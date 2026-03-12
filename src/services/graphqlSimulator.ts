/**
 * GraphQL Simulator — Apollo Server simulato nel browser
 * =======================================================
 * Simula un Apollo Server con:
 *  - Schema SDL (Schema Definition Language)
 *  - Resolver functions (Query, Mutation, Subscription)
 *  - WebSocket transport per Subscriptions (Observer pattern)
 *  - Introspection query (come in un vero playground Apollo)
 *
 * In produzione questo sarebbe Apollo Server su Node.js :4000
 * con graphql-ws per le subscriptions.
 */

import { citySimulator } from '../data/sensorSimulator';
import type { SimulatorUpdate } from '../data/sensorSimulator';

// ============================================================
// SCHEMA SDL — come sarebbe nel file schema.graphql del server
// ============================================================

export const SCHEMA_SDL = `
"""
Smart City IoT Platform — GraphQL API
Endpoint: http://gateway:4000/graphql
WebSocket: ws://gateway:4000/graphql
"""

type Query {
  """Ritorna tutte le zone della città con le loro metriche"""
  zones: [Zone!]!

  """Ritorna una zona specifica per nome"""
  zone(name: String!): Zone

  """Letture recenti con filtro opzionale per tipo"""
  readings(type: SensorType, limit: Int = 20): [SensorReading!]!

  """Statistiche globali della città"""
  cityStats: CityStats!

  """Alert attivi (non acknowledged)"""
  activeAlerts(severity: Severity): [Alert!]!

  """Storico metriche per grafici (ultimi N punti)"""
  metricsHistory(points: Int = 30): [MetricsSnapshot!]!
}

type Mutation {
  """Acknowledge un alert — segna come gestito"""
  acknowledgeAlert(id: ID!): AcknowledgePayload!

  """Simula pagamento multa (inoltrato al servizio SOAP)"""
  pagaMulta(targa: String!, importo: Float!, motivazione: String): MultaPayload!

  """Forza un'anomalia in una zona (per test)"""
  injectAnomaly(zone: String!, type: SensorType!, value: Float!): InjectionPayload!
}

type Subscription {
  """Stream real-time delle letture sensori"""
  sensorReading(zone: String, type: SensorType): SensorReading!

  """Nuovi alert in tempo reale"""
  newAlert(severity: Severity): Alert!

  """Aggiornamento metriche ogni 2 secondi"""
  cityMetricsUpdate: MetricsSnapshot!
}

type Zone {
  name:        String!
  traffic:     Float!
  airQuality:  Float!
  temperature: Float!
  noise:       Float!
  energy:      Float!
  alertCount:  Int!
  status:      ZoneStatus!
}

type SensorReading {
  id:        ID!
  sensorId:  String!
  type:      SensorType!
  value:     Float!
  unit:      String!
  timestamp: String!
  zone:      String!
  status:    ReadingStatus!
}

type Alert {
  id:           ID!
  sensorId:     String!
  type:         SensorType!
  severity:     Severity!
  message:      String!
  timestamp:    String!
  zone:         String!
  acknowledged: Boolean!
}

type CityStats {
  totalSensors:       Int!
  activeSensors:      Int!
  totalReadings:      Int!
  alertsToday:        Int!
  avgAirQuality:      Float!
  avgTraffic:         Float!
  avgTemperature:     Float!
  anomaliesDetected:  Int!
  uptime:             Int!
}

type MetricsSnapshot {
  timestamp:   String!
  traffic:     Float!
  airQuality:  Float!
  temperature: Float!
  noise:       Float!
  energy:      Float!
}

type AcknowledgePayload {
  success:      Boolean!
  alertId:      ID!
  acknowledgedAt: String!
}

type MultaPayload {
  transactionId: ID!
  targa:         String!
  importo:       Float!
  stato:         String!
  soapResponseMs: Int!
  timestamp:     String!
}

type InjectionPayload {
  success:  Boolean!
  readingId: ID!
  zone:     String!
}

enum SensorType {
  traffic
  air_quality
  temperature
  noise
  energy
}

enum Severity {
  low
  medium
  high
  critical
}

enum ZoneStatus {
  OPTIMAL
  WARNING
  CRITICAL
}

enum ReadingStatus {
  normal
  warning
  critical
}
`;

