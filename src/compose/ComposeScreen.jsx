import { useState, useEffect, useMemo, useRef } from 'react';
import { composeBrief, uploadPhoto, getEditorNote } from '../api';
import { splitBrief } from '../personas';
import { extractEXIF, compressFile, makeThumb } from '../exif';
import { startTimer, clearTimer, getTimer } from './timer';
import TimerBlock from './TimerBlock';

// Format the dispatch datestamp for the multi-pick review header — "04.18.26".
const formatDispatchDate = (d) => {
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const yy = (d.getFullYear() % 100).toString().padStart(2, '0');
  return `${m}.${day}.${yy}`;
};

// Format the clock portion ("8:17"). Used in the multi-pick review header.
const formatClock = (d) => {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
};

// Day-of-year — the brief counter ("Brief 108 / 365"). Frames the
// photographer's practice as a 365-day run.
const dayOfYear = (d) => {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = (d - start) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
  return Math.floor(diff / 86400000);
};

// Compose — the daily brief. Editor decides, photographer responds. The user
// no longer dials in mood / angle / time / context — those configs were a
// buffet that fought the brand ("editor decides; you respond"). On open the
// brief auto-fetches and lands on its own. One screen, one verb.
//
// Stages: loading → brief → uploading → filed
//   plus an optional `review` detour for multi-file picks (iOS picker can
//   return >1; we let the user pick which one to file).
//
// Silent context: light (from coords) is provided to the brief generator;
// place is intentionally withheld from the model (geographic pattern-match).
// Neither is shown as a card — the brief carries the context invisibly.
//
// Off-ramp: the close button (top-right) is the only escape. There is no
// Skip, no Recompose, no other-brief-please. If you don't want today's
// brief, close the screen. The deal already says "miss a day, the paper
// notices" — that's the social contract; the app doesn't reinforce it
// with badges.
//
// Timer: lives only in challenge mode (PR C). Default daily flow has no
// countdown — the soft "File by 23:59" line is the only deadline framing.
export default function ComposeScreen({ onClose, onFiled } = {}) {
  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  const [coords, setCoords] = useState(null);
  const [autoLight, setAutoLight] = useState(null);
  const [autoPlace, setAutoPlace] = useState(null);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('brief') || null;
  });
  // Challenge mode lights up on ~1-in-7 days, decided server-side and
  // returned with the brief. The duration is threaded into the brief copy
  // ("Twelve minutes. …"); the timer mirrors it so the urgency in the
  // language matches the urgency on the clock.
  const [challenge, setChallenge] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('challenge') === '1';
  });
  const [durationMinutes, setDurationMinutes] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const v = parseInt(p.get('duration') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  // Snapshot the timer's deadline ms in component state so the file-late
  // calculation survives the timer being cleared (user can dismiss the
  // expired-state TimerBlock, which deletes the localStorage record).
  const [challengeDeadlineMs, setChallengeDeadlineMs] = useState(null);

  // File-a-take state machine. Loading → Brief → Uploading → Filed.
  // Filed is terminal — the editor's note is persisted on the photo via a
  // background fetch and surfaced on the Today day detail.
  const [stage, setStage] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('brief') ? 'brief' : 'loading';
  });
  const [fileError, setFileError] = useState(null);
  const fileRef = useRef(null);

  // Multi-select review state. When the iOS picker returns >1 file, we
  // stage them here and push to the 'review' screen — a dedicated
  // "editor's desk" moment. Single picks skip this screen entirely.
  const [picks, setPicks] = useState([]); // [{ file, url }]
  const [pickIdx, setPickIdx] = useState(0);

  // Typewriter reveal for the brief body — chars 1-by-1 so the brief lands
  // like a developing photo, not a paste-in. ?brief= dev param skips it.
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

  // All Compose surfaces are paper now (no config screen → no grouped-list
  // bg). Brand moments stage on paper consistently.
  const trayClass = 's2-tray s2-tray--paper';

  // Page header — right-aligned close button. The off-ramp.
  const PageHeader = () => (
    <div className="s2-page-header s2-page-header--right">
      <button className="s2-page-close" onClick={dismiss} aria-label="Close">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M5 5L17 17M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  // Request geolocation once on mount. Silent fallback if denied — the
  // brief endpoint has a default coord pair so generation still succeeds.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 600000 }
    );
  }, []);

  // Auto-fetch the brief on mount. Wait briefly for coords to land so the
  // light context is real. If geolocation never resolves, fetch anyway —
  // the backend's default-location fallback covers the silence.
  const briefFetchedRef = useRef(false);
  useEffect(() => {
    if (briefFetchedRef.current) return;
    if (stage !== 'loading') return;

    const runFetch = async () => {
      if (briefFetchedRef.current) return;
      briefFetchedRef.current = true;
      const voice = (typeof localStorage !== 'undefined' && localStorage.getItem('scout-brief-voice')) || 'editor';
      const res = await composeBrief({ lat: coords?.lat, lon: coords?.lon, voice });
      if (!res || res.error) {
        setError(res?.error || "Couldn't load today's brief. Pull down or close and reopen.");
        // Allow retry on next mount/reopen.
        briefFetchedRef.current = false;
        return;
      }
      // Dev override: ?nochallenge=1 forces the regular flow on a server-
      // declared challenge day. Useful for QA on rare-event UI when you
      // happen to roll a challenge bucket. The brief copy itself may still
      // mention the duration since the model already generated it — close
      // and reopen to fetch a fresh non-challenge brief, or pair with
      // ?brief= to short-circuit.
      const params = new URLSearchParams(window.location.search);
      const noChallenge = params.get('nochallenge') === '1';
      setBrief(res.brief);
      setChallenge(noChallenge ? false : !!res.challenge);
      setDurationMinutes(noChallenge ? null : (res.durationMinutes || null));
      if (res.autoLight) setAutoLight(res.autoLight);
      if (res.autoPlace) setAutoPlace(res.autoPlace);
      setStage('brief');
    };

    if (coords) {
      runFetch();
    } else {
      const t = setTimeout(runFetch, 1500);
      return () => clearTimeout(t);
    }
  }, [coords, stage]);

  // Read a selected image, compress + thumb + EXIF, then upload with the
  // brief attached to meta. The compose stack on meta retains brief +
  // autoLight + autoPlace (silent inputs to brief generation) so the
  // archive can re-read them later.
  const uploadOne = async (file) => {
    setStage('uploading');
    setFileError(null);
    try {
      const exif = await extractEXIF(file);
      const fullSrc = await compressFile(file);
      const thumbSrc = await makeThumb(fullSrc);
      // On challenge days, mark whether the file landed before or after the
      // timer expired. Filed late = filed without the challenge stamp on
      // archive (per the design conversation — the timer earns its drama
      // by being unforgiving). Computed from the deadline snapshot, so it
      // survives the user dismissing the expired-state TimerBlock.
      const challengeFiledLate = challenge && challengeDeadlineMs != null && Date.now() > challengeDeadlineMs;
      const composeStack = {
        autoLight,
        autoPlace,
        brief,
        challenge: !!challenge,
        challengeDurationMinutes: durationMinutes,
        challengeFiledLate,
        filedAt: new Date().toISOString(),
        via: 'picker',
      };
      const ok = await uploadPhoto(todayKey, { fullSrc, thumbSrc, exif, caption: '', compose: composeStack });
      if (!ok) throw new Error('Upload failed. Check connection and retry.');
      // Clear the challenge timer regardless of late/on-time — the take is
      // in, the countdown's job is done.
      if (challenge) clearTimer();
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
  // every ~42ms. Reset to 0 each time `brief` text changes so the animation
  // re-runs on a fresh brief. Bypasses on `?brief=` dev URLs.
  useEffect(() => {
    if (stage !== 'brief' || !brief) return;
    if (briefShown >= brief.length) return;
    const t = setTimeout(() => setBriefShown((n) => Math.min(brief.length, n + 1)), 42);
    return () => clearTimeout(t);
  }, [stage, brief, briefShown]);
  useEffect(() => {
    if (stage === 'brief' && brief) setBriefShown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief]);

  // Challenge mode: kick off the countdown the moment the brief lands.
  // Idempotent — getTimer() already returns the active timer if one exists
  // for today, so reopening Compose mid-challenge picks up where it left
  // off. Cleared in uploadOne() once the take is filed (or filed late).
  // Snapshot the deadline so file-late detection survives a dismissed
  // TimerBlock (Dismiss removes the localStorage record).
  useEffect(() => {
    if (stage !== 'brief' || !challenge || !durationMinutes || !brief) return;
    const existing = getTimer();
    let startMs;
    if (existing && existing.date === todayKey) {
      startMs = new Date(existing.startedAt).getTime();
    } else {
      const t = startTimer({ date: todayKey, durationMs: durationMinutes * 60_000, brief });
      startMs = new Date(t.startedAt).getTime();
    }
    setChallengeDeadlineMs(startMs + durationMinutes * 60_000);
  }, [stage, challenge, durationMinutes, brief, todayKey]);

  // Fire the editor's-note endpoint in the background once we hit 'filed'
  // so the note is persisted on the photo's meta. Don't navigate — Filed
  // is the terminal screen; the note is surfaced on Today (as Field Note).
  useEffect(() => {
    if (stage !== 'filed') return;
    const voice = (typeof localStorage !== 'undefined' && localStorage.getItem('scout-brief-voice')) || 'editor';
    getEditorNote(todayKey, voice).catch(() => {});
  }, [stage, todayKey]);

  // Hidden file input — single picker. No `capture` attribute so iOS
  // surfaces its native sheet (Take Photo / Photo Library / Choose Files).
  const fileInputs = (
    <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelected} />
  );

  // ───────────── Loading (auto-fetching the brief) ─────────────
  if (stage === 'loading') {
    return (
      <div className={trayClass}>
        <PageHeader />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          {!error && (
            <>
              <div className="s2-spinner" style={{ width: 24, height: 24, borderWidth: 2, color: 'var(--s2-press-green)', marginBottom: 20 }} />
              <div className="s2-mono" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)' }}>
                Today&rsquo;s brief, on the way
              </div>
            </>
          )}
          {error && (
            <>
              <div className="s2-mono" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)', marginBottom: 14 }}>
                Wire trouble
              </div>
              <div className="s2-sans" style={{ fontSize: 'var(--fs-base)', color: 'var(--s2-text-secondary)', lineHeight: 1.5, maxWidth: 320, marginBottom: 28 }}>
                {error}
              </div>
              <button
                className="s2-btn-primary"
                onClick={() => { setError(null); setStage('loading'); }}
                style={{ minWidth: 200 }}
              >
                Try again
              </button>
            </>
          )}
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Filed (brand moment 02 — the stamp lands) ─────────────
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
            Your editor will review it. We&rsquo;ll let you know when their note is ready.
          </div>
          <button className="s2-btn-primary" onClick={dismiss}>
            Close
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── Multi-pick review — pick which one answers the brief ─────────────
  if (stage === 'review' && picks.length > 0) {
    const hero = picks[pickIdx];
    const clock = formatClock(now);
    return (
      <div className={trayClass}>
        <div className="s2-page-header s2-page-header--right">
          <button
            className="s2-page-close"
            onClick={() => {
              picks.forEach(p => URL.revokeObjectURL(p.url));
              setPicks([]);
              setStage('brief');
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

  // ───────────── Uploading (compressing + POSTing) ─────────────
  if (stage === 'uploading') {
    return (
      <div className={trayClass}>
        <PageHeader />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '36px 28px 28px', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div className="s2-spinner" style={{ width: 24, height: 24, borderWidth: 2, color: 'var(--s2-press-green)', marginBottom: 20 }} />
          <div className="s2-mono" style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--s2-text-muted)' }}>
            Filing your take&hellip;
          </div>
        </div>
        {fileInputs}
      </div>
    );
  }

  // ───────────── The Brief — anchor screen ─────────────
  // New Assignment stamp · brief body (Fraunces, large) · sign-off ·
  // Brief counter footer · "File your take" CTA. One screen, one verb.
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: challenge ? 48 : 72 }}>
            {challenge
              ? <span className="s2-stamp-dispatch s2-stamp-urgent">Urgent · {durationMinutes} min</span>
              : <span className="s2-stamp-dispatch">New Assignment</span>
            }
          </div>
          <div style={{ marginBottom: 'auto' }}>
            <div className="s2-serif" style={{ fontSize: 'var(--fs-2xl)', color: 'var(--s2-text-primary)', lineHeight: 1.3, letterSpacing: '-0.015em' }}>
              {bodyRevealed}
              {typing && <span className="s2-typewriter-caret" aria-hidden="true">▍</span>}
            </div>
            {sigShown && (
              <div className="note-reveal-sig" style={{ marginTop: 20 }}>{briefSig}</div>
            )}
          </div>
          {challenge && (
            <div style={{ margin: '32px -28px 0' }}>
              <TimerBlock />
            </div>
          )}
          <div className="s2-mono" style={{ fontSize: 12, color: 'var(--s2-text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: challenge ? 32 : 48, marginBottom: 36, textAlign: 'center' }}>
            Brief {briefNumber} / 365 &nbsp;·&nbsp; {challenge ? 'On the clock' : 'File by 23:59'}
          </div>
          {fileError && (
            <div className="s2-mono" style={{ color: 'var(--s2-warn)', fontSize: 'var(--fs-sm)', marginBottom: 10 }}>
              {fileError}
            </div>
          )}
          <button className="s2-btn-primary" onClick={() => fileRef.current?.click()}>
            File your take
          </button>
        </div>
        {fileInputs}
      </div>
    );
  }

  // Fallback — should never render in practice, but covers the gap if a
  // race lands the component in an unknown stage.
  return null;
}
