import { useState, useEffect, useMemo, useRef } from 'react';
import { composeBrief, getContext, uploadPhoto, getEditorNote } from '../api';
import { extractEXIF, compressFile, makeThumb } from '../exif';

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

// Day-of-year — the brief counter in the footer ("Brief 108 / 365"). Matches
// the handoff's framing of the photographer's practice as a 365-day run.
const dayOfYear = (d) => {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = (d - start) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / 86400000);
};

// How far the tray must be dragged down (px) before a release dismisses it.
// ~120px is a comfortable threshold — short enough to feel responsive, long
// enough that accidental brush-gestures don't close the screen.
const DISMISS_THRESHOLD = 120;

export default function ComposeScreen({ onClose, onFiled } = {}) {
  const now = useMemo(() => new Date(), []);
  const clock = useMemo(() => formatClock(now), [now]);
  const todayKey = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

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
  const [brief, setBrief] = useState(() => {
    // Dev-only: ?brief=<text> renders the Brief reveal directly for design
    // iteration without going through auth + the full compose round-trip.
    const p = new URLSearchParams(window.location.search);
    return p.get('brief') || null;
  });

  // File-a-take state machine. Advances Compose → Brief → Uploading →
  // Filed. Filed is terminal — the editor's note is persisted on the
  // photo via a background fetch and surfaced on the Today day detail.
  const [stage, setStage] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('brief')) return 'brief';
    return 'compose';
  });
  const [fileError, setFileError] = useState(null);
  const fileRef = useRef(null);

  // Typewriter reveal for the brief body. Renders chars 1-by-1 so the
  // brief lands like a developing photo, not a paste-in. Skips on initial
  // mount with ?brief= dev param so design iteration isn't slowed by the
  // animation. See useEffect below.
  const [briefShown, setBriefShown] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('brief') ? (p.get('brief') || '').length : 0;
  });

  // Drag-to-dismiss state. Refs avoid re-binding window listeners on every
  // move frame; state drives the translateY render.
  const [dragY, setDragY] = useState(0);
  const dragState = useRef({ active: false, startY: 0 });

  // Dismisses the tray. When embedded in the Today view, the parent passes
  // onClose to handle closing + refreshing dayMeta. When mounted via the
  // ?compose=1 silo there's no parent handler, so we fall back to routing
  // to the root app.
  const dismiss = () => {
    if (typeof onClose === 'function') onClose();
    else window.location.href = '/';
  };

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
  // Brand-moment stages (Brief, Filed, Uploading) paint on a paper/ink
  // surface via `s2-tray--paper`; Compose stays on the grouped-list bg so
  // list cards pop. The is-dragging class disables the slide transition
  // while a drag gesture is in flight.
  const paperStage = stage === 'brief' || stage === 'filed' || stage === 'uploading';
  const trayClass = [
    's2-tray',
    paperStage && 's2-tray--paper',
    dragState.current.active && 'is-dragging',
  ].filter(Boolean).join(' ');

  // Tray chrome: a single drag handle, nothing else. The handle signals
  // "this is a sheet" and is the only top-edge affordance — Cancel text
  // and bottom rule were removed per design feedback 2026-04-18. Dismiss
  // is still reachable via drag-to-close.
  const TrayChrome = () => (
    <div className="s2-tray-handle-area" onMouseDown={onDragStart} onTouchStart={onDragStart}>
      <div className="s2-sheet-handle" />
    </div>
  );

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
    setStage('brief');
    if (res.autoLight) setAutoLight(res.autoLight);
    if (res.autoPlace) setAutoPlace(res.autoPlace);
  };

  const recompose = () => {
    setBrief(null);
    setStage('compose');
    setError(null);
    setFileError(null);
  };

  // Read a selected image, compress + thumb + EXIF, then upload with the
  // full compose stack attached to meta. The backend's POST /api/photo/:date
  // was extended in Phase 1 to accept the compose field. iOS's native picker
  // sheet (no `capture` attr) handles whether the file came from camera or
  // library — Scout doesn't need to distinguish.
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setStage('uploading');
    setFileError(null);
    try {
      const exif = await extractEXIF(file);
      const fullSrc = await compressFile(file);
      const thumbSrc = await makeThumb(fullSrc);
      const composeStack = {
        mood,
        time,
        constraint,
        autoLight,
        autoPlace,
        brief,
        filedAt: new Date().toISOString(),
        via: 'picker',
      };
      const ok = await uploadPhoto(todayKey, { fullSrc, thumbSrc, exif, caption: '', compose: composeStack });
      if (!ok) throw new Error('Upload failed. Check connection and retry.');
      setStage('filed');
      if (typeof onFiled === 'function') {
        try { onFiled({ date: todayKey, compose: composeStack }); } catch {}
      }
    } catch (err) {
      setFileError(err?.message || 'Could not file your take. Try again.');
      setStage('brief');
    }
  };

  // Typewriter: when the Brief stage first opens, reveal `brief` one char
  // every ~24ms. Reset to 0 each time `brief` text changes (Recompose) so
  // the animation re-runs. Bypasses on `?brief=` dev URLs (initialised
  // pre-revealed in useState above).
  useEffect(() => {
    if (stage !== 'brief' || !brief) return;
    if (briefShown >= brief.length) return;
    const t = setTimeout(() => setBriefShown((n) => Math.min(brief.length, n + 1)), 24);
    return () => clearTimeout(t);
  }, [stage, brief, briefShown]);
  useEffect(() => {
    // New brief lands → restart the typewriter from 0.
    if (stage === 'brief' && brief) setBriefShown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief]);

  // Fire the editor's-note endpoint in the background once we hit 'filed'
  // so the note is persisted on the photo's meta. Don't navigate — Filed
  // is the terminal screen; the note is surfaced on the Today day detail
  // (as the Field Note block) when the user closes this tray.
  useEffect(() => {
    if (stage !== 'filed') return;
    getEditorNote(todayKey).catch(() => {});
  }, [stage, todayKey]);

  // Header dateline: "Overcast · Capitol Hill · 8:17" (filtered for nulls).
  const headerBits = [autoLight, autoPlace, clock].filter(Boolean).join(' · ');

  // Hidden file input — single picker. No `capture` attribute so iOS
  // surfaces its native sheet (Take Photo / Photo Library / Choose Files)
  // instead of jumping straight to the camera. cameraRef is kept around
  // as an alias for legacy call sites; both refs point at the same input.
  const fileInputs = (
    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
  );

  // ───────────── Filed (brand moment 02 — the stamp lands) ─────────────
  // Terminal screen in the Compose loop. Close returns the user to Today,
  // where the Editor's Note (fired in the background on entering 'filed')
  // shows up under the photo as the Field Note.
  if (stage === 'filed') {
    return (
      <div className={trayClass} style={trayStyle}>
        <TrayChrome />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px 28px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 80, marginBottom: 40 }}>
            <span className="s2-stamp-filed" style={{ fontSize: 14, padding: '10px 22px' }}>Filed</span>
          </div>
          <div className="s2-serif" style={{ fontSize: 24, color: 'var(--s2-text-primary)', lineHeight: 1.25, letterSpacing: '-0.015em', textAlign: 'center', marginBottom: 14 }}>
            Your take is in.
          </div>
          <div className="s2-sans" style={{ fontFamily: 'var(--s2-sans)', fontSize: 14, color: 'var(--s2-text-secondary)', lineHeight: 1.5, textAlign: 'center', maxWidth: 280, margin: '0 auto 16px' }}>
            Your editor will review it. We'll let you know when their note is ready.
          </div>
          <div className="s2-mono" style={{ fontSize: 10, color: 'var(--s2-text-muted)', letterSpacing: '0.22em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 'auto' }}>
            Archive {formatDispatchDate(now)} · {clock}
          </div>
          <button className="s2-btn-primary" onClick={dismiss}>
            Close
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Uploading (compressing + POSTing with compose stack) ─────────────
  if (stage === 'uploading') {
    return (
      <div className={trayClass} style={trayStyle}>
        <div className="s2-tray-handle-area">
          <div className="s2-sheet-handle" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px 28px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div className="s2-spinner" style={{ width: 24, height: 24, borderWidth: 2, color: 'var(--s2-press-green)', marginBottom: 20 }} />
          <div className="s2-mono" style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)' }}>
            Filing your take…
          </div>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── The Brief + File a Take (brand moment 01, anchor screen 2) ─────────────
  // One screen: New Assignment stamp · dispatch dateline · brief body (Fraunces) ·
  // Brief counter footer · Take photo (primary) + Choose from library (secondary) ·
  // Recompose in the tray header as a trailing action. Paper surface, nothing
  // competes with the brief itself.
  if (stage === 'brief' && brief) {
    const briefNumber = dayOfYear(now);
    const revealed = brief.slice(0, briefShown);
    const typing = briefShown < brief.length;
    return (
      <div className={trayClass} style={trayStyle}>
        <TrayChrome />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '28px 28px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="s2-stamp-dispatch">New Assignment</span>
            <button
              className="s2-icon-btn"
              onClick={recompose}
              aria-label="Recompose brief"
              title="Recompose"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2.5 8.5a6.5 6.5 0 0 1 11.4-4.3M15.5 9.5A6.5 6.5 0 0 1 4.1 13.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M14.2 1.5v3h-3M3.8 16.5v-3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="s2-mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--s2-text-muted)', textTransform: 'uppercase', marginBottom: 36 }}>
            Dispatch · {formatDispatchDate(now)} · {clock}
          </div>
          <div className="s2-serif" style={{ fontSize: 30, color: 'var(--s2-text-primary)', lineHeight: 1.22, letterSpacing: '-0.015em', marginBottom: 'auto' }}>
            {revealed}
            {typing && <span className="s2-typewriter-caret" aria-hidden="true">▍</span>}
          </div>
          <div className="s2-mono" style={{ fontSize: 10, color: 'var(--s2-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 28, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Brief {briefNumber} / 365</span>
            <span style={{ color: 'var(--s2-bone)' }}>·</span>
            <span>File by 23:59</span>
          </div>
          {fileError && (
            <div className="s2-mono" style={{ color: 'var(--s2-warn)', fontSize: 12, marginBottom: 10 }}>
              {fileError}
            </div>
          )}
          <button className="s2-btn-primary" onClick={() => fileRef.current?.click()}>
            Add your shot
          </button>
          <button className="s2-btn-tertiary" onClick={recompose} style={{ marginTop: 10, width: '100%' }}>
            Recompose
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Compose form ─────────────
  return (
    <div className={trayClass} style={trayStyle}>
      <TrayChrome />

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