// ============================================================
// TIPI INTERNI
// ============================================================

export type GQLOperationType = 'query' | 'mutation' | 'subscription';

export interface GQLRequest {
  id: string;
  query: string;
  variables?: Record<string, unknown>;
  operationType: GQLOperationType;
  operationName?: string;
  timestamp: number;
}

export interface GQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string; path?: string[] }>;
  extensions?: {
    tracing: {
      version: number;
      startTime: string;
      endTime: string;
      duration: number; // nanoseconds
      execution: { resolvers: ResolverTrace[] };
    };
  };
}

export interface ResolverTrace {
  path:        string[];
  parentType:  string;
  fieldName:   string;
  returnType:  string;
  startOffset: number;
  duration:    number;
}

export interface GQLCallLog {
  id:           string;
  timestamp:    number;
  operationType: GQLOperationType;
  operationName: string;
  query:        string;
  variables:    string;
  response:     string;
  durationMs:   number;
  status:       'success' | 'error';
  resolverCount: number;
}

export interface SubscriptionHandle {
  id:           string;
  query:        string;
  active:       boolean;
  eventCount:   number;
  startTime:    number;
  unsubscribe:  () => void;
  onData:       (cb: (data: Record<string, unknown>) => void) => void;
}

// ============================================================
// LOG REGISTRY
// ============================================================

class GQLCallRegistry {
  private logs: GQLCallLog[] = [];
  private listeners: Set<(log: GQLCallLog) => void> = new Set();

  record(log: GQLCallLog) {
    this.logs.unshift(log);
    if (this.logs.length > 150) this.logs.pop();
    this.listeners.forEach(l => l(log));
  }

