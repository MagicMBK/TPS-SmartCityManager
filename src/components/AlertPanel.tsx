import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, AlertTriangle, Info, CheckCircle, Shield } from 'lucide-react';
import type { Alert } from '../data/sensorSimulator';

interface Props {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onIntervene?: (alert: Alert) => void;
  onClose: () => void;
}

const SEV_CFG = {
  critical: { color: '#ef4444', label: 'Critical', Icon: AlertCircle,   cls: 'alert-severity-critical' },
  high:     { color: '#f97316', label: 'High',     Icon: AlertTriangle,  cls: 'alert-severity-high'     },
  medium:   { color: '#f59e0b', label: 'Medium',   Icon: AlertTriangle,  cls: 'alert-severity-medium'   },
  low:      { color: 'rgba(255,255,255,0.3)', label: 'Low', Icon: Info,  cls: 'alert-severity-low'      },
};

function cleanMessage(msg: string) {
  return msg.replace(/^[^\w\s]+/, '').trim();
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function AlertPanel({ alerts, onAcknowledge, onIntervene, onClose }: Props) {
  const unacked = alerts.filter(a => !a.acknowledged);
  const acked   = alerts.filter(a =>  a.acknowledged);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '330px',
        background: 'rgba(4,4,4,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        backdropFilter: 'blur(24px)',
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Alert Center</span>
            {unacked.length > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff', borderRadius: '999px',
                fontSize: '9px', fontWeight: 700, padding: '1px 6px', fontFamily: 'monospace',
              }}>
                {unacked.length}
              </span>
            )}
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
            {alerts.length} total — {acked.length} acknowledged
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Alerts list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {alerts.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '10px' }}>
            <CheckCircle size={28} color="rgba(16,185,129,0.35)" strokeWidth={1.2} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>No active alerts</span>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {alerts.map(alert => {
            const cfg = SEV_CFG[alert.severity as keyof typeof SEV_CFG] || SEV_CFG.low;
            const isAcked = alert.acknowledged;

            return (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: isAcked ? 0.35 : 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className={cfg.cls}
                style={{
                  borderRadius: '10px', marginBottom: '6px',
                  padding: '11px 13px',
                  cursor: 'default',
                  border: `1px solid ${isAcked ? 'rgba(255,255,255,0.04)' : `${cfg.color}22`}`,
                  background: isAcked ? 'rgba(255,255,255,0.01)' : `${cfg.color}07`,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: isAcked ? 'rgba(255,255,255,0.2)' : cfg.color, flexShrink: 0, marginTop: '1px' }}>
                    <cfg.Icon size={13} strokeWidth={1.5} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600, color: isAcked ? 'rgba(255,255,255,0.2)' : cfg.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)' }}>
                        {timeAgo(alert.timestamp)}
                      </span>
                    </div>

                    <p style={{ fontSize: '11px', color: isAcked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)', lineHeight: '1.45', marginBottom: '6px' }}>
                      {cleanMessage(alert.message)}
                    </p>

                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)', marginBottom: isAcked ? 0 : '8px' }}>
                      {alert.zone} · {alert.type}
                    </div>

                    {/* Action buttons — only show if not acknowledged */}
                    {!isAcked && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {/* Intervieni — opens crisis game */}
                        {onIntervene && (
                          <button
                            onClick={() => onIntervene(alert)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '5px',
                              padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                              background: `${cfg.color}14`, border: `1px solid ${cfg.color}32`,
                              fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                              color: cfg.color, fontWeight: 600, textTransform: 'uppercase',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}24`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${cfg.color}14`; }}
                          >
                            <Shield size={10} strokeWidth={1.5} />
                            Intervieni
                          </button>
                        )}

                        {/* ACK — acknowledge without game */}
                        <button
                          onClick={() => onAcknowledge(alert.id)}
                          style={{
                            padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.08em',
                            color: 'rgba(255,255,255,0.35)', fontWeight: 600,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        >
                          ACK
                        </button>
                      </div>
                    )}

                    {/* Acknowledged badge */}
                    {isAcked && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                        <CheckCircle size={10} color="rgba(16,185,129,0.4)" strokeWidth={1.5} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(16,185,129,0.4)', letterSpacing: '0.08em' }}>
                          ACKNOWLEDGED
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.18)' }}>
          {acked.length} acknowledged · {unacked.length} pending
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['critical', 'high', 'medium'] as const).map(sev => {
            const count = alerts.filter(a => a.severity === sev && !a.acknowledged).length;
            if (!count) return null;
            const cfg = SEV_CFG[sev];
            return (
              <span key={sev} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px', padding: '2px 7px', borderRadius: '999px',
                background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
                fontWeight: 600,
              }}>
                {count}
              </span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
