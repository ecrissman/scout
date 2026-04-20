import { useState } from 'react';
import ScoutWordmark from '../ScoutWordmark.jsx';

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
export default function OnboardingFlow({ onDone }) {
  const [step, setStep] = useState('intro');
  const [pitchIdx, setPitchIdx] = useState(0);

  if (step === 'intro') {
    return (
      <div className="onb-screen onb-intro">
        <div className="onb-intro-mark">
          <ScoutWordmark size={56} color="var(--s2-text-primary)" ruleColor="var(--s2-press-green)" gap={44} />
        </div>
        <div className="onb-intro-tag">A daily practice in looking.</div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={() => setStep('pitch')}>Begin</button>
        </div>
      </div>
    );
  }

  if (step === 'pitch') {
    const pane = PITCH_PANES[pitchIdx];
    const last = pitchIdx === PITCH_PANES.length - 1;
    const advance = () => last ? setStep('primer') : setPitchIdx(i => i + 1);
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
