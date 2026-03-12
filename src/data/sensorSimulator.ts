/**
 * Smart City IoT Sensor Simulator
 * Simula i dati dei sensori come se provenissero da un broker MQTT.
 * Flusso reale implementato:
 *   SensorReading → HTTP POST (fetch reale) → httpbin.org/post
 *   → Response confermata → timescaleStore.insert() → Dashboard / GraphQL
 *
 * Protocolli: MQTT (simulato Observer) → HTTP POST (reale) → TimescaleDB (in-memory)
 */
import { timescaleStore } from '../services/timescaleStore';
import { idbStore } from '../services/indexedDBStore';
import { supabaseService } from '../services/supabaseService';

// === TIPI ===
export interface SensorReading {
  id: string;
  sensorId: string;
  type: SensorType;
  value: number;
  unit: string;
  timestamp: number;
  location: { x: number; y: number }; // Posizione sulla griglia cittadina
  status: 'normal' | 'warning' | 'critical';
  zone: string;
}

export type SensorType = 'traffic' | 'air_quality' | 'temperature' | 'noise' | 'energy';

export interface Alert {
  id: string;
  sensorId: string;
  type: SensorType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  zone: string;
  acknowledged: boolean;
}

export interface ZoneData {
  name: string;
  traffic: number;
  airQuality: number;
  temperature: number;
  noise: number;
  energy: number;
  alertCount: number;
  position: { x: number; y: number };
}

export interface CityStats {
  totalSensors: number;
  activeSensors: number;
  totalReadings: number;
  alertsToday: number;
  avgAirQuality: number;
  avgTraffic: number;
  avgTemperature: number;
  anomaliesDetected: number;
  uptime: number;
}

// === ZONE DELLA CITTÀ ===
const CITY_ZONES: ZoneData[] = [
  { name: 'Centro Storico', traffic: 75, airQuality: 62, temperature: 28, noise: 68, energy: 82, alertCount: 0, position: { x: 0, y: 0 } },
  { name: 'Zona Industriale', traffic: 45, airQuality: 45, temperature: 31, noise: 78, energy: 95, alertCount: 0, position: { x: 2, y: 0 } },
  { name: 'Quartiere Residenziale Nord', traffic: 30, airQuality: 78, temperature: 26, noise: 35, energy: 60, alertCount: 0, position: { x: -2, y: 2 } },
  { name: 'Quartiere Residenziale Sud', traffic: 35, airQuality: 75, temperature: 27, noise: 38, energy: 58, alertCount: 0, position: { x: -2, y: -2 } },
  { name: 'Zona Commerciale', traffic: 85, airQuality: 55, temperature: 29, noise: 72, energy: 88, alertCount: 0, position: { x: 2, y: 2 } },
  { name: 'Parco Urbano', traffic: 15, airQuality: 92, temperature: 24, noise: 25, energy: 20, alertCount: 0, position: { x: 0, y: 2 } },
  { name: 'Porto / Logistica', traffic: 60, airQuality: 50, temperature: 30, noise: 65, energy: 75, alertCount: 0, position: { x: 2, y: -2 } },
  { name: 'Campus Universitario', traffic: 50, airQuality: 70, temperature: 27, noise: 55, energy: 65, alertCount: 0, position: { x: 0, y: -2 } },
  { name: 'Zona Ospedaliera', traffic: 55, airQuality: 68, temperature: 26, noise: 45, energy: 70, alertCount: 0, position: { x: -2, y: 0 } },
];

// === SENSORI PER ZONA ===
const SENSORS_PER_ZONE = 4;
const SENSOR_TYPES: SensorType[] = ['traffic', 'air_quality', 'temperature', 'noise', 'energy'];
const UNITS: Record<SensorType, string> = {
  traffic: 'veicoli/h',
  air_quality: 'AQI',
  temperature: '°C',
  noise: 'dB',
  energy: 'kWh',
};

// Genera tutti i sensori
function generateSensors() {
  const sensors: { id: string; type: SensorType; zone: string; zoneIdx: number }[] = [];
  CITY_ZONES.forEach((zone, zi) => {
    for (let i = 0; i < SENSORS_PER_ZONE; i++) {
      const type = SENSOR_TYPES[i % SENSOR_TYPES.length];
      sensors.push({
        id: `SEN-${zi.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`,
        type,
        zone: zone.name,
        zoneIdx: zi,
      });
    }
  });
  return sensors;
}

const ALL_SENSORS = generateSensors();

