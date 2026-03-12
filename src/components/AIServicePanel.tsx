/**
 * AIServicePanel — Pannello UI del Microservizio AI
 * Design: Pure black, glassmorphism, zero emoji, inline styles coerenti con il design system
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import {
  Cpu, AlertTriangle, TrendingUp, Radio, FileText, Code2,
  CheckCircle, Clock, Activity, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { smartCityAI, aiLogger } from '../ai/SmartCityAI';
import { aiServiceStub, grpcCallRegistry, sensorReadingToProto } from '../ai/grpcSimulator';
import type { AIServiceStats, AILogEntry, Proto_ModelStatus } from '../ai/SmartCityAI';
import type { GrpcCallLog } from '../ai/grpcSimulator';
import type { SimulatorUpdate, ZoneData } from '../data/sensorSimulator';

// ── health-check verso Express :3001 ────────────────────────────────────────
async function checkServerOnline(): Promise<boolean> {
  try {
    const res = await fetch('/api/grpc/modelStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Python source shown in the Code tab ────────────────────────────────────
const PYTHON_CODE = `# ai_service/smart_city_ai.py
import grpc, logging, numpy as np
from concurrent import futures
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import city_service_pb2 as pb2
import city_service_pb2_grpc as pb2_grpc

logging.basicConfig(level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("SmartCityAI")

class SmartCityAIServicer(pb2_grpc.AIServiceServicer):
    """Implementa RPC definite in city_service.proto. Porta 50052."""
    def __init__(self):
        self.isolation_models = {}
        self.sensor_types = ['traffic','air_quality','temperature','noise','energy']
        self.rf_regressor = RandomForestRegressor(
            n_estimators=100, max_depth=10, random_state=42)
        self.scaler = StandardScaler()
        self._warm_up()

    def _warm_up(self):
        """Warm-up con dati sintetici all'avvio del container."""
        logger.info("Warm-up modelli con dati sintetici...")
        params = {'traffic':(50,20),'air_quality':(65,15),
                  'temperature':(27,4),'noise':(55,12),'energy':(65,18)}
        for t in self.sensor_types:
            mu, sigma = params[t]
            X = np.random.normal(mu, sigma, 512)
            model = IsolationForest(n_estimators=100,
                contamination=0.05, random_state=42)
            model.fit(X.reshape(-1, 1))
            self.isolation_models[t] = model
            logger.info(f"IsolationForest[{t}] pronto")
        X_t, y_t = self._traffic_synthetic()
        self.rf_regressor.fit(self.scaler.fit_transform(X_t), y_t)
        logger.info("RandomForestRegressor pronto")

    def DetectAnomaly(self, request, context):
        model = self.isolation_models.get(request.type)
        if not model:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return pb2.AnomalyResult()
        score = float(model.score_samples([[request.value]])[0])
        normalized = np.clip((score + 0.5) / 0.5, 0, 1)
        is_anomaly = model.predict([[request.value]])[0] == -1
        return pb2.AnomalyResult(
            is_anomaly=is_anomaly, anomaly_score=float(normalized),
            severity=self._get_severity(normalized, is_anomaly),
            confidence=min(0.99, 0.5 + abs(normalized - 0.5) * 2))

    def _get_severity(self, score, is_anomaly):
        if not is_anomaly: return "none"
        if score > 0.92:   return "critical"
        if score > 0.82:   return "high"
        if score > 0.72:   return "medium"
        return "low"

    def PredictTraffic(self, request, context):
        history = list(request.history)
        features = np.array([[
            np.sin(2*np.pi*request.hour/24),
            np.cos(2*np.pi*request.hour/24),
            request.day_of_week / 6,
            history[-1] if history else 50,
            np.mean(history[-5:]) if history else 50]])
        X_scaled = self.scaler.transform(features)
        preds = [t.predict(X_scaled)[0]
                 for t in self.rf_regressor.estimators_]
        predicted = float(np.mean(preds))
        std_dev   = float(np.std(preds))
        return pb2.TrafficPrediction(
            predicted_value=predicted,
            lower_bound=max(0, predicted - 1.96*std_dev),
            upper_bound=min(100, predicted + 1.96*std_dev),
            trend=self._get_trend(predicted, history),
            peak_probability=self._peak_prob(request.hour, request.day_of_week))

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    pb2_grpc.add_AIServiceServicer_to_server(SmartCityAIServicer(), server)
    server.add_insecure_port('[::]:50052')
    server.start(); server.wait_for_termination()

if __name__ == '__main__':
    serve()`;

const DOCKERFILE_CODE = `# Dockerfile — ai-service (multi-stage)
FROM python:3.9-slim AS builder
RUN apt-get update && apt-get install -y gcc g++ \\
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.9-slim AS runtime
LABEL maintainer="SmartCity Team" version="1.0.0"
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
WORKDIR /app
COPY . .
RUN python -m grpc_tools.protoc -I. \\
    --python_out=. --grpc_python_out=. city_service.proto
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\
  CMD python -c "import grpc; ch=grpc.insecure_channel('localhost:50052'); ch.close()" \\
    || exit 1
EXPOSE 50052
CMD ["python", "-u", "smart_city_ai.py"]`;

const REQUIREMENTS_TXT = `# requirements.txt — ai-service
grpcio==1.59.0
grpcio-tools==1.59.0
protobuf==4.24.4
scikit-learn==1.3.0
numpy==1.25.2
pandas==2.1.1
scipy==1.11.3
joblib==1.3.2`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  panel: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    padding: '20px',
  } as React.CSSProperties,
  label: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.2)',
    marginBottom: '10px',
    display: 'block',
  } as React.CSSProperties,
  value: (color = 'rgba(255,255,255,0.85)') => ({
    fontFamily: 'var(--font-mono)',
    fontSize: '22px',
    fontWeight: 700,
    color,
    lineHeight: 1,
  } as React.CSSProperties),
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#3b82f6',
  none:     'rgba(255,255,255,0.2)',
};

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString('it-IT', { hour12: false });
}

// ─── Model Status Card ────────────────────────────────────────────────────────
function ModelCard({ model }: { model: Proto_ModelStatus }) {
  const isIF  = model.model_name.startsWith('IsolationForest');
  const pct   = Math.round(model.accuracy_score * 100);
  const accent = isIF ? '#3b82f6' : '#10b981';
  const shortName = model.model_name
    .replace('IsolationForest[', 'IF — ')
    .replace('RandomForestRegressor', 'RF Regressor')
    .replace(']', '');

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${accent}22`,
      borderRadius: '12px',
      padding: '14px',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.55)', maxWidth: '140px' }}>
          {shortName}
        </span>
        <span style={{
          fontSize: '9px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
          padding: '2px 8px', borderRadius: '999px',
          background: model.is_trained ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${model.is_trained ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
          color: model.is_trained ? '#10b981' : '#f59e0b',
        }}>
          {model.is_trained ? 'TRAINED' : 'WARM-UP'}
        </span>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>Accuracy</span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: accent }}>{pct}%</span>
        </div>
        <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ height: '100%', background: accent, borderRadius: '999px' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', fontFamily: 'var(--font-mono)' }}>
          {model.training_samples.toLocaleString()} samples
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', fontFamily: 'var(--font-mono)' }}>
          v{model.version}
        </span>
      </div>
    </div>
  );
}

// ─── gRPC Call Row ─────────────────────────────────────────────────────────────
function GrpcRow({ call }: { call: GrpcCallLog }) {
  const [open, setOpen] = useState(false);
  const ok = call.status === 'OK';
  const latColor = call.latencyMs < 5 ? '#10b981' : call.latencyMs < 15 ? '#f59e0b' : '#ef4444';

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        borderRadius: '9px', cursor: 'pointer',
        border: `1px solid ${ok ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.2)'}`,
        background: ok ? 'rgba(255,255,255,0.015)' : 'rgba(239,68,68,0.04)',
        transition: 'border-color 0.15s',
        overflow: 'hidden',
        marginBottom: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px' }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
          background: ok ? '#10b981' : '#ef4444',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#3b82f6', width: '120px', flexShrink: 0 }}>
          {call.method}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: latColor, width: '40px', flexShrink: 0 }}>
          {call.latencyMs}ms
        </span>
        <span style={{
          fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '1px 7px', borderRadius: '4px',
          background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: ok ? '#10b981' : '#ef4444',
        }}>
          {call.status}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.15)' }}>
          {fmt(call.timestamp)}
        </span>
        {open
          ? <ChevronUp size={10} color="rgba(255,255,255,0.2)" />
          : <ChevronDown size={10} color="rgba(255,255,255,0.2)" />}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 12px 12px' }}>
              {['request', 'response'].map(key => (
                <div key={key}>
                  <div style={{ ...S.label, marginBottom: '5px' }}>{key}</div>
                  <pre style={{
                    fontSize: '9px', fontFamily: 'var(--font-mono)',
                    color: 'rgba(255,255,255,0.45)',
                    background: 'rgba(0,0,0,0.4)',
                    borderRadius: '6px', padding: '8px',
                    overflowX: 'auto', lineHeight: 1.6,
                  }}>
                    {JSON.stringify(JSON.parse(key === 'request' ? call.request : call.response), null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Code Viewer ─────────────────────────────────────────────────────────────
type CodeFile = 'python' | 'dockerfile' | 'requirements';
const CODE_FILES: Record<CodeFile, { label: string; content: string }> = {
  python:       { label: 'smart_city_ai.py',  content: PYTHON_CODE       },
  dockerfile:   { label: 'Dockerfile',         content: DOCKERFILE_CODE   },
  requirements: { label: 'requirements.txt',   content: REQUIREMENTS_TXT  },
};

function CodeViewer() {
  const [active, setActive] = useState<CodeFile>('python');

  return (
    <div style={{
      ...S.panel,
      display: 'flex', flexDirection: 'column',
      height: '100%', padding: 0, overflow: 'hidden',
    }}>
      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: '4px', padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {(Object.keys(CODE_FILES) as CodeFile[]).map(k => (
          <button
            key={k}
            onClick={() => setActive(k)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
              background: active === k ? 'rgba(59,130,246,0.12)' : 'transparent',
              border: `1px solid ${active === k ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
              color: active === k ? '#3b82f6' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.15s',
            }}
          >
            {CODE_FILES[k].label}
          </button>
        ))}
      </div>
      {/* Code */}
      <pre style={{
        flex: 1, overflow: 'auto', margin: 0,
        padding: '16px 18px',
        fontFamily: 'var(--font-mono)', fontSize: '10.5px',
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
      }}>
        {CODE_FILES[active].content}
      </pre>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
