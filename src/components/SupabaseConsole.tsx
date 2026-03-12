/**
 * SupabaseConsole — Pannello di monitoraggio Supabase in tempo reale
 *
 * Mostra ogni operazione HTTP POST/GET verso il database PostgreSQL reale.
 * Ogni riga corrisponde a una chiamata fetch() reale verso:
 *   https://hqekyxrmswdxgpdruiap.supabase.co/rest/v1/<table>
 *
 * Come verificare i dati nel database:
 *   1. Vai su https://supabase.com/dashboard/project/hqekyxrmswdxgpdruiap
 *   2. Table Editor → readings → vedrai le righe in tempo reale
 *   3. SQL Editor → SELECT * FROM readings ORDER BY created_at DESC LIMIT 20;
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Send, CheckCircle, Clock,
  RefreshCw, ChevronDown, ChevronUp, Wifi, WifiOff, AlertTriangle
} from 'lucide-react';
import { supabaseService, type SupabasePostLog, type SupabaseStats } from '../services/supabaseService';
import { type SupabaseReading, type SupabaseAlert } from '../services/supabaseClient';
import { timescaleStore, type TimeBucket } from '../services/timescaleStore';

// ─── Design tokens ────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.022)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '14px',
  padding: '16px',
};

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const typeColors: Record<string, string> = {
  traffic: '#3b82f6',
  air_quality: '#10b981',
  temperature: '#f97316',
  noise: '#8b5cf6',
  energy: '#f59e0b',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ success, code }: { success: boolean; code: number }) {
  const color = code === 0 ? '#f59e0b' : success ? '#10b981' : '#ef4444';
  const label = code === 0 ? 'PENDING' : String(code);
  return (
    <span style={{
      ...mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 7px', borderRadius: '5px',
      background: `${color}14`, border: `1px solid ${color}30`, color,
    }}>{label}</span>
  );
}

function StatCard({ label, value, sub, color = 'rgba(255,255,255,0.8)' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{ ...glass, padding: '14px', textAlign: 'center' }}>
      <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: '20px', fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function PostLogRow({ log }: { log: SupabasePostLog }) {
  const [expanded, setExpanded] = useState(false);
  const t = new Date(log.timestamp);
  const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;

  const opColor: Record<string, string> = {
    BATCH_INSERT:   '#3b82f6',
    INSERT_ALERT:   '#ef4444',
    INSERT_GRPC:    '#8b5cf6',
    INSERT_READING: '#10b981',
  };
  const color = opColor[log.operation] ?? '#fff';

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: `1px solid ${log.success ? 'rgba(16,185,129,0.1)' : log.statusCode === 0 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.12)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        marginBottom: '6px',
      }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}
      >
        {/* Timestamp */}
        <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.18)', width: '52px', flexShrink: 0 }}>
          {timeStr}
        </span>

        {/* Operazione */}
        <span style={{
          ...mono, fontSize: '9px', fontWeight: 700, flexShrink: 0,
          padding: '2px 8px', borderRadius: '4px',
          background: `${color}10`, border: `1px solid ${color}25`, color,
        }}>
          {log.operation}
        </span>

        {/* Tabella */}
        <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
          → {log.table}
        </span>

        {/* Row count */}
        <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.18)', flex: 1 }}>
          {log.rowCount} row{log.rowCount !== 1 ? 's' : ''}
        </span>

        {/* Status */}
        <StatusBadge success={log.success} code={log.statusCode} />

        {/* Latenza */}
        <span style={{
          ...mono, fontSize: '9px', flexShrink: 0, marginLeft: '6px',
          color: log.latencyMs > 1000 ? '#f59e0b' : log.latencyMs > 500 ? 'rgba(255,255,255,0.4)' : '#10b981',
        }}>
          {log.latencyMs}ms
        </span>

        <div style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
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
            <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

                {/* Request */}
                <div>
                  <div style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                    REQUEST
                  </div>
                  <pre style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`${log.method} ${log.endpoint}
Authorization: Bearer <anon_key>
apikey: <anon_key>
Content-Type: application/json
X-Application: puntosnai-smart-city

${log.payload ? JSON.stringify(Array.isArray(log.payload) ? log.payload[0] : log.payload, null, 2).slice(0, 300) + (JSON.stringify(log.payload).length > 300 ? '\n...' : '') : 'no payload'}`}
                  </pre>
                </div>

                {/* Response */}
                <div>
                  <div style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                    RESPONSE
                  </div>
                  <pre style={{ ...mono, fontSize: '9px', margin: 0, lineHeight: 1.7, color: log.success ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)' }}>
{log.error
  ? `Error: ${log.error}`
  : `HTTP ${log.statusCode}
Latency: ${log.latencyMs}ms
Rows inserted: ${log.rowCount}
Table: ${log.table}
Status: SUCCESS

→ Dati visibili in:
  Supabase Dashboard
  Table Editor → ${log.table}`}
                  </pre>
                </div>
              </div>

              {log.success && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px' }}>
                  <span style={{ ...mono, fontSize: '9px', color: 'rgba(16,185,129,0.7)', lineHeight: 1.6 }}>
                    INSERT confermato da PostgreSQL — i dati sono persistiti nel database Supabase.
                    Verificabile in: dashboard.supabase.com → Table Editor → {log.table}
                  </span>
                </div>
              )}

              {log.error && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertTriangle size={12} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ ...mono, fontSize: '9px', color: 'rgba(239,68,68,0.7)' }}>
                    {log.error}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ReadingRow({ r }: { r: SupabaseReading }) {
  const color = typeColors[r.sensor_type] ?? '#fff';
  const t = r.created_at ? new Date(r.created_at) : new Date();
  const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
  const anomalyColor = r.anomaly_score > 0.7 ? '#ef4444' : r.anomaly_score > 0.4 ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '52px 1fr 90px 70px 60px 55px',
      gap: '8px', alignItems: 'center',
      padding: '7px 12px',
      background: 'rgba(255,255,255,0.012)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '8px', marginBottom: '4px',
    }}>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.18)' }}>{timeStr}</span>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sensor_id}</span>
      <span style={{
        ...mono, fontSize: '8px', fontWeight: 600,
        padding: '2px 7px', borderRadius: '4px',
        background: `${color}10`, border: `1px solid ${color}25`, color,
        textAlign: 'center',
      }}>{r.sensor_type.replace('_', ' ')}</span>
      <span style={{ ...mono, fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textAlign: 'right' }}>
        {r.value} <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{r.unit}</span>
      </span>
      <span style={{ ...mono, fontSize: '9px', color: anomalyColor, textAlign: 'center' }}>
        {(r.anomaly_score * 100).toFixed(0)}%
      </span>
      <CheckCircle size={11} color="#10b981" strokeWidth={1.5} style={{ justifySelf: 'center' }} />
    </div>
  );
}

