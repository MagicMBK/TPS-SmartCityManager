import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, BarChart2, Cpu, GitBranch,
  Radio, AlertTriangle, Database,
} from 'lucide-react';

type ViewTab = 'twin' | 'dashboard' | 'ai' | 'architecture' | 'timescale';

interface Props {
  activeTab: ViewTab;
  onChange: (tab: ViewTab) => void;
  alertCount: number;
  isLive: boolean;
  onToggleLive: () => void;
}

const NAV: { id: ViewTab; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: 'twin',         label: 'Digital Twin',  sub: '3D City View',      icon: <Globe      size={16} strokeWidth={1.4} /> },
  { id: 'dashboard',   label: 'Analytics',      sub: 'Real-time Data',    icon: <BarChart2  size={16} strokeWidth={1.4} /> },
  { id: 'ai',          label: 'AI Engine',      sub: 'ML Models',         icon: <Cpu        size={16} strokeWidth={1.4} /> },
  { id: 'architecture',label: 'Architecture',   sub: 'System Design',     icon: <GitBranch  size={16} strokeWidth={1.4} /> },
  { id: 'timescale',   label: 'Supabase DB',    sub: 'PostgreSQL Reale',  icon: <Database   size={16} strokeWidth={1.4} /> },
];

export default function Sidebar({ activeTab, onChange, alertCount, isLive, onToggleLive }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.aside
      className="sidebar"
      animate={{ width: expanded ? 210 : 60 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{ overflow: 'hidden', flexShrink: 0 }}
    >
      {/* Logo */}
      <div style={{
        height: '52px', display: 'flex', alignItems: 'center',
        padding: '0 18px', gap: '12px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <div style={{
          width: '24px', height: '24px', flexShrink: 0, borderRadius: '7px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 20 20" fill="none" style={{ width: '12px', height: '12px' }}>
            <rect x="3" y="10" width="3" height="7" rx="0.5" fill="rgba(255,255,255,0.25)" />
            <rect x="8.5" y="6" width="3" height="11" rx="0.5" fill="rgba(255,255,255,0.4)" />
            <rect x="14" y="2" width="3" height="15" rx="0.5" fill="rgba(59,130,246,0.85)" />
          </svg>
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              <div className="mono" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>PuntoSnai</div>
              <div className="mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em' }}>Smart City OS</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span style={{
              color: activeTab === item.id ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.28)',
              flexShrink: 0, display: 'flex',
            }}>
              {item.icon}
            </span>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 500, color: activeTab === item.id ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{item.sub}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: '6px 6px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '4px' }}>

        {/* Alert indicator */}
        {alertCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '9px 18px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.07)',
            border: '1px solid rgba(239,68,68,0.15)',
            cursor: 'default',
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <AlertTriangle size={15} color="rgba(239,68,68,0.8)" strokeWidth={1.5} />
              <span style={{
                position: 'absolute', top: '-5px', right: '-6px',
                background: '#ef4444', color: '#fff', borderRadius: '999px',
                fontSize: '8px', fontWeight: 700, padding: '0 4px', minWidth: '14px',
                height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'monospace',
              }}>{alertCount > 9 ? '9+' : alertCount}</span>
            </div>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <div style={{ fontSize: '11px', color: 'rgba(239,68,68,0.8)', fontWeight: 500 }}>
                    {alertCount} Alert{alertCount > 1 ? 's' : ''}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Live toggle */}
        <button
          onClick={onToggleLive}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '9px 18px', borderRadius: '10px', cursor: 'pointer',
            background: isLive ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${isLive ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.06)'}`,
            transition: 'all 0.18s',
          }}
        >
          {isLive
            ? <div className="dot-live" style={{ flexShrink: 0 }} />
            : <Radio size={15} color="rgba(255,255,255,0.2)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
          }
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ whiteSpace: 'nowrap' }}
              >
                <div className="mono" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: isLive ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.2)' }}>
                  {isLive ? 'Live' : 'Paused'}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
