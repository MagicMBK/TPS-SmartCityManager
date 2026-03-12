import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Activity, Wind, Thermometer, Volume2, Zap, Signal, SignalZero } from 'lucide-react';
import LandingPage from './components/LandingPage';
import Sidebar from './components/Sidebar';
import DigitalTwin3D from './components/DigitalTwin3D';
import Dashboard from './components/Dashboard';
import AlertPanel from './components/AlertPanel';
import ArchitectureView from './components/ArchitectureView';
import ZoneDetail from './components/ZoneDetail';
import AIServicePanel from './components/AIServicePanel';
import SupabaseConsole from './components/SupabaseConsole';
import ToastContainer from './components/ToastNotification';
import CrisisGame from './components/CrisisGame';
import type { GameResult } from './components/CrisisGame';
import { citySimulator } from './data/sensorSimulator';
import type { SimulatorUpdate, ZoneData, SensorType, Alert } from './data/sensorSimulator';

type ViewTab = 'twin' | 'dashboard' | 'ai' | 'architecture' | 'timescale';

const METRICS: { value: SensorType; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'traffic',     label: 'Traffic',  color: '#f97316', icon: <Activity    size={11} strokeWidth={1.5} /> },
  { value: 'air_quality', label: 'Air',      color: '#10b981', icon: <Wind        size={11} strokeWidth={1.5} /> },
  { value: 'temperature', label: 'Temp',     color: '#ef4444', icon: <Thermometer size={11} strokeWidth={1.5} /> },
  { value: 'noise',       label: 'Noise',    color: '#8b5cf6', icon: <Volume2     size={11} strokeWidth={1.5} /> },
  { value: 'energy',      label: 'Energy',   color: '#3b82f6', icon: <Zap         size={11} strokeWidth={1.5} /> },
];

const TAB_LABELS: Record<ViewTab, string> = {
  twin:         'Digital Twin',
  dashboard:    'Analytics',
  ai:           'AI Engine',
  architecture: 'Architecture',
  timescale:    'Supabase DB',
};