// === ANOMALY DETECTION (Isolation Forest semplificato) ===
function isolationForestScore(value: number, mean: number, std: number): number {
  const zScore = Math.abs((value - mean) / (std || 1));
  // Score 0-1, dove > 0.7 è anomalo
  return Math.min(1, zScore / 3);
}

// Parametri normali per tipo sensore
const NORMAL_PARAMS: Record<SensorType, { mean: number; std: number; min: number; max: number }> = {
  traffic: { mean: 50, std: 25, min: 0, max: 100 },
  air_quality: { mean: 65, std: 20, min: 0, max: 150 },
  temperature: { mean: 27, std: 4, min: 15, max: 45 },
  noise: { mean: 55, std: 18, min: 20, max: 100 },
  energy: { mean: 65, std: 20, min: 10, max: 100 },
};

// === GENERAZIONE LETTURA ===
function generateReading(sensorId: string, type: SensorType, zone: string, zoneIdx: number): SensorReading {
  const params = NORMAL_PARAMS[type];
  const zoneData = CITY_ZONES[zoneIdx];

  // Base value dalla zona
  const baseValues: Record<SensorType, number> = {
    traffic: zoneData.traffic,
    air_quality: zoneData.airQuality,
    temperature: zoneData.temperature,
    noise: zoneData.noise,
    energy: zoneData.energy,
  };

  // Aggiunge rumore gaussiano + occasionali anomalie
  const isAnomaly = Math.random() < 0.05; // 5% chance di anomalia
  let value: number;

  if (isAnomaly) {
    // Genera valore anomalo
    value = params.mean + (Math.random() > 0.5 ? 1 : -1) * (params.std * 2.5 + Math.random() * params.std);
  } else {
    // Valore normale con rumore
    value = baseValues[type] + (Math.random() - 0.5) * params.std * 0.8;
  }

  value = Math.max(params.min, Math.min(params.max, value));

  // Anomaly score
  const anomalyScore = isolationForestScore(value, params.mean, params.std);

  let status: 'normal' | 'warning' | 'critical' = 'normal';
  if (anomalyScore > 0.8) status = 'critical';
  else if (anomalyScore > 0.6) status = 'warning';

  return {
    id: `R-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    sensorId,
    type,
    value: Math.round(value * 10) / 10,
    unit: UNITS[type],
    timestamp: Date.now(),
    location: zoneData.position,
    status,
    zone,
  };
}

// === TRAFFIC PREDICTION (Random Forest semplificato) ===
export function predictTraffic(hour: number, dayOfWeek: number, currentTraffic: number): number {
  // Simula predizione basata su pattern temporali
  const hourWeight = Math.sin((hour - 6) * Math.PI / 12) * 0.4 + 0.6; // Peak a mezzogiorno
  const rushHourBonus = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.3 : 1.0;
  const weekendFactor = dayOfWeek >= 5 ? 0.6 : 1.0;

  const predicted = currentTraffic * hourWeight * rushHourBonus * weekendFactor;
  return Math.round(Math.max(0, Math.min(100, predicted + (Math.random() - 0.5) * 10)));
}

// === GENERAZIONE ALERT ===
function generateAlert(reading: SensorReading): Alert | null {
  if (reading.status === 'normal') return null;

  const messages: Record<SensorType, Record<string, string>> = {
    traffic: {
      warning: `Traffico elevato in ${reading.zone} — ${reading.value} ${reading.unit}`,
      critical: `Congestione critica in ${reading.zone} — ${reading.value} ${reading.unit}`,
    },
    air_quality: {
      warning: `Qualità aria degradata in ${reading.zone} — AQI ${reading.value}`,
      critical: `Allerta inquinamento in ${reading.zone} — AQI ${reading.value}`,
    },
    temperature: {
      warning: `Temperatura anomala in ${reading.zone} — ${reading.value}°C`,
      critical: `Temperatura critica in ${reading.zone} — ${reading.value}°C`,
    },
    noise: {
      warning: `Rumore elevato in ${reading.zone} — ${reading.value} dB`,
      critical: `Inquinamento acustico in ${reading.zone} — ${reading.value} dB`,
    },
    energy: {
      warning: `Consumo anomalo in ${reading.zone} — ${reading.value} kWh`,
      critical: `Sovraccarico energetico in ${reading.zone} — ${reading.value} kWh`,
    },
  };

  return {
    id: `ALR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    sensorId: reading.sensorId,
    type: reading.type,
    severity: reading.status === 'critical' ? 'critical' : 'medium',
    message: messages[reading.type][reading.status] || 'Anomalia rilevata',
    timestamp: reading.timestamp,
    zone: reading.zone,
    acknowledged: false,
  };
}

