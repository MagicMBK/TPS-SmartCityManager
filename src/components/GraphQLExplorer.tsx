/**
 * GraphQL Explorer — Apollo Studio nel browser
 * Editor query interattivo con subscriptions live e tracing
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Square, Wifi, WifiOff, Clock, ChevronRight,
  ChevronDown, RotateCcw, Copy, Check, Layers, Activity,
  GitBranch, Zap, Terminal,
} from 'lucide-react';
import {
  graphqlEngine, gqlCallRegistry, SCHEMA_SDL, EXAMPLE_QUERIES,
} from '../services/graphqlSimulator';
import type { GQLCallLog, SubscriptionHandle } from '../services/graphqlSimulator';

// ── Helpers ──────────────────────────────────────────────────

function OperationBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    query:        '#3b82f6',
    mutation:     '#f97316',
    subscription: '#10b981',
  };
  return (
    <span style={{
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase',
      background: `${colors[type] || '#6b7280'}18`,
      color: colors[type] || '#6b7280',
      border: `1px solid ${colors[type] || '#6b7280'}30`,
    }}>{type}</span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      fontSize: '10px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
      background: 'none', border: 'none', padding: '2px 6px',
      borderRadius: '4px', transition: 'color 0.15s',
    }}>
      {copied
        ? <><Check size={10} /><span>Copied</span></>
        : <><Copy size={10} /><span>Copy</span></>
      }
    </button>
  );
}

// ── Syntax coloring per GraphQL ───────────────────────────────
function GQLSyntax({ code }: { code: string }) {
  const highlighted = code
    .replace(/\b(query|mutation|subscription|fragment|on)\b/g,
      '<span style="color:#c084fc">$1</span>')
    .replace(/\b(true|false|null)\b/g,
      '<span style="color:#f97316">$1</span>')
    .replace(/"([^"\\]|\\.)*"/g,
      '<span style="color:#86efac">$&</span>')
    .replace(/\b([A-Z][A-Za-z]+)\b/g,
      '<span style="color:#67e8f9">$1</span>')
    .replace(/#.+$/gm,
      '<span style="color:rgba(255,255,255,0.2)">$&</span>')
    .replace(/\b(\d+(\.\d+)?)\b/g,
      '<span style="color:#fde68a">$1</span>');

  return (
    <pre style={{
      margin: 0, fontSize: '11.5px', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace',
      color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }} dangerouslySetInnerHTML={{ __html: highlighted }} />
  );
}

// ── JSON Viewer ───────────────────────────────────────────────
function JSONViewer({ data, depth = 0 }: { data: unknown; depth?: number }): React.ReactElement {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (typeof data === 'string') {
    return <span style={{ color: '#86efac' }}>"{data}"</span>;
  }
  if (typeof data === 'number') {
    return <span style={{ color: '#fde68a' }}>{data}</span>;
  }
  if (typeof data === 'boolean') {
    return <span style={{ color: '#f97316' }}>{String(data)}</span>;
  }
  if (data === null) {
    return <span style={{ color: 'rgba(255,255,255,0.3)' }}>null</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'rgba(255,255,255,0.4)' }}>[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(p => !p)}
          style={{ color: '#67e8f9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', fontFamily: 'inherit' }}
        >
          {collapsed ? `[${data.length} items]` : '['}
        </button>
        {!collapsed && (
          <span>
            {(data as unknown[]).map((item, i) => (
              <div key={i} style={{ paddingLeft: '14px' }}>
                <JSONViewer data={item as Record<string, unknown>} depth={depth + 1} />
                {i < data.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>,</span>}
              </div>
            ))}
            <span style={{ color: '#67e8f9' }}>]</span>
          </span>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'rgba(255,255,255,0.4)' }}>{'{}'}</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed(p => !p)}
          style={{ color: '#67e8f9', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', fontFamily: 'inherit' }}
        >
          {collapsed ? `{${entries.length} fields}` : '{'}
        </button>
        {!collapsed && (
          <span>
            {entries.map(([k, v], i) => (
              <div key={k} style={{ paddingLeft: '14px' }}>
                <span style={{ color: '#c084fc' }}>"{k}"</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>: </span>
                <JSONViewer data={v as Record<string, unknown>} depth={depth + 1} />
                {i < entries.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>,</span>}
              </div>
            ))}
            <span style={{ color: '#67e8f9' }}>{'}'}</span>
          </span>
        )}
      </span>
    );
  }
  return <span style={{ color: 'rgba(255,255,255,0.5)' }}>{String(data)}</span>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

type Panel = 'explorer' | 'schema' | 'logs' | 'subscriptions';

export default function GraphQLExplorer() {
  const [panel, setPanel] = useState<Panel>('explorer');
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0].query);
  const [variables, setVariables] = useState('{}');
  const [response, setResponse] = useState<unknown>(null);
  const [tracing, setTracing] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [logs, setLogs] = useState<GQLCallLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubscriptionHandle | null>(null);
  const [subEvents, setSubEvents] = useState<{ ts: number; data: unknown }[]>([]);
  const [selectedExample, setSelectedExample] = useState(0);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const subRef = useRef<SubscriptionHandle | null>(null);

  // Health-check Express al mount e ogni 5s
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ __typename }' }),
          signal: AbortSignal.timeout(2000),
        });
        setServerOnline(r.ok);
      } catch { setServerOnline(false); }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setLogs(gqlCallRegistry.getLogs());
    const unsub = gqlCallRegistry.subscribe(log => {
      setLogs(gqlCallRegistry.getLogs());
      setExpandedLog(log.id);
    });
    return () => { unsub(); };
  }, []);

  const executeQuery = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setResponse(null);
    setTracing(null);
    setDurationMs(null);

    try {
      let vars: Record<string, unknown> = {};
      try { vars = JSON.parse(variables); } catch { /* ignore */ }

      const start = performance.now();
      const result = await graphqlEngine.execute(query, vars);
      const dur = Math.round((performance.now() - start) * 10) / 10;
      setDurationMs(dur);
      setResponse({ data: result.data, errors: result.errors });
      setTracing(result.extensions?.tracing ?? null);
    } finally {
      setLoading(false);
    }
  }, [query, variables, loading]);

  const startSubscription = useCallback(() => {
    if (subRef.current) {
      subRef.current.unsubscribe();
      subRef.current = null;
      setActiveSub(null);
    }

    setSubEvents([]);
    setPanel('subscriptions');

    const handle = graphqlEngine.subscribe(query, (data) => {
      setSubEvents(prev => [{ ts: Date.now(), data }, ...prev].slice(0, 50));
    });

    subRef.current = handle;
    setActiveSub(handle);
  }, [query]);

  const stopSubscription = useCallback(() => {
    if (subRef.current) {
      subRef.current.unsubscribe();
      subRef.current = null;
      setActiveSub(null);
    }
  }, []);

  useEffect(() => {
    const cleanup = () => { subRef.current?.unsubscribe(); };
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectExample = (idx: number) => {
    setSelectedExample(idx);
    setQuery(EXAMPLE_QUERIES[idx].query);
    setResponse(null);
    setDurationMs(null);
  };

  const currentOp = query.trim().toLowerCase().startsWith('subscription')
    ? 'subscription'
    : query.trim().toLowerCase().startsWith('mutation')
      ? 'mutation' : 'query';

  const PANELS: { id: Panel; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'explorer',      label: 'Explorer',              Icon: Play     },
    { id: 'schema',        label: 'Schema',                Icon: Layers   },
    { id: 'logs',          label: `Logs (${logs.length})`, Icon: Terminal },
    { id: 'subscriptions', label: 'Subscriptions',         Icon: Activity },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>

      {/* ── Server status banner ── */}
      {serverOnline === false && (
        <div style={{ flexShrink: 0, padding: '9px 20px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>GraphQL server offline</span>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>— avvia Express: npx tsx server/index.ts</span>
        </div>
      )}
      {serverOnline === true && (
        <div style={{ flexShrink: 0, padding: '7px 20px', background: 'rgba(16,185,129,0.07)', borderBottom: '1px solid rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: '10px', color: '#6ee7b7' }}>Express online — /api/graphql attivo</span>
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: '44px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={13} color="#ec4899" strokeWidth={1.5} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>
              GraphQL Explorer
            </span>
          </div>
          <div style={{
            fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.18)', padding: '2px 8px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '4px',
          }}>
            ws://gateway:4000/graphql
          </div>
        </div>

        <div style={{ display: 'flex', gap: '3px' }}>
          {PANELS.map(p => (
            <button key={p.id} onClick={() => setPanel(p.id)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
              background: panel === p.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${panel === p.id ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
              color: panel === p.id ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.15s',
            }}>
              <p.Icon size={12} strokeWidth={1.5} /><span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Explorer Panel ── */}
      <AnimatePresence mode="wait">
        {panel === 'explorer' && (
          <motion.div
            key="explorer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
          >
            {/* Left: example list */}
            <div style={{
              width: '200px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)',
              overflowY: 'auto', padding: '12px 8px',
            }}>
              {['Query', 'Mutation', 'Subscription'].map(cat => (
                <div key={cat} style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.2)', fontWeight: 600, padding: '0 8px', marginBottom: '6px',
                  }}>{cat}</div>
                  {EXAMPLE_QUERIES.filter(q => q.category === cat).map((ex) => {
                    const globalIdx = EXAMPLE_QUERIES.indexOf(ex);
                    return (
                      <button
                        key={ex.label}
                        onClick={() => selectExample(globalIdx)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '7px 10px',
                          borderRadius: '6px', cursor: 'pointer', marginBottom: '2px',
                          background: selectedExample === globalIdx
                            ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: `1px solid ${selectedExample === globalIdx
                            ? 'rgba(255,255,255,0.09)' : 'transparent'}`,
                          color: selectedExample === globalIdx
                            ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
                          fontSize: '11px', transition: 'all 0.12s',
                        }}
                      >
                        {ex.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Center: editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Description */}
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.01)',
              }}>
                {EXAMPLE_QUERIES[selectedExample]?.description}
              </div>

              {/* Query editor */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <textarea
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: '100%', height: '100%', padding: '16px',
                    background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                    fontSize: '12.5px', lineHeight: 1.7, fontFamily: 'JetBrains Mono, monospace',
                    color: 'rgba(255,255,255,0.75)', caretColor: '#ec4899',
                  }}
                />
              </div>

              {/* Variables */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                padding: '8px 16px',
              }}>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '5px', letterSpacing: '0.1em' }}>
                  VARIABLES
                </div>
                <textarea
                  value={variables}
                  onChange={e => setVariables(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)', borderRadius: '5px',
                    padding: '6px 10px', color: 'rgba(255,255,255,0.5)', outline: 'none',
                    fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', resize: 'none',
                  }}
                />
              </div>

              {/* Execute bar */}
              <div style={{
                padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.015)',
              }}>
                <OperationBadge type={currentOp} />

                {currentOp === 'subscription' ? (
                  <>
                    {activeSub ? (
                      <button onClick={stopSubscription} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444', fontSize: '11px', fontWeight: 600,
                      }}>
                        <Square size={11} /> Stop Stream
                      </button>
                    ) : (
                      <button onClick={startSubscription} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                        color: '#10b981', fontSize: '11px', fontWeight: 600,
                      }}>
                        <Wifi size={11} /> Subscribe
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={executeQuery} disabled={loading} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', borderRadius: '6px', cursor: loading ? 'default' : 'pointer',
                    background: loading ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    color: loading ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                    fontSize: '11px', fontWeight: 600, transition: 'all 0.15s',
                  }}>
                    <Play size={11} fill={loading ? 'rgba(59,130,246,0.4)' : '#3b82f6'} />
                    {loading ? 'Executing...' : 'Execute'}
                  </button>
                )}

                {durationMs !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                    <Clock size={10} color="rgba(255,255,255,0.2)" />
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                      {durationMs}ms
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: response */}
            <div style={{
              width: '40%', flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.01)',
              }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>
                  RESPONSE
                </span>
                {response && <CopyButton text={JSON.stringify(response, null, 2)} />}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                {loading && (
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontFamily: 'monospace' }}>
                    Executing query...
                  </div>
                )}
                {!loading && !response && (
                  <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '11px', fontFamily: 'monospace' }}>
                    {`// Press Execute to run the query`}
                  </div>
                )}
                {response && (
                  <div style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.7 }}>
                    <JSONViewer data={response} />
                  </div>
                )}
              </div>

              {/* Resolver tracing */}
              {tracing && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  padding: '8px 14px', background: 'rgba(255,255,255,0.01)',
                }}>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em', marginBottom: '5px' }}>
                    RESOLVER TRACING
                  </div>
                  <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)' }}>
                    {(tracing as { execution?: { resolvers?: unknown[] } })?.execution?.resolvers?.length || 0} resolvers fired
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Schema Panel ── */}
        {panel === 'schema' && (
          <motion.div
            key="schema"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: '3px' }}>
                  Schema Definition Language
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                  Apollo Server — autogenerato da city_service.proto
                </div>
              </div>
              <CopyButton text={SCHEMA_SDL} />
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '10px', padding: '20px', overflowX: 'auto',
            }}>
              <GQLSyntax code={SCHEMA_SDL} />
            </div>
          </motion.div>
        )}

        {/* ── Logs Panel ── */}
        {panel === 'logs' && (
          <motion.div
            key="logs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, overflowY: 'auto', padding: '16px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                {logs.length} calls recorded
              </span>
              <button onClick={() => gqlCallRegistry.clear()} style={{
                display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px',
                color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer',
              }}>
                <RotateCcw size={10} /> Clear
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {logs.map(log => (
                <div key={log.id}>
                  <button
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '10px 14px', borderRadius: '7px', cursor: 'pointer',
                      background: expandedLog === log.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${expandedLog === log.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <OperationBadge type={log.operationType} />
                      <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'rgba(255,255,255,0.65)', flex: 1 }}>
                        {log.operationName}
                      </span>
                      <span style={{
                        fontSize: '10px', fontFamily: 'monospace',
                        color: log.durationMs > 50 ? '#f59e0b' : 'rgba(16,185,129,0.7)',
                      }}>
                        {log.durationMs}ms
                      </span>
                      <span style={{
                        fontSize: '9px', padding: '2px 6px', borderRadius: '3px',
                        background: log.status === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: log.status === 'success' ? '#10b981' : '#ef4444',
                      }}>
                        {log.status}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)' }}>
                        {expandedLog === log.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </div>
                    <div style={{ marginTop: '3px', fontSize: '10px', color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString()} — {log.resolverCount} resolvers
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedLog === log.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          margin: '2px 0 2px 14px', padding: '12px',
                          background: 'rgba(255,255,255,0.015)', borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                                REQUEST
                              </div>
                              <GQLSyntax code={log.query} />
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '6px', letterSpacing: '0.1em' }}>
                                RESPONSE
                              </div>
                              <div style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.65 }}>
                                <JSONViewer data={JSON.parse(log.response || '{}')} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {logs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.12)', fontSize: '12px' }}>
                  No queries executed yet
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Subscriptions Panel ── */}
        {panel === 'subscriptions' && (
          <motion.div
            key="subs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* Status bar */}
            <div style={{
              padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'rgba(255,255,255,0.01)',
            }}>
              {activeSub ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%', background: '#10b981',
                      boxShadow: '0 0 8px rgba(16,185,129,0.6)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '11px', color: '#10b981' }}>
                      WebSocket Connected
                    </span>
                  </div>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                    {activeSub.eventCount} events received
                  </span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                    {Math.round((Date.now() - activeSub.startTime) / 1000)}s uptime
                  </span>
                  <button onClick={stopSubscription} style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '4px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '10px',
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#ef4444',
                  }}>
                    <WifiOff size={10} /> Disconnect
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <WifiOff size={13} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                    No active subscription — select a Subscription query and click Subscribe
                  </span>
                </div>
              )}
            </div>

            {/* Events stream */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              <AnimatePresence>
                {subEvents.map((ev, i) => (
                  <motion.div
                    key={`${ev.ts}-${i}`}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      marginBottom: '6px', padding: '10px 14px',
                      background: 'rgba(16,185,129,0.04)', borderRadius: '7px',
                      border: '1px solid rgba(16,185,129,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Zap size={10} color="#10b981" />
                      <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
                        {new Date(ev.ts).toLocaleTimeString('it-IT', { hour12: false })}
                        .{String(ev.ts % 1000).padStart(3, '0')}
                      </span>
                      <span style={{ fontSize: '9px', color: '#10b981', marginLeft: 'auto' }}>event #{subEvents.length - i}</span>
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.65 }}>
                      <JSONViewer data={ev.data} depth={0} />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {subEvents.length === 0 && (
                <div style={{
                  height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,0.1)', gap: '10px',
                }}>
                  <Activity size={32} strokeWidth={1} />
                  <span style={{ fontSize: '12px' }}>Waiting for subscription events...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
