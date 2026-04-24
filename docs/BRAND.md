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
| **Fraunces** | Display / editorial / timer value | Google Fonts, variable, italic + roman, opsz `9..144`, wght `300..600` |
| **Geist Mono** | Labels, datelines, stamps, primary button labels | Google Fonts, wght `400/500/600` |
| **SF Pro** (system) | UI, body, form controls, mood pills, timer value | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ...` |

### CSS variables

```css
--s2-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
--s2-mono:  'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
--s2-sans:  -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ...;
```

> The unprefixed `--serif` is aliased to `--s2-sans` as a safety net for unmigrated v1 classes. Always use `--s2-serif` for Fraunces.

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
| Editor's Note body | Fraunces | 17 | **300** | 1.55 | -0.005em |
| Today empty headline | Fraunces | 28 | 400 | 1.15 | -0.015em |
| Timer value | SF Pro | 40 | **300** | 1 | -0.02em, tabular-nums |
| Section label | Geist Mono | 10 | 500 | — | 0.15em, UPPER |
| Dateline / dispatch | Geist Mono | 11–12 | 400–500 | — | 0.15–0.18em, UPPER |
| Stamp | Geist Mono | 10 | 500 | — | 0.15em, UPPER |
| Primary button | Geist Mono | 14 | 500 | — | 0.1em, UPPER |
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
- Geist Mono, 14px, weight 500, tracking 0.1em, UPPER.
- Radius 12px, padding 15px.
- `:active` drops opacity to 0.75.

### Pill — `.s2-mood-pill`

- Horizontal scrolling container, snap-x-mandatory, 20px gutter.
- Inactive: card tint bg, ink text.
- Active: ink bg, paper text, weight 500.

### Segmented control — `.s2-segmented`

- iOS-style. Transparent options over `rgba(120,120,128,0.12)` bg, 9px radius.
- Active option: paper fill (light) or `#3A3935` lifted fill (dark), shadow `0 3px 8px rgba(0,0,0,.08)`.

### Card — `.s2-angle-card` / `.s2-ctx-card`

- Card tint bg.
- 14px radius.
- Inline links in Geist Mono/SF Pro, press-green for primary, smoke for secondary.

### Timer card — `.s2-timer-card`

- Label in Geist Mono press-green, value in **SF Pro 300 / 40px** with tabular-nums, thin press-green progress bar.
- Expired state swaps label to ink and adds a "Dismiss" action.

### Stamps — `.s2-stamp-dispatch` / `.s2-stamp-filed`

- Small rectangles with a 1-line Geist Mono label.
- Dispatch: press-green outline, press-green label.
- Filed: ink fill, paper label.

### Editor's Note reveal — `.note-reveal`

- Full-screen paper.
- Thumb (120px, 2px radius) → Fraunces **300** body (17/1.55) → "— The Editor" signature in SF Pro.

### Today empty state — `.today-empty`

- Mono label ("NO BRIEF FILED") → Fraunces headline → sans subcopy → primary CTA.

### Tab bar — `.s2-tabbar`

- 3 tabs: Today (sun), Archive (4-grid), Calendar.
- Icons only, ink stroke.
- No color. Active state is ink opacity, not press-green.

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

- Flapjack wordmark (V1).
- Inconsolata body (V1).
- Terracotta (#D6542D), sage (#4F5E2E), gold (#E2B554) — aliased to press-green/ink/paper-2 for legacy classes but should not be used on new work.
- Grain textures.
- Week-review modal and weekly-theme pipeline.
- v1 Day One-style day-detail sheet.
