import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { onEnter: () => void; }

const BOOT_LINES = [
  { text: 'Inizializzazione broker MQTT — 9 zone urbane', delay: 400 },
  { text: 'Handshake microservizi gRPC', delay: 750 },
  { text: 'IsolationForest anomaly engine caricato', delay: 1100 },
  { text: 'Connessione TimescaleDB stabilita', delay: 1400 },
  { text: 'Digital Twin renderer online', delay: 1700 },
  { text: '36 sensori attivi — tutti i sistemi nominali', delay: 2000 },
];

const STATS = [
  { value: '36',    label: 'Sensori' },
  { value: '9',     label: 'Zone Urbane' },
  { value: '<2ms',  label: 'Latenza' },
  { value: '99.7%', label: 'Uptime' },
];

export default function LandingPage({ onEnter }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const [bootLines, setBootLines] = useState<number[]>([]);
  const [ready, setReady]         = useState(false);
  const [hovering, setHovering]   = useState(false);

  /* ── Particle field ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const pts: P[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.0 + 0.3,
      a: Math.random() * 0.15 + 0.04,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 100) * 0.03})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', onResize); };
  }, []);

  /* ── Boot sequence ── */
  useEffect(() => {
    BOOT_LINES.forEach((line, i) => {
      setTimeout(() => {
        setBootLines(p => [...p, i]);
        if (i === BOOT_LINES.length - 1) setTimeout(() => setReady(true), 300);
      }, line.delay);
    });
  }, []);

  return (
    <div className="landing-root">
      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Subtle grid */}
      <div className="landing-grid" />

      {/* Central glow — very subtle */}
      <div className="landing-glow" />

      {/* ── Top bar ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 20 20" fill="none" style={{ width: '13px', height: '13px' }}>
              <rect x="3" y="10" width="3" height="7" rx="0.5" fill="rgba(255,255,255,0.2)" />
              <rect x="8.5" y="6" width="3" height="11" rx="0.5" fill="rgba(255,255,255,0.4)" />
              <rect x="14" y="2" width="3" height="15" rx="0.5" fill="rgba(59,130,246,0.85)" />
            </svg>
          </div>
          <span className="mono" style={{ fontSize: '11px', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            PuntoSnai
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div className="dot-live" />
          <span className="mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em' }}>
            SYSTEM ONLINE
          </span>
        </div>
      </motion.div>

      {/* ── Hero content — centered, no overlap ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        gap: 0,
        /* Push content up slightly so terminal fits below without overlapping */
        marginTop: '-60px',
      }}>

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mono"
          style={{ fontSize: '10px', letterSpacing: '0.32em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: '24px' }}
        >
          Smart City Intelligence Platform
        </motion.p>

        {/* Main title */}
        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: 'clamp(58px, 11vw, 120px)',
            fontWeight: 900,
            letterSpacing: '-0.05em',
            lineHeight: 0.9,
            color: 'rgba(255,255,255,0.93)',
            marginBottom: '20px',
          }}
        >
          PUNTOSNAI
        </motion.h1>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.68 }}
          style={{
            width: '40px', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.55), transparent)',
            marginBottom: '18px',
          }}
        />

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.82 }}
          style={{ fontSize: '12px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '44px' }}
        >
          Digital Twin Command Center
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.96 }}
          style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '42px' }}
        >
          {STATS.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.07)', margin: '0 24px' }} />}
              <div style={{ textAlign: 'center' }}>
                <div className="mono" style={{ fontSize: '20px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '5px' }}>
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.1 }}
        >
          <button
            className="enter-btn"
            onClick={onEnter}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', zIndex: 1 }}>
              <span>Entra nel Digital Twin</span>
              <motion.svg
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                style={{ width: '13px', height: '13px' }}
                animate={{ x: hovering ? 3 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </motion.svg>
            </span>
          </button>
        </motion.div>
      </div>

      {/* ── Boot terminal — compact, fixed at bottom, no overlap ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '420px',
          background: 'rgba(0,0,0,0.65)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          overflow: 'hidden',
          backdropFilter: 'blur(20px)',
          /* Hard max-height so it never grows into hero content */
          maxHeight: '160px',
        }}
      >
        {/* Terminal header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'rgba(239,68,68,0.4)' }} />
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'rgba(245,158,11,0.4)' }} />
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'rgba(16,185,129,0.4)' }} />
          <span className="mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginLeft: '5px', letterSpacing: '0.07em' }}>
            puntosnai — boot
          </span>
        </div>

        {/* Terminal lines — scrollable internally */}
        <div style={{ padding: '10px 14px', overflowY: 'auto', maxHeight: '112px' }}>
          <AnimatePresence>
            {BOOT_LINES.map((line, i) => bootLines.includes(i) && (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                style={{ marginBottom: '4px' }}
              >
                <span className="mono" style={{ fontSize: '10px' }}>
                  <span style={{ color: 'rgba(59,130,246,0.5)' }}>$ </span>
                  <span style={{ color: ready && i === BOOT_LINES.length - 1 ? 'rgba(16,185,129,0.75)' : 'rgba(255,255,255,0.35)' }}>
                    {line.text}
                  </span>
                  {ready && i === BOOT_LINES.length - 1 && (
                    <span style={{ color: 'rgba(16,185,129,0.55)', marginLeft: '8px' }}>[OK]</span>
                  )}
                  {i === bootLines.length - 1 && !ready && (
                    <span className="mono" style={{
                      display: 'inline-block', width: '6px', height: '12px',
                      background: 'rgba(59,130,246,0.55)', marginLeft: '3px',
                      verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite',
                    }} />
                  )}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
