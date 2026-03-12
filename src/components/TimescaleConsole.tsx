/**
 * TimescaleConsole — Visualizza il flusso HTTP POST reale verso il server
 * e le letture confermate nella hypertable in-memory.
 *
 * Mostra:
 *  - POST log real-time (endpoint, latenza, status code, payload bytes)
 *  - Readings confermati dal server (confirmed_by_server = true)
 *  - Time-bucket aggregation (simula SELECT time_bucket(...) di TimescaleDB)
 *  - Stats generali (totali, latenza media, error rate)
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Send, CheckCircle, Clock, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { timescaleStore, type PostLog, type DBReading, type TimeBucket } from '../services/timescaleStore';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const glass = {
  background: 'rgba(255,255,255,0.022)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '14px',
  padding: '18px',
} as React.CSSProperties;

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

function StatusBadge({ code }: { code: number }) {
  const ok = code >= 200 && code < 300;
  const pending = code === 0;
  const color = pending ? '#f59e0b' : ok ? '#10b981' : '#ef4444';
  const label = pending ? 'PENDING' : ok ? String(code) : String(code);
  return (
    <span style={{
      ...mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 7px', borderRadius: '5px',
      background: `${color}12`, border: `1px solid ${color}28`, color,
    }}>{label}</span>
  );
}

function Stat({ label, value, sub, color = 'rgba(255,255,255,0.75)' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{ ...glass, padding: '14px', textAlign: 'center' }}>
      <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: '22px', fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function PostLogRow({ log }: { log: PostLog }) {
  const [expanded, setExpanded] = useState(false);
  const ok = log.status_code >= 200 && log.status_code < 300;
  const t = new Date(log.timestamp);
  const timeStr = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.015)',
      border: `1px solid ${ok ? 'rgba(16,185,129,0.12)' : log.status_code === 0 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'}`,
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '6px',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}
      >
        <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', width: '52px', flexShrink: 0 }}>
          {timeStr}
        </span>

        {/* Method + endpoint */}
        <span style={{ ...mono, fontSize: '9px', color: '#3b82f6', fontWeight: 600, flexShrink: 0 }}>
          POST
        </span>
        <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.endpoint}
        </span>

        {/* Badges */}
        <StatusBadge code={log.status_code} />

        <span style={{ ...mono, fontSize: '9px', color: log.latency_ms > 1000 ? '#f59e0b' : 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: '6px' }}>
          {log.latency_ms}ms
        </span>
        <span style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}>
          {log.payload_bytes}B
        </span>

        <div style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginLeft: '4px' }}>
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 12px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                    REQUEST HEADERS
                  </div>
                  <pre style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.6 }}>
{`Content-Type: application/json
X-Source: puntosnai-iot
X-Batch-Size: 3`}
                  </pre>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                    RISPOSTA SERVER
                  </div>
                  <pre style={{ ...mono, fontSize: '9px', color: ok ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)', margin: 0, lineHeight: 1.6 }}>
{log.error
  ? `Error: ${log.error}`
  : `Status: ${log.status_code}\nLatency: ${log.latency_ms}ms\nConfirmed: ${log.confirmed}`}
                  </pre>
                </div>
              </div>
              {log.confirmed && (
                <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '6px' }}>
                  <span style={{ ...mono, fontSize: '9px', color: 'rgba(16,185,129,0.65)' }}>
                    Il server httpbin.org ha confermato la ricezione del payload JSON con echo.
                    I dati sono stati persistiti nel TimescaleDB in-memory come "confirmed_by_server = true".
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReadingRow({ r }: { r: DBReading }) {
  const typeColors: Record<string, string> = {
    traffic: '#3b82f6', air_quality: '#10b981', temperature: '#f97316',
    noise: '#8b5cf6', energy: '#f59e0b',
  };
  const color = typeColors[r.type] ?? '#fff';
  const t = new Date(r.time);
  const timeStr = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '7px 12px',
      background: 'rgba(255,255,255,0.012)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '8px', marginBottom: '4px',
    }}>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.18)', width: '52px', flexShrink: 0 }}>{timeStr}</span>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.25)', flex: 1 }}>{r.sensor_id}</span>
      <span style={{
        ...mono, fontSize: '8px', fontWeight: 600,
        padding: '2px 7px', borderRadius: '4px',
        background: `${color}10`, border: `1px solid ${color}25`, color,
        flexShrink: 0,
      }}>{r.type.replace('_', ' ')}</span>
      <span style={{ ...mono, fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', width: '52px', textAlign: 'right', flexShrink: 0 }}>
        {r.value} <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{r.unit}</span>
      </span>
      <div style={{ flexShrink: 0 }}>
        {r.confirmed_by_server
          ? <CheckCircle size={11} color="#10b981" strokeWidth={1.5} />
          : <Clock size={11} color="#f59e0b" strokeWidth={1.5} />}
      </div>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'http' | 'readings' | 'buckets';

export default function TimescaleConsole() {
  const [tab, setTab] = useState<Tab>('http');
  const [logs, setLogs] = useState<PostLog[]>([]);
  const [readings, setReadings] = useState<DBReading[]>([]);
  const [buckets, setBuckets] = useState<TimeBucket[]>([]);
  const [stats, setStats] = useState(timescaleStore.getStats());

  useEffect(() => {
    const refresh = () => {
      setLogs(timescaleStore.getPostLogs());
      setReadings(timescaleStore.getReadings(40));
      setBuckets(timescaleStore.queryTimeBuckets(undefined, 20));
      setStats(timescaleStore.getStats());
    };
    refresh();
    const unsub = timescaleStore.subscribe(refresh);
    return () => { unsub(); };
  }, []);

  const TABS: { id: Tab; label: string; Icon: React.FC<{size?: number; strokeWidth?: number}> }[] = [
    { id: 'http',     label: 'HTTP POST Log',    Icon: Send     },
    { id: 'readings', label: 'Hypertable',        Icon: Database },
    { id: 'buckets',  label: 'Time Buckets',      Icon: Activity },
  ];

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
          background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Database size={16} color="#8b5cf6" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}>
            TimescaleDB — Live Feed
          </div>
          <div style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>
            HTTP POST reale → httpbin.org/post → hypertable in-memory
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="dot-live" />
          <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>LIVE</span>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        flexShrink: 0,
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px',
        padding: '12px 22px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <Stat label="Inseriti" value={stats.totalInserted} color="rgba(255,255,255,0.75)" />
        <Stat label="Confermati" value={stats.totalConfirmed} color="#10b981" />
        <Stat label="Errori" value={stats.totalErrors} color={stats.totalErrors > 0 ? '#ef4444' : 'rgba(255,255,255,0.35)'} />
        <Stat label="Latenza Media" value={`${stats.avgLatencyMs}ms`} color={stats.avgLatencyMs > 800 ? '#f59e0b' : '#3b82f6'} />
        <Stat label="Tasso Conferma" value={`${stats.confirmedRate}%`} color={stats.confirmedRate > 90 ? '#10b981' : '#f59e0b'} />
      </div>

      {/* Tab nav */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: '2px',
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                color: active ? '#8b5cf6' : 'rgba(255,255,255,0.25)',
                fontSize: '11px', fontWeight: 500, transition: 'all 0.15s',
              }}
            >
              <t.Icon size={12} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>

        {/* ── HTTP POST Log ── */}
        {tab === 'http' && (
          <div>
            {/* Explanation */}
            <div style={{ ...glass, marginBottom: '14px', padding: '14px 18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                Come funziona il flusso HTTP POST reale
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, margin: 0 }}>
                Ogni 3 letture generate dal simulatore, viene eseguita una chiamata <strong style={{ color: 'rgba(255,255,255,0.5)' }}>fetch() reale</strong> verso{' '}
                <code style={{ ...mono, fontSize: '10px', color: '#8b5cf6' }}>https://httpbin.org/post</code>.
                Il server riceve il payload JSON, lo valida e risponde con un echo del body nel campo <code style={{ ...mono, color: '#8b5cf6', fontSize: '10px' }}>json</code>.
                La latenza mostrata è quella <strong style={{ color: 'rgba(255,255,255,0.5)' }}>reale misurata</strong> con <code style={{ ...mono, color: '#8b5cf6', fontSize: '10px' }}>performance.now()</code>.
                I record confermati dal server vengono marcati con{' '}
                <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>confirmed_by_server = true</code>.
              </p>
            </div>

            {logs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)', ...mono, fontSize: '11px' }}>
                In attesa delle prime chiamate HTTP...
              </div>
            )}

            {logs.map(log => (
              <PostLogRow key={log.id} log={log} />
            ))}
          </div>
        )}

        {/* ── Hypertable readings ── */}
        {tab === 'readings' && (
          <div>
            <div style={{ ...glass, marginBottom: '12px', padding: '12px 16px' }}>
              <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginBottom: '2px' }}>
                SELECT * FROM readings ORDER BY time DESC LIMIT 40;
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                  <CheckCircle size={10} color="#10b981" style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  confirmed_by_server = true
                </span>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                  <Clock size={10} color="#f59e0b" style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  in attesa conferma server
                </span>
              </div>
            </div>

            {readings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)', ...mono, fontSize: '11px' }}>
                In attesa dei primi inserimenti...
              </div>
            )}

            {readings.map(r => <ReadingRow key={r.id} r={r} />)}
          </div>
        )}

        {/* ── Time buckets ── */}
        {tab === 'buckets' && (
          <div>
            <div style={{ ...glass, marginBottom: '12px', padding: '12px 16px' }}>
              <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
                {`SELECT time_bucket('2 minutes', time) AS bucket,\n       type, AVG(value), MAX(value), MIN(value), COUNT(*)\nFROM readings GROUP BY bucket, type ORDER BY bucket DESC;`}
              </div>
            </div>

            {buckets.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)', ...mono, fontSize: '11px' }}>
                Aggregazione disponibile dopo le prime letture...
              </div>
            )}

            {buckets.map((b, i) => {
              const typeColors: Record<string, string> = {
                traffic: '#3b82f6', air_quality: '#10b981', temperature: '#f97316',
                noise: '#8b5cf6', energy: '#f59e0b',
              };
              const color = typeColors[b.sensor_type] ?? '#fff';
              const t = new Date(b.bucket);
              const timeStr = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '52px 1fr 60px 60px 60px 40px',
                  gap: '8px', alignItems: 'center',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.012)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px', marginBottom: '4px',
                }}>
                  <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{timeStr}</span>
                  <span style={{
                    ...mono, fontSize: '8px', fontWeight: 600,
                    padding: '2px 7px', borderRadius: '4px',
                    background: `${color}10`, border: `1px solid ${color}25`, color,
                    display: 'inline-block', width: 'fit-content',
                  }}>{b.sensor_type.replace('_', ' ')}</span>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{b.avg_value}</div>
                    <div style={{ ...mono, fontSize: '7px', color: 'rgba(255,255,255,0.18)' }}>avg</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '10px', color: '#ef4444', opacity: 0.7 }}>{b.max_value}</div>
                    <div style={{ ...mono, fontSize: '7px', color: 'rgba(255,255,255,0.18)' }}>max</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '10px', color: '#10b981', opacity: 0.7 }}>{b.min_value}</div>
                    <div style={{ ...mono, fontSize: '7px', color: 'rgba(255,255,255,0.18)' }}>min</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{b.sample_count}</div>
                    <div style={{ ...mono, fontSize: '7px', color: 'rgba(255,255,255,0.18)' }}>n</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
