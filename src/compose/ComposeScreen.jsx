import { useState, useEffect, useMemo, useRef } from 'react';
import { composeBrief, getContext, uploadPhoto, getEditorNote } from '../api';
import { splitBrief } from '../personas';
import { extractEXIF, compressFile, makeThumb } from '../exif';
import { startTimer, clearTimer, getTimer, parseTimeLabel } from './timer';
import TimerBlock from './TimerBlock';

const MOODS = ['Lovely', 'Relaxed', 'Restless', 'Pensive', 'Electric', 'Quiet', 'Curious', 'Tender', 'Bold'];
const TIMES = ['Off', '3 min', '15 min', '1 hr', '3 hr'];
// Weather glyph set — 24x24, 1.8 stroke, inherits currentColor. Matches the
// labels returned by /api/ai/context (see functions/api lightDescFromCode).
// Keys are lowercased; fallback is 'ambient' (sun).
const WeatherIcon = ({ label }) => {
  const k = (label || '').toLowerCase();
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 's2-ctx-card-icon' };
  if (k.startsWith('clear') || k === 'mostly clear' || k === 'ambient') return (
    <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  );
  if (k === 'partly cloudy') return (
    <svg {...common}><circle cx="8" cy="9" r="3" /><path d="M8 2v1.5M2.5 9H4M3.6 4.6l1 1M12.4 4.6l-1 1" /><path d="M9 15h7.5a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 1 0-7z" /></svg>
  );
  if (k === 'overcast') return (
    <svg {...common}><path d="M6 10h10.5a3.5 3.5 0 0 1 0 7H6a3.5 3.5 0 0 1 0-7z" /><path d="M4 15.5h10.5a3.5 3.5 0 0 1 0 7H4" /></svg>
  );
  if (k === 'fog') return (
    <svg {...common}><path d="M4 8h16M3 13h18M5 18h14" /></svg>
  );
  if (k === 'drizzle') return (
    <svg {...common}><path d="M7 11h10a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 1 0-7z" /><path d="M10 20v1.5M14 20v1.5" /></svg>
  );
  if (k === 'rain' || k === 'showers') return (
    <svg {...common}><path d="M7 8h10a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 1 0-7z" /><path d="M9 17l-1 4M13 17l-1 4M17 17l-1 4" /></svg>
  );
  if (k === 'snow') return (
    <svg {...common}><path d="M7 8h10a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 1 0-7z" /><path d="M9 18v3M9 19.5h0M13 18v3M13 19.5h0M17 18v3M17 19.5h0" /></svg>
  );
  if (k === 'storm') return (
    <svg {...common}><path d="M7 8h10a3.5 3.5 0 0 1 0 7H7a3.5 3.5 0 0 1 0-7z" /><path d="M13 16l-3 4h3l-2 3" /></svg>
  );
  // Fallback
  return (
    <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  );
};