function AlertRow({ a }: { a: SupabaseAlert }) {
  const sevColor: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6',
  };
  const color = sevColor[a.severity] ?? '#fff';
  const t = a.created_at ? new Date(a.created_at) : new Date();
  const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;

  return (
    <div style={{
      display: 'flex', gap: '10px', alignItems: 'flex-start',
      padding: '10px 12px',
      background: `${color}06`,
      border: `1px solid ${color}18`,
      borderRadius: '8px', marginBottom: '6px',
    }}>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.18)', flexShrink: 0, marginTop: '1px' }}>{timeStr}</span>
      <span style={{
        ...mono, fontSize: '8px', fontWeight: 700, flexShrink: 0,
        padding: '2px 7px', borderRadius: '4px',
        background: `${color}14`, border: `1px solid ${color}30`, color,
      }}>{a.severity.toUpperCase()}</span>
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', flex: 1, lineHeight: 1.5 }}>{a.message}</span>
      <span style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{a.zone_name}</span>
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'post_log' | 'db_readings' | 'db_alerts' | 'time_buckets' | 'sql';

export default function SupabaseConsole() {
  const [tab, setTab]           = useState<Tab>('post_log');
  const [logs, setLogs]         = useState<SupabasePostLog[]>([]);
  const [stats, setStats]       = useState<SupabaseStats>(supabaseService.getStats());
  const [dbReadings, setDbReadings] = useState<SupabaseReading[]>([]);
  const [dbAlerts, setDbAlerts]     = useState<SupabaseAlert[]>([]);
  const [buckets, setBuckets]       = useState<TimeBucket[]>([]);
  const [fetching, setFetching]     = useState(false);

  // Aggiorna i log POST dal servizio
  useEffect(() => {
    const refresh = () => {
      setLogs(supabaseService.getLogs());
      setStats(supabaseService.getStats());
      setBuckets(timescaleStore.queryTimeBuckets(undefined, 20));
    };
    refresh();
    const unsub = supabaseService.subscribe(refresh);
    return () => { unsub(); };
  }, []);

  // Fetch dati reali da Supabase quando si cambia tab
  const fetchFromSupabase = useCallback(async () => {
    setFetching(true);
    if (tab === 'db_readings') {
      const rows = await supabaseService.fetchRecentReadings(50);
      setDbReadings(rows);
    } else if (tab === 'db_alerts') {
      const rows = await supabaseService.fetchRecentAlerts(30);
      setDbAlerts(rows);
    }
    setFetching(false);
  }, [tab]);

  useEffect(() => {
    if (tab === 'db_readings' || tab === 'db_alerts') {
      fetchFromSupabase();
    }
  }, [tab, fetchFromSupabase]);

  const TABS: { id: Tab; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'post_log',    label: 'HTTP POST Log',   Icon: Send     },
    { id: 'db_readings', label: 'DB Readings',      Icon: Database },
    { id: 'db_alerts',   label: 'DB Alerts',        Icon: AlertTriangle },
    { id: 'time_buckets',label: 'Time Buckets',     Icon: Clock    },
    { id: 'sql',         label: 'SQL Schema',       Icon: Database },
  ];

  const connStatus = stats.connectionStatus;
  const connColor = connStatus === 'connected' ? '#10b981' : connStatus === 'error' ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '18px 22px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '11px',
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Database size={17} color="#10b981" strokeWidth={1.5} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}>
            Supabase — PostgreSQL Reale
          </div>
          <div style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
            https://hqekyxrmswdxgpdruiap.supabase.co
          </div>
        </div>

        {/* Connection status */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {connStatus === 'connected'
            ? <Wifi size={13} color={connColor} strokeWidth={1.5} />
            : connStatus === 'error'
            ? <WifiOff size={13} color={connColor} strokeWidth={1.5} />
            : <Clock size={13} color={connColor} strokeWidth={1.5} />}
          <span style={{ ...mono, fontSize: '9px', color: connColor, letterSpacing: '0.08em' }}>
            {connStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        flexShrink: 0,
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px',
        padding: '12px 22px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <StatCard label="Rows Inserted" value={stats.totalInserted} color="rgba(255,255,255,0.8)" />
        <StatCard label="Alerts Saved" value={stats.totalAlerts} color="#ef4444" />
        <StatCard label="gRPC Logged" value={stats.totalGrpcCalls} color="#8b5cf6" />
        <StatCard label="Errori DB" value={stats.totalErrors} color={stats.totalErrors > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)'} />
        <StatCard label="Latenza Media" value={`${stats.avgLatencyMs}ms`} color={stats.avgLatencyMs > 800 ? '#f59e0b' : '#10b981'} />
      </div>

      {/* Tabs */}
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
                padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                background: active ? 'rgba(16,185,129,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(16,185,129,0.25)' : 'transparent'}`,
                color: active ? '#10b981' : 'rgba(255,255,255,0.25)',
                fontSize: '11px', fontWeight: 500, transition: 'all 0.15s',
              }}
            >
              <t.Icon size={11} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>

        {/* ── HTTP POST Log ── */}
        {tab === 'post_log' && (
          <div>
            {/* Explanation card */}
            <div style={{ ...glass, marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: '8px' }}>
                Come funziona il flusso POST reale verso Supabase
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.8, margin: 0 }}>
                Ogni <strong style={{ color: 'rgba(255,255,255,0.55)' }}>5 letture</strong> generate dal simulatore IoT,{' '}
                <code style={{ ...mono, fontSize: '10px', color: '#10b981' }}>supabaseService._flushBatch()</code>{' '}
                esegue una chiamata <code style={{ ...mono, fontSize: '10px', color: '#10b981' }}>fetch()</code> reale verso{' '}
                <code style={{ ...mono, fontSize: '10px', color: '#10b981' }}>
                  /rest/v1/readings
                </code>.<br /><br />
                Il client <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>@supabase/supabase-js</code> aggiunge automaticamente
                i headers <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>Authorization: Bearer</code> e{' '}
                <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>apikey</code>.{' '}
                PostgreSQL esegue l'<code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>INSERT</code> e risponde con{' '}
                <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>HTTP 201 Created</code>.{' '}
                I dati sono <strong style={{ color: 'rgba(255,255,255,0.55)' }}>persistiti permanentemente</strong> nel database.
              </p>
            </div>

            {logs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.18)', ...mono, fontSize: '11px' }}>
                In attesa del primo batch POST verso Supabase...
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {logs.map(log => (
                <PostLogRow key={log.id} log={log} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── DB Readings (dati reali da PostgreSQL) ── */}
        {tab === 'db_readings' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ ...glass, padding: '10px 14px', flex: 1, marginRight: '10px' }}>
                <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>
                  SELECT * FROM readings ORDER BY created_at DESC LIMIT 50;
                </div>
                <div style={{ ...mono, fontSize: '9px', color: 'rgba(16,185,129,0.5)', marginTop: '4px' }}>
                  → Dati letti direttamente da PostgreSQL su Supabase
                </div>
              </div>
              <button
                onClick={fetchFromSupabase}
                disabled={fetching}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                  color: '#10b981', fontSize: '11px',
                }}
              >
                <RefreshCw size={12} strokeWidth={1.5} style={{ animation: fetching ? 'spin 1s linear infinite' : 'none' }} />
                Refresh
              </button>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr 90px 70px 60px 55px',
              gap: '8px', padding: '6px 12px',
              marginBottom: '4px',
            }}>
              {['TIME', 'SENSOR_ID', 'TYPE', 'VALUE', 'ANOMALY', 'DB'].map(h => (
                <span key={h} style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.1em' }}>{h}</span>
              ))}
            </div>

            {fetching && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.2)', ...mono, fontSize: '11px' }}>
                Caricamento da PostgreSQL...
              </div>
            )}

            {!fetching && dbReadings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.18)', ...mono, fontSize: '11px' }}>
                Nessun record nel database ancora. I dati appaiono dopo il primo batch POST.
              </div>
            )}

            {dbReadings.map(r => <ReadingRow key={r.id} r={r} />)}
          </div>
        )}

        {/* ── DB Alerts ── */}
        {tab === 'db_alerts' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ ...glass, padding: '10px 14px', flex: 1, marginRight: '10px' }}>
                <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>
                  SELECT * FROM alerts ORDER BY created_at DESC LIMIT 30;
                </div>
              </div>
              <button
                onClick={fetchFromSupabase}
                disabled={fetching}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                  color: '#10b981', fontSize: '11px',
                }}
              >
                <RefreshCw size={12} strokeWidth={1.5} />
                Refresh
              </button>
            </div>

            {!fetching && dbAlerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.18)', ...mono, fontSize: '11px' }}>
                Nessun alert nel database. Gli alert appaiono ogni 2 minuti.
              </div>
            )}

            {dbAlerts.map(a => <AlertRow key={a.id} a={a} />)}
          </div>
        )}

        {/* ── Time Buckets ── */}
        {tab === 'time_buckets' && (
          <div>
            <div style={{ ...glass, marginBottom: '14px', padding: '12px 16px' }}>
              <div style={{ ...mono, fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', lineHeight: 1.8 }}>
                {`-- Equivalente in SQL su TimescaleDB/PostgreSQL:\nSELECT\n  time_bucket('2 minutes', created_at) AS bucket,\n  sensor_type,\n  AVG(value) AS avg_value,\n  MAX(value) AS max_value,\n  MIN(value) AS min_value,\n  COUNT(*) AS sample_count\nFROM readings\nGROUP BY bucket, sensor_type\nORDER BY bucket DESC;`}
              </div>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr 70px 70px 70px 44px',
              gap: '8px', padding: '6px 12px', marginBottom: '4px',
            }}>
              {['TIME', 'TYPE', 'AVG', 'MAX', 'MIN', 'N'].map(h => (
                <span key={h} style={{ ...mono, fontSize: '8px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.1em' }}>{h}</span>
              ))}
            </div>

            {buckets.map((b, i) => {
              const color = typeColors[b.sensor_type] ?? '#fff';
              const t = new Date(b.bucket);
              const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
              return (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr 70px 70px 70px 44px',
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
                  <span style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textAlign: 'center' }}>{b.avg_value}</span>
                  <span style={{ ...mono, fontSize: '10px', color: '#ef4444', opacity: 0.7, textAlign: 'center' }}>{b.max_value}</span>
                  <span style={{ ...mono, fontSize: '10px', color: '#10b981', opacity: 0.7, textAlign: 'center' }}>{b.min_value}</span>
                  <span style={{ ...mono, fontSize: '10px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{b.sample_count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SQL Schema ── */}
        {tab === 'sql' && (
          <div>
            <div style={{ ...glass, marginBottom: '16px', padding: '14px 18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: '8px' }}>
                Script SQL — Da eseguire in Supabase SQL Editor
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, margin: 0 }}>
                Copia questo script e incollalo in{' '}
                <code style={{ ...mono, color: '#10b981', fontSize: '10px' }}>
                  supabase.com/dashboard → SQL Editor → New query
                </code>.
                Crea le 3 tabelle necessarie con gli indici ottimizzati per serie temporali.
              </p>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px',
              padding: '20px',
              overflowX: 'auto',
            }}>
              <pre style={{ ...mono, fontSize: '11px', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.8, whiteSpace: 'pre' }}>
{`-- ═══════════════════════════════════════════════════════════
-- PuntoSnai Smart City — Database Schema
-- Supabase (PostgreSQL 15)
-- ═══════════════════════════════════════════════════════════

-- ── Tabella: readings ─────────────────────────────────────
-- Ogni riga è una lettura di un sensore IoT.
-- Riceve dati via HTTP POST ogni ~10 secondi (batch da 5).

CREATE TABLE IF NOT EXISTS public.readings (
  id            TEXT        PRIMARY KEY,
  sensor_id     TEXT        NOT NULL,
  sensor_type   TEXT        NOT NULL
                CHECK (sensor_type IN (
                  'traffic','air_quality',
                  'temperature','noise','energy'
                )),
  value         NUMERIC     NOT NULL,
  unit          TEXT        NOT NULL,
  zone_name     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'normal'
                CHECK (status IN ('normal','warning','critical')),
  anomaly_score NUMERIC     NOT NULL DEFAULT 0.0
                CHECK (anomaly_score BETWEEN 0.0 AND 1.0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per query temporali efficienti
CREATE INDEX IF NOT EXISTS idx_readings_created_at
  ON public.readings (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_readings_sensor_type
  ON public.readings (sensor_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_readings_zone
  ON public.readings (zone_name, created_at DESC);

-- ── Tabella: alerts ───────────────────────────────────────
-- Un alert viene generato ogni 2 minuti se c'è un'anomalia.
-- Ogni alert è persistito via HTTP POST su questa tabella.

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

CREATE INDEX IF NOT EXISTS idx_alerts_severity
  ON public.alerts (severity, created_at DESC);

-- ── Tabella: grpc_calls ───────────────────────────────────
-- Log di ogni chiamata gRPC verso l'AI Service.
-- Traccia DetectAnomaly e PredictTraffic nel tempo.

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

CREATE INDEX IF NOT EXISTS idx_grpc_created_at
  ON public.grpc_calls (created_at DESC);

-- ── Row Level Security (RLS) ──────────────────────────────
-- Permette INSERT/SELECT con la anon key senza autenticazione.
-- ATTENZIONE: in produzione restringere con policy specifiche.

ALTER TABLE public.readings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grpc_calls ENABLE ROW LEVEL SECURITY;

-- Policy: chiunque può inserire e leggere (per la demo)
CREATE POLICY IF NOT EXISTS "allow_all_readings"
  ON public.readings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "allow_all_alerts"
  ON public.alerts FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "allow_all_grpc"
  ON public.grpc_calls FOR ALL USING (true) WITH CHECK (true);

-- ── Query di verifica ─────────────────────────────────────
-- Esegui questi per verificare che i dati arrivino:

-- SELECT COUNT(*) FROM readings;
-- SELECT * FROM readings ORDER BY created_at DESC LIMIT 10;
-- SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5;
-- SELECT sensor_type, AVG(value), COUNT(*)
--   FROM readings
--   GROUP BY sensor_type
--   ORDER BY COUNT(*) DESC;`}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
