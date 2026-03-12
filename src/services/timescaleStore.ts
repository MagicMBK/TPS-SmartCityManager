/**
 * TimescaleDB In-Memory Store
 *
 * Riceve dati reali tramite HTTP POST verso un endpoint pubblico (httpbin.org/post),
 * legge la risposta JSON confermata dal server, e la persiste in un rolling buffer
 * in-memory che simula le hypertable di TimescaleDB.
 *
 * Flusso reale:
 *   SensorReading → HTTP POST (fetch) → httpbin.org/post
 *   → Response JSON (echo) → parse → INSERT into hypertable[]
 *   → Continuous aggregate → query da Dashboard / GraphQL
 *
 * httpbin.org/post: restituisce esattamente il body inviato nel campo "json",
 * confermando che il payload è stato ricevuto e validato dal server reale.
 */

import type { SensorReading } from '../data/sensorSimulator';

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface DBReading {
  id: string;
  time: string;           // ISO timestamp — come in TimescaleDB
  sensor_id: string;
  type: string;
  value: number;
  unit: string;
  zone: string;
  status: string;
  confirmed_by_server: boolean;  // true se il server ha risposto 200
  server_response_ms: number;    // latenza HTTP reale misurata
  raw_server_echo?: unknown;     // echo del server (httpbin restituisce il body)
}

export interface DBAlert {
  id: string;
  time: string;
  sensor_id: string;
  severity: string;
  message: string;
  zone: string;
  ack: boolean;
}

export interface TimeBucket {
  bucket: string;       // ISO string del bucket (es. ogni 2 minuti)
  sensor_type: string;
  avg_value: number;
  max_value: number;
  min_value: number;
  sample_count: number;
}

export interface PostLog {
  id: string;
  timestamp: number;
  endpoint: string;
  method: 'POST';
  payload_bytes: number;
  status_code: number;
  latency_ms: number;
  confirmed: boolean;
  error?: string;
}

// ─── Configurazione endpoint ──────────────────────────────────────────────────

/**
 * httpbin.org/post: endpoint reale che accetta POST con JSON body
 * e risponde con un echo del payload nel campo "json".
 * Uso gratuito, nessuna auth richiesta, CORS permissivo.
 *
 * Alternativa: https://api.restful-api.dev/objects (POST per creare oggetti reali)
 */
const ENDPOINT = 'https://httpbin.org/post';

// Batch: invia ogni N letture (riduce il numero di richieste HTTP)
const BATCH_SIZE = 3;

// ─── Store ────────────────────────────────────────────────────────────────────

class TimescaleDBStore {
  // Hypertable: readings (time-series)
  private readings: DBReading[] = [];
  private alerts: DBAlert[] = [];
  private postLogs: PostLog[] = [];

  // Buffer per il batching
  private pendingBatch: SensorReading[] = [];

  // Listener per aggiornamenti real-time
  private listeners: Set<() => void> = new Set();

  // Contatori
  private totalInserted = 0;
  private totalConfirmed = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;

  /**
   * Invia una lettura al server reale via HTTP POST,
   * poi persiste la risposta confermata nel DB in-memory.
   */
  async insert(reading: SensorReading): Promise<DBReading> {
    this.pendingBatch.push(reading);

    // Crea subito un record "pending" nel DB locale
    const dbRecord: DBReading = {
      id: reading.id,
      time: new Date(reading.timestamp).toISOString(),
      sensor_id: reading.sensorId,
      type: reading.type,
      value: reading.value,
      unit: reading.unit,
      zone: reading.zone,
      status: reading.status,
      confirmed_by_server: false,
      server_response_ms: 0,
    };

    this.readings.unshift(dbRecord);
    if (this.readings.length > 500) this.readings.pop();
    this.totalInserted++;

    // Quando il batch è pieno, invia al server reale
    if (this.pendingBatch.length >= BATCH_SIZE) {
      const batch = [...this.pendingBatch];
      this.pendingBatch = [];
      this._sendBatch(batch);
    }

    this.notify();
    return dbRecord;
  }