export default function App() {
  const [entered,       setEntered]       = useState(false);
  const [data,          setData]          = useState<SimulatorUpdate | null>(null);
  const [tab,           setTab]           = useState<ViewTab>('twin');
  const [metric,        setMetric]        = useState<SensorType>('traffic');
  const [selectedZone,  setSelectedZone]  = useState<ZoneData | null>(null);
  const [showAlerts,    setShowAlerts]    = useState(false);
  const [isLive,        setIsLive]        = useState(true);
  const [alertFlash,    setAlertFlash]    = useState(false);
  const [toastAlerts,   setToastAlerts]   = useState<SimulatorUpdate['alerts']>([]);
  const [activeGame,    setActiveGame]    = useState<Alert | null>(null);
  const [gameResultMsg, setGameResultMsg] = useState<{ text: string; won: boolean } | null>(null);
  const [serverOnline,  setServerOnline]  = useState<boolean | null>(null);
  const seenAlerts = useRef(new Set<string>());

  useEffect(() => {
    citySimulator.start(2000);
    setData(citySimulator.getInitialData());
    const unsub = citySimulator.subscribe(update => {
      setData(update);
      if (update.newAlerts.length > 0) {
        setAlertFlash(true);
        setTimeout(() => setAlertFlash(false), 700);
        const fresh = update.newAlerts.filter(a => !seenAlerts.current.has(a.id));
        if (fresh.length > 0) {
          fresh.forEach(a => seenAlerts.current.add(a.id));
          setToastAlerts(prev => [...fresh, ...prev].slice(0, 3));
        }
      }
    });
    const unsubServer = citySimulator.subscribeServer(setServerOnline);
    return () => { unsub(); unsubServer(); citySimulator.stop(); };
  }, []);

  const toggleLive = useCallback(() => {
    if (isLive) citySimulator.stop();
    else        citySimulator.start(2000);
    setIsLive(p => !p);
  }, [isLive]);

  const ack = useCallback((id: string) => citySimulator.acknowledgeAlert(id), []);

  const handleIntervene = useCallback((alert: Alert) => {
    citySimulator.acknowledgeAlert(alert.id);
    setActiveGame(alert);
  }, []);

  /* Landing */
  if (!entered) return <LandingPage onEnter={() => setEntered(true)} />;

  /* Loading */
  if (!data) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '1px solid rgba(59,130,246,0.25)', borderTop: '1px solid rgba(59,130,246,0.7)',
            margin: '0 auto 16px', animation: 'spin-slow 1s linear infinite',
          }} />
          <div className="mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Initializing
          </div>
        </motion.div>
      </div>
    );
  }

  const unacked = data.alerts.filter(a => !a.acknowledged).length;

  return (
    <motion.div
      className="app-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Toast — small, top-right, "Intervieni" button opens game */}
      <ToastContainer alerts={toastAlerts} onAcknowledge={ack} onIntervene={handleIntervene} />

      {/* ── Server status banner ─────────────────────────────────────────── */}
      {serverOnline === false && (
        <div style={{
          flexShrink: 0,
          padding: '7px 20px',
          background: 'rgba(239,68,68,0.15)',
          borderBottom: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', alignItems: 'center', gap: '12px',
          zIndex: 200,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
            boxShadow: '0 0 6px #ef4444' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5' }}>
            Server Express offline
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
            — dati congelati all'ultimo valore noto. Avvia: <b style={{ color: 'rgba(255,255,255,0.55)' }}>npm run dev</b>
          </span>
          <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>
            GraphQL · gRPC · SOAP non disponibili
          </div>
        </div>
      )}
      {serverOnline === true && (
        <div style={{
          flexShrink: 0,
          padding: '6px 20px',
          background: 'rgba(16,185,129,0.1)',
          borderBottom: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', alignItems: 'center', gap: '10px',
          zIndex: 200,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#6ee7b7' }}>
            Server online — GraphQL legge da Supabase · gRPC AI attivo · SOAP attivo
          </span>
        </div>
      )}

      {/* Top bar */}
      <header className="topbar">
        {/* Left: wordmark + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 20 20" fill="none" style={{ width: '12px', height: '12px' }}>
              <rect x="3" y="10" width="3" height="7" rx="0.5" fill="rgba(255,255,255,0.25)" />
              <rect x="8.5" y="6" width="3" height="11" rx="0.5" fill="rgba(255,255,255,0.4)" />
              <rect x="14" y="2" width="3" height="15" rx="0.5" fill="rgba(59,130,246,0.9)" />
            </svg>
          </div>
          <span className="mono" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
            PuntoSnai
          </span>
          <svg viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" style={{ width: '12px', height: '12px', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
          </svg>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.28)' }}>{TAB_LABELS[tab]}</span>
        </div>

        {/* Center: metric selector */}
        <AnimatePresence>
          {(tab === 'twin' || tab === 'dashboard') && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', gap: '4px' }}
            >
              {METRICS.map(m => (
                <button
                  key={m.value}
                  className={`metric-pill ${metric === m.value ? 'active' : ''}`}
                  onClick={() => setMetric(m.value)}
                  style={metric === m.value ? {
                    borderColor: `${m.color}35`,
                    background: `${m.color}12`,
                    color: m.color,
                  } : {}}
                >
                  <span style={{ color: metric === m.value ? m.color : 'rgba(255,255,255,0.25)' }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* gRPC status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '999px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {isLive
              ? <Signal     size={11} color="rgba(16,185,129,0.7)"  strokeWidth={1.5} />
              : <SignalZero size={11} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            }
            <span className="mono" style={{ fontSize: '9px', letterSpacing: '0.1em', color: isLive ? 'rgba(16,185,129,0.65)' : 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
              gRPC {isLive ? 'connected' : 'paused'}
            </span>
          </div>

          {/* Live toggle */}
          <button
            onClick={toggleLive}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '5px 12px', borderRadius: '999px', cursor: 'pointer',
              background: isLive ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isLive ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)'}`,
              transition: 'all 0.18s',
            }}
          >
            {isLive
              ? <div className="dot-live" />
              : <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            }
            <span className="mono" style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: isLive ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.25)' }}>
              {isLive ? 'Live' : 'Paused'}
            </span>
          </button>

          {/* Alert bell */}
          <button
            onClick={() => setShowAlerts(p => !p)}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '34px', height: '34px', borderRadius: '9px', cursor: 'pointer',
              background: showAlerts ? 'rgba(239,68,68,0.1)' : alertFlash ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${showAlerts || unacked > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}`,
              transition: 'all 0.18s',
            }}
          >
            <Bell size={14} color={unacked > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)'} strokeWidth={1.5} />
            {unacked > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}
                style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: '#ef4444', color: '#fff',
                  borderRadius: '999px', fontSize: '8px', fontWeight: 700,
                  padding: '0 4px', minWidth: '14px', height: '14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', border: '1.5px solid #000',
                }}
              >
                {unacked > 9 ? '9+' : unacked}
              </motion.span>
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          activeTab={tab}
          onChange={t => { setTab(t); setShowAlerts(false); }}
          alertCount={unacked}
          isLive={isLive}
          onToggleLive={toggleLive}
        />

        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {/* Digital Twin */}
          <AnimatePresence mode="wait">
            {tab === 'twin' && (
              <motion.div key="twin"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'absolute', inset: 0 }}
              >
                <div style={{ height: '100%', display: 'flex' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <DigitalTwin3D
                      zones={data.zones}
                      selectedMetric={metric}
                      onZoneSelect={setSelectedZone}
                      selectedZone={selectedZone}
                    />

                    {/* Protocol tags */}
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                      style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', gap: '5px', zIndex: 20, pointerEvents: 'none' }}
                    >
                      {['MQTT', 'gRPC', 'GraphQL', 'SOAP'].map(p => (
                        <span key={p} className="mono" style={{
                          fontSize: '9px', letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '5px',
                          background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.07)',
                          color: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)',
                        }}>{p}</span>
                      ))}
                    </motion.div>

                    {/* City stats */}
                    <motion.div
                      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                      style={{
                        position: 'absolute', top: '14px', right: '14px', zIndex: 20,
                        background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '12px', padding: '14px 16px', backdropFilter: 'blur(24px)',
                        minWidth: '156px',
                      }}
                    >
                      <div className="mono" style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: '10px' }}>
                        City Status
                      </div>
                      {[
                        { l: 'Sensors',     v: `${data.stats.activeSensors}/${data.stats.totalSensors}`, c: '#3b82f6' },
                        { l: 'Traffic',     v: `${data.stats.avgTraffic}%`,         c: '#f97316' },
                        { l: 'Air Quality', v: `AQI ${data.stats.avgAirQuality}`,   c: '#10b981' },
                        { l: 'Temp',        v: `${data.stats.avgTemperature}°C`,    c: '#ef4444' },
                        { l: 'Anomalies',   v: `${data.stats.anomaliesDetected}`,   c: '#f59e0b' },
                      ].map(row => (
                        <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{row.l}</span>
                          <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: row.c }}>{row.v}</span>
                        </div>
                      ))}
                    </motion.div>

                    {/* Legend */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                      style={{
                        position: 'absolute', bottom: '14px', left: '14px', zIndex: 20,
                        background: 'rgba(0,0,0,0.82)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '9px', padding: '10px 14px', backdropFilter: 'blur(20px)',
                      }}
                    >
                      <div className="mono" style={{ fontSize: '9px', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: '7px' }}>Scale</div>
                      <div style={{ display: 'flex', gap: '14px' }}>
                        {[
                          { c: '#10b981', l: 'Optimal' },
                          { c: '#f59e0b', l: 'Warning' },
                          { c: '#ef4444', l: 'Critical' },
                        ].map(({ c, l }) => (
                          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}60` }} />
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{l}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </div>

                  {/* Zone detail panel */}
                  <AnimatePresence>
                    {selectedZone && (
                      <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                        style={{
                          width: '272px', flexShrink: 0, overflowY: 'auto',
                          background: 'rgba(4,4,4,0.97)',
                          borderLeft: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <ZoneDetail zone={selectedZone} readings={data.readings} onClose={() => setSelectedZone(null)} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dashboard */}
          <AnimatePresence mode="wait">
            {tab === 'dashboard' && (
              <motion.div key="dashboard"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'absolute', inset: 0 }}
              >
                <Dashboard stats={data.stats} zones={data.zones} history={data.history} selectedMetric={metric} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Engine */}
          <AnimatePresence mode="wait">
            {tab === 'ai' && (
              <motion.div key="ai"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'absolute', inset: 0 }}
              >
                <AIServicePanel simData={data} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Architecture */}
          <AnimatePresence mode="wait">
            {tab === 'architecture' && (
              <motion.div key="architecture"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}
              >
                <ArchitectureView />
              </motion.div>
            )}
          </AnimatePresence>

          {/* TimescaleDB */}
          <AnimatePresence mode="wait">
            {tab === 'timescale' && (
              <motion.div key="timescale"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'absolute', inset: 0 }}
              >
                <SupabaseConsole />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alert panel overlay */}
          <AnimatePresence>
            {showAlerts && (
              <AlertPanel
                alerts={data.alerts}
                onAcknowledge={ack}
                onIntervene={(alert) => { setActiveGame(alert); }}
                onClose={() => setShowAlerts(false)}
              />
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Crisis Game — triggered ONLY by clicking "Intervieni" on toast */}
      <AnimatePresence>
        {activeGame && (
          <CrisisGame
            alert={activeGame}
            onComplete={(result: GameResult) => {
              setActiveGame(null);
              setGameResultMsg({
                text: result.won ? `+${result.points} pts — ${result.consequence}` : result.consequence,
                won: result.won,
              });
              setTimeout(() => setGameResultMsg(null), 5000);
            }}
            onDismiss={() => setActiveGame(null)}
          />
        )}
      </AnimatePresence>

      {/* Game result flash */}
      <AnimatePresence>
        {gameResultMsg && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{
              position: 'fixed', bottom: '52px', left: '50%', transform: 'translateX(-50%)',
              zIndex: 8888,
              background: gameResultMsg.won ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${gameResultMsg.won ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: '12px', padding: '12px 20px',
              backdropFilter: 'blur(24px)',
              maxWidth: '480px', width: 'calc(100vw - 120px)',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.08em',
              color: gameResultMsg.won ? '#10b981' : '#ef4444',
            }}>
              {gameResultMsg.won ? 'CRISI RISOLTA' : 'RISPOSTA FALLITA'}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '3px', lineHeight: 1.5 }}>
              {gameResultMsg.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status bar */}
      <footer className="statusbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {[
            { l: 'Uptime',   v: `${data.stats.uptime}s`,                   c: 'rgba(16,185,129,0.55)' },
            { l: 'Readings', v: data.stats.totalReadings.toLocaleString(),  c: 'rgba(255,255,255,0.25)' },
            { l: 'Zones',    v: `${data.zones.length} active`,              c: 'rgba(255,255,255,0.25)' },
            { l: 'Alerts',   v: `${data.alerts.length}`,                    c: unacked > 0 ? '#ef4444' : 'rgba(255,255,255,0.25)' },
          ].map(item => (
            <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.l}</span>
              <span className="mono" style={{ fontSize: '10px', fontWeight: 600, color: item.c }}>{item.v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {['MQTT', 'gRPC', 'GraphQL', 'TimescaleDB'].map(p => (
              <span key={p} className="mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em' }}>{p}</span>
            ))}
          </div>
          <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {isLive
              ? <div className="dot-live" style={{ width: '5px', height: '5px' }} />
              : <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
            }
            <span className="mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em' }}>PuntoSnai v4</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
