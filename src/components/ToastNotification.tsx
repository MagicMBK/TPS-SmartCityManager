import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, AlertCircle, Info, Shield } from 'lucide-react';
import type { Alert } from '../data/sensorSimulator';

interface Props {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onIntervene?: (alert: Alert) => void;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', label: 'Critical', Icon: AlertCircle },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.22)', label: 'High',     Icon: AlertTriangle },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.20)', label: 'Medium',   Icon: AlertTriangle },
  low:      { color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.08)', label: 'Low', Icon: Info },
};

function Toast({ alert, onDismiss, onIntervene }: { alert: Alert; onDismiss: () => void; onIntervene?: () => void }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;

  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      layout
      initial={{ x: 120, opacity: 0, scale: 0.92 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 120, opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="toast-item"
    >
      {/* Severity stripe top */}
      <div style={{ height: '2px', background: cfg.color, opacity: 0.7 }} />

      <div style={{
        padding: '12px 14px',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
        background: cfg.bg,
      }}>
        {/* Icon */}
        <span style={{ color: cfg.color, flexShrink: 0, marginTop: '1px' }}>
          <cfg.Icon size={13} strokeWidth={1.5} />
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span className="mono" style={{ fontSize: '9px', fontWeight: 600, color: cfg.color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)' }}>
              {alert.zone}
            </span>
          </div>
          <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.45', wordBreak: 'break-word', margin: 0 }}>
            {alert.message}
          </p>

          {/* Intervene button */}
          {onIntervene && (
            <button
              onClick={(e) => { e.stopPropagation(); onIntervene(); }}
              style={{
                marginTop: '8px',
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', borderRadius: '7px', cursor: 'pointer',
                background: `${cfg.color}12`, border: `1px solid ${cfg.color}30`,
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                color: cfg.color, fontWeight: 600, textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}22`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${cfg.color}12`; }}
            >
              <Shield size={10} strokeWidth={1.5} />
              Intervieni
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          style={{
            flexShrink: 0, width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '4px',
            color: 'rgba(255,255,255,0.2)', transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
        >
          <X size={11} strokeWidth={2} />
        </button>
      </div>
    </motion.div>
  );
}

export default function ToastContainer({ alerts, onAcknowledge, onIntervene }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter(a => !dismissed.has(a.id)).slice(0, 3);

  const dismiss = (id: string) => {
    onAcknowledge(id);
    setDismissed(p => new Set([...p, id]));
  };

  return (
    <div className="toast-wrap">
      <AnimatePresence mode="popLayout">
        {visible.map(a => (
          <Toast
            key={a.id}
            alert={a}
            onDismiss={() => dismiss(a.id)}
            onIntervene={onIntervene ? () => { onIntervene(a); dismiss(a.id); } : undefined}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
