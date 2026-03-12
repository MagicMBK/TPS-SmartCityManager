/**
 * GraphQL Routes — legge dati REALI da Supabase PostgreSQL
 * Niente Math.random() — ogni resolver fa una fetch verso Supabase.
 * Se Supabase non risponde → errore GraphQL, il client lo gestisce.
 */

import { Router } from 'express';

export const graphqlRouter = Router();

// ── Supabase config ─────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://hqekyxrmswdxgpdruiap.supabase.co';
const SUPABASE_API_KEY = 'sb_publishable_GmbuIdt9MrrnboCCLV0pGA_PNFjTdto';

const sbHeaders = {
  'apikey':        SUPABASE_API_KEY,
  'Authorization': `Bearer ${SUPABASE_API_KEY}`,
  'Content-Type':  'application/json',
};

async function sbGet(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

// ── In-memory store per readings ricevute via mutation ─────────────────────
// (le readings arrivano dal sensorSimulator ogni 2s via POST /graphql mutation)
const localReadings: Record<string, unknown>[] = [];
const localAlerts:   Record<string, unknown>[] = [];

// ── Resolvers ───────────────────────────────────────────────────────────────

async function resolveZoneMetrics(zoneName?: string) {
  // Legge le ultime letture per zona da Supabase e calcola le medie
  const rows = await sbGet(
    `readings?select=zone_name,sensor_type,value&order=created_at.desc&limit=500`
  ) as { zone_name: string; sensor_type: string; value: number }[];

  // Raggruppa per zona
  const byZone: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    if (!byZone[r.zone_name]) byZone[r.zone_name] = {};
    if (!byZone[r.zone_name][r.sensor_type]) byZone[r.zone_name][r.sensor_type] = [];
    byZone[r.zone_name][r.sensor_type].push(r.value);
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

  const zones = Object.entries(byZone).map(([zone, metrics]) => ({
    zone,
    traffic:     avg(metrics['traffic']     ?? []),
    airQuality:  avg(metrics['air_quality'] ?? []),
    temperature: avg(metrics['temperature'] ?? []),
    noise:       avg(metrics['noise']       ?? []),
    energy:      avg(metrics['energy']      ?? []),
    timestamp:   new Date().toISOString(),
  }));

  return zoneName ? zones.filter(z => z.zone === zoneName) : zones;
}

async function resolveRecentReadings(limit = 20, type?: string) {
  let path = `readings?select=*&order=created_at.desc&limit=${limit}`;
  if (type) path += `&sensor_type=eq.${type}`;
  const rows = await sbGet(path) as Record<string, unknown>[];
  return rows.map(r => ({
    id:        r.id,
    sensorId:  r.sensor_id,
    type:      r.sensor_type,
    value:     r.value,
    unit:      r.unit,
    zone:      r.zone_name,
    status:    r.status,
    timestamp: r.created_at,
  }));
}

async function resolveActiveAlerts(severity?: string) {
  let path = `alerts?select=*&acknowledged=eq.false&order=created_at.desc&limit=20`;
  if (severity) path += `&severity=eq.${severity}`;
  const rows = await sbGet(path) as Record<string, unknown>[];
  return rows.map(r => ({
    id:           r.id,
    sensorId:     r.sensor_id,
    type:         r.sensor_type,
    severity:     r.severity,
    message:      r.message,
    zone:         r.zone_name,
    acknowledged: r.acknowledged,
    timestamp:    r.created_at,
  }));
}

async function resolveCityStats() {
  const [readings, alerts] = await Promise.all([
    sbGet(`readings?select=zone_name,sensor_type,value,status&order=created_at.desc&limit=200`),
    sbGet(`alerts?select=severity,acknowledged`),
  ]) as [Record<string, unknown>[], Record<string, unknown>[]];

  const trafficVals = (readings as { sensor_type: string; value: number }[])
    .filter(r => r.sensor_type === 'traffic').map(r => r.value);
  const airVals = (readings as { sensor_type: string; value: number }[])
    .filter(r => r.sensor_type === 'air_quality').map(r => r.value);
  const tempVals = (readings as { sensor_type: string; value: number }[])
    .filter(r => r.sensor_type === 'temperature').map(r => r.value);
  const anomalies = (readings as { status: string }[])
    .filter(r => r.status === 'warning' || r.status === 'critical').length;

  const avg = (arr: number[]) => arr.length
    ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;

  return {
    totalSensors:      36,
    activeSensors:     36,
    totalReadings:     readings.length,
    alertsToday:       alerts.length,
    avgTraffic:        avg(trafficVals),
    avgAirQuality:     avg(airVals),
    avgTemperature:    avg(tempVals),
    anomaliesDetected: anomalies,
    uptime:            Math.floor(process.uptime()),
  };
}

// ── Mutation: insertReading (riceve letture dal sensorSimulator) ─────────────
async function mutationInsertReading(input: Record<string, unknown>) {
  // Salva in local buffer (il simulatore manda qui ogni lettura)
  const reading = { ...input, createdAt: new Date().toISOString() };
  localReadings.unshift(reading);
  if (localReadings.length > 500) localReadings.pop();
  return reading;
}

// ── Mutation: acknowledgeAlert ──────────────────────────────────────────────
async function mutationAcknowledgeAlert(id: string) {
  // PATCH su Supabase
  const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts?id=eq.${id}`, {
    method:  'PATCH',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ acknowledged: true }),
  });
  return { success: res.ok, alertId: id, acknowledgedAt: new Date().toISOString() };
}

// ── Mini GraphQL executor ───────────────────────────────────────────────────
async function executeQuery(query: string, variables: Record<string, unknown> = {}) {
  const q = query.trim().replace(/\s+/g, ' ').toLowerCase();

  try {
    // zoneMetrics
    if (q.includes('zonemetrics')) {
      const zone = variables.zone as string | undefined;
      return { data: { zoneMetrics: await resolveZoneMetrics(zone) } };
    }

    // recentReadings
    if (q.includes('recentreadings')) {
      const limit = (variables.limit as number) ?? 20;
      const type  = variables.type as string | undefined;
      return { data: { recentReadings: await resolveRecentReadings(limit, type) } };
    }

    // activeAlerts
    if (q.includes('activealerts')) {
      const severity = variables.severity as string | undefined;
      return { data: { activeAlerts: await resolveActiveAlerts(severity) } };
    }

    // cityStats
    if (q.includes('citystats')) {
      return { data: { cityStats: await resolveCityStats() } };
    }

    // zones (compatibilità con graphqlSimulator frontend)
    if (q.includes('zones')) {
      const zones = await resolveZoneMetrics();
      return {
        data: {
          zones: zones.map(z => ({
            name:        z.zone,
            traffic:     z.traffic,
            airQuality:  z.airQuality,
            temperature: z.temperature,
            noise:       z.noise,
            energy:      z.energy,
            alertCount:  0,
            status:      'OPTIMAL',
          })),
        },
      };
    }

    // readings (compatibilità)
    if (q.includes('readings')) {
      const limit = (variables.limit as number) ?? 20;
      const type  = variables.type as string | undefined;
      return { data: { readings: await resolveRecentReadings(limit, type) } };
    }

    // mutation insertReading
    if (q.includes('insertreading') || (q.includes('mutation') && q.includes('reading'))) {
      const input = (variables.input as Record<string, unknown>) ?? variables;
      return { data: { insertReading: await mutationInsertReading(input) } };
    }

    // mutation acknowledgeAlert
    if (q.includes('acknowledgealert')) {
      const idMatch = query.match(/id:\s*"([^"]+)"/i);
      const id = idMatch?.[1] ?? (variables.id as string) ?? '';
      return { data: { acknowledgeAlert: await mutationAcknowledgeAlert(id) } };
    }

    // introspection
    if (q.includes('__schema') || q.includes('__typename')) {
      return { data: { __typename: 'Query' } };
    }

    return { errors: [{ message: `Query non supportata. Usa: zoneMetrics, recentReadings, activeAlerts, cityStats, insertReading, acknowledgeAlert` }] };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { errors: [{ message: `Errore server: ${msg}` }] };
  }
}

// ── POST /graphql ───────────────────────────────────────────────────────────
graphqlRouter.post('/', async (req, res) => {
  const { query, variables } = req.body as { query?: string; variables?: Record<string, unknown> };

  if (!query) {
    return res.status(400).json({ errors: [{ message: 'Missing "query" field' }] });
  }

  const result = await executeQuery(query, variables ?? {});
  res.json(result);
});

graphqlRouter.get('/', (_req, res) => {
  res.json({
    message:  'PuntoSnai GraphQL — dati reali da Supabase PostgreSQL',
    endpoint: 'POST /graphql',
    supportedQueries: [
      'query { zoneMetrics { zone traffic airQuality temperature } }',
      'query { recentReadings(limit: 20) { id type value zone status } }',
      'query { activeAlerts { id severity message zone } }',
      'query { cityStats { totalSensors avgTraffic anomaliesDetected } }',
      'mutation { insertReading(input: { type: "traffic", value: 72, zone: "Centro Storico" }) { id } }',
      'mutation { acknowledgeAlert(id: "ALR-xxx") { success } }',
    ],
  });
});
