/**
 * CrisisGame — Mini-gioco che si attiva quando scatta un alert critico.
 * Il giocatore deve rispondere correttamente entro il tempo limite.
 * Design: pure black, glassmorphism, Framer Motion.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Zap, Wind, Thermometer, Volume2, Activity, X, Trophy, Clock } from 'lucide-react';
import type { Alert } from '../data/sensorSimulator';

// ─── Types ────────────────────────────────────────────────────────────────────
interface GameOption {
  id: string;
  label: string;
  description: string;
  isCorrect: boolean;
  consequence: string;
}

interface GameScenario {
  title: string;
  briefing: string;
  options: GameOption[];
  timeLimit: number; // seconds
  points: number;
}

export interface GameResult {
  won: boolean;
  points: number;
  choice: string;
  consequence: string;
}

interface Props {
  alert: Alert;
  onComplete: (result: GameResult) => void;
  onDismiss: () => void;
}

// ─── Scenario Generator ───────────────────────────────────────────────────────
function buildScenario(alert: Alert): GameScenario {
  const isCritical = alert.severity === 'critical';

  const SCENARIOS: Record<string, GameScenario> = {
    traffic: {
      title: 'Congestione Rilevata',
      briefing: `Traffico ${isCritical ? 'critico' : 'elevato'} in ${alert.zone}. I sensori MQTT segnalano ${isCritical ? 'blocco totale' : 'rallentamento severo'}. L'AI ha classificato questa anomalia come ${alert.severity.toUpperCase()} con Isolation Forest score > 0.85. Scegli la risposta ottimale.`,
      timeLimit: isCritical ? 20 : 30,
      points: isCritical ? 150 : 100,
      options: [
        {
          id: 'A',
          label: 'Attiva semafori adattivi',
          description: 'Ridistribuisce il flusso veicolare in tempo reale via GraphQL mutation',
          isCorrect: true,
          consequence: 'Ottimo. I semafori adattivi hanno ridotto la congestione del 35% in 8 minuti.'
        },
        {
          id: 'B',
          label: 'Invia pattuglia manuale',
          description: 'Risposta lenta, richiede 15-20 minuti. Non sfrutta l\'infrastruttura IoT.',
          isCorrect: false,
          consequence: 'Risposta lenta. La congestione si è espansa alle zone adiacenti prima dell\'arrivo.'
        },
        {
          id: 'C',
          label: 'Chiudi la zona al traffico',
          description: 'Soluzione drastica che devasta la viabilità del quadrante',
          isCorrect: false,
          consequence: 'Errore. La chiusura ha creato congestione secondaria in 3 zone limitrofe.'
        },
        {
          id: 'D',
          label: 'Notifica utenti via app',
          description: 'Devia solo il traffico GPS-guidato, insufficiente per veicoli non connessi',
          isCorrect: false,
          consequence: 'Parzialmente efficace. Solo il 22% del traffico ha risposto alla notifica.'
        },
      ],
    },
    air_quality: {
      title: 'Allerta Qualità Aria',
      briefing: `AQI ${isCritical ? 'pericoloso' : 'degradato'} in ${alert.zone}. I sensori di qualità aria hanno inviato ${isCritical ? 'alert rosso' : 'alert arancio'} via MQTT. Il modello RandomForest prevede peggioramento nelle prossime 2 ore. Risposta immediata richiesta.`,
      timeLimit: isCritical ? 18 : 28,
      points: isCritical ? 160 : 110,
      options: [
        {
          id: 'A',
          label: 'Blocco ZTL esteso + ventilazione edifici',
          description: 'Blocca le sorgenti principali di emissione e attiva sistemi di filtraggio',
          isCorrect: true,
          consequence: 'Corretto. AQI tornato sotto soglia in 22 minuti. Zero esposti a rischio.'
        },
        {
          id: 'B',
          label: 'Emetti solo allerta pubblica',
          description: 'Informare la popolazione senza intervenire sulle cause',
          isCorrect: false,
          consequence: 'Insufficiente. L\'AQI ha continuato a peggiorare. 3 ricoveri ospedalieri registrati.'
        },
        {
          id: 'C',
          label: 'Attendi secondo ciclo di letture',
          description: 'Aspetta conferma da altri sensori MQTT prima di agire',
          isCorrect: false,
          consequence: 'Ritardo critico. La finestra d\'intervento ottimale è stata persa.'
        },
        {
          id: 'D',
          label: 'Ricalibra i sensori',
          description: 'Assume che i sensori abbiano un drift di calibrazione',
          isCorrect: false,
          consequence: 'Errore di valutazione. I sensori erano corretti. L\'intervento è arrivato tardi.'
        },
      ],
    },
    temperature: {
      title: 'Anomalia Termica',
      briefing: `Temperatura ${isCritical ? 'critica' : 'anomala'} rilevata in ${alert.zone}. L'Isolation Forest ha isolato questo valore in soli 3 livelli di albero (anomalia estrema). Il gRPC ha propagato l'alert all'AlertService in 4ms. Intervieni.`,
      timeLimit: isCritical ? 15 : 25,
      points: isCritical ? 180 : 120,
      options: [
        {
          id: 'A',
          label: 'Attiva protocollo calore + centri refrigerati',
          description: 'Apre strutture di accoglienza e invia alert SOAP al sistema sanitario',
          isCorrect: true,
          consequence: 'Risposta esemplare. Zero casi di colpo di calore. Protocollo completato in 12 minuti.'
        },
        {
          id: 'B',
          label: 'Aumenta irrigazione parchi',
          description: 'Azione parziale, insufficiente per temperature critiche',
          isCorrect: false,
          consequence: 'Misura simbolica. Abbassamento termico di soli 0.8°C, insufficiente per la crisi.'
        },
        {
          id: 'C',
          label: 'Ignora, è un picco temporaneo',
          description: 'Il modello AI ha già escluso la temporaneità con CI 95%',
          isCorrect: false,
          consequence: 'Errore grave. L\'anomalia era strutturale. Escalation a livello critico confermata.'
        },
        {
          id: 'D',
          label: 'Invia allerta solo ai medici',
          description: 'Bypass della risposta preventiva, reagisce invece di prevenire',
          isCorrect: false,
          consequence: 'Approccio reattivo. 8 persone a rischio prima dell\'intervento medico.'
        },
      ],
    },
    noise: {
      title: 'Inquinamento Acustico',
      briefing: `Rumore ${isCritical ? 'critico' : 'elevato'} (${isCritical ? '> 90dB' : '75-90dB'}) in ${alert.zone}. Il sensor array MQTT ha rilevato picchi sostenuti. GraphQL subscription ha notificato il frontend in tempo reale. Identifica e neutralizza la fonte.`,
      timeLimit: 30,
      points: 90,
      options: [
        {
          id: 'A',
          label: 'Geocomparazione sensori + identificazione fonte',
          description: 'Usa la triangolazione dei dati multi-sensore per pinpointare l\'origine',
          isCorrect: true,
          consequence: 'Analisi precisa. Fonte identificata (cantiere non autorizzato). Multa emessa via SOAP.'
        },
        {
          id: 'B',
          label: 'Aumenta barriere acustiche',
          description: 'Soluzione fisica lenta, non risolve la causa',
          isCorrect: false,
          consequence: 'Palliativo. La fonte continua. Attenuazione insufficiente per i residenti.'
        },
        {
          id: 'C',
          label: 'Disabilita sensori in zona',
          description: 'Elimina il problema dai dati senza risolverlo nella realtà',
          isCorrect: false,
          consequence: 'Azione controproducente. Perdita di copertura sensoristica nella zona.'
        },
        {
          id: 'D',
          label: 'Emetti ordinanza comunale',
          description: 'Iter burocratico lento, non è una risposta real-time',
          isCorrect: false,
          consequence: 'Tempistica inadeguata. L\'ordinanza arriverà dopo 48 ore. Problema irrisolto.'
        },
      ],
    },
    energy: {
      title: 'Sovraccarico Energetico',
      briefing: `Consumo ${isCritical ? 'critico' : 'anomalo'} in ${alert.zone}. I sensori di energia hanno inviato dati al DataProcessor via gRPC. Il modello AI prevede un blackout con probabilità ${isCritical ? '87%' : '54%'} nelle prossime 4 ore. Gestisci il carico.`,
      timeLimit: isCritical ? 20 : 30,
      points: isCritical ? 170 : 115,
      options: [
        {
          id: 'A',
          label: 'Load balancing automatico + DR attivato',
          description: 'Ridistribuisce il carico sulla rete e attiva la domanda flessibile',
          isCorrect: true,
          consequence: 'Perfetto. Picco abbattuto del 28%. Blackout scongiurato. Risparmio 12 MWh.'
        },
        {
          id: 'B',
          label: 'Aumenta la tensione di rete',
          description: 'Controproducente — peggiora il rischio di guasto',
          isCorrect: false,
          consequence: 'Errore tecnico. L\'aumento di tensione ha accelerato il degrado degli impianti.'
        },
        {
          id: 'C',
          label: 'Distacca utenze industriali',
          description: 'Azione drastica senza previa negoziazione, crea problemi legali',
          isCorrect: false,
          consequence: 'Tecnicamente efficace ma giuridicamente rischioso. 3 contenziosi aperti.'
        },
        {
          id: 'D',
          label: 'Attendi i dati di TimescaleDB',
          description: 'Analisi storica utile ma non prioritaria in fase acuta',
          isCorrect: false,
          consequence: 'Ritardo ingiustificato. Il blackout si è verificato durante l\'analisi storica.'
        },
      ],
    },
  };

  return SCENARIOS[alert.type] ?? SCENARIOS['traffic'];
}

// ─── Score Store (in-memory) ───────────────────────────────────────────────────
export const gameStore = {
  totalScore: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  addResult(r: GameResult) {
    this.gamesPlayed++;
    if (r.won) { this.gamesWon++; this.totalScore += r.points; }
  },
};

// ─── Countdown Ring ────────────────────────────────────────────────────────────
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = seconds / total;
  const r = 20;
  const circ = 2 * Math.PI * r;
  const color = pct > 0.5 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: '52px', height: '52px', flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
        <circle
          cx="26" cy="26" r={r} fill="none"
          stroke={color} strokeWidth="2.5"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color,
      }}>
        {seconds}
      </div>
    </div>
  );
}

// ─── Severity Icon ────────────────────────────────────────────────────────────
const SENSOR_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number; color?: string }>> = {
  traffic:     Activity,
  air_quality: Wind,
  temperature: Thermometer,
  noise:       Volume2,
  energy:      Zap,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#3b82f6',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CrisisGame({ alert, onComplete, onDismiss }: Props) {
  const scenario = buildScenario(alert);
  const [timeLeft,   setTimeLeft]   = useState(scenario.timeLimit);
  const [chosen,     setChosen]     = useState<GameOption | null>(null);
  const [phase,      setPhase]      = useState<'briefing' | 'choice' | 'result'>('briefing');
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const SensorIcon = SENSOR_ICONS[alert.type] ?? AlertTriangle;
  const accentColor = SEVERITY_COLORS[alert.severity] ?? '#f59e0b';

  // Start countdown when in choice phase
  useEffect(() => {
    if (phase !== 'choice') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          // Timeout — auto-fail
          const result: GameResult = {
            won: false,
            points: 0,
            choice: 'TIMEOUT',
            consequence: 'Tempo scaduto. Nessuna risposta inviata. La situazione è degenerata.',
          };
          gameStore.addResult(result);
          setPhase('result');
          setChosen(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  const handleChoice = useCallback((opt: GameOption) => {
    clearInterval(timerRef.current!);
    setChosen(opt);
    const result: GameResult = {
      won: opt.isCorrect,
      points: opt.isCorrect ? scenario.points : 0,
      choice: opt.label,
      consequence: opt.consequence,
    };
    gameStore.addResult(result);
    setPhase('result');
  }, [scenario.points]);

  const handleDone = useCallback(() => {
    if (chosen) {
      onComplete({
        won: chosen.isCorrect,
        points: chosen.isCorrect ? scenario.points : 0,
        choice: chosen.label,
        consequence: chosen.consequence,
      });
    } else {
      onComplete({ won: false, points: 0, choice: 'TIMEOUT', consequence: 'Tempo scaduto.' });
    }
  }, [chosen, scenario.points, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(16px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{
          width: '100%', maxWidth: '560px',
          background: '#0a0a0a',
          border: `1px solid ${accentColor}30`,
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: `0 0 60px ${accentColor}10, 0 24px 64px rgba(0,0,0,0.7)`,
          margin: '16px',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${accentColor}15`,
          background: `linear-gradient(135deg, ${accentColor}06 0%, transparent 60%)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0,
              background: `${accentColor}12`, border: `1px solid ${accentColor}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SensorIcon size={18} color={accentColor} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{
                  fontSize: '9px', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em',
                  padding: '2px 8px', borderRadius: '999px',
                  background: `${accentColor}15`, border: `1px solid ${accentColor}30`,
                  color: accentColor,
                }}>
                  {alert.severity.toUpperCase()} — CRISIS RESPONSE
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Trophy size={10} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>
                    Score: {gameStore.totalScore} — W: {gameStore.gamesWon}/{gameStore.gamesPlayed}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.88)', letterSpacing: '-0.01em' }}>
                {scenario.title}
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                {alert.zone}
              </div>
            </div>

            {phase === 'choice' && (
              <CountdownRing seconds={timeLeft} total={scenario.timeLimit} />
            )}

            <button
              onClick={onDismiss}
              style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={12} color="rgba(255,255,255,0.3)" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">

          {/* BRIEFING */}
          {phase === 'briefing' && (
            <motion.div
              key="briefing"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              style={{ padding: '20px' }}
            >
              {/* Alert context */}
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px', padding: '14px', marginBottom: '16px',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Briefing Situazione
                </div>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>
                  {scenario.briefing}
                </p>
              </div>

              {/* Protocol info */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {['MQTT alert ricevuto', `gRPC → AIService (${alert.severity})`, 'GraphQL subscription push', alert.severity === 'critical' ? 'SOAP → Sanità' : 'TimescaleDB log'].map(tag => (
                  <span key={tag} style={{
                    fontSize: '9px', fontFamily: 'var(--font-mono)',
                    padding: '3px 8px', borderRadius: '5px',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.25)',
                  }}>{tag}</span>
                ))}
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '18px' }}>
                {[
                  { label: 'Tempo limite', value: `${scenario.timeLimit}s`, color: '#f59e0b' },
                  { label: 'Punti in palio', value: `+${scenario.points}`, color: '#10b981' },
                  { label: 'Opzioni', value: `${scenario.options.length}`, color: '#3b82f6' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px', padding: '10px 12px', textAlign: 'center',
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setPhase('choice')}
                style={{
                  width: '100%', padding: '13px',
                  background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
                  border: `1px solid ${accentColor}35`,
                  borderRadius: '12px', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em',
                  color: accentColor, fontWeight: 600, textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                <Shield size={13} strokeWidth={1.5} />
                Avvia risposta di crisi
              </button>
            </motion.div>
          )}

          {/* CHOICE */}
          {phase === 'choice' && (
            <motion.div
              key="choice"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              style={{ padding: '16px 20px 20px' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
              }}>
                <Clock size={11} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flex: 1 }}>
                  Seleziona la risposta ottimale
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                  padding: '2px 8px', borderRadius: '999px',
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                  color: '#f59e0b',
                }}>
                  +{scenario.points} pts se corretto
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scenario.options.map((opt, idx) => {
                  const isHov = hoveredId === opt.id;
                  return (
                    <motion.button
                      key={opt.id}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, duration: 0.2 }}
                      onMouseEnter={() => setHoveredId(opt.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => handleChoice(opt)}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        background: isHov ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
                        border: `1px solid ${isHov ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: '12px', padding: '14px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
                          background: isHov ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isHov ? `${accentColor}40` : 'rgba(255,255,255,0.08)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
                          color: isHov ? accentColor : 'rgba(255,255,255,0.3)',
                          transition: 'all 0.15s',
                        }}>
                          {opt.id}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '12px', fontWeight: 600,
                            color: isHov ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
                            marginBottom: '4px', transition: 'color 0.15s',
                          }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
                            {opt.description}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ padding: '20px' }}
            >
              {/* Outcome banner */}
              {(() => {
                const isTimeout = !chosen;
                const isWin = chosen?.isCorrect ?? false;
                const bannerColor = isWin ? '#10b981' : '#ef4444';
                const bannerLabel = isTimeout ? 'TIMEOUT' : isWin ? 'RISPOSTA CORRETTA' : 'RISPOSTA ERRATA';
                const pts = isWin ? scenario.points : 0;

                return (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '16px', borderRadius: '14px', marginBottom: '16px',
                      background: `${bannerColor}08`, border: `1px solid ${bannerColor}25`,
                    }}>
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                        background: `${bannerColor}12`, border: `1px solid ${bannerColor}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isWin
                          ? <Shield size={20} color={bannerColor} strokeWidth={1.5} />
                          : <AlertTriangle size={20} color={bannerColor} strokeWidth={1.5} />
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
                          color: bannerColor, marginBottom: '3px',
                        }}>
                          {bannerLabel}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                          {chosen?.label ?? 'Nessuna azione intrapresa'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700,
                          color: bannerColor, lineHeight: 1,
                        }}>
                          {isWin ? `+${pts}` : '0'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>
                          POINTS
                        </div>
                      </div>
                    </div>

                    {/* Consequence */}
                    <div style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '12px', padding: '14px', marginBottom: '16px',
                    }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', marginBottom: '7px', textTransform: 'uppercase' }}>
                        Conseguenza
                      </div>
                      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>
                        {chosen?.consequence ?? 'La situazione è degenerata in assenza di risposta.'}
                      </p>
                    </div>

                    {/* Total score */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                      {[
                        { label: 'Score Totale', value: gameStore.totalScore.toString(), color: '#f59e0b' },
                        { label: 'Vittorie', value: `${gameStore.gamesWon}/${gameStore.gamesPlayed}`, color: '#10b981' },
                        { label: 'Percentuale', value: gameStore.gamesPlayed > 0 ? `${Math.round(gameStore.gamesWon / gameStore.gamesPlayed * 100)}%` : '—', color: '#3b82f6' },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '10px', padding: '10px 12px', textAlign: 'center',
                        }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '3px' }}>{s.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleDone}
                      style={{
                        width: '100%', padding: '12px',
                        background: `${bannerColor}10`, border: `1px solid ${bannerColor}28`,
                        borderRadius: '12px', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em',
                        color: bannerColor, fontWeight: 600, textTransform: 'uppercase',
                        transition: 'all 0.2s',
                      }}
                    >
                      Chiudi e continua il monitoraggio
                    </button>
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
