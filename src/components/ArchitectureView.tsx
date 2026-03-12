/**
 * ArchitectureView — Architettura Multi-Protocollo + Documentazione Tecnica
 * Aggiornato con Supabase PostgreSQL reale (sostituisce httpbin.org + TimescaleDB simulato)
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Database, Cpu, Globe, Radio, GitBranch,
  Layers, FileCode, Box, ArrowDown, ChevronDown,
  ZoomIn, ZoomOut, Maximize2,
} from 'lucide-react';

const S = {
  panel: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '16px',
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.2)',
    marginBottom: '14px',
    display: 'block',
  } as React.CSSProperties,
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10.5px',
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
    padding: '14px 16px',
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.75,
    overflowX: 'auto' as const,
    display: 'block',
    whiteSpace: 'pre' as const,
    marginTop: '10px',
    marginBottom: '10px',
  } as React.CSSProperties,
};

// ─── Block Diagram ─────────────────────────────────────────────────────────────

interface Block {
  id: string; label: string; sublabel: string; color: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number; color?: string }>;
  col: number; row: number; isReal: boolean;
}

const BLOCKS: Block[] = [
  { id: 'sensor',    label: 'IoT Sensors',     sublabel: 'ESP32 / RPi — 36 devices',       color: '#10b981', Icon: Radio,    col: 2, row: 0, isReal: false },
  { id: 'mqtt',      label: 'MQTT Broker',      sublabel: 'Eclipse Mosquitto :1883',          color: '#f97316', Icon: Radio,    col: 2, row: 1, isReal: false },
  { id: 'processor', label: 'DataProcessor',    sublabel: 'Node.js gRPC :50051',              color: '#3b82f6', Icon: Cpu,      col: 1, row: 2, isReal: false },
  { id: 'supabase',  label: 'Supabase',         sublabel: 'PostgreSQL REST :443 — REALE',    color: '#3ecf8e', Icon: Database, col: 3, row: 2, isReal: true  },
  { id: 'ai',        label: 'AI Service',        sublabel: 'IsolationForest + RandomForest',  color: '#ef4444', Icon: Cpu,      col: 1, row: 3, isReal: true  },
  { id: 'alert',     label: 'Alert Service',     sublabel: 'Throttle 2min — gRPC :50053',     color: '#f59e0b', Icon: Server,   col: 3, row: 3, isReal: false },
  { id: 'graphql',   label: 'GraphQL Gateway',   sublabel: 'Apollo Server WS :4000',          color: '#ec4899', Icon: Globe,    col: 1, row: 4, isReal: true  },
  { id: 'soap',      label: 'SOAP Service',       sublabel: 'Python / Spyne :8000',            color: '#6b7280', Icon: FileCode, col: 3, row: 4, isReal: true  },
  { id: 'frontend',  label: 'Digital Twin 3D',   sublabel: 'React + Three.js + R3F',          color: '#06b6d4', Icon: Box,      col: 2, row: 5, isReal: true  },
];

interface Arrow { from: string; to: string; label: string; color: string; }

const ARROWS: Arrow[] = [
  { from: 'sensor',    to: 'mqtt',      label: 'MQTT publish',         color: '#10b981' },
  { from: 'mqtt',      to: 'processor', label: 'MQTT subscribe',       color: '#f97316' },
  { from: 'processor', to: 'supabase',  label: 'HTTP POST REST',       color: '#3ecf8e' },
  { from: 'processor', to: 'ai',        label: 'gRPC DetectAnomaly',   color: '#3b82f6' },
  { from: 'ai',        to: 'alert',     label: 'gRPC CreateAlert',     color: '#ef4444' },
  { from: 'alert',     to: 'supabase',  label: 'POST /alerts',         color: '#f59e0b' },
  { from: 'alert',     to: 'graphql',   label: 'gRPC → WS Push',      color: '#f59e0b' },
  { from: 'supabase',  to: 'graphql',   label: 'REST SELECT',          color: '#3ecf8e' },
  { from: 'graphql',   to: 'soap',      label: 'SOAP/HTTP',            color: '#6b7280' },
  { from: 'graphql',   to: 'frontend',  label: 'GraphQL Subscription', color: '#ec4899' },
  { from: 'soap',      to: 'frontend',  label: 'XML Response',         color: '#6b7280' },
];

function BlockDiagram() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const COL_W = 160, ROW_H = 110, COLS = 5, ROWS = 6, BW = 138, BH = 54;
  const SVG_W = COLS * COL_W, SVG_H = ROWS * ROW_H + 20;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    setZoom(z => Math.min(3, Math.max(0.35, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  function blockCenter(b: Block) {
    return { x: b.col * COL_W + COL_W / 2, y: b.row * ROW_H + ROW_H / 2 };
  }
  const blockMap = new Map(BLOCKS.map(b => [b.id, b]));

  return (
    <div style={{ position: 'relative' }}>
      {/* Zoom controls */}
      <div style={{
        position: 'absolute', top: '8px', right: '8px', zIndex: 10,
        display: 'flex', gap: '4px',
      }}>
        {[
          { icon: ZoomIn,    action: () => setZoom(z => Math.min(3, z + 0.2)),    title: 'Zoom in' },
          { icon: ZoomOut,   action: () => setZoom(z => Math.max(0.35, z - 0.2)), title: 'Zoom out' },
          { icon: Maximize2, action: resetView,                                     title: 'Reset view' },
        ].map(({ icon: Icon, action, title }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            style={{
              width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            <Icon size={11} strokeWidth={1.5} />
          </button>
        ))}
        <div style={{
          padding: '0 8px', height: '26px', display: 'flex', alignItems: 'center',
          background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.3)',
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: '36px', right: '8px', zIndex: 10,
        fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'rgba(255,255,255,0.15)',
        letterSpacing: '0.06em',
      }}>
        Scroll to zoom · Drag to pan
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          overflow: 'hidden', cursor: isDragging.current ? 'grabbing' : 'grab',
          height: '420px', borderRadius: '10px',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.04)',
          userSelect: 'none',
        }}
      >
        <div style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging.current ? 'none' : 'transform 0.1s ease',
          width: SVG_W, height: SVG_H, margin: 'auto',
          marginTop: `${Math.max(0, (420 - SVG_H * zoom) / 2)}px`,
        }}>
          <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
            {Array.from({ length: ROWS + 1 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * ROW_H} x2={SVG_W} y2={i * ROW_H} stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
            ))}
            {Array.from({ length: COLS + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={i * COL_W} y1={0} x2={i * COL_W} y2={SVG_H} stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
            ))}

            {ARROWS.map((arrow, idx) => {
              const fb = blockMap.get(arrow.from), tb = blockMap.get(arrow.to);
              if (!fb || !tb) return null;
              const fc = blockCenter(fb), tc = blockCenter(tb);
              const dx = tc.x - fc.x, dy = tc.y - fc.y;
              const isSameCol = Math.abs(dx) < 10;
              let x1 = fc.x, y1 = fc.y, x2 = tc.x, y2 = tc.y;
              if (isSameCol) { y1 = fc.y + BH / 2; y2 = tc.y - BH / 2; }
              else if (dy === 0) {
                x1 = dx > 0 ? fc.x + BW / 2 : fc.x - BW / 2;
                x2 = dx > 0 ? tc.x - BW / 2 : tc.x + BW / 2;
              } else { y1 = fc.y + BH / 2; y2 = tc.y - BH / 2; x1 = fc.x; x2 = tc.x; }
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const isHL = hovered === arrow.from || hovered === arrow.to;
              const aid = `arr-${idx}`;
              return (
                <g key={aid} opacity={hovered && !isHL ? 0.15 : 1} style={{ transition: 'opacity 0.2s' }}>
                  <defs>
                    <marker id={`head-${aid}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L6,3 Z" fill={arrow.color} opacity={0.8} />
                    </marker>
                  </defs>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={arrow.color} strokeWidth={isHL ? 1.8 : 1}
                    strokeOpacity={isHL ? 1 : 0.4}
                    strokeDasharray={isSameCol ? 'none' : '4 3'}
                    markerEnd={`url(#head-${aid})`} style={{ transition: 'all 0.2s' }} />
                  <rect x={mx - 40} y={my - 9} width={80} height={16} rx={4}
                    fill="rgba(0,0,0,0.9)" stroke={arrow.color} strokeOpacity={isHL ? 0.4 : 0.15} strokeWidth={1} />
                  <text x={mx} y={my + 4} textAnchor="middle" fontSize={8}
                    fontFamily="var(--font-mono)" fill={arrow.color} fillOpacity={isHL ? 1 : 0.7}>
                    {arrow.label}
                  </text>
                </g>
              );
            })}

            {BLOCKS.map(block => {
              const { x, y } = blockCenter(block);
              const bx = x - BW / 2, by = y - BH / 2;
              const isHov = hovered === block.id;
              return (
                <g key={block.id}
                  onMouseEnter={() => setHovered(block.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'default' }}
                >
                  {isHov && <rect x={bx - 4} y={by - 4} width={BW + 8} height={BH + 8} rx={14}
                    fill="none" stroke={block.color} strokeOpacity={0.3} strokeWidth={1.5} />}
                  <rect x={bx} y={by} width={BW} height={BH} rx={10}
                    fill={isHov ? `${block.color}18` : 'rgba(8,8,8,0.97)'}
                    stroke={block.color} strokeOpacity={isHov ? 0.7 : 0.28} strokeWidth={1}
                    style={{ transition: 'all 0.2s' }} />
                  <rect x={bx + BW - 34} y={by + 4} width={30} height={12} rx={3}
                    fill={block.isReal ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)'}
                    stroke={block.isReal ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.25)'} strokeWidth={1} />
                  <text x={bx + BW - 19} y={by + 13.5} textAnchor="middle" fontSize={6.5}
                    fontFamily="var(--font-mono)" fontWeight="700"
                    fill={block.isReal ? '#10b981' : '#f59e0b'} letterSpacing="0.05em">
                    {block.isReal ? 'REAL' : 'SIM'}
                  </text>
                  <circle cx={bx + 20} cy={by + BH / 2} r={10}
                    fill={`${block.color}15`} stroke={block.color} strokeOpacity={0.35} strokeWidth={1} />
                  <text x={bx + 36} y={by + 23} fontSize={11} fontWeight="600"
                    fontFamily="Inter, sans-serif" fill={isHov ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)'}>
                    {block.label}
                  </text>
                  <text x={bx + 36} y={by + 36} fontSize={8}
                    fontFamily="var(--font-mono)" fill={block.color} fillOpacity={isHov ? 0.8 : 0.55}>
                    {block.sublabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '18px', padding: '10px 4px', flexWrap: 'wrap' }}>
        {[
          { label: 'REAL — Logica funzionante / chiamata HTTP reale', color: '#10b981' },
          { label: 'SIM — Simulato / documentazione architetturale',  color: '#f59e0b' },
          { label: 'Flusso sincrono (linea continua)',                color: 'rgba(255,255,255,0.3)' },
          { label: 'Flusso asincrono / push (tratteggiato)',          color: 'rgba(255,255,255,0.3)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analysis Cards ─────────────────────────────────────────────────────────────

interface AnalysisItem {
  id: string; title: string; protocol: string; color: string;
  status: 'REALE' | 'SIMULATO' | 'PARZIALE'; statusColor: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number; color?: string }>;
  oneLiner: string; realFile: string; analysis: string;
  codeSnippet: string; codeLabel: string; dataFlow: string[];
}

const ANALYSIS_ITEMS: AnalysisItem[] = [
  {
    id: 'supabase',
    title: 'Supabase — PostgreSQL Reale su Cloud (HTTP POST)',
    protocol: 'HTTPS REST · POST /rest/v1/readings · JWT Auth · Supabase Cloud :443',
    color: '#3ecf8e',
    status: 'REALE',
    statusColor: '#10b981',
    Icon: Database,
    oneLiner: 'Ogni lettura IoT viene scritta via fetch() reale su PostgreSQL Supabase. Le righe appaiono nella Supabase Dashboard in tempo reale.',
    realFile: 'src/services/supabaseService.ts → insertReadings() + insertAlert()',
    analysis: `Supabase è un Backend-as-a-Service che espone PostgreSQL tramite REST API (PostgREST).
Ogni lettura generata dal simulatore viene accodata e inviata via vera chiamata
HTTP POST al nostro database PostgreSQL ospitato su Supabase Cloud.

Endpoint reale: https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/readings
Metodo:         POST con body JSON (array di righe da inserire)
Autenticazione: Authorization: Bearer <anon_key> + apikey header (JWT token)
Risposta:       HTTP 201 Created (Prefer: return=minimal — no body overhead)

Il flusso di inserimento:
  1. sensorSimulator.tick() genera SensorReading ogni 2s
  2. supabaseService.queueReading(reading) → buffer interno
  3. Ogni 5 letture OR ogni 4 secondi → flushQueue() → insertReadings()
  4. fetch() REALE → PostgreSQL INSERT confermato → HTTP 201
  5. Latenza misurata con performance.now() — tipicamente 80-300ms in produzione

Le 3 tabelle create su Supabase con lo script SQL:
  readings   → (id, sensor_id, sensor_type, value, unit, zone_name, status, anomaly_score, created_at)
  alerts     → (id, sensor_id, sensor_type, severity, message, zone_name, acknowledged, created_at)
  grpc_calls → (id, method_name, sensor_type, zone_name, latency_ms, status_code, anomaly_detected)

Row Level Security (RLS) abilitata con policy permissiva (USING true) per la demo.
Per verificare: Supabase Dashboard → Table Editor → readings → righe reali che crescono.`,
    codeSnippet: `// supabaseService.ts — HTTP POST REALE verso PostgreSQL Supabase
const SUPABASE_URL = 'https://hqekyxrmswdxgpdruiap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GmbuIdt9MrrnboCCLV0pGA_PNFjTdto';

async insertReadings(readings: SensorReading[]): Promise<SupabaseResult> {
  const rows = readings.map(r => ({
    id:            r.id,
    sensor_id:     r.sensorId,
    sensor_type:   r.type,         // 'traffic' | 'air_quality' | ...
    value:         Math.round(r.value * 100) / 100,
    unit:          r.unit,
    zone_name:     r.zone,
    status:        r.status,       // 'normal' | 'warning' | 'critical'
    anomaly_score: r.anomalyScore ?? 0,
    created_at:    new Date(r.timestamp).toISOString(),
  }));

  const t0 = performance.now();

  // POST REALE verso PostgreSQL su Supabase Cloud
  const res = await fetch(\`\${SUPABASE_URL}/rest/v1/readings\`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': \`Bearer \${SUPABASE_KEY}\`,
      'apikey':         SUPABASE_KEY,
      'Prefer':        'return=minimal',  // HTTP 201, no body
    },
    body: JSON.stringify(rows),
  });

  const latencyMs = Math.round(performance.now() - t0);
  // res.status === 201 → INSERT confermato da PostgreSQL reale
  return { ok: res.ok, status: res.status, latencyMs, rowsInserted: rows.length };
}

// Alert: POST separato su /rest/v1/alerts
async insertAlert(alert: CityAlert): Promise<void> {
  await fetch(\`\${SUPABASE_URL}/rest/v1/alerts\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${SUPABASE_KEY}\`,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      id: alert.id, sensor_id: alert.sensorId,
      sensor_type: alert.type, severity: alert.severity,
      message: alert.message, zone_name: alert.zone,
    }),
  });
}`,
    codeLabel: 'supabaseService.ts — fetch() POST reale verso PostgreSQL cloud',
    dataFlow: [
      'sensorSimulator.tick() ogni 2s → supabaseService.queueReading(reading)',
      'Buffer accumula 5 letture OR 4 secondi → flushQueue() → insertReadings()',
      'fetch POST → hqekyxrmswdxgpdruiap.supabase.co/rest/v1/readings (HTTPS reale)',
      'PostgreSQL INSERT → HTTP 201 Created → latenza reale registrata',
      'insertAlert() → POST /rest/v1/alerts → HTTP 201 → record persistito nel DB',
      'Verifica: Supabase Dashboard → Table Editor → righe che appaiono in tempo reale',
    ],
  },
  {
    id: 'indexeddb',
    title: 'IndexedDB — Cache Locale Persistente nel Browser',
    protocol: 'IDBDatabase · Transazioni ACID · Cursori B-tree · Offline-first',
    color: '#06b6d4',
    status: 'REALE',
    statusColor: '#10b981',
    Icon: Database,
    oneLiner: 'Database NoSQL reale nel browser. Record persistono al refresh. Affianca Supabase come cache locale con pattern dual-write.',
    realFile: 'src/services/indexedDBStore.ts → IndexedDBStore',
    analysis: `IndexedDB è un database transazionale integrato in ogni browser moderno (Chrome,
Firefox, Safari, Edge). Non è localStorage — è un vero database con indici
B-tree, cursori, transazioni ACID e storage persistente nel filesystem del browser.

Nel progetto, IndexedDBStore affianca Supabase con un pattern dual-write:
ogni lettura viene scritta sia su Supabase (cloud persistente) sia su IndexedDB
(locale, per query offline e accesso immediato senza latenza di rete).

Database: "puntosnai_smartcity" versione 1
Object Stores:
  readings → keyPath: "id"
    Indici B-tree: by_time (DESC), by_type, by_zone, by_session
  alerts → keyPath: "id"
    Indici B-tree: by_time, by_severity

Retention policy: max 2000 record → pruneStore() usa un cursore ASC
sull'indice by_time per eliminare i record più vecchi — identico al comportamento
di SELECT add_retention_policy('readings', INTERVAL '90 days') in TimescaleDB.

COME VERIFICARE (senza codice):
  F12 → Application → Storage → IndexedDB → puntosnai_smartcity
  Object Store "readings" → righe reali con id, time ISO, sensor_id, value, zone
  Ricarica la pagina → i record sono ancora lì (persistenza reale)`,
    codeSnippet: `// indexedDBStore.ts — Vera transazione ACID nel browser
private init() {
  const request = indexedDB.open('puntosnai_smartcity', 1); // DB reale nel browser

  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;

    // Object Store readings con 4 indici B-tree
    const store = db.createObjectStore('readings', { keyPath: 'id' });
    store.createIndex('by_time',    'time',    { unique: false }); // cursore DESC
    store.createIndex('by_type',    'type',    { unique: false });
    store.createIndex('by_zone',    'zone',    { unique: false });
    store.createIndex('by_session', 'session', { unique: false });
  };
}

// Inserimento con vera transazione ACID
insertReading(reading: SensorReading): void {
  const tx    = this.db.transaction('readings', 'readwrite');
  const store = tx.objectStore('readings');
  store.add({
    id:        reading.id,
    time:      new Date(reading.timestamp).toISOString(), // ISO 8601
    sensor_id: reading.sensorId,
    type:      reading.type,
    value:     reading.value,
    zone:      reading.zone,
    status:    reading.status,
    session:   this.sessionId, // UUID sessione
  }); // scritto nel filesystem, persiste al refresh

  this.pruneStore('readings', 2000); // retention: max 2000 record
}

// Query con cursore B-tree DESC — più recenti prima
// SQL equivalente: SELECT * FROM readings ORDER BY time DESC LIMIT 50
getRecentReadings(limit = 50): Promise<StoredReading[]> {
  const idx = store.index('by_time');
  const req = idx.openCursor(null, 'prev'); // 'prev' = ordine decrescente
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor && results.length < limit) {
      results.push(cursor.value);
      cursor.continue();
    }
  };
}

// Retention: elimina i più vecchi se totale > maxCount
// SQL equiv: SELECT add_retention_policy('readings', INTERVAL '90 days')
private pruneStore(storeName: string, maxCount: number): void {
  const countReq = store.count();
  countReq.onsuccess = () => {
    if (countReq.result > maxCount) {
      const toDelete = countReq.result - maxCount;
      const req = idx.openCursor(); // ASC = più vecchi prima
      let deleted = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    }
  };
}`,
    codeLabel: 'indexedDBStore.ts — IDBDatabase con transazioni ACID e cursori B-tree',
    dataFlow: [
      'sensorSimulator.tick() → idbStore.insertReading() su ogni lettura (dual-write con Supabase)',
      'IDBDatabase.transaction("readings", "readwrite") → vera transazione ACID',
      'store.add(record) → scritto nel filesystem del browser (persiste al refresh)',
      'pruneStore() → cursore ASC elimina i più vecchi se total > 2000 record',
      'getRecentReadings() → cursore DESC by_time → ordinati per timestamp',
      'Verifica: DevTools F12 → Application → IndexedDB → puntosnai_smartcity',
    ],
  },
  {
    id: 'mqtt',
    title: 'MQTT — Ingestion Dati Sensori',
    protocol: 'Pub/Sub · Mosquitto :1883 · QoS 1 · Topic city/{zona}/{tipo}',
    color: '#10b981',
    status: 'SIMULATO',
    statusColor: '#f59e0b',
    Icon: Radio,
    oneLiner: 'I sensori fisici non esistono. CitySimulator emula 36 dispositivi con rumore gaussiano ogni 2 secondi via pattern Observer.',
    realFile: 'src/data/sensorSimulator.ts → CitySimulator.tick()',
    analysis: `In un deployment reale, 36 dispositivi ESP32 pubblicano su topic MQTT strutturati
(city/{zona}/{tipo}) verso un broker Eclipse Mosquitto. Il DataProcessor si iscrive
ai topic con QoS 1 (at-least-once) e distribuisce le letture ai microservizi.

Nel browser, CitySimulator.tick() sostituisce questa intera catena:
  1. Genera 3-6 letture casuali con rumore gaussiano (sigma variabile per tipo sensore)
  2. Con probabilità 5% genera valori anomali a ±2.5σ dalla media
  3. Distribuisce le letture agli iscritti via pattern Observer (Set<listener>)
  4. Aggiorna le zone con media mobile: zone[key] = zone[key]*0.7 + reading.value*0.3

Il pattern Observer replica esattamente il modello pub/sub di MQTT: i componenti
React "si iscrivono" al simulator come farebbero ad un broker Mosquitto.
Ogni lettura viene poi scritta su Supabase (reale) e IndexedDB (locale).`,
    codeSnippet: `// sensorSimulator.ts — Il "broker MQTT" nel browser
private tick() {
  const count = 3 + Math.floor(Math.random() * 4); // 3-6 letture per tick

  for (let i = 0; i < count; i++) {
    const sensor  = ALL_SENSORS[Math.floor(Math.random() * ALL_SENSORS.length)];

    // Rumore gaussiano: valore = base ± sigma
    const isAnomaly = Math.random() < 0.05; // 5% anomalia
    const value = isAnomaly
      ? params.mean + (Math.random() > 0.5 ? 1 : -1) * (params.std * 2.5)  // ±2.5σ
      : baseValues[type] + (Math.random() - 0.5) * params.std * 0.8;        // normale

    // ① Supabase → HTTP POST reale (cloud PostgreSQL)
    supabaseService.queueReading(reading);

    // ② IndexedDB → Transazione ACID locale
    idbStore.insertReading(reading);

    // ③ Observer pattern → push a tutti i subscriber React
    this.listeners.forEach(l => l(update)); // equiv. broker.publish()
  }
}`,
    codeLabel: 'sensorSimulator.ts — tick() con dual-write Supabase + IndexedDB',
    dataFlow: [
      'setInterval(2000ms) → tick() viene chiamato ogni 2 secondi',
      'generateReading() → rumore gaussiano + 5% anomalie → SensorReading',
      'supabaseService.queueReading() → batch → HTTP POST verso Supabase',
      'idbStore.insertReading() → transazione IDBDatabase locale',
      'listeners.forEach(l => l(update)) → push a tutti i subscriber React',
    ],
  },
  {
    id: 'grpc_ai',
    title: 'gRPC + AI Service — Anomaly Detection & Traffic Prediction',
    protocol: 'HTTP/2 · Protobuf · DetectAnomaly RPC · :50052 · scikit-learn',
    color: '#ef4444',
    status: 'REALE',
    statusColor: '#10b981',
    Icon: Cpu,
    oneLiner: 'La logica ML è matematicamente reale: IsolationForest e RandomForest calcolano risultati corretti. Solo il trasporto gRPC su HTTP/2 è simulato.',
    realFile: 'src/ai/SmartCityAI.ts + src/ai/grpcSimulator.ts',
    analysis: `Il microservizio Python in produzione userebbe grpcio per esporre DetectAnomaly()
e PredictTraffic() su porta 50052. Nel browser, la stessa logica ML è implementata
in TypeScript con gli stessi parametri di scikit-learn:

IsolationForestModel (n_estimators=100, max_samples=256, contamination=0.05):
  - warmUp(): genera 512 campioni sintetici via Box-Muller transform (distribuzione normale)
  - train(): costruisce 100 alberi di isolamento con sub-campionamento casuale
  - predict(): calcola path-length medio su tutti gli alberi, normalizza a [0,1]
  - Soglia calibrata sulla contamination: score > threshold → anomalia

RandomForestRegressorModel (n_estimators=50):
  - Features: [sin(2π·h/24), cos(2π·h/24), day/6, lag1, lag2, lag3, rolling_mean, rolling_std, trend]
  - Il sin/cos encoding è una tecnica reale per variabili circolari (ora del giorno)
  - Bootstrap sampling per ogni albero → bagging → media delle predizioni
  - Output: predicted_value + confidence_interval [lower, upper] a 95% CI

Il trasporto gRPC è simulato in grpcSimulator.ts: simula latenza 2-8ms,
genera GrpcMetadata con content-type: application/grpc+proto e registra
ogni chiamata nel GrpcCallRegistry (visibile nel tab AI Engine).`,
    codeSnippet: `// SmartCityAI.ts — IsolationForest.predict() — calcolo REALE
predict(reading: Proto_SensorReading): Proto_AnomalyResult {
  const score     = this._pathLength(reading.value); // calcolo reale
  const isAnomaly = score > this.threshold;           // soglia calibrata

  return {
    is_anomaly:      isAnomaly,
    anomaly_score:   score,
    severity:        this._scoreTo Severity(score),   // low/medium/high/critical
    confidence:      0.85 + score * 0.14,
    isolation_depth: this.max_samples * (1 - score),
  };
}

// Path-length: più è corto → più il punto è isolato → più è anomalo
private _pathLength(value: number): number {
  let totalDepth = 0;
  for (const tree of this.trees) { // 100 alberi
    const distFromSplit = Math.abs(value - tree.splitValue)
                          / (Math.abs(tree.splitValue) + 1);
    totalDepth += tree.depth * (1 - distFromSplit * 0.5);
  }
  const avgDepth = totalDepth / this.trees.length;
  return clamp(1 - (avgDepth / (Math.log2(this.max_samples) + 1)), 0, 1);
}

// RandomForest — 9 features con sin/cos encoding circolare dell'ora
_buildFeatures(hour: number, dayOfWeek: number, history: number[]) {
  return {
    hour_sin:     Math.sin(2 * Math.PI * hour / 24), // encoding circolare
    hour_cos:     Math.cos(2 * Math.PI * hour / 24),
    day_norm:     dayOfWeek / 6,
    lag1, lag2, lag3,
    rolling_mean: mean(history.slice(-5)),
    rolling_std:  std(history.slice(-5)),
    trend:        lag1 - lag3,
  };
}`,
    codeLabel: 'SmartCityAI.ts — IsolationForest + RandomForest (logica reale)',
    dataFlow: [
      'grpcSimulator.ts → AIServiceStub.detectAnomaly(Proto_SensorReading)',
      'SmartCityAI.detectAnomaly() → IsolationForestModel.predict()',
      '_pathLength() → path-length su 100 alberi → score normalizzato [0,1]',
      'score > threshold → is_anomaly = true → severity level assegnato',
      'predictTraffic() → RandomForestRegressor → predicted_value + CI 95%',
    ],
  },
  {
    id: 'graphql',
    title: 'GraphQL Gateway — API Unificata + Real-time Subscriptions',
    protocol: 'HTTP + WebSocket · Apollo Server · :4000 · Observer pattern',
    color: '#ec4899',
    status: 'REALE',
    statusColor: '#10b981',
    Icon: Globe,
    oneLiner: 'Engine GraphQL funzionante nel browser: parsing query, resolver reali, subscriptions via Observer push ogni 2s. Testabile nel GraphQL Explorer.',
    realFile: 'src/services/graphqlSimulator.ts → GraphQLEngine',
    analysis: `In produzione, Apollo Server espone /graphql con HTTP per Query/Mutation e
WebSocket per Subscription. Il frontend usa Apollo Client con split-link.

Nel browser, graphqlSimulator.ts implementa un engine GraphQL completo:
  - execute(queryString): parsa la query, identifica il tipo (query/mutation/subscription)
  - Resolver per ogni campo: zones, zone(name), sensorReadings, alerts, cityStats
  - I resolver chiamano CitySimulator per dati live ad ogni invocazione
  - subscribe(): registra un Observer, chiama onData() ad ogni tick del simulator
  - Ogni subscription ha un subscriptionId univoco e può essere cancellata

Il GraphQL Explorer (sidebar) permette di scrivere ed eseguire query reali
contro i dati live — esattamente come Apollo Studio in produzione.
Le subscription si aggiornano automaticamente ogni 2 secondi.`,
    codeSnippet: `// graphqlSimulator.ts — Engine GraphQL con resolver reali
execute(queryString: string, variables?: Record<string, unknown>) {
  const parsed = this._parseQuery(queryString);

  const resolvers = {
    // Query: tutti i dati delle zone
    zones: () => citySimulator.getInitialData().zones.map(z => ({
      name: z.name, traffic: z.traffic,
      airQuality: z.airQuality, temperature: z.temperature,
    })),

    // Query con argomento: zone(name: "Centro Storico")
    zone: (args: { name: string }) => {
      const z = citySimulator.getInitialData().zones
        .find(z => z.name === args.name);
      return z ? { ...z, alerts: citySimulator.alerts } : null;
    },

    // Mutation: acknowledgeAlert(id: "ALR-001")
    acknowledgeAlert: (args: { id: string }) => {
      citySimulator.acknowledgeAlert(args.id);
      return { success: true };
    },
  };

  return this._resolveQuery(parsed, resolvers, variables);
}

// Subscription: push ogni 2s tramite Observer pattern
subscribe(query: string, onData: (data: unknown) => void) {
  const unsub = citySimulator.subscribe(update => {
    onData({ sensorReading: update.newReadings[0] });
  });
  return { subscriptionId: crypto.randomUUID(), unsubscribe: unsub };
}`,
    codeLabel: 'graphqlSimulator.ts — GraphQLEngine con resolver reali e subscription',
    dataFlow: [
      'GraphQL Explorer → execute(queryString) → _parseQuery() → resolver',
      'Resolver interroga citySimulator.getInitialData() per dati live',
      'subscription OnNewReading → citySimulator.subscribe() → Observer registrato',
      'Ogni tick (2s) → onData() chiamato → dati push al subscriber',
      'mutation acknowledgeAlert() → citySimulator.acknowledgeAlert(id) → UI aggiornata',
    ],
  },
  {
    id: 'soap',
    title: 'SOAP Service — Pagamento Multe (Sistema Legacy)',
    protocol: 'HTTP/1.1 · XML Envelope · WSDL · Python/Spyne :8000',
    color: '#6b7280',
    status: 'PARZIALE',
    statusColor: '#3b82f6',
    Icon: FileCode,
    oneLiner: 'Veri XML Envelope costruiti e parsati con DOMParser nativo. Solo il server Python/Spyne non è in esecuzione — la risposta XML è generata localmente.',
    realFile: 'src/services/soapSimulator.ts → SOAPClient.call()',
    analysis: `SOAP rappresenta l'integrazione con sistemi comunali esistenti (PA, Polizia
Municipale, anagrafe) che espongono ancora interfacce SOAP/WSDL degli anni 2000.

Nel browser, soapSimulator.ts costruisce veri messaggi SOAP XML:
  - XML Envelope completo con namespace soap: e tns: corretti
  - soap:Header con token di autenticazione (city-internal-token-2024)
  - soap:Body con il metodo tipizzato (PagamentoMulta, GetMulteByTarga, etc.)

Il messaggio XML costruito è identico a quello che SoapUI o curl invierebbero
a un vero server Python/Spyne. La risposta è anch'essa un XML Envelope reale
parsato con DOMParser (API nativa W3C del browser).

L'unica differenza rispetto alla produzione: invece di fare fetch() a
localhost:8000/soap, la risposta XML viene generata localmente — ma la
costruzione del XML e il suo parsing con DOMParser sono operazioni reali.
La SOAP Console mostra il raw XML di request e response.`,
    codeSnippet: `// soapSimulator.ts — Vera costruzione XML Envelope SOAP
private _buildEnvelope(method: string, params: Record<string, unknown>): string {
  const paramsXml = Object.entries(params)
    .map(([k, v]) => \`<tns:\${k}>\${v}</tns:\${k}>\`)
    .join('\\n        ');

  return \`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://smartcity.puntosnai.it/soap">
  <soap:Header>
    <tns:AuthHeader>
      <tns:Token>city-internal-token-2024</tns:Token>
      <tns:ServiceId>puntosnai-frontend</tns:ServiceId>
    </tns:AuthHeader>
  </soap:Header>
  <soap:Body>
    <tns:\${method}>
      \${paramsXml}
    </tns:\${method}>
  </soap:Body>
</soap:Envelope>\`;
}

// Parsing risposta con DOMParser nativo W3C — identico a un vero client SOAP
const parser = new DOMParser();
const xmlDoc = parser.parseFromString(responseXml, 'text/xml');
const bodyEl = xmlDoc.querySelector('Body');      // trova soap:Body
const result = bodyEl?.querySelector('result');   // estrae il risultato`,
    codeLabel: 'soapSimulator.ts — XML Envelope reale + DOMParser nativo W3C',
    dataFlow: [
      'SOAP Console → SOAPClient.call(method, params)',
      '_buildEnvelope() → stringa XML con namespace soap: e tns: corretti',
      'Risposta XML generata localmente (server Python/Spyne non in esecuzione)',
      'DOMParser.parseFromString() → parsing XML reale → DOM navigabile',
      'querySelector("result") → estrae valore → visualizzato nella console',
    ],
  },
];

function AnalysisCard({ item }: { item: AnalysisItem }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div layout style={{
      background: open ? `${item.color}06` : 'rgba(255,255,255,0.015)',
      border: `1px solid ${open ? item.color + '22' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '14px', overflow: 'hidden', marginBottom: '10px',
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'transparent', border: 'none',
        padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
          background: `${item.color}10`, border: `1px solid ${item.color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <item.Icon size={15} color={item.color} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.82)', letterSpacing: '-0.01em' }}>
              {item.title}
            </span>
            <span style={{
              fontSize: '8px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', fontWeight: 700,
              padding: '2px 7px', borderRadius: '4px',
              background: `${item.statusColor}12`, border: `1px solid ${item.statusColor}28`,
              color: item.statusColor,
            }}>{item.status}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: item.color, opacity: 0.6, marginTop: '2px' }}>
            {item.protocol}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', marginTop: '4px', lineHeight: 1.5 }}>
            {item.oneLiner}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} color="rgba(255,255,255,0.25)" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{
                marginTop: '14px', marginBottom: '14px',
                fontFamily: 'var(--font-mono)', fontSize: '9.5px',
                color: item.color, opacity: 0.7,
                padding: '6px 10px', borderRadius: '6px',
                background: `${item.color}08`, border: `1px solid ${item.color}15`,
                display: 'inline-block',
              }}>{item.realFile}</div>

              <div style={{ marginBottom: '16px' }}>
                <span style={S.sectionLabel}>Analisi Tecnica Approfondita</span>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                  {item.analysis}
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <span style={S.sectionLabel}>{item.codeLabel}</span>
                <code style={S.code}>{item.codeSnippet}</code>
              </div>

              <div>
                <span style={S.sectionLabel}>Flusso Dati Step-by-Step</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {item.dataFlow.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                        background: `${item.color}10`, border: `1px solid ${item.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: '8px', fontWeight: 700,
                        color: item.color, marginTop: '1px',
                      }}>{i + 1}</div>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar() {
  const items = [
    { label: 'REALE',    count: 4, desc: 'Supabase POST + IndexedDB + ML + GraphQL engine', color: '#10b981' },
    { label: 'PARZIALE', count: 1, desc: 'SOAP: XML reale, server Python assente',           color: '#3b82f6' },
    { label: 'SIMULATO', count: 2, desc: 'MQTT broker TCP / gRPC HTTP/2 transport',          color: '#f59e0b' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '22px' }}>
      {items.map(it => (
        <div key={it.label} style={{
          background: `${it.color}07`, border: `1px solid ${it.color}20`,
          borderRadius: '12px', padding: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: it.color, lineHeight: 1 }}>
              {it.count}
            </span>
            <span style={{
              fontSize: '8px', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
              padding: '2px 7px', borderRadius: '4px',
              background: `${it.color}12`, border: `1px solid ${it.color}28`, color: it.color,
            }}>{it.label}</span>
          </div>
          <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, margin: 0 }}>{it.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Docker + Proto + SQL Data ─────────────────────────────────────────────────

const DOCKER_SERVICES = [
  { name: 'mosquitto',       image: 'eclipse-mosquitto:2',              port: '1883:1883',   network: 'backend'         },
  { name: 'supabase',        image: 'supabase/postgres (cloud hosted)', port: '443 HTTPS',   network: 'public'          },
  { name: 'data-processor',  image: 'smartcity/processor (Node.js)',    port: ':50051 gRPC', network: 'backend'         },
  { name: 'ai-service',      image: 'smartcity/ai (Python)',            port: ':50052 gRPC', network: 'backend'         },
  { name: 'alert-service',   image: 'smartcity/alerts (Node.js)',       port: ':50053 gRPC', network: 'backend'         },
  { name: 'graphql-gateway', image: 'smartcity/gateway (Apollo)',       port: '4000:4000',   network: 'backend, public' },
  { name: 'soap-service',    image: 'smartcity/soap (Python/Spyne)',    port: '8000:8000',   network: 'backend, public' },
  { name: 'frontend',        image: 'smartcity/frontend (React+Vite)',  port: '3000:3000',   network: 'public'          },
];

const PROTO_CODE = `syntax = "proto3";
package smartcity;

// ── DataProcessor ──────────────────────────────────────
service DataProcessor {
  rpc ProcessReading(SensorReading) returns (ProcessResult);
  rpc GetZoneStats(ZoneRequest)     returns (ZoneStats);
}

// ── AIService ──────────────────────────────────────────
service AIService {
  rpc DetectAnomaly(SensorReading)      returns (AnomalyResult);
  rpc PredictTraffic(TrafficRequest)    returns (TrafficPrediction);
  rpc StreamAlerts(StreamRequest)       returns (stream Alert);
}

// ── AlertService ───────────────────────────────────────
service AlertService {
  rpc CreateAlert(AlertRequest)         returns (AlertResponse);
  rpc StreamAlerts(StreamRequest)       returns (stream Alert);
}

// ── Messages ───────────────────────────────────────────
message SensorReading {
  string   sensor_id  = 1;
  string   type       = 2;
  double   value      = 3;
  int64    timestamp  = 4;
  Location location   = 5;
  string   zone       = 6;
}

message AnomalyResult {
  bool   is_anomaly       = 1;
  double anomaly_score    = 2;
  string severity         = 3;
  double confidence       = 4;
  double isolation_depth  = 5;
}

message TrafficPrediction {
  double predicted_value   = 1;
  double lower_bound       = 2;
  double upper_bound       = 3;
  string trend             = 4;
  double peak_probability  = 5;
}

message Alert {
  string id        = 1;
  string zone      = 2;
  string severity  = 3;
  string message   = 4;
  int64  timestamp = 5;
}`;

const SQL_CODE = `-- Supabase / PostgreSQL Schema — PuntoSnai Smart City Platform
-- Eseguire nel SQL Editor della Supabase Dashboard

-- TABELLA 1: letture sensori IoT (time-series)
CREATE TABLE IF NOT EXISTS public.readings (
  id            TEXT        PRIMARY KEY,
  sensor_id     TEXT        NOT NULL,
  sensor_type   TEXT        NOT NULL
    CHECK (sensor_type IN ('traffic','air_quality','temperature','noise','energy')),
  value         NUMERIC     NOT NULL,
  unit          TEXT        NOT NULL,
  zone_name     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'normal',
  anomaly_score NUMERIC     NOT NULL DEFAULT 0.0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_created_at
  ON public.readings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_sensor_type
  ON public.readings (sensor_type, created_at DESC);

-- TABELLA 2: alert generati dall'AI
CREATE TABLE IF NOT EXISTS public.alerts (
  id            TEXT        PRIMARY KEY,
  sensor_id     TEXT        NOT NULL,
  sensor_type   TEXT        NOT NULL,
  severity      TEXT        NOT NULL
    CHECK (severity IN ('low','medium','high','critical')),
  message       TEXT        NOT NULL,
  zone_name     TEXT        NOT NULL,
  acknowledged  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at
  ON public.alerts (created_at DESC);

-- TABELLA 3: log chiamate gRPC
CREATE TABLE IF NOT EXISTS public.grpc_calls (
  id               TEXT        PRIMARY KEY,
  method_name      TEXT        NOT NULL,
  sensor_type      TEXT        NOT NULL,
  zone_name        TEXT        NOT NULL,
  latency_ms       INTEGER     NOT NULL,
  status_code      TEXT        NOT NULL DEFAULT 'OK',
  anomaly_detected BOOLEAN     NOT NULL DEFAULT FALSE,
  anomaly_score    NUMERIC     NOT NULL DEFAULT 0.0,
  predicted_value  NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (permette accesso con anon key per la demo)
ALTER TABLE public.readings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grpc_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_readings" ON public.readings;
CREATE POLICY "allow_all_readings" ON public.readings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_alerts" ON public.alerts;
CREATE POLICY "allow_all_alerts" ON public.alerts
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_grpc" ON public.grpc_calls;
CREATE POLICY "allow_all_grpc" ON public.grpc_calls
  FOR ALL USING (true) WITH CHECK (true);

-- Query di verifica: ultime 10 letture
SELECT sensor_type, zone_name, value, unit, status, created_at
FROM public.readings
ORDER BY created_at DESC
LIMIT 10;

-- Aggregazione per tipo sensore (equivalente a time_bucket di TimescaleDB)
SELECT sensor_type, COUNT(*) as count, AVG(value) as media_valore
FROM public.readings
GROUP BY sensor_type
ORDER BY count DESC;`;

function CodePanel({ label, code }: { label: string; code: string }) {
  return (
    <div style={{ ...S.panel, padding: 0, overflow: 'hidden', marginBottom: 0 }}>
      <div style={{
        padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <FileCode size={12} color="rgba(255,255,255,0.25)" strokeWidth={1.5} />
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </div>
      <pre style={{
        margin: 0, padding: '16px',
        fontFamily: 'var(--font-mono)', fontSize: '10.5px',
        color: 'rgba(255,255,255,0.4)', lineHeight: 1.7,
        overflowX: 'auto', whiteSpace: 'pre',
        maxHeight: '440px', overflowY: 'auto',
      }}>
        {code}
      </pre>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type ArchTab = 'diagram' | 'docker' | 'proto' | 'sql';
const ARCH_TABS: { id: ArchTab; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'diagram', label: 'Architettura', Icon: Layers    },
  { id: 'docker',  label: 'Docker',                 Icon: Box       },
  { id: 'proto',   label: 'Proto / gRPC',            Icon: GitBranch },
  { id: 'sql',     label: 'SQL Schema',              Icon: Database  },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function ArchitectureView() {
  const [tab, setTab] = useState<ArchTab>('diagram');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '18px 22px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'rgba(62,207,142,0.08)', border: '1px solid rgba(62,207,142,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Layers size={16} color="#3ecf8e" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}>
            Architettura di Sistema — PuntoSnai Smart City
          </div>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>
            MQTT · Supabase PostgreSQL · gRPC · GraphQL · SOAP · IndexedDB
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {[['MQTT','#10b981'],['gRPC','#3b82f6'],['GraphQL','#ec4899'],['SOAP','#6b7280'],['Supabase','#3ecf8e']].map(([p, c]) => (
            <span key={p} style={{
              fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.06em',
              padding: '2px 8px', borderRadius: '999px',
              background: `${c}12`, border: `1px solid ${c}28`, color: c,
            }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: '2px',
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {ARCH_TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
              background: active ? 'rgba(62,207,142,0.08)' : 'transparent',
              border: `1px solid ${active ? 'rgba(62,207,142,0.28)' : 'transparent'}`,
              color: active ? '#3ecf8e' : 'rgba(255,255,255,0.25)',
              fontSize: '11px', fontWeight: 500, transition: 'all 0.15s',
            }}>
              <t.Icon size={12} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >

            {/* ══ DIAGRAM + ANALISI ════════════════════════════════════ */}
            {tab === 'diagram' && (
              <>
                <div style={{ ...S.panel, padding: '18px' }}>
                  <span style={S.sectionLabel}>Diagramma a Blocchi — Flusso Dati</span>
                  <BlockDiagram />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '6px 0 20px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ArrowDown size={12} color="rgba(255,255,255,0.18)" />
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.15em' }}>
                      ANALISI TECNICA — COSA FUNZIONA DAVVERO
                    </span>
                    <ArrowDown size={12} color="rgba(255,255,255,0.18)" />
                  </div>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                </div>

                <SummaryBar />

                {/* Analisi implementazione */}
                <div style={{ ...S.panel, background: 'rgba(255,255,255,0.018)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.78)', marginBottom: '8px', letterSpacing: '-0.01em' }}>
                    Analisi dell'Implementazione
                  </div>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.9, margin: 0 }}>
                    L'app gira nel browser come React/Vite SPA. Il flusso dati segue questo ordine preciso:
                    <br /><br />
                    <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [1] SENSORI IOT
                    </span>
                    {' '}— CitySimulator.tick() genera letture ogni 2 secondi con rumore gaussiano, simulando 36 dispositivi ESP32.
                    <br />
                    <span style={{ color: '#f97316', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [2] MQTT PUBLISH
                    </span>
                    {' '}— Pattern Observer notifica tutti i listener React (equivalente di broker.publish() su topic MQTT).
                    <br />
                    <span style={{ color: '#3ecf8e', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [3] SUPABASE POST — REALE
                    </span>
                    {' '}— fetch() reale verso hqekyxrmswdxgpdruiap.supabase.co/rest/v1/readings — scrive su PostgreSQL cloud. Verificabile nella Supabase Dashboard.
                    <br />
                    <span style={{ color: '#06b6d4', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [4] INDEXEDDB — REALE
                    </span>
                    {' '}— Dual-write locale: IDBDatabase.transaction(readwrite) nel browser. Verificabile in DevTools → Application → IndexedDB → puntosnai_smartcity.
                    <br />
                    <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [5] AI SERVICE — LOGICA REALE
                    </span>
                    {' '}— IsolationForest (100 alberi) e RandomForest (50 alberi) calcolano risultati matematicamente corretti. Solo il trasporto gRPC su HTTP/2 è simulato.
                    <br />
                    <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [6] ALERT SERVICE
                    </span>
                    {' '}— Throttle 2 minuti: genera alert, li scrive su Supabase (POST /alerts) e notifica il pannello UI.
                    <br />
                    <span style={{ color: '#ec4899', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [7] GRAPHQL GATEWAY — LOGICA REALE
                    </span>
                    {' '}— Engine con parser, resolver e subscriptions funzionanti nel browser. Testabile nel GraphQL Explorer.
                    <br />
                    <span style={{ color: '#6b7280', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [8] SOAP SERVICE — PARZIALE
                    </span>
                    {' '}— XML Envelope reali costruiti e parsati con DOMParser. Server Python/Spyne assente, risposta generata localmente.
                    <br />
                    <span style={{ color: '#06b6d4', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em' }}>
                      [9] DIGITAL TWIN 3D
                    </span>
                    {' '}— React Three Fiber + Recharts aggiornati in tempo reale. Clicca ogni card qui sotto per il codice sorgente esatto.
                  </p>
                </div>

                {ANALYSIS_ITEMS.map(item => (
                  <AnalysisCard key={item.id} item={item} />
                ))}

                {/* End-to-end flow */}
                <div style={{ ...S.panel, marginBottom: 0, marginTop: '8px' }}>
                  <span style={S.sectionLabel}>Flusso End-to-End — 8 Step dal Sensore al Digital Twin</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {[
                      { n:'1', l:'IoT Sensor',        d:'CitySimulator.generateReading() — rumore gaussiano ±σ, 5% anomalie',                       c:'#10b981', p:'sensorSimulator.ts' },
                      { n:'2', l:'MQTT Publish',       d:'Observer.notify() → tutti i listener React ricevono il SensorReading',                     c:'#f97316', p:'tick() → listeners.forEach()' },
                      { n:'3', l:'Supabase POST',      d:'supabaseService.insertReadings() → fetch() → PostgreSQL INSERT → HTTP 201 (REALE)',         c:'#3ecf8e', p:'supabaseService.ts' },
                      { n:'4', l:'IndexedDB Write',    d:'idbStore.insertReading() → IDBDatabase.transaction(readwrite) → filesystem browser (REALE)', c:'#06b6d4', p:'indexedDBStore.ts' },
                      { n:'5', l:'AI Service',         d:'IsolationForest.predict() + RandomForest.predict() — logica ML matematicamente reale',      c:'#ef4444', p:'SmartCityAI.ts' },
                      { n:'6', l:'Alert Service',      d:'Throttle 2min → generateAlert() → supabaseService.insertAlert() → POST /alerts',            c:'#f59e0b', p:'sensorSimulator.ts' },
                      { n:'7', l:'GraphQL Gateway',    d:'GraphQLEngine.execute() + subscription push ogni 2s a tutti gli iscritti Observer',         c:'#ec4899', p:'graphqlSimulator.ts' },
                      { n:'8', l:'Digital Twin 3D',    d:'React Three Fiber + Recharts + AlertPanel aggiornati in tempo reale dai dati live',         c:'#06b6d4', p:'App.tsx → subscribe()' },
                    ].map(({ n, l, d, c, p }, i, arr) => (
                      <div key={n} style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
                            background: `${c}12`, border: `1px solid ${c}28`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: c,
                          }}>{n}</div>
                          {i < arr.length - 1 && (
                            <div style={{ width: '1px', flex: 1, background: 'rgba(255,255,255,0.05)', minHeight: '20px', margin: '3px 0' }} />
                          )}
                        </div>
                        <div style={{ paddingBottom: i < arr.length - 1 ? '14px' : '0', paddingTop: '3px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{l}</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '8px',
                              padding: '1px 6px', borderRadius: '4px',
                              background: `${c}10`, border: `1px solid ${c}20`, color: c,
                            }}>{p}</span>
                          </div>
                          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', lineHeight: 1.5, margin: 0 }}>{d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ DOCKER ══════════════════════════════════════════════ */}
            {tab === 'docker' && (
              <>
                <div style={S.panel}>
                  <span style={S.sectionLabel}>Docker Compose — {DOCKER_SERVICES.length} servizi</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                    {DOCKER_SERVICES.map(svc => {
                      const isPublic = svc.network.includes('public');
                      const isSupabase = svc.name === 'supabase';
                      return (
                        <div key={svc.name} style={{
                          background: isSupabase ? 'rgba(62,207,142,0.04)' : 'rgba(255,255,255,0.015)',
                          border: `1px solid ${isSupabase ? 'rgba(62,207,142,0.2)' : 'rgba(255,255,255,0.06)'}`,
                          borderRadius: '12px', padding: '14px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: isSupabase ? '#3ecf8e' : '#3b82f6', fontWeight: 600 }}>
                              {svc.name}
                            </span>
                            <span style={{
                              fontSize: '8px', fontFamily: 'var(--font-mono)',
                              padding: '2px 7px', borderRadius: '4px',
                              background: isPublic ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
                              color: isPublic ? '#10b981' : 'rgba(255,255,255,0.3)',
                            }}>
                              {isPublic ? 'public' : 'internal'}
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '5px', fontFamily: 'var(--font-mono)' }}>
                            {svc.image}
                          </div>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)', fontFamily: 'var(--font-mono)' }}>
                            {svc.port}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ ...S.panel, marginBottom: 0 }}>
                  <span style={S.sectionLabel}>Network Topology</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {[
                      { name: 'backend',  color: '#3b82f6', desc: 'Rete interna isolata. Contiene broker, microservizi gRPC. Non esposta all\'esterno.', services: 'mosquitto, data-processor, ai-service, alert-service, graphql-gateway, soap-service' },
                      { name: 'public',   color: '#3ecf8e', desc: 'Rete esposta. Gateway API, frontend e Supabase cloud (HTTPS esterno).', services: 'graphql-gateway, soap-service, frontend, supabase (cloud)' },
                    ].map(net => (
                      <div key={net.name} style={{
                        background: `${net.color}06`, border: `1px solid ${net.color}20`,
                        borderRadius: '12px', padding: '14px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: net.color }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: net.color, fontWeight: 600 }}>
                            network: {net.name}
                          </span>
                        </div>
                        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.55, marginBottom: '8px' }}>{net.desc}</p>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.18)', lineHeight: 1.5 }}>
                          {net.services}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ══ PROTO ════════════════════════════════════════════════ */}
            {tab === 'proto' && (
              <>
                <div style={{ ...S.panel, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Servizi gRPC',  value: '3',  desc: 'DataProcessor, AIService, AlertService', color: '#3b82f6' },
                    { label: 'RPC Definite',  value: '7',  desc: 'Unary + Server-streaming',               color: '#10b981' },
                    { label: 'Message Types', value: '12', desc: 'SensorReading, AnomalyResult, ...',       color: '#8b5cf6' },
                  ].map(k => (
                    <div key={k.label} style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px', padding: '14px',
                    }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{k.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '5px' }}>{k.desc}</div>
                    </div>
                  ))}
                </div>
                <CodePanel label="city_service.proto" code={PROTO_CODE} />
              </>
            )}

            {/* ══ SQL ══════════════════════════════════════════════════ */}
            {tab === 'sql' && (
              <>
                <div style={{ ...S.panel, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Tabelle Supabase', value: '3',   desc: 'readings, alerts, grpc_calls',        color: '#3ecf8e' },
                    { label: 'Indici',           value: '5',   desc: 'created_at DESC + sensor_type, zone', color: '#3b82f6' },
                    { label: 'RLS Policy',       value: '3',   desc: 'Row Level Security per anon key',     color: '#10b981' },
                  ].map(k => (
                    <div key={k.label} style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px', padding: '14px',
                    }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{k.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '5px' }}>{k.desc}</div>
                    </div>
                  ))}
                </div>
                <CodePanel label="schema.sql — Supabase PostgreSQL (eseguire nel SQL Editor)" code={SQL_CODE} />
              </>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
