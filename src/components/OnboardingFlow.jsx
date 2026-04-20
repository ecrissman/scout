import { useState } from 'react';

// First-run flow. Runs before auth on first launch. State machine:
//   intro  → pitch (3 panes) → primer → onDone
// Acts map to the onboarding plan: Act 1 (intro/zoom-out), Act 2 (pitch
// panes), Act 3 (permission primer). Act 4 (auth) happens after onDone.
// Act 5 (first-brief pulse) lives in the main app, gated separately.
export default function OnboardingFlow({ onDone }) {
  const [step, setStep] = useState('intro');

  if (step === 'intro') {
    return (
      <div className="onb-screen" data-step="intro">
        <button className="s2-btn-primary" onClick={() => setStep('pitch')}>
          Begin
        </button>
      </div>
    );
  }

  if (step === 'pitch') {
    return (
      <div className="onb-screen" data-step="pitch">
        <button className="s2-btn-primary" onClick={() => setStep('primer')}>
          Continue
        </button>
      </div>
    );
  }

  if (step === 'primer') {
    return (
      <div className="onb-screen" data-step="primer">
        <button className="s2-btn-primary" onClick={onDone}>
          Got it
        </button>
      </div>
    );
  }

  return null;
}