const CONSTRAINTS = [
  'Look up',
  'Look down',
  'One color only',
  'No people',
  'Only reflections',
  'Through something',
  'Through glass',
  'Find an edge',
  'Lowest angle you can',
  "Only what's within arm's reach",
  "Nothing farther than 10 feet",
  'Negative space',
  'A single shape, repeated',
  'Where light ends',
  'Between two things',
  'Soft against hard',
  'Out of focus on purpose',
  'Deliberate blur',
  'Just a texture',
  'One shadow',
  'A corner, any corner',
  'The thing behind the thing',
  "What you almost stepped on",
  'An accidental still life',
  'Something small, made large',
  'Something plastic',
  'Something handwritten',
  'A mess, not cleaned up',
  "What's on the floor",
  "The view from sitting down",
  "A thing someone else placed",
  'One object, your worst angle of it',
  "The ugliest thing nearby",
  'Only warm tones',
  'Only cool tones',
  'A face that isn\'t a face',
];

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
  const [timeIdx, setTimeIdx] = useState(0); // default "Off"
  const [constraintIdx, setConstraintIdx] = useState(() =>
    Math.floor(Math.random() * CONSTRAINTS.length)
  );
  const [angleSkipped, setAngleSkipped] = useState(false);
  const [coords, setCoords] = useState(null);
  const [autoLight, setAutoLight] = useState(null);
  const [autoPlace, setAutoPlace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('brief')) return p.get('brief');
    const t = getTimer();
    if (t && t.brief) return t.brief;
    return null;
  });

  // File-a-take state machine. Advances Compose → Brief → Uploading →
  // Filed. Filed is terminal — the editor's note is persisted on the
  // photo via a background fetch and surfaced on the Today day detail.
  const [stage, setStage] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('brief')) return 'brief';
    const t = getTimer();
    if (t && t.brief) return 'brief';
    return 'compose';
  });
  const [fileError, setFileError] = useState(null);
  const fileRef = useRef(null);

  // Multi-select review state. When the iOS picker returns >1 file, we
  // stage them here and push to the 'review' screen — a dedicated
  // "editor's desk" moment. Single picks skip this screen entirely.
  const [picks, setPicks] = useState([]); // [{ file, url }]
  const [pickIdx, setPickIdx] = useState(0);

  // Typewriter reveal for the brief body. Renders chars 1-by-1 so the
  // brief lands like a developing photo, not a paste-in. Skips on initial
  // mount with ?brief= dev param so design iteration isn't slowed by the
  // animation. See useEffect below.
  const [briefShown, setBriefShown] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('brief') ? (p.get('brief') || '').length : 0;
  });

  // Dismisses the page. When embedded in the Today view, the parent passes
  // onClose to handle closing + refreshing dayMeta. When mounted via the
  // ?compose=1 silo there's no parent handler, so we fall back to routing
  // to the root app.
  const dismiss = () => {
    if (typeof onClose === 'function') onClose();
    else window.location.href = '/';
  };

  // Brand-moment stages (Brief, Filed, Uploading) paint on a paper/ink
  // surface; Compose stays on the grouped-list bg so list cards pop.
  const paperStage = stage === 'brief' || stage === 'filed' || stage === 'uploading';
  const trayClass = ['s2-tray', paperStage && 's2-tray--paper'].filter(Boolean).join(' ');

  // Page header — right-aligned close button. An explicit dismiss
  // affordance in place of the old drag-handle tray.
  const PageHeader = () => (
    <div className="s2-page-header s2-page-header--right">
      <button className="s2-page-close" onClick={dismiss} aria-label="Close">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M5 5L17 17M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  const time = TIMES[timeIdx];
  const timeForApi = timeIdx === 0 ? null : time;
  const constraint = angleSkipped ? null : CONSTRAINTS[constraintIdx % CONSTRAINTS.length];

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

  const rerollConstraint = () => {
    setAngleSkipped(false);
    setConstraintIdx((i) => (i + 1 + Math.floor(Math.random() * (CONSTRAINTS.length - 1))) % CONSTRAINTS.length);
  };
  const skipAngle = () => setAngleSkipped(true);

  const canCompose = mood !== null && !loading;

  const [firstBrief, setFirstBrief] = useState(() => localStorage.getItem('scout-first-brief-seen') !== '1');

  const dismissFirstBrief = () => {
    if (!firstBrief) return;
    localStorage.setItem('scout-first-brief-seen', '1');
    setFirstBrief(false);
  };

  const pickMood = (m) => {
    setMood(m);
    dismissFirstBrief();
  };

  const compose = async () => {
    if (!canCompose) return;
    dismissFirstBrief();
    setLoading(true);
    setError(null);
    const res = await composeBrief({
      mood,
      time: timeForApi,
      constraint,
      lat: coords?.lat,
      lon: coords?.lon,
      voice: (typeof localStorage !== 'undefined' && localStorage.getItem('scout-brief-voice')) || 'current',
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
    const durationMs = parseTimeLabel(timeForApi);
    if (durationMs > 0) startTimer({ date: todayKey, durationMs, brief: res.brief });
    else clearTimer();
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
  const uploadOne = async (file) => {
    setStage('uploading');
    setFileError(null);
    try {
      const exif = await extractEXIF(file);
      const fullSrc = await compressFile(file);
      const thumbSrc = await makeThumb(fullSrc);
      const composeStack = {
        mood,
        time: timeForApi,
        constraint,
        autoLight,
        autoPlace,
        brief,
        filedAt: new Date().toISOString(),
        via: 'picker',
      };
      const ok = await uploadPhoto(todayKey, { fullSrc, thumbSrc, exif, caption: '', compose: composeStack });
      if (!ok) throw new Error('Upload failed. Check connection and retry.');
      clearTimer();
      setStage('filed');
      if (typeof onFiled === 'function') {
        try { onFiled({ date: todayKey, compose: composeStack }); } catch {}
      }
    } catch (err) {
      setFileError(err?.message || 'Could not file your take. Try again.');
      setStage('brief');
    }
  };

  const handleFileSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.length === 1) {
      picks.forEach(p => URL.revokeObjectURL(p.url));
      setPicks([]);
      await uploadOne(files[0]);
      return;
    }
    // Multi-select → stage for review. Cap at 6 to keep the thumb strip sane.
    picks.forEach(p => URL.revokeObjectURL(p.url));
    const capped = files.slice(0, 6);
    const next = capped.map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setPicks(next);
    setPickIdx(0);
    setStage('review');
  };

  const fileSelectedPick = async () => {
    const chosen = picks[pickIdx];
    if (!chosen) return;
    const file = chosen.file;
    picks.forEach(p => URL.revokeObjectURL(p.url));
    setPicks([]);
    await uploadOne(file);
  };

  // Cleanup object URLs on unmount.
  useEffect(() => () => { picks.forEach(p => URL.revokeObjectURL(p.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Typewriter: when the Brief stage first opens, reveal `brief` one char
  // every ~24ms. Reset to 0 each time `brief` text changes (Recompose) so
  // the animation re-runs. Bypasses on `?brief=` dev URLs (initialised
  // pre-revealed in useState above).
  useEffect(() => {
    if (stage !== 'brief' || !brief) return;
    if (briefShown >= brief.length) return;
    const t = setTimeout(() => setBriefShown((n) => Math.min(brief.length, n + 1)), 42);
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
    const voice = (typeof localStorage !== 'undefined' && localStorage.getItem('scout-brief-voice')) || 'editor';
    getEditorNote(todayKey, voice).catch(() => {});
  }, [stage, todayKey]);

  // Header dateline: "Overcast · Capitol Hill · 8:17" (filtered for nulls).
  const headerBits = [autoLight, autoPlace, clock].filter(Boolean).join(' · ');

  // Hidden file input — single picker. No `capture` attribute so iOS
  // surfaces its native sheet (Take Photo / Photo Library / Choose Files)
  // instead of jumping straight to the camera. cameraRef is kept around
  // as an alias for legacy call sites; both refs point at the same input.
  const fileInputs = (
    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelected} />
  );

  // ───────────── Filed (brand moment 02 — the stamp lands) ─────────────
  // Terminal screen in the Compose loop. Close returns the user to Today,
  // where the Editor's Note (fired in the background on entering 'filed')
  // shows up under the photo as the Field Note.
  if (stage === 'filed') {
    return (
      <div className={trayClass}>
        <PageHeader />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px 32px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 96, marginBottom: 56 }}>
            <span className="s2-stamp-filed" style={{ fontSize: 'var(--fs-base)', padding: '10px 22px' }}>Filed</span>
          </div>
          <div className="s2-serif" style={{ fontSize: 'var(--fs-3xl)', color: 'var(--s2-text-primary)', lineHeight: 1.15, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 22 }}>
            Your take is in.
          </div>
          <div className="s2-sans" style={{ fontFamily: 'var(--s2-sans)', fontSize: 'var(--fs-base)', color: 'var(--s2-text-secondary)', lineHeight: 1.55, textAlign: 'center', maxWidth: 320, margin: '0 auto', marginBottom: 'auto' }}>
            Your editor will review it. We'll let you know when their note is ready.
          </div>
          <button className="s2-btn-primary" onClick={dismiss}>
            Close
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Select Your Take (multi-pick review screen) ─────────────
  // Lands when the iOS picker returns >1 file. Editor's-desk moment: spread
  // out the contact sheet, pick the keeper. Single picks skip this entirely.
  if (stage === 'review' && picks.length > 0) {
    const hero = picks[pickIdx];
    return (
      <div className={trayClass}>
        <div className="s2-page-header s2-page-header--right">
          <button
            className="s2-page-close"
            onClick={() => {
              picks.forEach(p => URL.revokeObjectURL(p.url));
              setPicks([]);
              setStage(brief ? 'brief' : 'compose');
            }}
            aria-label="Discard picks"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M5 5L17 17M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 20px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', minHeight: 0 }}>
          <div className="s2-mono" style={{ fontSize: 'var(--fs-2xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)', marginBottom: 8 }}>
            Select Your Take
          </div>
          <div className="s2-serif" style={{ fontSize: 'var(--fs-lg)', color: 'var(--s2-text-primary)', lineHeight: 1.25, letterSpacing: '-0.01em', marginBottom: 14 }}>
            Pick the one that answers the brief.
          </div>
          <div className="s2-review-hero" style={{ flex: '1 1 0', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--s2-bone, #EFEBE3)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <img src={hero.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
            {picks.map((p, i) => (
              <button
                key={p.url}
                onClick={() => setPickIdx(i)}
                aria-label={`Preview ${i + 1}`}
                style={{
                  flex: '0 0 auto',
                  width: 56,
                  height: 56,
                  padding: 0,
                  border: i === pickIdx ? '2px solid var(--s2-text-primary)' : '2px solid transparent',
                  background: 'var(--s2-bone, #EFEBE3)',
                  cursor: 'pointer',
                  borderRadius: 2,
                  overflow: 'hidden',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
          <div className="s2-mono" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--s2-text-muted)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12, flexShrink: 0 }}>
            Dispatch · {formatDispatchDate(now)} · {clock}
          </div>
          <button className="s2-btn-primary" onClick={fileSelectedPick} style={{ flexShrink: 0 }}>
            File this one
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ background: 'none', border: 'none', color: 'var(--s2-text-secondary)', fontFamily: 'var(--s2-sans)', fontSize: 'var(--fs-sm)', padding: '10px 0 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
          >
            Choose again
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Uploading (compressing + POSTing with compose stack) ─────────────
  if (stage === 'uploading') {
    return (
      <div className={trayClass}>
        <PageHeader />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px 28px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div className="s2-spinner" style={{ width: 24, height: 24, borderWidth: 2, color: 'var(--s2-press-green)', marginBottom: 20 }} />
          <div className="s2-mono" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)' }}>
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
    const { body: briefBody, signature: briefSig } = splitBrief(brief);
    const revealedFull = brief.slice(0, briefShown);
    const typing = briefShown < brief.length;
    // Reveal the sign-off line only once the body is fully typed, and keep
    // the typewriter strictly on the body portion so the signature doesn't
    // type character-by-character.
    const bodyRevealed = briefSig
      ? revealedFull.slice(0, Math.min(revealedFull.length, briefBody.length))
      : revealedFull;
    const sigShown = briefSig && briefShown >= brief.length;
    return (
      <div className={trayClass}>
        <PageHeader />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '44px 28px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 72 }}>
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
          <div style={{ marginBottom: 'auto' }}>
            <div className="s2-serif" style={{ fontSize: 'var(--fs-xl)', color: 'var(--s2-text-primary)', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
              {bodyRevealed}
              {typing && <span className="s2-typewriter-caret" aria-hidden="true">▍</span>}
            </div>
            {sigShown && (
              <div className="note-reveal-sig" style={{ marginTop: 20 }}>{briefSig}</div>
            )}
          </div>
          <div style={{ margin: '32px -28px 0' }}>
            <TimerBlock />
          </div>
          <div className="s2-mono" style={{ fontSize: 12, color: 'var(--s2-text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 48, marginBottom: 36, textAlign: 'center' }}>
            Brief {briefNumber} / 365 &nbsp;·&nbsp; File by 23:59
          </div>
          {fileError && (
            <div className="s2-mono" style={{ color: 'var(--s2-warn)', fontSize: 'var(--fs-sm)', marginBottom: 10 }}>
              {fileError}
            </div>
          )}
          <button className="s2-btn-primary" onClick={() => fileRef.current?.click()}>
            Add your shot
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Compose form ─────────────
  const briefNumber = dayOfYear(now);
  return (
    <div className={trayClass}>
      <PageHeader />

      {firstBrief && (
        <div className="s2-first-assignment" role="note">
          <div className="s2-first-assignment-label">Your first assignment</div>
          <div className="s2-first-assignment-body">Pick a mood to compose your first brief.</div>
        </div>
      )}

      <div className="s2-title-block">
        <h1 className="s2-title">Daily Brief</h1>
        <div className="s2-dateline" style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {now.toLocaleDateString('en-US', { weekday: 'short' })} · {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · №&nbsp;{String(briefNumber).padStart(3, '0')}
        </div>
      </div>

      <div className="s2-section-label">How are you feeling?</div>
      <div className="s2-mood-scroll">
        {MOODS.map((m) => (
          <button
            key={m}
            className={`s2-mood-pill ${mood === m ? 'active' : ''}`}
            onClick={() => pickMood(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="s2-section-label">The angle</div>
      <div className="s2-angle-card">
        <div className="s2-angle-text">{angleSkipped ? 'No angle — blank canvas.' : `“${constraint}”`}</div>
        <div className="s2-angle-actions">
          <button className="s2-angle-primary" onClick={rerollConstraint}>↻ Try another</button>
          {!angleSkipped && <button onClick={skipAngle}>Skip</button>}
        </div>
      </div>

      <div className="s2-section-label">Time Box</div>
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

      {(autoLight || autoPlace) && (
        <>
          <div className="s2-section-label">Context</div>
          <div className="s2-ctx-row">
            <div className="s2-ctx-card">
              <WeatherIcon label={autoLight} />
              <div className="s2-ctx-card-val">{autoLight || '—'}</div>
              <div className="s2-ctx-card-sub">{clock}</div>
            </div>
            <div className="s2-ctx-card">
              <svg className="s2-ctx-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 22s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <div className="s2-ctx-card-val">{autoPlace || '—'}</div>
              <div className="s2-ctx-card-sub">Nearby</div>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="s2-mono" style={{ color: 'var(--s2-warn)', padding: '14px 20px', fontSize: 'var(--fs-sm)', letterSpacing: '0.05em' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 'auto', padding: '16px 16px 26px' }}>
        <button
          className="s2-btn-primary"
          disabled={mood === null}
          aria-busy={loading}
          onClick={compose}
          style={{ whiteSpace: 'nowrap' }}
        >
          {loading
            ? (<><span className="s2-spinner" /><span>Composing…</span></>)
            : <span>Compose</span>}
        </button>
      </div>
    </div>
  );
}