  subscribe(fn: (log: GQLCallLog) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getLogs(): GQLCallLog[] { return [...this.logs]; }
  clear() { this.logs = []; }
}

export const gqlCallRegistry = new GQLCallRegistry();

// ============================================================
// PARSER QUERY LEGGERO — rileva tipo e nome operazione
// ============================================================

function parseOperation(query: string): { type: GQLOperationType; name: string } {
  const clean = query.trim().toLowerCase();
  let type: GQLOperationType = 'query';
  if (clean.startsWith('mutation')) type = 'mutation';
  else if (clean.startsWith('subscription')) type = 'subscription';

  // Estrai nome operazione (es. "query GetZones { ... }" → "GetZones")
  const nameMatch = query.match(/(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  const name = nameMatch ? nameMatch[1] : type.charAt(0).toUpperCase() + type.slice(1);

  return { type, name };
}

// ============================================================
// RESOLVERS — la logica che risponde alle query
// ============================================================

function resolveZones(data: SimulatorUpdate) {
  return data.zones.map(z => ({
    name:        z.name,
    traffic:     z.traffic,
    airQuality:  z.airQuality,
    temperature: z.temperature,
    noise:       z.noise,
    energy:      z.energy,
    alertCount:  z.alertCount,
    status:      z.alertCount > 3 ? 'CRITICAL' : z.alertCount > 0 ? 'WARNING' : 'OPTIMAL',
  }));
}

function resolveReadings(data: SimulatorUpdate, type?: string, limit = 20) {
  let readings = [...data.readings];
  if (type) readings = readings.filter(r => r.type === type);
  return readings.slice(0, limit).map(r => ({
    id:        r.id,
    sensorId:  r.sensorId,
    type:      r.type,
    value:     r.value,
    unit:      r.unit,
    timestamp: new Date(r.timestamp).toISOString(),
    zone:      r.zone,
    status:    r.status,
  }));
}

function resolveAlerts(data: SimulatorUpdate, severity?: string) {
  let alerts = data.alerts.filter(a => !a.acknowledged);
  if (severity) alerts = alerts.filter(a => a.severity === severity);
  return alerts.map(a => ({
    id:           a.id,
    sensorId:     a.sensorId,
    type:         a.type,
    severity:     a.severity,
    message:      a.message,
    timestamp:    new Date(a.timestamp).toISOString(),
    zone:         a.zone,
    acknowledged: a.acknowledged,
  }));
}

function buildTracingExtension(resolverCount: number, durationNs: number) {
  const now = new Date();
  return {
    tracing: {
      version:   1,
      startTime: now.toISOString(),
      endTime:   new Date(now.getTime() + durationNs / 1e6).toISOString(),
      duration:  durationNs,
      execution: {
        resolvers: Array.from({ length: resolverCount }, (_, i) => ({
          path:        ['root', `field${i}`],
          parentType:  i === 0 ? 'Query' : 'Zone',
          fieldName:   i === 0 ? 'zones' : 'traffic',
          returnType:  i === 0 ? '[Zone!]!' : 'Float!',
          startOffset: i * 100000,
          duration:    50000 + Math.random() * 200000,
        })),
      },
    },
  };
}

// ============================================================
// GRAPHQL ENGINE
// ============================================================

export class GraphQLEngine {
  private currentData: SimulatorUpdate | null = null;
  private subListeners: Map<string, Set<(data: Record<string, unknown>) => void>> = new Map();
  private activeSubscriptions: SubscriptionHandle[] = [];

  constructor() {
    citySimulator.subscribe(update => {
      this.currentData = update;
      this.pushToSubscriptions(update);
    });
  }

  private getData(): SimulatorUpdate {
    if (!this.currentData) {
      return citySimulator.getInitialData();
    }
    return this.currentData;
  }

  // ── Esegue una Query o Mutation via HTTP → Express :3001 ─────
  // Se Express è offline lancia errore — nessun fallback locale.
  async execute(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<GQLResponse> {
    const start = performance.now();
    const { type, name } = parseOperation(query);

    let data: Record<string, unknown> | undefined;
    let errors: GQLResponse['errors'] | undefined;
    let resolverCount = 1;

    try {
      const res = await fetch('/api/graphql', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} — server Express non raggiungibile`);

      const json = await res.json() as { data?: Record<string, unknown>; errors?: GQLResponse['errors'] };
      data   = json.data;
      errors = json.errors;
      resolverCount = Object.keys(data ?? {}).length || 1;
    } catch (err) {
      errors = [{ message: `Server offline: ${err instanceof Error ? err.message : String(err)}` }];
    }

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const durationNs = Math.round(durationMs * 1e6);

    const log: GQLCallLog = {
      id:            `gql-${Date.now().toString(36)}`,
      timestamp:     Date.now(),
      operationType: type,
      operationName: name,
      query:         query.trim(),
      variables:     JSON.stringify(variables, null, 2),
      response:      JSON.stringify({ data, errors }, null, 2),
      durationMs,
      status:        errors ? 'error' : 'success',
      resolverCount,
    };
    gqlCallRegistry.record(log);

    return {
      data,
      errors,
      extensions: buildTracingExtension(resolverCount, durationNs),
    };
  }

  private executeQuery(
    query: string,
    variables: Record<string, unknown>
  ): { data: Record<string, unknown>; resolverCount: number } {
    const d = this.getData();
    const q = query.toLowerCase();
    const data: Record<string, unknown> = {};
    let resolverCount = 0;

    if (q.includes('zones') && !q.includes('zone(')) {
      data['zones'] = resolveZones(d);
      resolverCount += 1 + d.zones.length * 7;
    }

    if (q.includes('zone(') || q.includes('zone (')) {
      const nameMatch = query.match(/zone\s*\(\s*name\s*:\s*"([^"]+)"/i)
        || query.match(/name:\s*\$(\w+)/i);
      const zoneName = nameMatch
        ? (nameMatch[1] || String(variables[nameMatch[1]] || ''))
        : '';
      const zone = d.zones.find(z =>
        z.name.toLowerCase().includes(zoneName.toLowerCase())
      );
      data['zone'] = zone ? {
        name: zone.name, traffic: zone.traffic,
        airQuality: zone.airQuality, temperature: zone.temperature,
        noise: zone.noise, energy: zone.energy, alertCount: zone.alertCount,
        status: zone.alertCount > 3 ? 'CRITICAL' : zone.alertCount > 0 ? 'WARNING' : 'OPTIMAL',
      } : null;
      resolverCount += 8;
    }

    if (q.includes('readings')) {
      const typeMatch = query.match(/type:\s*(?:"?(\w+)"?|\$(\w+))/i);
      const limitMatch = query.match(/limit:\s*(\d+)/i);
      const sensorType = typeMatch ? (typeMatch[1] || String(variables[typeMatch[2] || ''] || '')) : undefined;
      const limit = limitMatch ? parseInt(limitMatch[1]) : 20;
      data['readings'] = resolveReadings(d, sensorType, limit);
      resolverCount += 1 + limit * 8;
    }

    if (q.includes('citystats')) {
      data['cityStats'] = {
        totalSensors:      d.stats.totalSensors,
        activeSensors:     d.stats.activeSensors,
        totalReadings:     d.stats.totalReadings,
        alertsToday:       d.stats.alertsToday,
        avgAirQuality:     d.stats.avgAirQuality,
        avgTraffic:        d.stats.avgTraffic,
        avgTemperature:    d.stats.avgTemperature,
        anomaliesDetected: d.stats.anomaliesDetected,
        uptime:            d.stats.uptime,
      };
      resolverCount += 9;
    }

    if (q.includes('activealerts')) {
      const sevMatch = query.match(/severity:\s*(?:"?(\w+)"?|\$(\w+))/i);
      const severity = sevMatch ? sevMatch[1] : undefined;
      data['activeAlerts'] = resolveAlerts(d, severity);
      resolverCount += 1 + d.alerts.length * 8;
    }

    if (q.includes('metricshistory')) {
      const ptsMatch = query.match(/points:\s*(\d+)/i);
      const points = ptsMatch ? parseInt(ptsMatch[1]) : 30;
      data['metricsHistory'] = d.history.slice(-points).map(h => ({
        timestamp:   new Date(h.timestamp).toISOString(),
        traffic:     h.traffic,
        airQuality:  h.airQuality,
        temperature: h.temperature,
        noise:       h.noise,
        energy:      h.energy,
      }));
      resolverCount += 1 + points * 6;
    }

    if (Object.keys(data).length === 0) {
      data['zones'] = resolveZones(d);
      resolverCount += d.zones.length * 7;
    }

    return { data, resolverCount };
  }

  private executeMutation(
    query: string,
    variables: Record<string, unknown>
  ): { data: Record<string, unknown>; resolverCount: number } {
    const q = query.toLowerCase();
    const data: Record<string, unknown> = {};

    if (q.includes('acknowledgealert')) {
      const idMatch = query.match(/id:\s*(?:"([^"]+)"|\$(\w+))/i);
      const alertId = idMatch
        ? (idMatch[1] || String(variables[idMatch[2] || ''] || ''))
        : '';
      citySimulator.acknowledgeAlert(alertId);
      data['acknowledgeAlert'] = {
        success:        true,
        alertId,
        acknowledgedAt: new Date().toISOString(),
      };
      return { data, resolverCount: 3 };
    }

    if (q.includes('pagamulta')) {
      const targaMatch = query.match(/targa:\s*"([^"]+)"/i);
      const importoMatch = query.match(/importo:\s*([\d.]+)/i);
      const targa    = targaMatch  ? targaMatch[1]  : String(variables['targa']   || 'XX000YY');
      const importo  = importoMatch ? parseFloat(importoMatch[1]) : Number(variables['importo'] || 87.5);
      data['pagaMulta'] = {
        transactionId: `TXN-${Date.now().toString(36).toUpperCase()}`,
        targa,
        importo,
        stato:         'PAGATO',
        soapResponseMs: Math.round(80 + Math.random() * 120),
        timestamp:     new Date().toISOString(),
      };
      return { data, resolverCount: 5 };
    }

    if (q.includes('injectanomaly')) {
      data['injectAnomaly'] = {
        success:   true,
        readingId: `R-INJ-${Date.now().toString(36)}`,
        zone:      String(variables['zone'] || 'Centro Storico'),
      };
      return { data, resolverCount: 4 };
    }

    data['result'] = { success: true };
    return { data, resolverCount: 1 };
  }

  // ── Subscription (WebSocket simulato) ─────────────────────────
  subscribe(
    query: string,
    onData: (data: Record<string, unknown>) => void
  ): SubscriptionHandle {
    const id = `sub-${Date.now().toString(36)}`;
    const { name } = parseOperation(query);
    const q = query.toLowerCase();

    const handle: SubscriptionHandle = {
      id,
      query:      query.trim(),
      active:     true,
      eventCount: 0,
      startTime:  Date.now(),
      unsubscribe: () => {
        handle.active = false;
        this.activeSubscriptions = this.activeSubscriptions.filter(s => s.id !== id);
        const listeners = this.subListeners.get(id);
        if (listeners) listeners.clear();
        gqlCallRegistry.record({
          id:            `gql-${Date.now().toString(36)}`,
          timestamp:     Date.now(),
          operationType: 'subscription',
          operationName: `${name} [CLOSED]`,
          query:         query.trim(),
          variables:     '{}',
          response:      JSON.stringify({ info: 'Subscription closed' }),
          durationMs:    (Date.now() - handle.startTime) / 1000,
          status:        'success',
          resolverCount: handle.eventCount,
        });
      },
      onData: (cb) => {
        if (!this.subListeners.has(id)) {
          this.subListeners.set(id, new Set());
        }
        this.subListeners.get(id)!.add(cb);
      },
    };

    // Chiama onData immediatamente con dato iniziale
    const d = this.getData();
    this.dispatchSubEvent(id, q, d, onData, handle);
    this.activeSubscriptions.push(handle);

    // Log apertura subscription
    gqlCallRegistry.record({
      id:            `gql-${Date.now().toString(36)}`,
      timestamp:     Date.now(),
      operationType: 'subscription',
      operationName: `${name} [OPENED]`,
      query:         query.trim(),
      variables:     '{}',
      response:      JSON.stringify({ info: 'WebSocket opened, waiting for events...' }),
      durationMs:    0,
      status:        'success',
      resolverCount: 0,
    });

    // Registra il listener
    if (!this.subListeners.has(id)) {
      this.subListeners.set(id, new Set());
    }
    this.subListeners.get(id)!.add(onData);

    return handle;
  }

  private dispatchSubEvent(
    _subId: string,
    queryLower: string,
    update: SimulatorUpdate,
    onData: (data: Record<string, unknown>) => void,
    handle: SubscriptionHandle
  ) {
    if (!handle.active) return;

    let payload: Record<string, unknown> = {};

    if (queryLower.includes('sensorreading')) {
      const reading = update.newReadings[0] || update.readings[0];
      if (reading) {
        payload = {
          sensorReading: {
            id:        reading.id,
            sensorId:  reading.sensorId,
            type:      reading.type,
            value:     reading.value,
            unit:      reading.unit,
            timestamp: new Date(reading.timestamp).toISOString(),
            zone:      reading.zone,
            status:    reading.status,
          },
        };
      }
    } else if (queryLower.includes('newalert')) {
      const alert = update.newAlerts[0];
      if (alert) {
        payload = {
          newAlert: {
            id:           alert.id,
            type:         alert.type,
            severity:     alert.severity,
            message:      alert.message,
            timestamp:    new Date(alert.timestamp).toISOString(),
            zone:         alert.zone,
            acknowledged: false,
          },
        };
      } else {
        return; // Non pushare se non ci sono nuovi alert
      }
    } else if (queryLower.includes('citymetricsupdate')) {
      const last = update.history[update.history.length - 1];
      if (last) {
        payload = {
          cityMetricsUpdate: {
            timestamp:   new Date(last.timestamp).toISOString(),
            traffic:     last.traffic,
            airQuality:  last.airQuality,
            temperature: last.temperature,
            noise:       last.noise,
            energy:      last.energy,
          },
        };
      }
    }

    if (Object.keys(payload).length > 0) {
      handle.eventCount++;
      onData(payload);
    }
  }

  private pushToSubscriptions(update: SimulatorUpdate) {
    this.activeSubscriptions.forEach(handle => {
      if (!handle.active) return;
      const q = handle.query.toLowerCase();
      const listeners = this.subListeners.get(handle.id);
      if (listeners) {
        listeners.forEach(cb => {
          this.dispatchSubEvent(handle.id, q, update, cb, handle);
        });
      }
    });
  }

  getActiveSubscriptions(): SubscriptionHandle[] {
    return [...this.activeSubscriptions];
  }
}

// ============================================================
// QUERY PREDEFINITE — Esempi pronti da eseguire
// ============================================================

export const EXAMPLE_QUERIES: {
  label: string;
  category: string;
  type: GQLOperationType;
  query: string;
  variables?: Record<string, unknown>;
  description: string;
}[] = [
  {
    label: 'All Zones',
    category: 'Query',
    type: 'query',
    description: 'Recupera tutte le 9 zone con le loro metriche complete',
    query: `query GetAllZones {
  zones {
    name
    traffic
    airQuality
    temperature
    noise
    energy
    alertCount
    status
  }
}`,
  },
  {
    label: 'City Stats',
    category: 'Query',
    type: 'query',
    description: 'Statistiche globali della città in un\'unica query',
    query: `query GetCityStats {
  cityStats {
    totalSensors
    activeSensors
    totalReadings
    alertsToday
    avgAirQuality
    avgTraffic
    avgTemperature
    anomaliesDetected
    uptime
  }
}`,
  },
  {
    label: 'Single Zone',
    category: 'Query',
    type: 'query',
    description: 'Recupera dati di una zona specifica per nome',
    query: `query GetZone {
  zone(name: "Centro Storico") {
    name
    traffic
    airQuality
    temperature
    status
    alertCount
  }
}`,
  },
  {
    label: 'Recent Readings',
    category: 'Query',
    type: 'query',
    description: 'Ultime 10 letture filtrate per tipo sensore',
    query: `query GetReadings {
  readings(type: traffic, limit: 10) {
    id
    sensorId
    value
    unit
    timestamp
    zone
    status
  }
}`,
  },
  {
    label: 'Active Alerts',
    category: 'Query',
    type: 'query',
    description: 'Alert attivi filtrati per severity critica',
    query: `query GetCriticalAlerts {
  activeAlerts(severity: critical) {
    id
    type
    severity
    message
    zone
    timestamp
  }
}`,
  },
  {
    label: 'Metrics History',
    category: 'Query',
    type: 'query',
    description: 'Storico delle metriche per i grafici (20 snapshot)',
    query: `query GetMetricsHistory {
  metricsHistory(points: 20) {
    timestamp
    traffic
    airQuality
    temperature
    energy
  }
}`,
  },
  {
    label: 'Ack Alert',
    category: 'Mutation',
    type: 'mutation',
    description: 'Segna un alert come gestito (acknowledged)',
    query: `mutation AcknowledgeAlert {
  acknowledgeAlert(id: "ALR-EXAMPLE-001") {
    success
    alertId
    acknowledgedAt
  }
}`,
  },
  {
    label: 'Paga Multa',
    category: 'Mutation',
    type: 'mutation',
    description: 'Pagamento multa — inoltrato al servizio SOAP legacy',
    query: `mutation PagamentoMulta {
  pagaMulta(
    targa: "AB123CD"
    importo: 87.50
    motivazione: "Sosta in zona vietata"
  ) {
    transactionId
    targa
    importo
    stato
    soapResponseMs
    timestamp
  }
}`,
  },
  {
    label: 'Stream Readings',
    category: 'Subscription',
    type: 'subscription',
    description: 'WebSocket: stream real-time delle letture sensori',
    query: `subscription StreamReadings {
  sensorReading {
    id
    type
    value
    unit
    zone
    status
    timestamp
  }
}`,
  },
  {
    label: 'City Metrics',
    category: 'Subscription',
    type: 'subscription',
    description: 'WebSocket: aggiornamento metriche ogni 2 secondi',
    query: `subscription CityMetrics {
  cityMetricsUpdate {
    timestamp
    traffic
    airQuality
    temperature
    noise
    energy
  }
}`,
  },
  {
    label: 'Alert Stream',
    category: 'Subscription',
    type: 'subscription',
    description: 'WebSocket: push di nuovi alert in tempo reale',
    query: `subscription AlertStream {
  newAlert {
    id
    severity
    message
    zone
    timestamp
  }
}`,
  },
];

// Singleton
export const graphqlEngine = new GraphQLEngine();