type AITab = 'overview' | 'anomaly' | 'prediction' | 'grpc' | 'logs' | 'code';

const TABS: { id: AITab; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'overview',   label: 'Overview',    Icon: Cpu           },
  { id: 'anomaly',    label: 'Anomalia',    Icon: AlertTriangle },
  { id: 'prediction', label: 'Predizione',  Icon: TrendingUp    },
  { id: 'grpc',       label: 'gRPC',        Icon: Radio         },
  { id: 'logs',       label: 'Logs',        Icon: FileText      },
  { id: 'code',       label: 'Codice',      Icon: Code2         },
];

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; name: string; color: string }[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(8,8,8,0.95)', border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: '8px', padding: '8px 12px',
    }}>
      {payload.map((p, i) => (
        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props { simData: SimulatorUpdate | null; }

export default function AIServicePanel({ simData }: Props) {
  const [tab,          setTab]          = useState<AITab>('overview');
  const [aiStats,      setAiStats]      = useState<AIServiceStats | null>(null);
  const [logs,         setLogs]         = useState<AILogEntry[]>([]);
  const [grpcCalls,    setGrpcCalls]    = useState<GrpcCallLog[]>([]);
  const [isInit,       setIsInit]       = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null); // null = checking
  const [logFilter,    setLogFilter]    = useState<AILogEntry['level'] | 'ALL'>('ALL');
  const [selectedZone, setSelectedZone] = useState<ZoneData | null>(null);
  const [predResult,   setPredResult]   = useState<{
    predicted: number; lower: number; upper: number; trend: string; peakProb: number;
  } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Health-check Express al mount + ogni 5 secondi
    const doCheck = () => checkServerOnline().then(setServerOnline);
    doCheck();
    const interval = setInterval(doCheck, 5000);

    smartCityAI.initialize().then(() => {
      setIsInit(true);
      setAiStats(smartCityAI.getStats());
    });
    const u1 = smartCityAI.subscribe(s => setAiStats(s));
    const u2 = aiLogger.subscribe(() => setLogs(aiLogger.getLogs()));
    const u3 = grpcCallRegistry.subscribe(() => setGrpcCalls(grpcCallRegistry.getCalls()));
    setLogs(aiLogger.getLogs());
    setGrpcCalls(grpcCallRegistry.getCalls());
    return () => { u1(); u2(); u3(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    // Manda le letture al server gRPC SOLO se online
    if (!simData || !isInit || !serverOnline) return;
    simData.newReadings.forEach(r => {
      aiServiceStub.detectAnomaly(sensorReadingToProto(r))
        .then(call => { if (call.status === 'UNAVAILABLE') setServerOnline(false); })
        .catch(() => setServerOnline(false));
    });
  }, [simData, isInit, serverOnline]);

  const runPrediction = useCallback(async (zone: ZoneData) => {
    if (!serverOnline) return;
    const now = new Date();
    const req = {
      zone: zone.name, current_value: zone.traffic,
      history: Array.from({ length: 10 }, () => Math.max(0, zone.traffic + (Math.random() - 0.5) * 20)),
      hour: now.getHours(), day_of_week: now.getDay(),
    };
    const call = await aiServiceStub.predictTraffic(req);
    if (call.response) {
      setPredResult({
        predicted: call.response.predicted_value,
        lower:     call.response.confidence_interval[0],
        upper:     call.response.confidence_interval[1],
        trend:     call.response.trend,
        peakProb:  call.response.peak_probability,
      });
    }
    setSelectedZone(zone);
  }, []);

  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.level === logFilter);
  const anomalyData  = (aiStats?.recentAnomalies ?? []).slice(0, 20).map((a, idx) => ({ idx, score: a.score }));
  const predData     = (aiStats?.predictionHistory ?? []).slice(0, 30).map((p, idx) => ({ idx, predicted: p.predicted, actual: p.actual }));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', color: '#fff', overflow: 'hidden' }}>

      {/* ── Server status banner ────────────────────────────────────────── */}
      {serverOnline === false && (
        <div style={{
          flexShrink: 0, padding: '10px 22px',
          background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 600 }}>
            Server Express offline
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
            — avvia con: npx tsx server/index.ts
          </span>
        </div>
      )}
      {serverOnline === null && (
        <div style={{
          flexShrink: 0, padding: '8px 22px',
          background: 'rgba(234,179,8,0.08)', borderBottom: '1px solid rgba(234,179,8,0.2)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#fde047' }}>Verifica connessione al server...</span>
        </div>
      )}
      {serverOnline === true && (
        <div style={{
          flexShrink: 0, padding: '8px 22px',
          background: 'rgba(16,185,129,0.08)', borderBottom: '1px solid rgba(16,185,129,0.15)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', color: '#6ee7b7' }}>Express online — gRPC attivo su localhost:3001</span>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '18px 22px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Cpu size={16} color="#ef4444" strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.88)' }}>
                AI Engine
              </div>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>
                Python — scikit-learn — gRPC :50052
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '999px',
            background: isInit ? 'rgba(16,185,129,0.07)' : 'rgba(245,158,11,0.07)',
            border: `1px solid ${isInit ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: isInit ? '#10b981' : '#f59e0b',
              animation: 'pulse-dot 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: '9px', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
              color: isInit ? '#10b981' : '#f59e0b',
            }}>
              {isInit ? 'READY' : 'WARM-UP'}
            </span>
          </div>
        </div>

        {/* KPI strip */}
        {aiStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'Predizioni',   value: aiStats.totalPredictions.toLocaleString(), color: '#3b82f6' },
              { label: 'Anomalie',     value: aiStats.anomaliesDetected.toString(),       color: '#ef4444' },
              { label: 'Avg Latency',  value: `${aiStats.avgProcessingTimeMs}ms`,         color: '#f59e0b' },
              { label: 'Modelli',      value: aiStats.modelsStatus.length.toString(),      color: '#8b5cf6' },
            ].map(k => (
              <div key={k.label} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px', padding: '10px 12px',
              }}>
                <div style={S.label}>{k.label}</div>
                <div style={S.value(k.color)}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab nav ────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: '2px',
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        overflowX: 'auto',
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
                background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgba(59,130,246,0.28)' : 'transparent'}`,
                color: active ? '#3b82f6' : 'rgba(255,255,255,0.25)',
                fontSize: '11px', fontWeight: 500, letterSpacing: '0.01em',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              <t.Icon size={12} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >

            {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
            {tab === 'overview' && aiStats && (
              <>
                {/* Models grid */}
                <div>
                  <span style={S.label}>Stato Modelli — {aiStats.modelsStatus.length} attivi</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                    {aiStats.modelsStatus.map(m => <ModelCard key={m.model_name} model={m} />)}
                  </div>
                </div>

                {/* Pipeline flow */}
                <div style={S.panel}>
                  <span style={S.label}>Pipeline gRPC — Flusso Dati</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    {[
                      { label: 'IoT Sensors',    color: '#10b981', proto: 'MQTT'    },
                      { label: 'DataProcessor',  color: '#3b82f6', proto: 'gRPC'    },
                      { label: 'AI Service',     color: '#ef4444', proto: 'gRPC'    },
                      { label: 'AlertService',   color: '#f59e0b', proto: 'WS Push' },
                      { label: 'GraphQL GW',     color: '#ec4899', proto: ''        },
                    ].map((node, i, arr) => (
                      <div key={node.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{
                            width: '38px', height: '38px', borderRadius: '10px', margin: '0 auto 5px',
                            background: `${node.color}12`, border: `1px solid ${node.color}30`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Activity size={14} color={node.color} strokeWidth={1.5} />
                          </div>
                          <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.25)' }}>
                            {node.label}
                          </div>
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>→</div>
                            <div style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.12)' }}>{node.proto}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anomaly score chart */}
                {anomalyData.length > 0 && (
                  <div style={S.panel}>
                    <span style={S.label}>Score Anomalie — Ultime {anomalyData.length} rilevazioni</span>
                    <ResponsiveContainer width="100%" height={90}>
                      <AreaChart data={anomalyData}>
                        <defs>
                          <linearGradient id="agr" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <YAxis stroke="rgba(255,255,255,0.1)" fontSize={8} domain={[0, 1]} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={1.2} fill="url(#agr)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* ══ ANOMALY ═══════════════════════════════════════════════ */}
            {tab === 'anomaly' && (
              <>
                {/* Isolation Forest info */}
                <div style={S.panel}>
                  <span style={S.label}>Isolation Forest — Hyperparameters</span>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: '14px' }}>
                    Un punto anomalo viene isolato in meno passi rispetto a un punto normale.
                    Score = profondità media normalizzata su <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>100 alberi</span> con
                    sub-campionamento di <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>256</span> osservazioni.
                    Contamination target: <span style={{ color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>5%</span>.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'n_estimators',  value: '100',  desc: 'Alberi nella foresta'    },
                      { label: 'max_samples',   value: '256',  desc: 'Campioni per albero'      },
                      { label: 'contamination', value: '0.05', desc: 'Frazione anomalie attesa' },
                    ].map(p => (
                      <div key={p.label} style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px', padding: '12px',
                      }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{p.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{p.value}</div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>{p.desc}</div>
                      </div>
                    ))}
                  </div>
                  {/* Severity scale */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { s: 'NONE',     col: 'rgba(255,255,255,0.2)', score: '< 0.65'    },
                      { s: 'LOW',      col: '#3b82f6',               score: '0.65–0.72' },
                      { s: 'MEDIUM',   col: '#f59e0b',               score: '0.72–0.82' },
                      { s: 'HIGH',     col: '#f97316',               score: '0.82–0.92' },
                      { s: 'CRITICAL', col: '#ef4444',               score: '> 0.92'    },
                    ].map(({ s, col, score }) => (
                      <div key={s} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: col, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: col, letterSpacing: '0.08em' }}>{s}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>{score}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent anomalies list */}
                <div style={S.panel}>
                  <span style={S.label}>Anomalie Rilevate — {aiStats?.recentAnomalies.length ?? 0}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto' }}>
                    {!aiStats?.recentAnomalies.length && (
                      <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                        Nessuna anomalia rilevata ancora
                      </div>
                    )}
                    {aiStats?.recentAnomalies.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div style={{
                          width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                          background: SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.none,
                        }} />
                        <span style={{ flex: 1, fontSize: '10px', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.zone}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>[{a.type}]</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#ef4444', flexShrink: 0 }}>{a.score.toFixed(3)}</span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.08em',
                          padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
                          background: `${SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.none}15`,
                          color: SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.none,
                        }}>
                          {a.severity.toUpperCase()}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>{fmt(a.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scatter */}
                {anomalyData.length > 0 && (
                  <div style={S.panel}>
                    <span style={S.label}>Score Distribution — Scatter</span>
                    <ResponsiveContainer width="100%" height={130}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="idx" stroke="rgba(255,255,255,0.1)" fontSize={8} name="Index" />
                        <YAxis dataKey="score" stroke="rgba(255,255,255,0.1)" fontSize={8} domain={[0, 1]} name="Score" />
                        <ZAxis range={[25, 50]} />
                        <Tooltip content={<ChartTooltip />} />
                        <Scatter data={anomalyData} fill="#ef4444" fillOpacity={0.55} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* ══ PREDICTION ════════════════════════════════════════════ */}
            {tab === 'prediction' && (
              <>
                {/* RF info */}
                <div style={S.panel}>
                  <span style={S.label}>Random Forest Regressor — Architettura</span>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: '14px' }}>
                    Predice il traffico con <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>50 decision trees</span> (bagging)
                    su <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>9 feature temporali</span>: encoding sin/cos ora, giorno normalizzato, 3 lag features, rolling mean/std e trend.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                      { label: 'n_estimators', value: '50', desc: 'Alberi nel forest' },
                      { label: 'max_depth',    value: '5',  desc: 'Profondità max'    },
                      { label: 'Features',     value: '9',  desc: 'Input al modello'  },
                    ].map(p => (
                      <div key={p.label} style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px', padding: '12px',
                      }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{p.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: '#10b981', lineHeight: 1 }}>{p.value}</div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>{p.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {['hour_sin','hour_cos','day_norm','lag1','lag2','lag3','rolling_mean','rolling_std','trend'].map(f => (
                      <span key={f} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '9px',
                        padding: '3px 9px', borderRadius: '999px',
                        background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)',
                        color: '#10b981',
                      }}>{f}</span>
                    ))}
                  </div>
                </div>

                {/* Zone selector */}
                {simData && (
                  <div style={S.panel}>
                    <span style={S.label}>Esegui Predizione — Seleziona Zona</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                      {simData.zones.map(zone => {
                        const active = selectedZone?.name === zone.name;
                        return (
                          <button
                            key={zone.name}
                            onClick={() => runPrediction(zone)}
                            style={{
                              textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                              background: active ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${active ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ fontSize: '11px', fontWeight: 500, color: active ? '#10b981' : 'rgba(255,255,255,0.55)', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {zone.name}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>
                              Traffic: {zone.traffic}%
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Prediction result */}
                    <AnimatePresence>
                      {predResult && selectedZone && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{
                            background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)',
                            borderRadius: '12px', padding: '16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                            <CheckCircle size={13} color="#10b981" strokeWidth={1.5} style={{ marginRight: '8px' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{selectedZone.name}</span>
                            <span style={{
                              marginLeft: 'auto', fontSize: '9px', fontFamily: 'var(--font-mono)',
                              padding: '2px 8px', borderRadius: '999px',
                              background: predResult.trend === 'increasing' ? 'rgba(239,68,68,0.1)' : predResult.trend === 'decreasing' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${predResult.trend === 'increasing' ? 'rgba(239,68,68,0.2)' : predResult.trend === 'decreasing' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
                              color: predResult.trend === 'increasing' ? '#ef4444' : predResult.trend === 'decreasing' ? '#10b981' : 'rgba(255,255,255,0.3)',
                            }}>
                              {predResult.trend === 'increasing' ? '↑ Aumento' : predResult.trend === 'decreasing' ? '↓ Calo' : '→ Stabile'}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                            {[
                              { label: 'Predetto',    value: predResult.predicted.toString(), color: '#10b981', sub: 'veh/h equiv.' },
                              { label: 'CI 95%',      value: `[${predResult.lower}–${predResult.upper}]`, color: '#3b82f6', sub: 'Intervallo confidenza' },
                              { label: 'P(Peak Hour)', value: `${Math.round(predResult.peakProb * 100)}%`, color: predResult.peakProb > 0.6 ? '#f97316' : 'rgba(255,255,255,0.4)', sub: 'Ora di punta' },
                            ].map(k => (
                              <div key={k.label} style={{
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '10px', padding: '12px',
                              }}>
                                <div style={{ ...S.label, marginBottom: '4px' }}>{k.label}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: k.color, lineHeight: 1, marginBottom: '3px' }}>{k.value}</div>
                                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>{k.sub}</div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Prediction history chart */}
                {predData.length > 0 && (
                  <div style={S.panel}>
                    <span style={S.label}>Storico — Predetto vs Attuale</span>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={predData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="idx" stroke="rgba(255,255,255,0.1)" fontSize={8} />
                        <YAxis stroke="rgba(255,255,255,0.1)" fontSize={8} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={1.2} dot={false} name="Predetto" />
                        <Line type="monotone" dataKey="actual" stroke="rgba(255,255,255,0.2)" strokeWidth={1} dot={false} name="Attuale" strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {/* ══ gRPC ══════════════════════════════════════════════════ */}
            {tab === 'grpc' && (
              <>
                {/* Summary */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.65)' }}>{grpcCalls.length}</span> chiamate totali —
                    Endpoint: <span style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>ai-service:50052</span>
                  </span>
                  <button
                    onClick={() => { grpcCallRegistry.clear(); setGrpcCalls([]); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '7px', padding: '4px 10px', cursor: 'pointer',
                      fontSize: '10px', color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <Trash2 size={10} strokeWidth={1.5} />
                    Svuota
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '4px' }}>
                  {[
                    { label: 'DetectAnomaly',  count: grpcCalls.filter(c => c.method === 'DetectAnomaly').length,  color: '#ef4444' },
                    { label: 'PredictTraffic', count: grpcCalls.filter(c => c.method === 'PredictTraffic').length, color: '#10b981' },
                    { label: 'Errori',         count: grpcCalls.filter(c => c.status !== 'OK').length,             color: 'rgba(255,255,255,0.3)' },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px', padding: '12px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.2)', marginBottom: '4px' }}>{s.label}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.count}</div>
                    </div>
                  ))}
                </div>
                <div>
                  {grpcCalls.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                      Le chiamate gRPC appariranno automaticamente con la simulazione attiva
                    </div>
                  )}
                  {grpcCalls.slice(0, 60).map(c => <GrpcRow key={c.id} call={c} />)}
                </div>
              </>
            )}

            {/* ══ LOGS ══════════════════════════════════════════════════ */}
            {tab === 'logs' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {(['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR'] as const).map(level => {
                    const active = logFilter === level;
                    const colors: Record<string, string> = { DEBUG: 'rgba(255,255,255,0.3)', INFO: '#3b82f6', WARNING: '#f59e0b', ERROR: '#ef4444', ALL: 'rgba(255,255,255,0.5)' };
                    return (
                      <button
                        key={level}
                        onClick={() => setLogFilter(level)}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                          padding: '4px 12px', borderRadius: '6px', cursor: 'pointer',
                          background: active ? `${colors[level]}14` : 'transparent',
                          border: `1px solid ${active ? `${colors[level]}30` : 'rgba(255,255,255,0.05)'}`,
                          color: active ? colors[level] : 'rgba(255,255,255,0.2)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {level}
                      </button>
                    );
                  })}
                  <span style={{ marginLeft: 'auto', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.15)' }}>
                    {filteredLogs.length} entries
                  </span>
                  <button
                    onClick={() => { aiLogger.clear(); setLogs([]); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '7px', padding: '4px 10px', cursor: 'pointer',
                      fontSize: '10px', color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <Trash2 size={10} strokeWidth={1.5} />
                    Svuota
                  </button>
                </div>

                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '2px',
                  maxHeight: '520px', overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {filteredLogs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>Nessun log</div>
                  )}
                  {filteredLogs.map(log => {
                    const levelColors: Record<AILogEntry['level'], string> = {
                      DEBUG: 'rgba(255,255,255,0.2)',
                      INFO: '#3b82f6',
                      WARNING: '#f59e0b',
                      ERROR: '#ef4444',
                    };
                    return (
                      <div key={log.id} style={{
                        display: 'flex', alignItems: 'baseline', gap: '10px',
                        padding: '5px 10px', borderRadius: '6px',
                        background: log.level === 'ERROR' ? 'rgba(239,68,68,0.05)' :
                                    log.level === 'WARNING' ? 'rgba(245,158,11,0.04)' :
                                    'rgba(255,255,255,0.01)',
                      }}>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.12)', flexShrink: 0, width: '60px' }}>{fmt(log.timestamp)}</span>
                        <span style={{ fontSize: '9px', fontWeight: 600, width: '56px', flexShrink: 0, color: levelColors[log.level] }}>[{log.level}]</span>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', width: '110px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.module}</span>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', flex: 1 }}>{log.message}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </>
            )}

            {/* ══ CODE ══════════════════════════════════════════════════ */}
            {tab === 'code' && (
              <div style={{ height: '660px' }}>
                <CodeViewer />
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Live indicator bottom bar */}
      <div style={{
        flexShrink: 0, padding: '8px 22px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Clock size={10} color="rgba(255,255,255,0.15)" strokeWidth={1.5} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.15)' }}>
          {grpcCalls.length > 0 ? `Ultimo aggiornamento: ${fmt(grpcCalls[0]?.timestamp ?? Date.now())}` : 'In attesa di dati...'}
        </span>
        {isInit && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(16,185,129,0.5)', letterSpacing: '0.1em' }}>AI ACTIVE</span>
          </div>
        )}
      </div>
    </div>
  );
}
