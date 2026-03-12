import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from 'recharts';
import { Activity, Wind, Thermometer, Volume2, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import type { SimulatorUpdate, SensorType, ZoneData } from '../data/sensorSimulator';

interface Props {
  stats: SimulatorUpdate['stats'];
  zones: ZoneData[];
  history: SimulatorUpdate['history'];
  selectedMetric: SensorType;
}

type HistoryEntry = SimulatorUpdate['history'][number];

const METRIC_META: Record<SensorType, {
  label: string; unit: string; color: string;
  zoneKey: keyof ZoneData; icon: React.ReactNode; maxVal: number;
}> = {
  traffic:     { label: 'Traffic Flow',  unit: 'veh/h', color: '#f97316', zoneKey: 'traffic',     icon: <Activity size={14} strokeWidth={1.4} />, maxVal: 100 },
  air_quality: { label: 'Air Quality',   unit: 'AQI',   color: '#10b981', zoneKey: 'airQuality',  icon: <Wind size={14} strokeWidth={1.4} />,     maxVal: 150 },
  temperature: { label: 'Temperature',  unit: '°C',    color: '#ef4444', zoneKey: 'temperature', icon: <Thermometer size={14} strokeWidth={1.4} />, maxVal: 45 },
  noise:       { label: 'Noise Level',  unit: 'dB',    color: '#8b5cf6', zoneKey: 'noise',       icon: <Volume2 size={14} strokeWidth={1.4} />,  maxVal: 100 },
  energy:      { label: 'Energy Usage', unit: 'kWh',   color: '#3b82f6', zoneKey: 'energy',      icon: <Zap size={14} strokeWidth={1.4} />,      maxVal: 100 },
};

const HISTORY_KEY: Record<SensorType, keyof HistoryEntry> = {
  traffic:     'traffic',
  air_quality: 'airQuality',
  temperature: 'temperature',
  noise:       'noise',
  energy:      'energy',
};

const ChartTip = ({ active, payload }: { active?: boolean; payload?: { value: number; color: string }[] }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(6,6,6,0.98)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '8px 12px', backdropFilter: 'blur(16px)',
    }}>
      <div className="mono" style={{ fontSize: '13px', fontWeight: 600, color: payload[0].color }}>
        {typeof payload[0].value === 'number' ? payload[0].value.toFixed(1) : payload[0].value}
      </div>
    </div>
  );
};

function statusOf(zone: ZoneData): 'critical' | 'warning' | 'normal' {
  if (zone.alertCount > 3) return 'critical';
  if (zone.alertCount > 0) return 'warning';
  return 'normal';
}
const STATUS_COLOR = { critical: '#ef4444', warning: '#f59e0b', normal: '#10b981' };

