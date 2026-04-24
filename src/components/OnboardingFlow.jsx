import { useState } from 'react';
import ScoutWordmark from '../ScoutWordmark.jsx';
import { PERSONAS } from '../personas';

const PITCH_PANES = [
  {
    eyebrow: 'Every day',
    headline: 'A brief.',
    body: 'Scout sends you one assignment each morning — a mood, an angle, a time box.',
    sample: {
      kind: 'brief',
      dateline: 'BRIEF 001 · WED · APR 22',
      quote: 'Find an edge. Shoot something soft against something hard. Twenty minutes.',
    },
  },
  {
    eyebrow: 'File',
    headline: 'A single frame.',
    body: 'One photo per day. No rolls, no drafts. The constraint is the practice.',
    sample: { kind: 'stamp' },
  },
  {
    eyebrow: 'At 8pm',
    headline: 'Your editor responds.',
    body: "A short note on what the frame did — and what to try tomorrow. Off the record, just for you.",
    sample: {
      kind: 'note',
      body: 'The shadow across the top third does more than the subject. Tomorrow — follow light that cuts, not light that fills.',
    },
  },
];

// First-run flow. Runs before auth on first launch. State machine:
//   intro → pitch (3 panes) → primer → onDone
// Acts map to the onboarding plan: Act 1 (intro/zoom-out, static poster
// version for now), Act 2 (pitch panes), Act 3 (permission primer).
// Act 4 (auth) happens after onDone. Act 5 (first-brief pulse) lives
// in the main app, gated separately.
export default function OnboardingFlow({ onDone, briefVoice, setBriefVoice }) {
  const [step, setStep] = useState('intro');
  const [pitchIdx, setPitchIdx] = useState(0);

  if (step === 'intro') {
    return <IntroGrid onBegin={() => setStep('pitch')} />;
  }

  if (step === 'pitch') {
    const pane = PITCH_PANES[pitchIdx];
    const last = pitchIdx === PITCH_PANES.length - 1;
    const advance = () => last ? setStep('editor') : setPitchIdx(i => i + 1);
    return (
      <div className="onb-screen onb-pitch">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">{pane.eyebrow}</div>
          <h1 className="s2-serif onb-headline">{pane.headline}</h1>
          <div className="onb-sample">
            {pane.sample.kind === 'brief' && (
              <>
                <div className="s2-mono onb-sample-dateline">{pane.sample.dateline}</div>
                <div className="s2-serif onb-sample-quote">{pane.sample.quote}</div>
              </>
            )}
            {pane.sample.kind === 'stamp' && (
              <span className="s2-stamp-filed">Filed</span>
            )}
            {pane.sample.kind === 'note' && (
              <>
                <div className="s2-mono onb-sample-dateline">EDITOR'S NOTE · 8:00 PM</div>
                <div className="s2-sans onb-sample-note">{pane.sample.body}</div>
              </>
            )}
          </div>
          <p className="s2-sans onb-body">{pane.body}</p>
        </div>
        <div className="onb-pager">
          {PITCH_PANES.map((_, i) => (
            <span key={i} className={`onb-pager-dot${i === pitchIdx ? ' active' : ''}`} />
          ))}
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={advance}>{last ? 'Continue' : 'Next'}</button>
        </div>
      </div>
    );
  }

  if (step === 'editor') {
    const picked = PERSONAS.find(p => p.id === briefVoice) || PERSONAS[0];
    return (
      <div className="onb-screen onb-editor">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">The masthead</div>
          <h1 className="s2-serif onb-headline">Pick your editor.</h1>
          <p className="s2-sans onb-body onb-editor-sub">Each contributes from a different corner of the industry. You can swap any time from Settings.</p>
          <div className="onb-persona-list">
            {PERSONAS.map(p => {
              const active = picked.id === p.id;
              return (
                <button
                  key={p.id}
                  className={`onb-persona-row${active ? ' active' : ''}`}
                  onClick={() => setBriefVoice(p.id)}
                  aria-pressed={active}
                >
                  <div className="onb-persona-avatar" data-persona={p.id} aria-hidden="true">
                    <span>{p.initial}</span>
                  </div>
                  <div className="onb-persona-copy">
                    <div className="s2-serif onb-persona-name">{p.name}</div>
                    <div className="s2-mono onb-persona-title">{p.title} · {p.publication}</div>
                    <div className="s2-sans onb-persona-short">{p.short}</div>
                  </div>
                  {active && <span className="onb-persona-check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={() => setStep('primer')}>File for {picked.name.split(' ')[0]}</button>
        </div>
      </div>
    );
  }

  if (step === 'primer') {
    return (
      <div className="onb-screen onb-primer">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">A note on permissions</div>
          <h1 className="s2-serif onb-headline">We'll ask when it matters.</h1>
          <ul className="onb-primer-list">
            <li>
              <div className="s2-mono onb-primer-label">Location</div>
              <div className="s2-sans onb-primer-sub">Weather and light inform your brief. Asked at first compose.</div>
            </li>
            <li>
              <div className="s2-mono onb-primer-label">Notifications</div>
              <div className="s2-sans onb-primer-sub">One ping at 8pm when your editor's note is in. Asked after your first filed frame.</div>
            </li>
            <li>
              <div className="s2-mono onb-primer-label">Camera</div>
              <div className="s2-sans onb-primer-sub">Only when you tap to shoot.</div>
            </li>
          </ul>
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={onDone}>Got it</button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Act 1 intro (zoom-out) ────────────────────────────────────────
// A 6×6 grid of placeholder tiles, staggered drop-in, overlaid with
// the wordmark, tagline, and Begin button. Tile order is a reproducible
// shuffle so the reveal feels composed rather than sequential. Delay
// follows (rank/n)^0.55 so early tiles are spaced and later tiles stack.
const POP_TILES = new Set([4, 11, 22, 29]);
const HERO_IDX = 14;

const ZOOM_ORDER = (() => {
  const arr = Array.from({ length: 36 }, (_, i) => i);
  for (let k = 0; k < arr.length; k++) {
    const j = Math.abs(Math.round(Math.sin((k + 1) * 12.9898) * 10000)) % arr.length;
    const t = arr[k]; arr[k] = arr[j]; arr[j] = t;
  }
  return arr; // arr[rank] = tileIdx
})();
const ZOOM_RANK = ZOOM_ORDER.reduce((acc, tileIdx, rank) => { acc[tileIdx] = rank; return acc; }, {});

const zoomStart = (i) => {
  const rank = ZOOM_RANK[i];
  const n = 35;
  const total = 3400;
  const delay = Math.round(total * Math.pow(rank / n, 0.55));
  const rot = ((Math.sin(i * 1.91) * 7) | 0); // -7..7 deg, deterministic
  return { '--idx': i, '--delay': `${delay}ms`, '--fall-rot': `${rot}deg` };
};

function IntroGrid({ onBegin }) {
  return (
    <div className="onb-screen onb-intro onb-intro--zoom">
      <div className="onb-grid onb-grid--zoom" aria-hidden="true">
        {Array.from({ length: 36 }).map((_, i) => (
          <div
            key={i}
            className={`onb-tile${i === HERO_IDX ? ' onb-tile-hero' : ''}${POP_TILES.has(i) ? ' onb-tile-pop' : ''}`}
            data-variant={i % 6}
            data-idx={i}
            style={zoomStart(i)}
          />
        ))}
      </div>
      <div className="onb-intro-overlay">
        <div className="onb-intro-mark">
          <ScoutWordmark size={56} color="#FFFDFA" ruleColor="#007C04" gap={44} />
        </div>
        <div className="onb-intro-tag">A daily practice in looking.</div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={onBegin}>Begin</button>
        </div>
      </div>
    </div>
  );
}