  /**
   * Invia il batch via HTTP POST REALE a httpbin.org/post
   * httpbin risponde con echo JSON: { json: { readings: [...] } }
   */
  private async _sendBatch(batch: SensorReading[]): Promise<void> {
    const payload = {
      source: 'puntosnai-smart-city',
      table: 'readings',
      batch_size: batch.length,
      timestamp: new Date().toISOString(),
      readings: batch.map(r => ({
        sensor_id: r.sensorId,
        type: r.type,
        value: r.value,
        unit: r.unit,
        zone: r.zone,
        status: r.status,
        time: new Date(r.timestamp).toISOString(),
      })),
    };

    const payloadStr = JSON.stringify(payload);
    const startMs = performance.now();

    const logEntry: PostLog = {
      id: `POST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      endpoint: ENDPOINT,
      method: 'POST',
      payload_bytes: new TextEncoder().encode(payloadStr).length,
      status_code: 0,
      latency_ms: 0,
      confirmed: false,
    };

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source': 'puntosnai-iot',
          'X-Batch-Size': String(batch.length),
        },
        body: payloadStr,
      });

      const latency = Math.round(performance.now() - startMs);
      const serverData = await response.json();

      logEntry.status_code = response.status;
      logEntry.latency_ms = latency;
      logEntry.confirmed = response.ok;
      this.totalLatencyMs += latency;

      if (response.ok) {
        this.totalConfirmed += batch.length;

        // Aggiorna i record locali come "confermati dal server"
        batch.forEach(r => {
          const record = this.readings.find(d => d.id === r.id);
          if (record) {
            record.confirmed_by_server = true;
            record.server_response_ms = latency;
            // httpbin restituisce il body nel campo "json"
            record.raw_server_echo = (serverData as { json?: unknown })?.json ?? serverData;
          }
        });
      } else {
        this.totalErrors++;
        logEntry.error = `HTTP ${response.status}`;
      }

    } catch (err: unknown) {
      const latency = Math.round(performance.now() - startMs);
      logEntry.latency_ms = latency;
      logEntry.status_code = 0;
      logEntry.error = err instanceof Error ? err.message : 'Network error';
      this.totalErrors++;
    }

    this.postLogs.unshift(logEntry);
    if (this.postLogs.length > 100) this.postLogs.pop();

    this.notify();
  }

  /**
   * INSERT alert nel DB locale (senza HTTP POST — già gestito dal batch readings)
   */
  insertAlert(alert: { id: string; sensorId: string; severity: string; message: string; zone: string; timestamp: number }) {
    this.alerts.unshift({
      id: alert.id,
      time: new Date(alert.timestamp).toISOString(),
      sensor_id: alert.sensorId,
      severity: alert.severity,
      message: alert.message,
      zone: alert.zone,
      ack: false,
    });
    if (this.alerts.length > 100) this.alerts.pop();
    this.notify();
  }

  /**
   * SELECT time_bucket('2 minutes', time), AVG(value) ... GROUP BY type
   * Simula le continuous aggregate views di TimescaleDB
   */
  queryTimeBuckets(sensorType?: string, limit = 30): TimeBucket[] {
    const source = sensorType
      ? this.readings.filter(r => r.type === sensorType)
      : this.readings;

    // Raggruppa per bucket di 2 minuti
    const bucketMap: Map<string, DBReading[]> = new Map();
    source.forEach(r => {
      const d = new Date(r.time);
      d.setSeconds(0, 0);
      const minutes = d.getMinutes();
      d.setMinutes(minutes - (minutes % 2));
      const key = `${r.type}::${d.toISOString()}`;
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key)!.push(r);
    });

    const result: TimeBucket[] = [];
    bucketMap.forEach((rows, key) => {
      const [type, bucket] = key.split('::');
      const values = rows.map(r => r.value);
      result.push({
        bucket,
        sensor_type: type,
        avg_value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
        max_value: Math.max(...values),
        min_value: Math.min(...values),
        sample_count: values.length,
      });
    });

    return result
      .sort((a, b) => new Date(b.bucket).getTime() - new Date(a.bucket).getTime())
      .slice(0, limit);
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  getReadings(limit = 50): DBReading[] {
    return this.readings.slice(0, limit);
  }

  getAlerts(): DBAlert[] {
    return this.alerts;
  }

  getPostLogs(): PostLog[] {
    return this.postLogs;
  }

  getStats() {
    const avgLatency = this.totalConfirmed > 0
      ? Math.round(this.totalLatencyMs / Math.max(this.postLogs.length, 1))
      : 0;

    return {
      totalInserted: this.totalInserted,
      totalConfirmed: this.totalConfirmed,
      totalErrors: this.totalErrors,
      avgLatencyMs: avgLatency,
      pendingBatch: this.pendingBatch.length,
      confirmedRate: this.totalInserted > 0
        ? Math.round((this.totalConfirmed / this.totalInserted) * 100)
        : 0,
      lastPostAt: this.postLogs[0]?.timestamp ?? null,
    };
  }

  // ─── Observer ─────────────────────────────────────────────────────────────

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }
}

// Singleton
export const timescaleStore = new TimescaleDBStore();