function Fade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function Dashboard({ stats, zones, history, selectedMetric }: Props) {
  const meta    = METRIC_META[selectedMetric];
  const histKey = HISTORY_KEY[selectedMetric];

  const chartData = history.slice(-30).map((h, i) => ({
    t: i % 6 === 0 ? `${i * 2}s` : '',
    v: h[histKey] as number,
  }));

  const radarData = zones.slice(0, 7).map(z => ({
    zone: z.name.slice(0, 10),
    v: Math.round(z[meta.zoneKey] as number),
  }));

  const barData = zones.map(z => ({
    name: z.name.length > 14 ? z.name.slice(0, 13) + '…' : z.name,
    v: Math.round(z[meta.zoneKey] as number),
  }));

  const kpis = [
    { label: 'Active Sensors',  value: `${stats.activeSensors}/${stats.totalSensors}`, sub: 'online',       color: '#10b981', trend: 1 },
    { label: 'Traffic Flow',    value: `${stats.avgTraffic}%`,                         sub: 'city avg',     color: '#f97316', trend: 0 },
    { label: 'Air Quality',     value: `${stats.avgAirQuality}`,                       sub: 'AQI index',    color: '#10b981', trend: 1 },
    { label: 'Temperature',     value: `${stats.avgTemperature}°`,                     sub: 'avg celsius',  color: '#ef4444', trend: -1 },
    { label: 'Anomalies',       value: `${stats.anomaliesDetected}`,                   sub: 'detected',     color: '#f59e0b', trend: -1 },
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#000' }}>
      <div style={{ padding: '20px', maxWidth: '1440px' }}>

        {/* ── KPI Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '14px' }}>
          {kpis.map((k, idx) => (
            <Fade key={k.label} delay={idx * 0.06}>
              <div className="kpi-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 500 }}>
                    {k.label}
                  </span>
                  {k.trend > 0
                    ? <TrendingUp size={12} color={k.color} strokeWidth={1.5} />
                    : k.trend < 0
                      ? <TrendingDown size={12} color={k.color} strokeWidth={1.5} />
                      : null}
                </div>
                <div className="mono" style={{ fontSize: '26px', fontWeight: 700, color: k.color, letterSpacing: '-0.04em', lineHeight: 1 }}>
                  {k.value}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', marginTop: '7px' }}>{k.sub}</div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${k.color}60, transparent 60%)` }} />
              </div>
            </Fade>
          ))}
        </div>

        {/* ── Chart Row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <Fade delay={0.32}>
            <div className="glass-card" style={{ padding: '20px', height: '230px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', marginTop: '2px' }}>City average — {meta.unit}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="dot-live" />
                  <span className="mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em' }}>Real-time</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height="72%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
                  <defs>
                    <linearGradient id={`grad-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={meta.color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="v" stroke={meta.color} strokeWidth={1.2} fill={`url(#grad-${selectedMetric})`} dot={false} activeDot={{ r: 3, fill: meta.color, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Fade>

          <Fade delay={0.38}>
            <div className="glass-card" style={{ padding: '20px', height: '230px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.78)', marginBottom: '2px' }}>Zone Radar</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', marginBottom: '10px' }}>{meta.label} distribution</div>
              <ResponsiveContainer width="100%" height="82%">
                <RadarChart data={radarData} margin={{ top: 0, right: 14, bottom: 0, left: 14 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.05)" />
                  <PolarAngleAxis dataKey="zone" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.22)', fontFamily: 'monospace' }} />
                  <Radar dataKey="v" stroke={meta.color} fill={meta.color} fillOpacity={0.08} strokeWidth={1} />
                  <Tooltip content={<ChartTip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Fade>
        </div>

        {/* ── Bar Chart ── */}
        <Fade delay={0.44}>
          <div className="glass-card" style={{ padding: '20px', height: '200px', marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.78)', marginBottom: '2px' }}>Zone Comparison</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', marginBottom: '16px' }}>{meta.label} — {meta.unit}</div>
            <ResponsiveContainer width="100%" height="68%">
              <BarChart data={barData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="v" fill={meta.color} opacity={0.5} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Fade>

        {/* ── Zone Table ── */}
        <Fade delay={0.50}>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>All Zones</span>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{zones.length} zones monitored</span>
            </div>
            {zones.map((z, i) => {
              const val    = z[meta.zoneKey] as number;
              const pct    = Math.min(100, (val / meta.maxVal) * 100);
              const status = statusOf(z);
              return (
                <div
                  key={z.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '10px 18px',
                    borderBottom: i < zones.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.018)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                  <div style={{ width: '200px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{z.name}</div>
                  <div style={{ flex: 1, height: '2px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)' }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.9 }}
                      style={{ height: '100%', borderRadius: '2px', background: meta.color, opacity: 0.6 }}
                    />
                  </div>
                  <div className="mono" style={{ width: '80px', textAlign: 'right', fontSize: '12px', color: meta.color, fontWeight: 500 }}>
                    {val.toFixed(1)} <span style={{ fontSize: '10px', opacity: 0.6 }}>{meta.unit}</span>
                  </div>
                  <div className="mono" style={{ width: '55px', textAlign: 'right', fontSize: '9px', color: STATUS_COLOR[status], textTransform: 'capitalize', fontWeight: 600, letterSpacing: '0.06em' }}>
                    {status}
                  </div>
                </div>
              );
            })}
          </div>
        </Fade>

      </div>
    </div>
  );
}