// === CLASSE PRINCIPALE SIMULATOR ===
export class CitySimulator {
  private readings: SensorReading[] = [];
  private alerts: Alert[] = [];
  private zones: ZoneData[] = [...CITY_ZONES.map(z => ({ ...z }))];
  private listeners: Set<(data: SimulatorUpdate) => void> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private healthId:   ReturnType<typeof setInterval> | null = null;
  private readingCount = 0;
  private anomalyCount = 0;
  private startTime = Date.now();
  private lastAlertTime: number = 0;

  // ── Stato connessione server ─────────────────────────────────
  serverOnline: boolean | null = null; // null = non ancora verificato
  private serverListeners: Set<(online: boolean | null) => void> = new Set();

  private history: { timestamp: number; traffic: number; airQuality: number; temperature: number; noise: number; energy: number }[] = [];

  // ── Health check ─────────────────────────────────────────────
  private async checkServer(): Promise<boolean> {
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch { return false; }
  }

  subscribeServer(fn: (online: boolean | null) => void) {
    this.serverListeners.add(fn);
    return () => this.serverListeners.delete(fn);
  }

  private setServerOnline(online: boolean) {
    if (this.serverOnline !== online) {
      this.serverOnline = online;
      this.serverListeners.forEach(fn => fn(online));
    }
  }

  // ── Invia lettura al server GraphQL (mutation) ────────────────
  private async pushReadingToServer(reading: SensorReading): Promise<void> {
    try {
      await fetch('/api/graphql', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation InsertReading($input: ReadingInput!) {
            insertReading(input: $input) { id }
          }`,
          variables: {
            input: {
              id:          reading.id,
              sensorId:    reading.sensorId,
              type:        reading.type,
              value:       reading.value,
              unit:        reading.unit,
              zone:        reading.zone,
              status:      reading.status,
              timestamp:   reading.timestamp,
            },
          },
        }),
      });
    } catch { /* server offline, non bloccare il tick */ }
  }

  // ── Fetchare le zone aggiornate dal server ────────────────────
  private async fetchZonesFromServer(): Promise<void> {
    try {
      const res = await fetch('/api/graphql', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{ zoneMetrics {
            zone traffic airQuality temperature noise energy
          }}`,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as {
        data?: { zoneMetrics: { zone: string; traffic: number; airQuality: number; temperature: number; noise: number; energy: number }[] }
      };
      const metrics = json.data?.zoneMetrics;
      if (metrics && metrics.length > 0) {
        // Aggiorna le zone con i dati reali dal DB
        this.zones = this.zones.map(z => {
          const m = metrics.find(m => m.zone === z.name);
          if (!m) return z;
          return {
            ...z,
            traffic:     m.traffic     || z.traffic,
            airQuality:  m.airQuality  || z.airQuality,
            temperature: m.temperature || z.temperature,
            noise:       m.noise       || z.noise,
            energy:      m.energy      || z.energy,
          };
        });
        this.setServerOnline(true);
      }
    } catch {
      this.setServerOnline(false);
    }
  }

  start(intervalMs = 2000) {
    if (this.intervalId) return;
    this.startTime = Date.now();

    // Pre-popola con dati locali (grafici visibili subito)
    for (let i = 0; i < 30; i++) this.tick(true);

    // Health-check iniziale + prima fetch zone dal server
    this.checkServer().then(online => {
      this.setServerOnline(online);
      if (online) this.fetchZonesFromServer();
    });

    // Tick sensori ogni 2s
    this.intervalId = setInterval(() => this.tick(), intervalMs);

    // Ogni 6s: ri-fetch zone dal server + health check
    this.healthId = setInterval(async () => {
      const online = await this.checkServer();
      this.setServerOnline(online);
      if (online) this.fetchZonesFromServer();
    }, 6000);
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.healthId)   { clearInterval(this.healthId);   this.healthId   = null; }
  }

