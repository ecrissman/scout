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
    short: 'Direct. Specific. Dry.',
    signatureDisplay: 'Novak —',
  },
  {
    id: 'rob',
    name: 'Rob Calder',
    title: 'Contributing Editor',
    publication: 'small photo zine, Providence',
    initial: 'R',
    short: 'Warm. Curious. Indie.',
    signatureDisplay: '— rob',
  },
  {
    id: 'walsh',
    name: 'Eileen Walsh',
    title: 'Editor at Large',
    publication: 'photography quarterly',
    initial: 'E',
    short: 'Spare. Considered. Silent.',
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
