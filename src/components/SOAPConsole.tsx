/**
 * SOAP Console — Client SOAP interattivo
 * Genera XML Envelope reali, esegue chiamate simulate e mostra WSDL
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, RotateCcw, Copy, Check,
  FileCode, Send, Clock, AlertTriangle, CheckCircle, BookOpen,
} from 'lucide-react';
import {
  soapClient, soapCallRegistry, WSDL_DEFINITION, SOAP_EXAMPLES,
} from '../services/soapSimulator';
import type { SOAPCallLog, SOAPOperation } from '../services/soapSimulator';

// ── XML Syntax highlighter ────────────────────────────────────
function XMLSyntax({ code }: { code: string }) {
  const highlighted = code
    .replace(/(&lt;|<)(\/?)([a-zA-Z:][^\s>/]*)/g,
      (_, lt, slash, tag) =>
        `${lt === '&lt;' ? '&lt;' : '<'}${slash}<span style="color:#67e8f9">${tag}</span>`)
    .replace(/([a-zA-Z:]+)=/g,
      '<span style="color:#c084fc">$1</span>=')
    .replace(/"([^"]*)"/g,
      '"<span style="color:#86efac">$1</span>"')
    .replace(/(&gt;|>)([^<]+)(<|&lt;)/g,
      (_m, gt, content, lt) =>
        `${gt === '&gt;' ? '&gt;' : '>'}` +
        `<span style="color:rgba(255,255,255,0.7)">${content}</span>` +
        `${lt === '&lt;' ? '&lt;' : '<'}`)
    .replace(/(&lt;\?xml[^?]*\?&gt;|<\?xml[^?]*\?>)/g,
      '<span style="color:rgba(255,255,255,0.25)">$1</span>')
    .replace(/(<!--.*?-->)/gs,
      '<span style="color:rgba(255,255,255,0.2)">$1</span>');

  return (
    <pre style={{
      margin: 0, fontSize: '11px', lineHeight: 1.65, fontFamily: 'JetBrains Mono, monospace',
      color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }} dangerouslySetInnerHTML={{ __html: highlighted }} />
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => {
      navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); });
    }} style={{
      display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px',
      color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer',
    }}>
      {ok ? <><Check size={10} /><span>Copied</span></> : <><Copy size={10} /><span>Copy</span></>}
    </button>
  );
}

// ── Operation badge ───────────────────────────────────────────
function OpBadge({ op }: { op: SOAPOperation }) {
  const colors: Record<SOAPOperation, string> = {
    PagamentoMulta:  '#f97316',
    VerificaVeicolo: '#3b82f6',
    ReportZona:      '#8b5cf6',
  };
  return (
    <span style={{
      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase',
      background: `${colors[op]}18`, color: colors[op],
      border: `1px solid ${colors[op]}30`,
    }}>{op}</span>
  );
}

type Panel = 'console' | 'wsdl' | 'history';

// ── Form fields per operazione ────────────────────────────────
type FormState = {
  // PagamentoMulta
  targa: string;
  importo: string;
  motivazione: string;
  operatore: string;
  // ReportZona
  zona: string;
  dataInizio: string;
  dataFine: string;
};

const ZONES = [
  'Centro Storico', 'Zona Industriale', 'Quartiere Residenziale Nord',
  'Zona Commerciale', 'Parco Urbano', 'Porto / Logistica',
  'Campus Universitario', 'Zona Ospedaliera',
];

export default function SOAPConsole() {
  const [panel, setPanel] = useState<Panel>('console');
  const [operation, setOperation] = useState<SOAPOperation>('PagamentoMulta');
  const [form, setForm] = useState<FormState>({
    targa: 'AB123CD', importo: '87.50', motivazione: 'Sosta in zona vietata',
    operatore: 'AGT-042', zona: 'Centro Storico',
    dataInizio: '2024-01-01', dataFine: '2024-01-31',
  });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SOAPCallLog | null>(null);
  const [logs, setLogs] = useState<SOAPCallLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [activeXML, setActiveXML] = useState<'request' | 'response'>('request');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Health-check Express al mount e ogni 5s
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/soap', {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml', 'SOAPAction': '"ping"' },
          body: '<ping/>',
          signal: AbortSignal.timeout(2000),
        });
        // qualsiasi risposta (anche fault XML) = server online
        setServerOnline(r.status !== 0);
      } catch { setServerOnline(false); }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);
    targa: 'AB123CD', importo: '87.50', motivazione: 'Sosta in zona vietata',
    operatore: 'AGT-042', zona: 'Centro Storico',
    dataInizio: '2024-01-01', dataFine: '2024-01-31',
  });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SOAPCallLog | null>(null);
  const [logs, setLogs] = useState<SOAPCallLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [activeXML, setActiveXML] = useState<'request' | 'response'>('request');

  useEffect(() => {
    setLogs(soapCallRegistry.getLogs());
    const unsub = soapCallRegistry.subscribe(log => {
      setLogs(soapCallRegistry.getLogs());
      setLastResult(log);
    });
    return () => { unsub(); };
  }, []);

  const setField = (k: keyof FormState, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const loadExample = (op: SOAPOperation, idx: number) => {
    setOperation(op);
    const ex = (SOAP_EXAMPLES[op] as Record<string, string>[])[idx];
    if (!ex) return;
    setForm(f => ({ ...f, ...ex, importo: String(ex.importo || f.importo) }));
  };

  const execute = async () => {
    if (loading) return;
    setLoading(true);
    setLastResult(null);
    try {
      let result: SOAPCallLog;
      if (operation === 'PagamentoMulta') {
        result = await soapClient.pagamentoMulta({
          targa: form.targa, importo: parseFloat(form.importo) || 0,
          motivazione: form.motivazione, operatore: form.operatore,
        });
      } else if (operation === 'VerificaVeicolo') {
        result = await soapClient.verificaVeicolo({ targa: form.targa });
      } else {
        result = await soapClient.reportZona({
          zona: form.zona, dataInizio: form.dataInizio, dataFine: form.dataFine,
        });
      }
      setLastResult(result);
      setActiveXML('response');
    } finally {
      setLoading(false);
    }
  };

  const PANELS: { id: Panel; label: string }[] = [
    { id: 'console', label: 'Console' },
    { id: 'wsdl',    label: 'WSDL' },
    { id: 'history', label: `History (${logs.length})` },
  ];

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px',
    padding: '7px 10px', color: 'rgba(255,255,255,0.75)', outline: 'none',
    fontSize: '12px', fontFamily: 'JetBrains Mono, monospace',
    transition: 'border-color 0.15s',
  };

  const labelStyle = {
    fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.25)', marginBottom: '5px', display: 'block',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>

      {/* Server status banner */}
      {serverOnline === false && (
        <div style={{ flexShrink: 0, padding: '9px 20px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>SOAP server offline</span>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>— avvia Express: npx tsx server/index.ts</span>
        </div>
      )}
      {serverOnline === true && (
        <div style={{ flexShrink: 0, padding: '7px 20px', background: 'rgba(16,185,129,0.07)', borderBottom: '1px solid rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: '10px', color: '#6ee7b7' }}>Express online — /api/soap attivo</span>
        </div>
      )}

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: '44px', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCode size={13} color="#6b7280" strokeWidth={1.5} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
              SOAP Console
            </span>
          </div>
          <div style={{
            fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.05em',
            color: 'rgba(255,255,255,0.18)', padding: '2px 8px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '4px',
          }}>
            http://soap-service:8000/soap
          </div>
          <div style={{
            fontSize: '9px', color: 'rgba(255,255,255,0.15)', padding: '2px 8px',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px',
          }}>
            Python / Spyne 2.14 · SOAP 1.1
          </div>
        </div>

        <div style={{ display: 'flex', gap: '3px' }}>
          {PANELS.map(p => (
            <button key={p.id} onClick={() => setPanel(p.id)} style={{
              padding: '4px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
              background: panel === p.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: `1px solid ${panel === p.id ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
              color: panel === p.id ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── Console ── */}
        {panel === 'console' && (
          <motion.div key="console"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, display: 'flex', overflow: 'hidden' }}
          >
            {/* Left: form */}
            <div style={{
              width: '300px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.05)',
              overflowY: 'auto', padding: '16px',
            }}>
              {/* Operation selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Operation</label>
                {(['PagamentoMulta', 'VerificaVeicolo', 'ReportZona'] as SOAPOperation[]).map(op => (
                  <button key={op} onClick={() => { setOperation(op); setLastResult(null); }} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', borderRadius: '6px', marginBottom: '3px', cursor: 'pointer',
                    background: operation === op ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${operation === op ? 'rgba(255,255,255,0.09)' : 'transparent'}`,
                    color: operation === op ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                    fontSize: '11.5px', transition: 'all 0.12s',
                  }}>
                    <OpBadge op={op} />
                    <span style={{ marginLeft: '8px' }}>
                      {op === 'PagamentoMulta'  ? 'Pagamento Multa' :
                       op === 'VerificaVeicolo' ? 'Verifica Veicolo' : 'Report Zona'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Quick examples */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Quick Examples</label>
                {(SOAP_EXAMPLES[operation] as Record<string, string | number>[]).map((ex, i) => (
                  <button key={i} onClick={() => loadExample(operation, i)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', borderRadius: '5px', marginBottom: '2px',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.35)', fontSize: '10.5px', cursor: 'pointer',
                    fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.12s',
                  }}>
                    {ex.targa || ex.zona || `Example ${i + 1}`}
                    {ex.importo && <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: '6px' }}>€{ex.importo}</span>}
                  </button>
                ))}
              </div>

              {/* Form fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(operation === 'PagamentoMulta' || operation === 'VerificaVeicolo') && (
                  <div>
                    <label style={labelStyle}>Targa</label>
                    <input
                      value={form.targa} onChange={e => setField('targa', e.target.value)}
                      style={inputStyle} placeholder="AB123CD"
                    />
                  </div>
                )}
                {operation === 'PagamentoMulta' && (
                  <>
                    <div>
                      <label style={labelStyle}>Importo (€)</label>
                      <input
                        value={form.importo} onChange={e => setField('importo', e.target.value)}
                        style={inputStyle} placeholder="87.50" type="number" step="0.01"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Motivazione</label>
                      <input
                        value={form.motivazione} onChange={e => setField('motivazione', e.target.value)}
                        style={inputStyle} placeholder="Sosta vietata"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Operatore</label>
                      <input
                        value={form.operatore} onChange={e => setField('operatore', e.target.value)}
                        style={inputStyle} placeholder="AGT-001"
                      />
                    </div>
                  </>
                )}
                {operation === 'ReportZona' && (
                  <>
                    <div>
                      <label style={labelStyle}>Zona</label>
                      <select
                        value={form.zona} onChange={e => setField('zona', e.target.value)}
                        style={{ ...inputStyle, appearance: 'none' }}
                      >
                        {ZONES.map(z => <option key={z} value={z} style={{ background: '#0a0a0a' }}>{z}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Data Inizio</label>
                      <input
                        value={form.dataInizio} onChange={e => setField('dataInizio', e.target.value)}
                        style={inputStyle} type="date"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Data Fine</label>
                      <input
                        value={form.dataFine} onChange={e => setField('dataFine', e.target.value)}
                        style={inputStyle} type="date"
                      />
                    </div>
                  </>
                )}

                <button onClick={execute} disabled={loading} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                  padding: '9px', borderRadius: '7px', cursor: loading ? 'default' : 'pointer',
                  background: loading ? 'rgba(107,114,128,0.08)' : 'rgba(107,114,128,0.12)',
                  border: '1px solid rgba(107,114,128,0.2)',
                  color: loading ? 'rgba(107,114,128,0.4)' : 'rgba(180,185,192,0.8)',
                  fontSize: '12px', fontWeight: 600, transition: 'all 0.15s', marginTop: '4px',
                }}>
                  <Send size={12} />
                  {loading ? 'Sending...' : 'Send SOAP Request'}
                </button>
              </div>
            </div>

            {/* Center + Right: XML view */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Tab: request / response */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(255,255,255,0.01)',
              }}>
                {(['request', 'response'] as const).map(t => (
                  <button key={t} onClick={() => setActiveXML(t)} style={{
                    padding: '10px 20px', fontSize: '11px', cursor: 'pointer',
                    background: activeXML === t ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${activeXML === t ? 'rgba(107,114,128,0.6)' : 'transparent'}`,
                    color: activeXML === t ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)',
                    transition: 'all 0.15s',
                  }}>
                    {t === 'request' ? 'HTTP Request (XML Envelope)' : 'HTTP Response (XML)'}
                  </button>
                ))}

                {lastResult && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {lastResult.status === 'success'
                        ? <CheckCircle size={12} color="#10b981" />
                        : <AlertTriangle size={12} color="#ef4444" />
                      }
                      <span style={{
                        fontSize: '10px', fontFamily: 'monospace',
                        color: lastResult.status === 'success' ? '#10b981' : '#ef4444',
                      }}>
                        HTTP {lastResult.httpStatus}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} color="rgba(255,255,255,0.2)" />
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                        {lastResult.durationMs}ms
                      </span>
                    </div>
                    <CopyBtn text={activeXML === 'request' ? lastResult.requestXML : lastResult.responseXML} />
                  </div>
                )}
              </div>

              {/* XML Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {loading && (
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontFamily: 'monospace', padding: '8px' }}>
                    Sending SOAP request to {soapClient.getEndpoint()}...
                  </div>
                )}

                {!loading && !lastResult && (
                  <div style={{ padding: '8px' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', marginBottom: '16px' }}>
                      {`<!-- SOAP Envelope will appear here after you send a request -->`}
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.04)', padding: '16px',
                    }}>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginBottom: '12px', letterSpacing: '0.1em' }}>
                        COME FUNZIONA SOAP
                      </div>
                      {[
                        { step: '1', text: 'Il client costruisce un XML Envelope con Header (Auth) e Body (parametri)' },
                        { step: '2', text: 'HTTP POST verso il service endpoint con header SOAPAction' },
                        { step: '3', text: 'Il server Python/Spyne parsa il WSDL, valida il messaggio e esegue il metodo' },
                        { step: '4', text: 'La risposta è un altro XML Envelope con i dati nel Body' },
                        { step: '5', text: 'In caso di errore: SOAP Fault con faultcode e faultstring' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                          <span style={{
                            width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                            background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '9px', color: 'rgba(107,114,128,0.8)', fontWeight: 700,
                          }}>{s.step}</span>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>{s.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!loading && lastResult && (
                  <XMLSyntax code={activeXML === 'request' ? lastResult.requestXML : lastResult.responseXML} />
                )}
              </div>

              {/* Parsed response card */}
              {lastResult && lastResult.status === 'success' && (
                <div style={{
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  padding: '12px 16px', background: 'rgba(16,185,129,0.03)',
                }}>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                    PARSED RESPONSE
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                    {Object.entries(lastResult.parsedResponse).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '2px' }}>{k}</div>
                        <div style={{
                          fontSize: '12px', fontFamily: 'JetBrains Mono, monospace',
                          color: k === 'stato' || k === 'trovato' ? '#10b981' : 'rgba(255,255,255,0.65)',
                          fontWeight: 600,
                        }}>
                          {String(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── WSDL ── */}
        {panel === 'wsdl' && (
          <motion.div key="wsdl"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <BookOpen size={14} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                    WSDL — SmartCitySOAPService
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                  Web Services Description Language · Generato da Python/Spyne 2.14 · Namespace: http://smartcity.local/soap
                </div>
              </div>
              <CopyBtn text={WSDL_DEFINITION} />
            </div>

            {/* Operations summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {(['PagamentoMulta', 'VerificaVeicolo', 'ReportZona'] as SOAPOperation[]).map(op => (
                <div key={op} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px', padding: '12px',
                }}>
                  <OpBadge op={op} />
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    {op === 'PagamentoMulta'  ? 'Registra pagamento multa. Input: targa, importo, motivazione. Output: transactionId, stato, ricevuta.' :
                     op === 'VerificaVeicolo' ? 'Verifica dati veicolo da targa. Output: proprietario, multeAperte, totaleDebito.' :
                     'Report incassi per zona in un periodo. Output: totalMulte, totaleIncassato, media.'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '10px', padding: '20px',
            }}>
              <XMLSyntax code={WSDL_DEFINITION} />
            </div>
          </motion.div>
        )}

        {/* ── History ── */}
        {panel === 'history' && (
          <motion.div key="history"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ flex: 1, overflowY: 'auto', padding: '16px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                {logs.length} SOAP calls
              </span>
              <button onClick={() => soapCallRegistry.clear()} style={{
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
                      width: '100%', textAlign: 'left', padding: '10px 14px',
                      borderRadius: '7px', cursor: 'pointer',
                      background: expandedLog === log.id ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${expandedLog === log.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <OpBadge op={log.operation} />
                      <span style={{
                        fontSize: '10px', fontFamily: 'monospace', marginLeft: 'auto',
                        color: log.status === 'success' ? 'rgba(16,185,129,0.7)' : '#ef4444',
                      }}>HTTP {log.httpStatus}</span>
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                        {log.durationMs}ms
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)' }}>
                        {expandedLog === log.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </div>
                    <div style={{ marginTop: '3px', fontSize: '10px', color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>
                      {new Date(log.timestamp).toLocaleTimeString()} · {log.soapAction.split('/').pop()}
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
                          margin: '2px 0 2px 14px', padding: '14px',
                          background: 'rgba(255,255,255,0.015)', borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '8px', letterSpacing: '0.1em' }}>
                                REQUEST XML
                              </div>
                              <XMLSyntax code={log.requestXML} />
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '8px', letterSpacing: '0.1em' }}>
                                RESPONSE XML
                              </div>
                              <XMLSyntax code={log.responseXML} />
                            </div>
                          </div>
                          {log.parsedResponse && (
                            <div style={{
                              marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.04)',
                              display: 'flex', flexWrap: 'wrap', gap: '16px',
                            }}>
                              {Object.entries(log.parsedResponse).map(([k, v]) => (
                                <div key={k}>
                                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>{k}</div>
                                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)' }}>
                                    {String(v)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {logs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.1)', fontSize: '12px' }}>
                  No SOAP calls made yet
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
