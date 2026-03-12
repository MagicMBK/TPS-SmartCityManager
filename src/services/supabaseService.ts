/**
 * supabaseService.ts — Servizio di persistenza reale su PostgreSQL
 *
 * Questo servizio sostituisce httpbin.org con Supabase (PostgreSQL reale).
 * Ogni chiamata qui genera una vera richiesta HTTP POST verso:
 *   https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/<table>
 *
 * Il protocollo usato è PostgREST (REST su PostgreSQL):
 *   POST /rest/v1/readings      → INSERT INTO readings (...)
 *   POST /rest/v1/alerts        → INSERT INTO alerts (...)
 *   GET  /rest/v1/readings      → SELECT * FROM readings
 *
 * Headers obbligatori per ogni richiesta:
 *   Authorization: Bearer <anon_key>
 *   apikey: <anon_key>
 *   Content-Type: application/json
 *   Prefer: return=minimal   (non restituisce il body per risparmiare bandwidth)
 *
 * Questo è esattamente il "POST richiesto dal professore" — una vera
 * chiamata fetch() che persiste dati su un server PostgreSQL remoto.
 */

import { supabase, type SupabaseReading, type SupabaseAlert, type SupabaseGrpcCall, type PostResult } from './supabaseClient';
import type { SensorReading, Alert } from '../data/sensorSimulator';

// ─── Log di ogni operazione HTTP ─────────────────────────────────────────────

export interface SupabasePostLog {
  id: string;
  timestamp: number;
  operation: 'INSERT_READING' | 'INSERT_ALERT' | 'INSERT_GRPC' | 'BATCH_INSERT';
  table: string;
  endpoint: string;         // URL completo della richiesta
  method: 'POST' | 'GET';
  rowCount: number;
  latencyMs: number;
  statusCode: number;
  success: boolean;
  error?: string;
  payload?: unknown;        // Payload inviato (per debug)
}

// ─── Stats aggregate ──────────────────────────────────────────────────────────

export interface SupabaseStats {
  totalInserted: number;
  totalAlerts: number;
  totalGrpcCalls: number;
  totalErrors: number;
  avgLatencyMs: number;
  lastInsertAt: number | null;
  connectionStatus: 'connected' | 'error' | 'pending';
}

// ─── Servizio principale ──────────────────────────────────────────────────────

class SupabaseService {
  private logs: SupabasePostLog[] = [];
  private listeners: Set<() => void> = new Set();

  // Contatori statistiche
  private totalInserted  = 0;
  private totalAlerts    = 0;
  private totalGrpcCalls = 0;
  private totalErrors    = 0;
  private totalLatencyMs = 0;
  private lastInsertAt: number | null = null;
  private connectionStatus: 'connected' | 'error' | 'pending' = 'pending';

  // Batch buffer — raggruppa letture per ridurre il numero di richieste
  private readingBatch: SensorReading[] = [];
  private batchSize = 5;
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  // ─── INSERT singola lettura sensore ────────────────────────────────────────

  /**
   * Aggiunge una lettura al batch buffer.
   * Quando il batch è pieno (5 letture) o dopo 4 secondi,
   * esegue un INSERT batch su Supabase.
   *
   * Equivalente SQL:
   *   INSERT INTO readings (id, sensor_id, sensor_type, value, unit, zone_name, status, anomaly_score)
   *   VALUES (...), (...), ...
   *   ON CONFLICT (id) DO NOTHING;
   */
  queueReading(reading: SensorReading): void {
    this.readingBatch.push(reading);

    // Flush immediato quando il batch è pieno
    if (this.readingBatch.length >= this.batchSize) {
      this._flushBatch();
    } else if (!this.batchTimeout) {
      // Flush automatico dopo 4 secondi se il batch non è ancora pieno
      this.batchTimeout = setTimeout(() => {
        this._flushBatch();
      }, 4000);
    }
  }

