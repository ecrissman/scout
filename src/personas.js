// Scout masthead — frontend persona data.
//
// Source of truth for voice: /docs/personas/UNIVERSE.md + /docs/personas/MATRIX.md.
// Backend twin: /functions/api/_personas.js (system prompts + signatures).
//
// The three personas are contributing editors on Scout's masthead. This
// module holds display metadata (for onboarding + settings cards) and the
// signature-parsing helpers (for rendering the sign-off as a separate line).

export const PERSONAS = [
  {
    id: 'editor',
    name: 'Stan Novak',
    title: 'Editor',
    publication: 'Chicago Sun-Times, retired',
    initial: 'N',
    portrait: '/personas/novak.png',
    short: 'Direct. Specific. Dry.',
    sample: 'Light\u2019s doing the work. Frame could\u2019ve asked more of the subject.',
    sampleBrief: 'Something in your kitchen is performing. Find the audience. Twelve minutes.',
    sampleNote: 'Looked at it. Shadow’s doing more than the subject. Bottom third is dead weight. Frame tighter next.',
    signatureDisplay: 'Novak —',
  },
  {
    id: 'rob',
    name: 'Rob Calder',
    title: 'Contributing Editor',
    publication: 'small photo zine, Providence',
    initial: 'R',
    portrait: '/personas/calder.png',
    short: 'Warm. Curious. Indie.',
    sample: 'subject\u2019s clean, light supports it. curious what the background could do.',
    sampleBrief: 'something small you’ve walked past a hundred times. ten minutes.',
    sampleNote: 'this keeps unfolding. light on the left is doing real work. push the background?',
    signatureDisplay: '— rob',
  },
  {
    id: 'walsh',
    name: 'Eileen Walsh',
    title: 'Editor at Large',
    publication: 'photography quarterly',
    initial: 'E',
    portrait: '/personas/walsh.png',
    short: 'Spare. Considered. Silent.',
    sample: 'the frame rests. received.',
    sampleBrief: 'What is in the room. Then what is also there.',
    sampleNote: 'second shape. quieter than the first. listens longer.',
    signatureDisplay: '— e.w.',
  },
];

// ── Legacy ID migration ─────────────────────────────────────────────────────

const LEGACY_IDS = new Set(['current', 'assignment', 'columnist']);
const VALID_IDS = new Set(PERSONAS.map(p => p.id));

// Called on app load. Folds the retired persona IDs into 'editor' (Novak).
// Returns the canonical ID and writes it back to localStorage so migration
// happens once.
export function migrateVoiceId() {
  if (typeof localStorage === 'undefined') return 'editor';
  const current = localStorage.getItem('scout-brief-voice');
  if (!current || LEGACY_IDS.has(current) || !VALID_IDS.has(current)) {
    localStorage.setItem('scout-brief-voice', 'editor');
    return 'editor';
  }
  return current;
}

// ── Signature parsing ───────────────────────────────────────────────────────

// Each persona has a unique sign-off pattern. Novak signs at the end with
// "Novak —" (name-first, em-dash after). Rob and Walsh sign "— X" in the
// traditional byline order. We also keep a few legacy patterns so old
// filed briefs render correctly in the archive.
const SIGNATURE_MATCHERS = [
  // Current masthead
  { match: /\s*\n?\s*Novak\s*[–—-]?\s*\.?\s*$/i,          display: 'Novak —' },
  { match: /\s*\n?\s*[–—-]\s*rob\s*\.?\s*$/i,             display: '— rob' },
  { match: /\s*\n?\s*[–—-]\s*e\.?\s*w\.?\s*\.?\s*$/i,     display: '— e.w.' },
  // Legacy sign-offs from the prior persona system (for archived briefs)
  { match: /\s*\n?\s*[–—-]\s*The Editor\s*\.?\s*$/i,      display: '— The Editor' },
  { match: /\s*\n?\s*[–—-]\s*Dispatch\s*\.?\s*$/i,        display: '— Dispatch' },
  { match: /\s*\n?\s*[–—-]\s*The Romantic\s*\.?\s*$/i,    display: '— The Romantic' },
  { match: /\s*\n?\s*[–—-]\s*The Detective\s*\.?\s*$/i,   display: '— The Detective' },
  { match: /\s*\n?\s*[–—-]\s*The Smart-Aleck\s*\.?\s*$/i, display: '— The Smart-Aleck' },
  { match: /\s*\n?\s*[–—-]\s*The Documentarian\s*\.?\s*$/i, display: '— The Documentarian' },
  { match: /\s*\n?\s*[–—-]\s*The Kid\s*\.?\s*$/i,         display: '— The Kid' },
];

export function splitBrief(text) {
  if (!text) return { body: '', signature: '' };
  for (const { match, display } of SIGNATURE_MATCHERS) {
    if (match.test(text)) {
      return { body: text.replace(match, '').trimEnd(), signature: display };
    }
  }
  return { body: text, signature: '' };
}
