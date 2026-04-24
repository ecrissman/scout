# Scout — Brand Guide

Version: v2 (April 2026 · post Fraunces/Geist Mono brand pass)
Source of truth: `src/App.jsx` CSS

---

## 1. Principles

- **Editorial, not appy.** Scout behaves like a newspaper desk, not a social feed. Dispatch datelines, stamps, field notes.
- **Paper and ink.** Warm paper, deep ink, quiet type. Color shows up only at intentional moments.
- **Quiet confidence.** No exclamation points. No emoji. Language is terse, literary, a little dry.
- **One thing at a time.** A day is one brief, one photo, one note. Every screen should feel similarly singular.

---

## 2. Wordmark

- **Name in UI:** Scout
- **Display type:** Fraunces
- The wordmark is not stylized beyond setting it in Fraunces. No lockup, no mark, no custom glyph.

---

## 3. Color

### Paper & ink (core)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--s2-paper` | `#FFFDFA` | `#0C0C0C` | Primary surface — day detail, brief reveal |
| `--s2-paper-2` | `#F7F3EC` | `#1A1A18` | Secondary surface — legacy card bg |
| `--s2-grouped-bg` | `#F2F1EC` | `#050505` | Grouped-list bg — Compose tray, Settings |
| `--s2-ink` | `#0C0C0C` | — | Primary text / CTAs |
| `--s2-archive` | `#3A3A35` | `#B8B2A3` | Secondary text |
| `--s2-smoke` | `#8A8680` | `#7A7668` | Muted text / section labels |
| `--s2-bone` | `#D8D7D4` | `#2A2A26` | Rules, borders |

### Card tint (light/dark)

Cards on the Compose tray use a neutral **tint** rather than a pigment:

| Context | Light | Dark |
|---|---|---|
| Angle card / Context card / Mood pill | `rgba(12,12,12,0.05)` | `#22221F` |

This keeps cards visually attached to their surrounding surface instead of introducing a new hue.

### Press green (accent)

| Token | Value | Use |
|---|---|---|
| `--s2-press-green` | `#007C04` | Timer bar/label, "New Assignment" stamp, Editor's Note ready dot, active link in angle card |
| `--s2-green-50` → `--s2-green-900` | `#F2F7F0` … `#00330A` | Ramp is defined; rarely used beyond 500. Reserve for future status states. |

### System

| Token | Value | Use |
|---|---|---|
| `--s2-warn` | `#C8102E` | Errors (rare — trust the user) |
| `--s2-caution` | `#C89A7E` | Not currently used. Reserved. |

### Color rules

- Most of the app is ink on paper.
- **Press green** appears only at earned moments: an active timer, the "New Assignment" stamp, the Editor's Note ready banner. Never on nav, form chrome, or as decoration.
- No gradients. No shadows beyond the one-layer selected chip in the segmented control.
- Grain textures from the v1 era are retired.

---

## 4. Typography

### Families

