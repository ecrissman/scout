import { useState, useEffect, useMemo, useRef } from 'react';
import { composeBrief, getContext } from '../api';

// Mood / constraint lists carried forward from the silo prototype. The brand
// guide mockup shows "Quiet" and "Shoot through something" as representative
// picks, so those stay in the list. Keep moods short enough to render in a
// single iOS row without truncation.
const MOODS = ['Restless', 'Quiet', 'Curious', 'Heavy', 'Playful', 'Open', 'Tender', 'Sharp'];
const TIMES = ['5 min', '20 min', '1 hour'];
const CONSTRAINTS = [
  'Look up',
  'One color only',
  'No people',
  'Shoot through something',
  'Find an edge',
  'Lowest angle you can',
  "Only what's within arm's reach",
  'Negative space',
  'A single shape, repeated',
  'Where light ends',
  'Between two things',
  'Soft against hard',
];

// Chevron and check glyphs as inline SVG — no icon library dependency.
const ChevRight = ({ color = 'currentColor' }) => (
  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
    <path d="M1 1L6 6L1 11" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Check = ({ color = 'currentColor' }) => (
  <svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden="true">
    <path d="M1 5.5L5 9.5L13 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Format the clock portion of the Compose dateline — "8:17" or "14:47".
const formatClock = (d) => {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
};

// Format the dispatch datestamp for the brief header — "04.18.26".
const formatDispatchDate = (d) => {
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const yy = (d.getFullYear() % 100).toString().padStart(2, '0');
  return `${m}.${day}.${yy}`;
};

// How far the tray must be dragged down (px) before a release dismisses it.
// ~120px is a comfortable threshold — short enough to feel responsive, long
// enough that accidental brush-gestures don't close the screen.
const DISMISS_THRESHOLD = 120;

export default function ComposeScreen() {
  const now = useMemo(() => new Date(), []);
  const clock = useMemo(() => formatClock(now), [now]);

  const [mood, setMood] = useState(null);
  const [timeIdx, setTimeIdx] = useState(1); // default "20 min"
  const [constraintIdx, setConstraintIdx] = useState(() =>
    Math.floor(Math.random() * CONSTRAINTS.length)
  );
  const [coords, setCoords] = useState(null);
  const [autoLight, setAutoLight] = useState(null);
  const [autoPlace, setAutoPlace] = useState(null);
  const [moodSheetOpen, setMoodSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);

  // Drag-to-dismiss state. Refs avoid re-binding window listeners on every
  // move frame; state drives the translateY render.
  const [dragY, setDragY] = useState(0);
  const dragState = useRef({ active: false, startY: 0 });

  // Dismisses the tray. In silo mode (?compose=1) this drops the flag and
  // returns to the root app. Phase 6 will wire this to the Today state machine.
  const dismiss = () => { window.location.href = '/'; };

  const onDragStart = (e) => {
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { active: true, startY: y };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current.active) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = Math.max(0, y - dragState.current.startY);
      setDragY(delta);
    };
    const onEnd = () => {
      if (!dragState.current.active) return;
      dragState.current.active = false;
      setDragY((prev) => {
        if (prev > DISMISS_THRESHOLD) { dismiss(); return prev; }
        return 0;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const trayStyle = dragY
    ? { transform: `translateY(${dragY}px)`, transition: 'none' }
    : undefined;
  const trayClass = dragState.current.active ? 's2-tray is-dragging' : 's2-tray';

  const time = TIMES[timeIdx];
  const constraint = CONSTRAINTS[constraintIdx % CONSTRAINTS.length];

  // Request geolocation once on mount; silent fallback if denied/unavailable.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 600000 }
    );
  }, []);

  // Once coords land, pull autoLight + autoPlace for the header dateline.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    getContext(coords).then((ctx) => {
      if (cancelled || !ctx) return;
      setAutoLight(ctx.autoLight || null);
      setAutoPlace(ctx.autoPlace || null);
    });
    return () => { cancelled = true; };
  }, [coords]);

  const rerollConstraint = () =>
    setConstraintIdx((i) => (i + 1 + Math.floor(Math.random() * (CONSTRAINTS.length - 1))) % CONSTRAINTS.length);

  const canCompose = mood !== null && !loading;

  const compose = async () => {
    if (!canCompose) return;
    setLoading(true);
    setError(null);
    const res = await composeBrief({
      mood,
      time,
      constraint,
      lat: coords?.lat,
      lon: coords?.lon,
    });
    setLoading(false);
    if (!res || res.error) {
      setError(res?.error || 'Could not compose brief. Check connection and retry.');
      return;
    }
    setBrief(res.brief);
    if (res.autoLight) setAutoLight(res.autoLight);
    if (res.autoPlace) setAutoPlace(res.autoPlace);
  };

  const recompose = () => {
    setBrief(null);
    setError(null);
  };

  // Header dateline: "Overcast · Capitol Hill · 8:17" (filtered for nulls).
  const headerBits = [autoLight, autoPlace, clock].filter(Boolean).join(' · ');

  // ───────────── Brief reveal (minimal preview — Phase 3 builds the full screen) ─────────────
  if (brief) {
    return (
      <div className={trayClass} style={{ ...trayStyle, background: 'var(--s2-paper)' }}>
        <div className="s2-tray-handle-area" onMouseDown={onDragStart} onTouchStart={onDragStart}>
          <div className="s2-sheet-handle" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '14px 28px 28px' }}>
          <div style={{ marginBottom: 12 }}>
            <span className="s2-stamp-dispatch">New Assignment</span>
          </div>
          <div className="s2-mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--s2-text-muted)', textTransform: 'uppercase', marginBottom: 40 }}>
            Dispatch · {formatDispatchDate(now)} · {clock}
          </div>
          <div className="s2-serif" style={{ fontSize: 28, color: 'var(--s2-text-primary)', lineHeight: 1.25, marginBottom: 'auto' }}>
            {brief}
          </div>
          <div className="s2-mono" style={{ fontSize: 10, color: 'var(--s2-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 24, marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{mood}</span>
            <span style={{ color: 'var(--s2-bone)' }}>·</span>
            <span>{time}</span>
            <span style={{ color: 'var(--s2-bone)' }}>·</span>
            <span>{constraint}</span>
          </div>
          <button className="s2-btn-primary" disabled title="File a Take arrives in Phase 4">
            Accept Assignment
          </button>
          <button className="s2-btn-secondary" onClick={recompose} style={{ marginTop: 8, width: '100%' }}>
            Recompose
          </button>
        </div>
      </div>
    );
  }

  // ───────────── Compose form ─────────────
  return (
    <div className={trayClass} style={trayStyle}>
      <div className="s2-tray-handle-area" onMouseDown={onDragStart} onTouchStart={onDragStart}>
        <div className="s2-sheet-handle" />
      </div>

      <div className="s2-title-block">
        <h1 className="s2-title">Today</h1>
        {headerBits && <div className="s2-dateline" style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>{headerBits}</div>}
      </div>

      <div className="s2-section-label">MOOD</div>
      <div className="s2-list">
        <div className="s2-list-row" onClick={() => setMoodSheetOpen(true)} role="button" tabIndex={0}>
          <div className="s2-list-row-label" style={{ color: mood ? 'var(--s2-text-primary)' : 'var(--s2-text-muted)' }}>
            {mood || 'Choose a mood…'}
          </div>
          <ChevRight color="var(--s2-text-muted)" />
        </div>
      </div>

      <div className="s2-section-label">TIME</div>
      <div className="s2-segmented">
        {TIMES.map((t, i) => (
          <button
            key={t}
            className={`s2-segmented-option ${timeIdx === i ? 'active' : ''}`}
            onClick={() => setTimeIdx(i)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="s2-section-label">CONSTRAINT</div>
      <div className="s2-list">
        <div className="s2-list-row" onClick={rerollConstraint} role="button" tabIndex={0}>
          <div className="s2-list-row-label">{constraint}</div>
          <div className="s2-list-row-trail">↻ New</div>
        </div>
      </div>

      {error && (
        <div className="s2-mono" style={{ color: 'var(--s2-warn)', padding: '14px 20px', fontSize: 12, letterSpacing: '0.05em' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 'auto', padding: '16px 16px 26px' }}>
        <button className="s2-btn-primary" disabled={!canCompose} onClick={compose}>
          {loading ? (<><span className="s2-spinner" />Composing…</>) : 'Compose'}
        </button>
      </div>

      {moodSheetOpen && (
        <MoodSheet
          selected={mood}
          onSelect={(m) => { setMood(m); setMoodSheetOpen(false); }}
          onClose={() => setMoodSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ───────────── Mood picker sheet (iOS-style bottom sheet) ─────────────
function MoodSheet({ selected, onSelect, onClose }) {
  // Close on Escape for keyboard/desktop parity with the tap-backdrop gesture.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="s2-sheet-backdrop" onClick={onClose}>
      <div className="s2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="s2-sheet-handle" />
        <div className="s2-sheet-header">
          <span className="s2-mono" style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--s2-text-muted)' }}>
            Mood
          </span>
          <button className="s2-nav-btn" onClick={onClose}>Cancel</button>
        </div>
        <div className="s2-sheet-list">
          {MOODS.map((m) => (
            <button
              key={m}
              className="s2-list-row s2-sheet-row"
              onClick={() => onSelect(m)}
              style={{ justifyContent: 'space-between' }}
            >
              <span className="s2-list-row-label">{m}</span>
              {selected === m && <Check color="var(--s2-press-green)" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
