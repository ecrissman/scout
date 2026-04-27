import { useState } from 'react';
import ScoutWordmark from '../ScoutWordmark.jsx';
import { PERSONAS } from '../personas';

// First-run flow. Runs before auth on first launch. State machine:
//   intro → editor → cycle → deal → onDone
// The masthead leads (screen 2) so the cycle pane (screen 3) can render in
// the chosen editor's voice — meeting their editor doing real work is the
// payload, not the mechanic. Auth happens after onDone. Act 5 (first-brief
// pulse) lives in the main app, gated separately.
export default function OnboardingFlow({ onDone, briefVoice, setBriefVoice }) {
  const [step, setStep] = useState('intro');

  if (step === 'intro') {
    return <IntroGrid onBegin={() => setStep('editor')} />;
  }

  if (step === 'editor') {
    const picked = PERSONAS.find(p => p.id === briefVoice) || PERSONAS[0];
    return (
      <div className="onb-screen onb-editor">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">The masthead</div>
          <h1 className="s2-serif onb-headline">Three editors. Pick yours.</h1>
          <p className="s2-sans onb-body onb-editor-sub">Each comes from a different corner of the industry. You can request a transfer any time.</p>
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
                  <div className="onb-persona-portrait" aria-hidden="true">
                    <img src={p.portrait} alt="" loading="lazy" />
                  </div>
                  <div className="onb-persona-copy">
                    <div className="s2-mono onb-persona-role">{p.title}</div>
                    <div className="s2-serif onb-persona-name">{p.name}</div>
                    <div className="s2-mono onb-persona-pub">{p.publication}</div>
                    <div className="s2-serif onb-persona-sample">"{p.sample}"</div>
                  </div>
                  {active && <span className="onb-persona-stamp" aria-hidden="true">Your desk</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={() => setStep('cycle')}>File for {picked.name.split(' ')[0]}</button>
        </div>
      </div>
    );
  }

  if (step === 'cycle') {
    const picked = PERSONAS.find(p => p.id === briefVoice) || PERSONAS[0];
    return (
      <div className="onb-screen onb-cycle">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">The edition cycle</div>
          <h1 className="s2-serif onb-headline">How a day runs.</h1>
          <div className="onb-sample">
            <div className="s2-mono onb-sample-dateline">BRIEF · 06:00</div>
            <div className="s2-serif onb-sample-quote">{picked.sampleBrief}</div>
          </div>
          <div className="onb-cycle-stamp">
            <span className="s2-stamp-filed">Filed</span>
          </div>
          <div className="onb-sample">
            <div className="s2-mono onb-sample-dateline">EDITOR'S NOTE · 20:00</div>
            <div className="s2-sans onb-sample-note">{picked.sampleNote}</div>
            <div className="s2-mono onb-cycle-sig">{picked.signatureDisplay}</div>
          </div>
          <p className="s2-sans onb-body onb-cycle-caption">Brief out. One frame. Note back at 8.</p>
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={() => setStep('deal')}>One more thing</button>
        </div>
      </div>
    );
  }

  if (step === 'deal') {
    return (
      <div className="onb-screen onb-deal">
        <div className="onb-pitch-body">
          <div className="s2-mono onb-eyebrow">The terms</div>
          <h1 className="s2-serif onb-headline">What you're agreeing to.</h1>
          <ul className="onb-primer-list">
            <li>
              <div className="s2-mono onb-primer-label">Daily</div>
              <div className="s2-sans onb-primer-sub">One brief, one frame, one note. Miss a day, the paper notices.</div>
            </li>
            <li>
              <div className="s2-mono onb-primer-label">Honest</div>
              <div className="s2-sans onb-primer-sub">The editor won't flatter you. They'll make you better.</div>
            </li>
            <li>
              <div className="s2-mono onb-primer-label">Private</div>
              <div className="s2-sans onb-primer-sub">Your work is yours. Off the record.</div>
            </li>
          </ul>
          <p className="s2-sans onb-deal-perms">Location, notifications, camera — asked when each one matters.</p>
        </div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={onDone}>Begin</button>
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
        <div className="onb-intro-tag">Founded 1961. Still filing.</div>
        <div className="onb-intro-dateline">Est. 1961 · West 22nd St · NY</div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={onBegin}>Step inside</button>
        </div>
      </div>
    </div>
  );
}