  subscribe(listener: (data: SimulatorUpdate) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private tick(silent = false) {
    const newReadings: SensorReading[] = [];
    const newAlerts: Alert[] = [];

    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const sensor = ALL_SENSORS[Math.floor(Math.random() * ALL_SENSORS.length)];
      const reading = generateReading(sensor.id, sensor.type, sensor.zone, sensor.zoneIdx);
      newReadings.push(reading);
      this.readingCount++;

      // Supabase: sempre attivo, non dipende da Express
      supabaseService.queueReading(reading);
      timescaleStore.insert(reading);
      idbStore.insertReading(reading);

      // Invia al server GraphQL Express via mutation (se non è tick silenzioso)
      if (!silent) this.pushReadingToServer(reading);

      // ⚠️ NON aggiornare le zone localmente —
      // i dati zona vengono SOLO da fetchZonesFromServer() ogni 6s.
      // Se il server è offline, le zone restano congelate all'ultimo valore noto.

      if (reading.status !== 'normal') {
        this.anomalyCount++;
        const now = Date.now();
        if (now - this.lastAlertTime >= 120000) {
          const alert = generateAlert(reading);
          if (alert) {
            this.lastAlertTime = now;
            newAlerts.push(alert);
            this.alerts.unshift(alert);
            supabaseService.insertAlert(alert);
            timescaleStore.insertAlert(alert);
            idbStore.insertAlert(alert);
            const z = this.zones.find(z => z.name === reading.zone);
            if (z) z.alertCount++;
          }
        }
      }
    }

    this.readings = [...newReadings, ...this.readings].slice(0, 200);
    this.alerts   = this.alerts.slice(0, 50);

    const avgTraffic = this.zones.reduce((s, z) => s + z.traffic, 0) / this.zones.length;
    const avgAir     = this.zones.reduce((s, z) => s + z.airQuality, 0) / this.zones.length;
    const avgTemp    = this.zones.reduce((s, z) => s + z.temperature, 0) / this.zones.length;
    const avgNoise   = this.zones.reduce((s, z) => s + z.noise, 0) / this.zones.length;
    const avgEnergy  = this.zones.reduce((s, z) => s + z.energy, 0) / this.zones.length;

    this.history.push({
      timestamp: Date.now(),
      traffic: Math.round(avgTraffic * 10) / 10,
      airQuality: Math.round(avgAir * 10) / 10,
      temperature: Math.round(avgTemp * 10) / 10,
      noise: Math.round(avgNoise * 10) / 10,
      energy: Math.round(avgEnergy * 10) / 10,
    });
    if (this.history.length > 60) this.history.shift();

    if (!silent) {
      const update: SimulatorUpdate = {
        readings: this.readings,
        newReadings,
        alerts: this.alerts,
        newAlerts,
        zones: this.zones.map(z => ({ ...z })),
        stats: this.getStats(),
        history: [...this.history],
      };

      this.listeners.forEach(l => l(update));
    }
  }

  getStats(): CityStats {
    return {
      totalSensors: ALL_SENSORS.length,
      activeSensors: ALL_SENSORS.length - Math.floor(Math.random() * 3),
      totalReadings: this.readingCount,
      alertsToday: this.alerts.length,
      avgAirQuality: Math.round(this.zones.reduce((s, z) => s + z.airQuality, 0) / this.zones.length),
      avgTraffic: Math.round(this.zones.reduce((s, z) => s + z.traffic, 0) / this.zones.length),
      avgTemperature: Math.round(this.zones.reduce((s, z) => s + z.temperature, 0) / this.zones.length * 10) / 10,
      anomaliesDetected: this.anomalyCount,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  getInitialData(): SimulatorUpdate {
    return {
      readings: this.readings,
      newReadings: [],
      alerts: this.alerts,
      newAlerts: [],
      zones: this.zones.map(z => ({ ...z })),
      stats: this.getStats(),
      history: [...this.history],
    };
  }

  acknowledgeAlert(alertId: string) {
    const idx = this.alerts.findIndex(a => a.id === alertId);
    if (idx === -1) return;

    // Crea nuovo oggetto (immutabile) con acknowledged = true
    const alert = { ...this.alerts[idx], acknowledged: true };
    this.alerts = [
      ...this.alerts.slice(0, idx),
      alert,
      ...this.alerts.slice(idx + 1),
    ];

    // Decrementa alertCount nella zona corrispondente
    const zone = this.zones.find(z => z.name === alert.zone);
    if (zone && zone.alertCount > 0) {
      zone.alertCount = Math.max(0, zone.alertCount - 1);
    }

    // Notifica subito tutti i listener così UI e Digital Twin si aggiornano
    const update: SimulatorUpdate = {
      readings:    this.readings,
      newReadings: [],
      alerts:      this.alerts,
      newAlerts:   [],
      zones:       this.zones.map(z => ({ ...z })),
      stats:       this.getStats(),
      history:     [...this.history],
    };
    this.listeners.forEach(l => l(update));
  }
}

export interface SimulatorUpdate {
  readings: SensorReading[];
  newReadings: SensorReading[];
  alerts: Alert[];
  newAlerts: Alert[];
  zones: ZoneData[];
  stats: CityStats;
  history: { timestamp: number; traffic: number; airQuality: number; temperature: number; noise: number; energy: number }[];
}

// Singleton
export const citySimulator = new CitySimulator();
