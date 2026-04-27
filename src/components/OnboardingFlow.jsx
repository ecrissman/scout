import { useState, useRef, useEffect } from 'react';
import ScoutWordmark from '../ScoutWordmark.jsx';
import { PERSONAS } from '../personas';

// First-run flow. Three screens:
//   intro → masthead (carousel) → terms → onDone
// The masthead carousel folds the former "edition cycle" screen into each
// persona card — swiping through the editors *is* the cycle preview, since
// each card shows that editor's brief + filed + editor's note in their
// own voice. Auth happens after onDone.
export default function OnboardingFlow({ onDone, briefVoice, setBriefVoice }) {
  const [step, setStep] = useState('intro');

  if (step === 'intro') {
    return <IntroGrid onBegin={() => setStep('masthead')} />;
  }
  if (step === 'masthead') {
    return (
      <MastheadCarousel
        briefVoice={briefVoice}
        setBriefVoice={setBriefVoice}
        onNext={() => setStep('terms')}
      />
    );
  }
  if (step === 'terms') {
    return <TermsScreen onDone={onDone} />;
  }
  return null;
}

// ── Masthead carousel ─────────────────────────────────────────────
// Horizontal snap-scroller, one editor per card. Active editor is whichever
// card is currently centered in the viewport (derived from scrollLeft, no
// separate selection state). Sticky CTA at the bottom always commits the
// centered editor: "Begin with [first name]".
function MastheadCarousel({ briefVoice, setBriefVoice, onNext }) {
  const scrollRef = useRef(null);
  const initialIdx = Math.max(0, PERSONAS.findIndex(p => p.id === briefVoice));
  const [activeIdx, setActiveIdx] = useState(initialIdx);

  // Land returning users on their existing pick. Instant scroll so the
  // carousel doesn't animate from #0 on every entry.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[initialIdx];
    if (card) el.scrollLeft = card.offsetLeft;
  }, [initialIdx]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (!w) return;
    const idx = Math.round(el.scrollLeft / w);
    if (idx !== activeIdx && idx >= 0 && idx < PERSONAS.length) {
      setActiveIdx(idx);
    }
  };

  const goToIdx = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[i];
    if (card) el.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
  };

  const active = PERSONAS[activeIdx];
  const firstName = active.name.split(' ')[0];

  const begin = () => {
    setBriefVoice(active.id);
    onNext();
  };

  return (
    <div className="onb-screen onb-masthead">
      <div className="onb-masthead-head">
        <div className="s2-mono onb-eyebrow">The masthead</div>
        <h1 className="s2-serif onb-headline">Pick your editor.</h1>
      </div>
      <div className="onb-carousel" ref={scrollRef} onScroll={onScroll}>
        {PERSONAS.map((p) => (
          <article key={p.id} className="onb-card">
            <div className="onb-card-portrait" aria-hidden="true">
              <img src={p.portrait} alt="" loading="lazy" />
            </div>
            <div className="onb-card-role">{p.title} · {p.publication}</div>
            <div className="s2-serif onb-card-name">{p.name}</div>
            <div className="onb-card-cycle">
              <div className="onb-card-block">
                <div className="onb-card-dateline">Brief · 06:00</div>
                <div className="s2-serif onb-card-brief">&ldquo;{p.sampleBrief}&rdquo;</div>
              </div>
              <div className="onb-card-stamp">
                <span className="s2-stamp-filed">Filed</span>
              </div>
              <div className="onb-card-block">
                <div className="onb-card-dateline">Editor&rsquo;s note · 20:00</div>
                <div className="s2-sans onb-card-note">&ldquo;{p.sampleNote}&rdquo;</div>
                <div className="onb-card-sig">{p.signatureDisplay}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="onb-pager" role="tablist" aria-label="Editors">
        {PERSONAS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`onb-pager-dot${i === activeIdx ? ' active' : ''}`}
            onClick={() => goToIdx(i)}
            aria-label={`Show ${p.name}`}
            aria-selected={i === activeIdx}
            role="tab"
          />
        ))}
      </div>
      <div className="onb-switch-line">You can switch any time.</div>
      <div className="onb-cta">
        <button className="s2-btn-primary" onClick={begin}>Begin with {firstName}</button>
      </div>
    </div>
  );
}

// ── Terms ─────────────────────────────────────────────────────────
// Two items only — "Honest" was implied by having an editor at all, and
// the permissions line was retired (each permission asks itself in
// context when it's first needed).
function TermsScreen({ onDone }) {
  return (
    <div className="onb-screen onb-deal">
      <div className="onb-pitch-body">
        <div className="s2-mono onb-eyebrow">The terms</div>
        <h1 className="s2-serif onb-headline">What you&rsquo;re agreeing to.</h1>
        <ul className="onb-primer-list">
          <li>
            <div className="s2-mono onb-primer-label">Daily</div>
            <div className="s2-sans onb-primer-sub">One brief, one frame, one note. Miss a day, the paper notices.</div>
          </li>
          <li>
            <div className="s2-mono onb-primer-label">Private</div>
            <div className="s2-sans onb-primer-sub">Your work stays yours. Off the record.</div>
          </li>
        </ul>
      </div>
      <div className="onb-cta">
        <button className="s2-btn-primary" onClick={onDone}>Begin</button>
      </div>
    </div>
  );
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
        <div className="onb-intro-tag">The beat is yours.</div>
        <div className="onb-cta">
          <button className="s2-btn-primary" onClick={onBegin}>Step inside</button>
        </div>
      </div>
    </div>
  );
}
