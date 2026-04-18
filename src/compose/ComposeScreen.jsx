import { useState, useRef, useEffect } from 'react';
import { composeBrief } from '../api';

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

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function ComposeScreen() {
  const now = new Date();
  const headerDate = `${DAYS_SHORT[now.getDay()]} · ${MONTHS_SHORT[now.getMonth()]} ${now.getDate()}`;

  const [mood, setMood] = useState(null);
  const [timeIndex, setTimeIndex] = useState(null);
  const [constraintIndex, setConstraintIndex] = useState(0);
  const [constraintFlip, setConstraintFlip] = useState(false);
  const constraint = CONSTRAINTS[constraintIndex % CONSTRAINTS.length];

  const [coords, setCoords] = useState(null);
  const [autoLight, setAutoLight] = useState('—');
  const [autoPlace, setAutoPlace] = useState('—');

  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [composed, setComposed] = useState(false);

  const sliderRef = useRef(null);
  const [draggingTime, setDraggingTime] = useState(false);

  // Ask for geolocation once on mount; silently fall back if denied.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 600000 }
    );
  }, []);

  const rerollConstraint = () => {
    setConstraintFlip(true);
    setTimeout(() => {
      setConstraintIndex((i) => i + 1);
      setConstraintFlip(false);
    }, 180);
  };

  const updateTimeFromEvent = (e) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    const ratio = Math.max(0, Math.min(1, (point.clientX - rect.left) / rect.width));
    setTimeIndex(Math.round(ratio * (TIMES.length - 1)));
  };
  const timeDown = (e) => {
    e.preventDefault();
    setDraggingTime(true);
    updateTimeFromEvent(e);
  };
  useEffect(() => {
    if (!draggingTime) return;
    const move = (e) => updateTimeFromEvent(e);
    const up = () => setDraggingTime(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [draggingTime]);

  const canCompose = mood !== null && timeIndex !== null && !loading;

  const compose = async () => {
    if (!canCompose) return;
    setLoading(true);
    setError(null);

    const res = await composeBrief({
      mood,
      time: TIMES[timeIndex],
      constraint,
      lat: coords?.lat,
      lon: coords?.lon,
    });

    if (res?.error) {
      setError(res.error);
    } else if (res?.brief) {
      setBrief(res.brief);
      if (res.autoLight) setAutoLight(res.autoLight);
      if (res.autoPlace) setAutoPlace(res.autoPlace);
      setComposed(true);
    } else {
      setError('No brief returned');
    }
    setLoading(false);
  };

  return (
    <div className="compose-root">
      <style>{COMPOSE_CSS}</style>

      <div className="compose-inner">
        {/* Header */}
        <div className="compose-header">
          <div className="t-label">{headerDate}</div>
          <h1 className="compose-today">Today</h1>
        </div>

        {/* Context strip */}
        <div className="compose-context">
          <span>{autoLight}</span>
          <span className="compose-context-dot">·</span>
          <span>{autoPlace}</span>
        </div>

        <div className="compose-rule" />

        {/* Mood */}
        <section className="compose-section">
          <div className="t-label">Mood</div>
          <div className="compose-mood-row">
            {MOODS.map((m) => {
              const isActive = mood === m;
              return (
                <span
                  key={m}
                  onClick={() => setMood(m)}
                  className={`mood-word ${isActive ? 'active' : ''}`}
                >
                  {m}
                </span>
              );
            })}
          </div>
        </section>

        <div className="compose-rule" />

        {/* Time */}
        <section className="compose-section">
          <div className="compose-section-head">
            <span className="t-label">Time</span>
            <span className={`compose-value ${timeIndex !== null ? 'on' : ''}`}>
              {timeIndex !== null ? TIMES[timeIndex] : '—'}
            </span>
          </div>

          <div
            ref={sliderRef}
            onMouseDown={timeDown}
            onTouchStart={timeDown}
            className="compose-slider"
          >
            <div className="compose-slider-track" />
            {TIMES.map((_, i) => (
              <div
                key={i}
                className="compose-slider-tick"
                style={{ left: `${(i / (TIMES.length - 1)) * 100}%` }}
              />
            ))}
            {timeIndex !== null && (
              <div
                className="compose-slider-thumb"
                style={{
                  left: `${(timeIndex / (TIMES.length - 1)) * 100}%`,
                  transition: draggingTime ? 'none' : 'left 0.2s cubic-bezier(0.2, 0, 0, 1)',
                }}
              />
            )}
          </div>

          <div className="compose-slider-labels">
            {TIMES.map((t, i) => (
              <span key={t} className={`compose-slider-lbl ${timeIndex === i ? 'on' : ''}`}>
                {t.toUpperCase()}
              </span>
            ))}
          </div>
        </section>

        <div className="compose-rule" />

        {/* Constraint */}
        <section className="compose-section compose-section-last">
          <div className="compose-section-head">
            <span className="t-label">Constraint</span>
            <button onClick={rerollConstraint} className="compose-reroll">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              NEW
            </button>
          </div>
          <div className={`compose-constraint ${constraintFlip ? 'flipping' : ''}`}>
            {constraint}
          </div>
        </section>

        {/* Compose button */}
        <button onClick={compose} disabled={!canCompose} className="compose-btn">
          {loading ? <span className="compose-pulse">COMPOSING</span> : composed ? 'COMPOSE AGAIN' : 'COMPOSE'}
        </button>

        {/* Brief */}
        {brief && !error && (
          <div className="compose-brief-wrap develop" key={brief}>
            <div className="t-label">Brief</div>
            <div className="compose-brief">{brief}</div>
          </div>
        )}

        {error && (
          <div className="compose-error">
            <div className="compose-error-lbl">ERROR</div>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

const COMPOSE_CSS = `
.compose-root {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  background: #0C0C0A;
  color: #E8E4DB;
  font-family: 'DM Mono', ui-monospace, monospace;
  padding: 48px 24px 64px;
}
.compose-inner { max-width: 560px; margin: 0 auto; }

.compose-header { margin-bottom: 56px; }
.compose-today {
  font-family: 'EB Garamond', Georgia, serif;
  font-size: 44px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: #F5F1E8;
  line-height: 1;
  margin-top: 12px;
}

.t-label {
  color: #5C584F;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 400;
}

.compose-context {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 40px;
  color: #7A7668;
  font-size: 11px;
  letter-spacing: 0.08em;
}
.compose-context-dot { opacity: 0.35; }

.compose-rule {
  height: 1px;
  background: rgba(245, 241, 232, 0.06);
  margin-bottom: 36px;
}

.compose-section { margin-bottom: 40px; }
.compose-section-last { margin-bottom: 48px; }
.compose-section .t-label { margin-bottom: 20px; display: block; }

.compose-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.compose-section-head .t-label { margin-bottom: 0; }

.compose-value {
  font-size: 13px;
  letter-spacing: 0.08em;
  color: #5C584F;
  transition: color 0.2s;
}
.compose-value.on { color: #F5F1E8; }

.compose-mood-row {
  display: flex;
  flex-wrap: wrap;
  row-gap: 16px;
  column-gap: 28px;
}
.mood-word {
  cursor: pointer;
  position: relative;
  font-size: 16px;
  letter-spacing: 0.01em;
  padding: 2px 0;
  transition: color 0.2s ease;
  color: #7A7668;
  user-select: none;
}
.mood-word:hover { color: #D4CFC1; }
.mood-word.active { color: #F5F1E8; }
.mood-word::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -2px;
  height: 1px;
  background: #F5F1E8;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1);
}
.mood-word.active::after { transform: scaleX(1); }

.compose-slider {
  position: relative;
  cursor: pointer;
  user-select: none;
  height: 32px;
  padding: 14px 0;
}
.compose-slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(245, 241, 232, 0.15);
  transform: translateY(-50%);
}
.compose-slider-tick {
  position: absolute;
  top: 50%;
  width: 1px;
  height: 6px;
  background: rgba(245, 241, 232, 0.25);
  transform: translate(-50%, -50%);
}
.compose-slider-thumb {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #F5F1E8;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 0 12px rgba(245, 241, 232, 0.25);
}
.compose-slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
.compose-slider-lbl {
  font-size: 9px;
  letter-spacing: 0.1em;
  color: #5C584F;
  transition: color 0.2s;
}
.compose-slider-lbl.on { color: #9A9486; }

.compose-reroll {
  font-family: 'DM Mono', ui-monospace, monospace;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  letter-spacing: 0.2em;
  color: #5C584F;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.2s;
}
.compose-reroll:hover { color: #9A9486; }

.compose-constraint {
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 17px;
  letter-spacing: 0.01em;
  color: #F5F1E8;
}
.compose-constraint.flipping { animation: constraintFlip 0.36s ease; }

@keyframes constraintFlip {
  0% { opacity: 1; transform: translateY(0); }
  50% { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}

.compose-btn {
  background: transparent;
  border: 1px solid rgba(245, 241, 232, 0.35);
  color: #F5F1E8;
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.32em;
  padding: 18px 0;
  width: 100%;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
}
.compose-btn:hover:not(:disabled) {
  background: #F5F1E8;
  color: #0C0C0A;
  border-color: #F5F1E8;
}
.compose-btn:disabled { opacity: 0.25; cursor: not-allowed; }

.compose-pulse { animation: composePulse 1.4s ease-in-out infinite; }
@keyframes composePulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.compose-brief-wrap { margin-top: 56px; }
.compose-brief-wrap .t-label { margin-bottom: 20px; display: block; }
.compose-brief {
  font-family: 'EB Garamond', Georgia, serif;
  font-size: 30px;
  font-weight: 400;
  color: #F5F1E8;
  line-height: 1.3;
  letter-spacing: -0.01em;
  text-shadow: 0 0 40px rgba(245, 241, 232, 0.06);
}

.develop { animation: develop 1.2s ease-out; }
@keyframes develop {
  0% { opacity: 0; filter: blur(6px); transform: translateY(4px); }
  100% { opacity: 1; filter: blur(0); transform: translateY(0); }
}

.compose-error {
  margin-top: 40px;
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: #C89A7E;
  padding: 16px;
  border: 1px solid rgba(200, 154, 126, 0.2);
  border-radius: 2px;
  background: rgba(200, 154, 126, 0.04);
  line-height: 1.5;
  word-break: break-word;
}
.compose-error-lbl {
  color: #C89A7E;
  margin-bottom: 6px;
  opacity: 0.7;
  font-size: 9px;
  letter-spacing: 0.2em;
}
`;