| Family | Role | Loaded |
|---|---|---|
| **Fraunces** | Display / editorial / timer value | Vendored — `public/fonts/Fraunces-VariableFont_SOFT_WONK_opsz_wght.ttf` (+ italic), variable, opsz `9..144`, wght `100..900`, SOFT/WONK axes |
| **Geist Mono** | Labels, datelines, stamps | Vendored — `public/fonts/GeistMono-VariableFont_wght.ttf`, variable, wght `100..900` |
| **SF Pro** (system) | UI, body, form controls, mood pills, timer value, **primary button** | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ...` |

### CSS variables

```css
--s2-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
--s2-mono:  'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
--s2-sans:  -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ...;
```

> The unprefixed `--serif` is aliased to `--s2-sans` as a safety net for unmigrated v1 classes. Always use `--s2-serif` for Fraunces.

> **Weight 300 note:** Fraunces is now vendored as a full variable font (100–900), so weight 300 is available. Setting `font-weight:300` on an element will render at true 300 (not fall back). The Editor's Note `.note-reveal-body` rule still doesn't explicitly set weight — it inherits 400. Add `font-weight:300` there to ship the spec.

### Scale

```css
--fs-2xs: 10px;   /* Micro labels (stamps only) */
--fs-xs:  12px;   /* Meta, file-by counters */
--fs-sm:  14px;   /* Links, tip copy */
--fs-base:16px;   /* Body */
--fs-md:  18px;   /* — */
--fs-lg:  21px;   /* Section subheads (Pick the one) */
--fs-xl:  25px;   /* — */
--fs-2xl: 30px;   /* Brief body */
--fs-3xl: 36px;   /* Filed headline */
--fs-4xl: 44px;   /* Reserved */
```

Ratio is roughly **1.18**. Base is 16px.

### Weight & leading conventions

| Element | Family | Size | Weight | Leading | Tracking |
|---|---|---|---|---|---|
| Screen title (Daily Brief) | Fraunces | 32 | 500 | 1.05 | -0.02em |
| Brief body | Fraunces | 30 (2xl) | 400 | 1.2 | -0.015em |
| Filed headline | Fraunces | 36 (3xl) | 400 | 1.15 | -0.02em |
| Editor's Note body | Fraunces | 17 | 400 *(spec: 300 — see note above)* | 1.55 | -0.005em |
| Today empty headline | Fraunces | 28 | 400 | 1.15 | -0.015em |
| Timer value | SF Pro | 40 | **300** | 1 | -0.02em, tabular-nums |
| Section label | Geist Mono | 10 | 500 | — | 0.15em, UPPER |
| Dateline / dispatch | Geist Mono | 11–12 | 400–500 | — | 0.15–0.18em, UPPER |
| Dispatch stamp (`.s2-stamp-dispatch`) | Geist Mono | 9 | 500 | — | 0.25em, UPPER |
| Filed stamp (`.s2-stamp-filed`) | Geist Mono | 11 | 500 | — | 0.3em, UPPER, rotate -1.5° |
| Primary button | SF Pro | 17 | 600 | — | -0.01em, sentence case |
| Body (mood pill, sub copy) | SF Pro | 15 | 400 | 1.5 | 0 |

---

## 5. Spacing & Layout

- **Base unit:** 4px. Most values snap to multiples of 4 or 8.
- **Screen gutter:** 20px for labels, 16–28px for cards/sections. Compose form uses 20px to align section labels with the first mood pill.
- **Card radius:** 14px for Angle/Context cards. 12px for primary buttons. 10px for segmented. 999px for pills. 2px for photo containers (deliberately sharp for the photo itself).
- **Card padding:** 14–16px internal.
- **Safe area:** All fixed-position surfaces respect `env(safe-area-inset-bottom)`.

---

## 6. Components

### Primary button — `.s2-btn-primary`

- Ink fill, paper text.
- SF Pro, 17px, weight 600, tracking -0.01em, sentence case.
- Radius 12px, padding 15px.
- `:active` drops opacity to 0.75.

### Segmented control — `.s2-segmented`

- iOS-style. Transparent options over `rgba(120,120,128,0.12)` bg, 9px radius.
- Active option: paper fill (light) or lifted fill (dark), shadow `0 3px 8px rgba(0,0,0,.08)`.

### Stamps — `.s2-stamp-dispatch` / `.s2-stamp-filed`

- Dispatch: press-green outline + press-green label, small leading dot, 9px Geist Mono, 0.25em tracking, 1.5px border, 2px radius.
- Filed: press-green outline + press-green label, rotate -1.5°, 11px Geist Mono, 0.3em tracking, 2px radius. (Note: not ink-fill/paper-label — that was a v1 spec.)

### Editor's Note reveal — `.note-reveal`

- Full-screen paper.
- Dispatch stamp → dateline (11px Geist Mono, 0.18em, UPPER) → thumb (120×120, 1px border, 2px radius) → Fraunces body (17/1.55, weight 400 live, 300 spec) → signature in SF Pro 13px.

### Tab bar — `.s2-tabbar`

- Floating pill: fixed bottom-center, paper/ink bg with border and soft shadow, 999px radius.
- Icon-only buttons (`.s2-tab-btn`), 52×44 each. Active state: ink bg + paper icon.
- No press-green. Active is ink, not accent.

### Compose tray components — inline-styled in `src/compose/ComposeScreen.jsx`

These components ship as live UI in the Compose tray but are **not implemented as named CSS classes**. They're built from inline styles plus the generic utility classes (`.s2-btn-primary`, `.s2-stamp-*`, `.s2-serif`, `.s2-mono`, `.s2-sans`, `.s2-page-header`, `.s2-spinner`, `.s2-icon-btn`, `.s2-typewriter-caret`). The visual spec below is the intent; edit `ComposeScreen.jsx` to change it.

- **Mood pill** — horizontal scrolling row, snap-x-mandatory, 20px gutter. Inactive: card tint bg, ink text. Active: ink bg, paper text, weight 500.
- **Angle card / Context card** — card tint bg, 14px radius. Inline links in Geist Mono / SF Pro; press-green for primary action, smoke for secondary.
- **Timer card** — label in Geist Mono press-green; value in SF Pro 300 / 40px with tabular-nums; thin press-green progress bar. Expired state swaps label to ink and adds a "Dismiss" action.
- **Today empty state** — mono label ("NO BRIEF FILED" or similar) → Fraunces headline → sans subcopy → primary CTA.

If these are ever extracted into named CSS rules, reasonable class names would be `.s2-mood-pill`, `.s2-angle-card`, `.s2-ctx-card`, `.s2-timer-card`, `.today-empty` — none currently exist in the codebase.

---

## 7. Motion

- **Tray entry:** `sheetSlideUp` 380ms `cubic-bezier(0.32, 0.72, 0, 1)`.
- **Page push:** `pagePushIn` 320ms same curve.
- **Typewriter reveal:** brief body chars at 42ms/char; editor's note at 28ms/char.
- **Button tap:** opacity 0.75, 150ms.
- **No spring physics, no stagger, no bounce.** Scout moves like a well-oiled desk drawer.

---

## 8. Voice

- **Editorial, field-journal, terse.** 4–15 words. Fragments with periods.
- **Never use:** "photo", "photograph", "picture", "shoot", "capture". The photography is implied.
- **Vocabulary to favor:** light, edge, quiet, weight, seam, margin, shadow, texture, shape, breath, line.
- **Never:** exclamation points, emoji, imperative "Snap it!" language.

Examples:
- Brief: "Edge light only."
- Empty state: "Today's brief is waiting."
- Timer expired: "File your take — or let it go."
- Filed: "Your take is in."
- Editor sig: "— The Editor"

---

## 9. Theming

- Stored as `scout-theme-pref` in localStorage (`light` | `dark` | `system`).
- Applied via `data-theme` attribute on `<html>`.
- All tokens have dark equivalents. Press green (`#007C04`) holds in both modes.

---

## 10. Iconography

- Stroke style, 1.75px, round caps and joins.
- 24×24 viewBox, rendered at 22×22.
- Ink color, never accent.
- Tab icons: sun (Today), 4-grid (Archive), month (Calendar).

---

## 11. What's retired

- Flapjack wordmark (v1).
- Inconsolata body (v1).
- Terracotta (`#D6542D`), sage (`#4F5E2E`), gold (`#E2B554`) — aliased via `--terracotta`, `--sage`, `--gold` to press-green/ink/paper-2 for legacy classes. Should not be used on new work.
- Grain textures.
- Week-review modal and weekly-theme pipeline.
- v1 Day One-style day-detail sheet.