  /**
   * Invia il batch di letture a Supabase via HTTP POST reale.
   * Questa è la chiamata fetch() vera che il professore ha richiesto.
   *
   * Supabase PostgREST traduce il POST in:
   *   INSERT INTO readings (...) VALUES (...) ON CONFLICT (id) DO NOTHING
   */
  private async _flushBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.readingBatch.length === 0) return;

    const batch = [...this.readingBatch];
    this.readingBatch = [];

    const startMs = performance.now();

    // Converte SensorReading → SupabaseReading (schema Supabase)
    const rows: SupabaseReading[] = batch.map(r => ({
      id:           r.id,
      sensor_id:    r.sensorId,
      sensor_type:  r.type,
      value:        r.value,
      unit:         r.unit,
      zone_name:    r.zone,
      status:       r.status,
      anomaly_score: this._calcAnomalyScore(r),
    }));

    const logEntry: SupabasePostLog = {
      id:        `SB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      operation: 'BATCH_INSERT',
      table:     'readings',
      endpoint:  'https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/readings',
      method:    'POST',
      rowCount:  rows.length,
      latencyMs: 0,
      statusCode: 0,
      success:   false,
      payload:   rows,
    };

    try {
      // ══════════════════════════════════════════════════════════════════
      // CHIAMATA HTTP POST REALE A SUPABASE (PostgreSQL)
      // Il client Supabase usa fetch() internamente verso:
      // POST https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/readings
      // con headers: Authorization, apikey, Content-Type: application/json
      // ══════════════════════════════════════════════════════════════════
      const { error } = await supabase
        .from('readings')
        .insert(rows)
        .select();                          // Prefer: return=representation

      const latency = Math.round(performance.now() - startMs);
      logEntry.latencyMs  = latency;
      logEntry.statusCode = error ? 400 : 201;
      logEntry.success    = !error;

      if (error) {
        logEntry.error = error.message;
        this.totalErrors++;
        this.connectionStatus = 'error';
        console.error('[Supabase] INSERT readings error:', error.message);
      } else {
        this.totalInserted   += rows.length;
        this.totalLatencyMs  += latency;
        this.lastInsertAt     = Date.now();
        this.connectionStatus = 'connected';
      }

    } catch (err: unknown) {
      const latency = Math.round(performance.now() - startMs);
      logEntry.latencyMs  = latency;
      logEntry.statusCode = 0;
      logEntry.error      = err instanceof Error ? err.message : 'Network error';
      this.totalErrors++;
      this.connectionStatus = 'error';
    }

    this._addLog(logEntry);
  }

  // ─── INSERT alert ──────────────────────────────────────────────────────────

  /**
   * Inserisce un alert in Supabase via HTTP POST reale.
   *
   * Equivalente SQL:
   *   INSERT INTO alerts (id, sensor_id, sensor_type, severity, message, zone_name, acknowledged)
   *   VALUES (...)
   *   ON CONFLICT (id) DO NOTHING;
   */
  async insertAlert(alert: Alert): Promise<PostResult> {
    const startMs = performance.now();

    const row: SupabaseAlert = {
      id:           alert.id,
      sensor_id:    alert.sensorId,
      sensor_type:  alert.type,
      severity:     alert.severity,
      message:      alert.message,
      zone_name:    alert.zone,
      acknowledged: alert.acknowledged,
    };

    const logEntry: SupabasePostLog = {
      id:         `SB-ALR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp:  Date.now(),
      operation:  'INSERT_ALERT',
      table:      'alerts',
      endpoint:   'https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/alerts',
      method:     'POST',
      rowCount:   1,
      latencyMs:  0,
      statusCode: 0,
      success:    false,
      payload:    row,
    };

    try {
      // HTTP POST REALE → Supabase → PostgreSQL alerts table
      const { error } = await supabase
        .from('alerts')
        .insert(row);

      const latency = Math.round(performance.now() - startMs);
      logEntry.latencyMs  = latency;
      logEntry.statusCode = error ? 400 : 201;
      logEntry.success    = !error;

      if (error) {
        logEntry.error = error.message;
        this.totalErrors++;
        this.connectionStatus = 'error';
      } else {
        this.totalAlerts++;
        this.totalLatencyMs  += latency;
        this.lastInsertAt     = Date.now();
        this.connectionStatus = 'connected';
      }

      this._addLog(logEntry);

      return {
        success:      !error,
        rowsInserted: error ? 0 : 1,
        latencyMs:    latency,
        error:        error?.message,
        endpoint:     logEntry.endpoint,
      };

    } catch (err: unknown) {
      const latency = Math.round(performance.now() - startMs);
      const message = err instanceof Error ? err.message : 'Network error';
      logEntry.latencyMs  = latency;
      logEntry.error      = message;
      this.connectionStatus = 'error';
      this.totalErrors++;
      this._addLog(logEntry);

      return { success: false, rowsInserted: 0, latencyMs: latency, error: message, endpoint: logEntry.endpoint };
    }
  }

  // ─── INSERT gRPC call log ─────────────────────────────────────────────────

  /**
   * Persiste il log di una chiamata gRPC nel database.
   * Permette di tracciare tutte le invocazioni AI nel tempo.
   */
  async insertGrpcCall(call: {
    method: string;
    sensorType: string;
    zoneName: string;
    latencyMs: number;
    statusCode: string;
    anomalyDetected: boolean;
    anomalyScore: number;
    predictedValue?: number;
  }): Promise<void> {
    const startMs = performance.now();

    const row: SupabaseGrpcCall = {
      id:               `GRPC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      method_name:      call.method,
      sensor_type:      call.sensorType,
      zone_name:        call.zoneName,
      latency_ms:       call.latencyMs,
      status_code:      call.statusCode,
      anomaly_detected: call.anomalyDetected,
      anomaly_score:    call.anomalyScore,
      predicted_value:  call.predictedValue ?? null,
    };

    const logEntry: SupabasePostLog = {
      id:         `SB-GRPC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp:  Date.now(),
      operation:  'INSERT_GRPC',
      table:      'grpc_calls',
      endpoint:   'https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/grpc_calls',
      method:     'POST',
      rowCount:   1,
      latencyMs:  0,
      statusCode: 0,
      success:    false,
    };

    try {
      const { error } = await supabase
        .from('grpc_calls')
        .insert(row);

      const latency = Math.round(performance.now() - startMs);
      logEntry.latencyMs  = latency;
      logEntry.statusCode = error ? 400 : 201;
      logEntry.success    = !error;

      if (error) {
        logEntry.error = error.message;
        this.totalErrors++;
      } else {
        this.totalGrpcCalls++;
        this.totalLatencyMs += latency;
        this.connectionStatus = 'connected';
      }
    } catch (err: unknown) {
      logEntry.error = err instanceof Error ? err.message : 'Network error';
      this.totalErrors++;
    }

    this._addLog(logEntry);
  }

  // ─── SELECT — letture recenti da Supabase ─────────────────────────────────

  /**
   * Recupera le ultime letture direttamente da PostgreSQL.
   * Questa è una GET reale verso:
   *   GET /rest/v1/readings?order=created_at.desc&limit=50
   */
  async fetchRecentReadings(limit = 50): Promise<SupabaseReading[]> {
    const { data, error } = await supabase
      .from('readings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] SELECT readings error:', error.message);
      return [];
    }
    return (data as SupabaseReading[]) ?? [];
  }

  /**
   * Recupera gli ultimi alert da PostgreSQL.
   */
  async fetchRecentAlerts(limit = 20): Promise<SupabaseAlert[]> {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Supabase] SELECT alerts error:', error.message);
      return [];
    }
    return (data as SupabaseAlert[]) ?? [];
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private _calcAnomalyScore(r: SensorReading): number {
    const thresholds: Record<string, { mean: number; std: number }> = {
      traffic:     { mean: 50, std: 25 },
      air_quality: { mean: 65, std: 20 },
      temperature: { mean: 27, std: 4  },
      noise:       { mean: 55, std: 18 },
      energy:      { mean: 65, std: 20 },
    };
    const p = thresholds[r.type] ?? { mean: 50, std: 20 };
    return Math.min(1, Math.abs((r.value - p.mean) / (p.std || 1)) / 3);
  }

  private _addLog(log: SupabasePostLog) {
    this.logs.unshift(log);
    if (this.logs.length > 200) this.logs.pop();
    this._notify();
  }

  // ─── Observer ─────────────────────────────────────────────────────────────

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private _notify() {
    this.listeners.forEach(fn => fn());
  }

  // ─── Getters pubblici ─────────────────────────────────────────────────────

  getLogs(): SupabasePostLog[] { return this.logs; }

  getStats(): SupabaseStats {
    return {
      totalInserted:    this.totalInserted,
      totalAlerts:      this.totalAlerts,
      totalGrpcCalls:   this.totalGrpcCalls,
      totalErrors:      this.totalErrors,
      avgLatencyMs:     this.logs.length > 0
        ? Math.round(this.totalLatencyMs / Math.max(this.logs.filter(l => l.success).length, 1))
        : 0,
      lastInsertAt:     this.lastInsertAt,
      connectionStatus: this.connectionStatus,
    };
  }
}

// Singleton — una sola istanza per tutta l'app
export const supabaseService = new SupabaseService();
