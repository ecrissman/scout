# Scout — Creative Brief
**Version 1.0 · April 2026**  
**For:** Claude Code implementation  
**Status:** Design direction approved, ready for UI build

---

## What Is Scout

Scout is a photo-a-day time-lapse app. You shoot one photo every day. Over time, Scout compiles them into a personal visual record and time-lapse reel. It's a habit app, a journal, and a creative practice tool — in that order.

The current build (deployed at `sightful.pages.dev`) has solid structure and functionality. This brief covers the **visual redesign only** — not new features.

---

## The Problem with the Current UI

It feels clinical. Too polished. Generic. The app could be any modern SaaS product. It has no personality, no point of view, no sense that a human made it. The redesign fixes this with restraint, not decoration — through typography and color, not ornament.

---

## Design Direction

### The One-Sentence Brief
A modern photo app with the typographic warmth of 1950s advertising — handmade letterforms, bold color moments, and a lot of confident white space.

### References
- **Birdie typeface specimen** (taylorpenton.com) — the terracotta splash card with heavy all-caps type is the mood
- **Whirly Birdie specimen** — multi-color type on cream, bold and playful, shows how color can live in type not just backgrounds
- **Leica, Fujifilm, VSCO, Moment app** — modern photo tools that respect the craft
- **Field notebooks, vintage darkroom signage** — analog warmth, utility without fussiness

### What This Is Not
- Not a vintage/retro app — it's a *modern* app with a handmade nod
- Not maximalist — color is used sparingly and purposefully
- Not over-textured — grain is subtle, almost imperceptible
- Not decorative — no hand-drawn SVG dividers, no stamp borders, no drop shadows on cards

---

## Typography

### Fonts

| Role | Font | Notes |
|------|------|-------|
| Wordmark / Display | **Taylor Penton — Birdie or Wingman** | Purchase at taylorpenton.com (~$25). All-caps, heavy weight only. Used for wordmark, splash, milestone numbers, section headers. This font carries the entire personality of the brand. |
| UI / Body | **DM Sans** | 300 (light), 400 (regular), 500 (medium). Available on Google Fonts. Handles all interface text, captions, labels, buttons. |

**Do not substitute the Taylor font with any system font.** The handmade quality of the letterforms is the design. DM Sans alone makes the app look like everything else.

### Type Scale

```
Wordmark (splash):     82px  700  Taylor font  all-caps  tracking: -1px
Wordmark (nav):        26px  700  Taylor font  all-caps
Milestone number:     120px  700  Taylor font  tracking: -3px
Section headline:      36px  700  Taylor font
Section label:          9px  400  DM Sans      all-caps  tracking: 3px
Body / captions:       12px  300  DM Sans      italic for quotes/captions
Nav items:              9px  500  DM Sans      all-caps  tracking: 2.5px
```

### Type Rules
- Section labels are always `9px / all-caps / letter-spacing: 3px / DM Sans 400` in `--warm-mid`
- Quotes and photo captions are always `DM Sans 300 italic`
- Milestone numbers and wordmark are always Taylor font, never DM Sans
- No decorative type treatments — size and weight contrast does the work

---

## Color System

```
--terracotta:  #C4622D   Splash · Streak counter · Active state · CTA
--sage:        #4A6741   Prompt strips · Empty states · Day One screen
--sky:         #5B8FA8   Milestone screens · Streak celebrations
--paper:       #F5F1EB   Primary background (warm white, not pure #FFF)
--ink:         #1C1916   All text · Borders · Nav · Icons (warm near-black, not #000)
--warm-mid:    #8C857C   Secondary text · Section labels · Timestamps
--rule:        rgba(28,25,22,0.1)   Dividers · Card borders
```

### Color Rules

**Most of the app is ink on paper.** Color only appears at specific, meaningful moments:

| Color | Where it lives |
|-------|---------------|
| Terracotta | Splash screen background · Streak counter text · Active photo thumb border · Primary CTA button |
| Sage | Prompt strip on home screen · Day One / empty state screen background |
| Sky | Milestone / streak celebration screen background |
| Paper | All primary screen backgrounds |

Color never appears on interactive chrome (nav, buttons in regular states). It is reserved for content moments and full-bleed screens. This is what gives it impact.

### Grain Texture
Apply a subtle SVG fractalNoise grain to all full-color background blocks (terracotta, sage, sky). Parameters:

```css
background-image: url("data:image/svg+xml,
  <svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>
    <filter id='g'>
      <feTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/>
      <feColorMatrix type='saturate' values='0'/>
    </filter>
    <rect width='300' height='300' filter='url(%23g)' opacity='0.12'/>
  </svg>");
background-size: 300px 300px;
mix-blend-mode: multiply;
```

**Do not apply grain to the paper background.** Only colored blocks get grain.

---

## Screen Specifications

### Splash Screen
- Full-bleed terracotta background with grain
- Small eyebrow: `"A daily practice"` — 10px / all-caps / tracking: 5px / DM Sans / ink at 45% opacity
- Wordmark: `SCOUT` — 82px / Taylor font / ink color
- 32px horizontal rule — ink at 25% opacity
- Tagline: `"One frame. Every day."` — 11px / all-caps / tracking: 4px / DM Sans / ink at 50% opacity

### Home Screen
- Paper background
- Status bar standard
- Header: wordmark left-aligned, date + streak right-aligned. Separated from content by 1px rule (`--rule`).
- Streak counter in `--terracotta`
- `"Today"` section label
- Full-width photo card — no border radius, no drop shadow, no frame. Just the image.
- Photo caption: DM Sans 300 italic, white at 90% opacity, bottom-left of image
- Prompt strip: full-bleed `--sage` block with grain. Label + italic prompt text.
- Week thumbnail strip: square crops, 5px gap, active thumb outlined in `--terracotta` 2px
- Bottom nav: `Grid` · camera button (ink circle, 40px) · `Reel` — all-caps DM Sans, ink/warm-mid

### Milestone Screen
- Full-bleed `--sky` background with grain
- Eyebrow: `"You've reached"` — small / all-caps / ink at 40% opacity
- Number: `100` (or current count) — 120px / Taylor font / ink
- Unit: `"Days"` — small / all-caps / ink at 40% opacity
- 32px rule
- Message: short italic quote — DM Sans 300 italic / ink at 65% opacity

### Empty State / Day One Screen
- Full-bleed `--sage` background with grain
- Eyebrow: `"Day one"` — small / all-caps / paper at 45% opacity
- Headline: `"Start your visual record."` — 36px / Taylor font / paper
- Rule
- Sub-copy: short italic line — DM Sans 300 italic / paper at 55% opacity
- CTA button: paper background / ink text / no border radius / small all-caps label

---

## What to Avoid

| ❌ Don't | ✓ Do instead |
|----------|-------------|
| Hand-drawn SVG dividers | 1px CSS rule at `--rule` opacity |
| Decorative borders on photo cards | No border. Image edge is the frame. |
| Drop shadows on cards | Whitespace and proximity |
| Multiple font weights competing | Taylor font for display, DM Sans for everything else |
| Grain on paper/white backgrounds | Grain on colored blocks only |
| Color on nav or interactive chrome | Color on content moments only |
| Rounded corners on buttons | Square or very subtle radius (2px max) |
| Icons competing with type | Minimal icons, type does navigation labeling |

---

## Stack Context

- **Framework:** React + Vite
- **Deployment:** Cloudflare Pages
- **Backend:** Cloudflare Worker + R2 storage
- **Auth:** Cookie-based
- **AI features:** Anthropic API (photo feedback, captions, prompts, tagging, reflection) — not in scope for this visual pass

---

## Implementation Priority

1. **Token/variable setup first** — establish all CSS custom properties before touching components
2. **Wordmark / Taylor font integration** — this unlocks the personality of every screen
3. **Splash + onboarding screens** — first impression, sets the tone
4. **Home screen** — most used, most important
5. **Milestone / celebration screens** — these are the emotional peaks
6. **Empty states** — Day One and no-photo-yet states

---

## Open Questions for Eric

- [ ] Taylor font purchased? Which one — Birdie or Wingman?
- [ ] Confirm app name: Scout, or still deciding?
- [ ] Any existing design tokens / CSS variables in the codebase to preserve or replace?
- [ ] Is there a `CLAUDE.md` in the repo with additional project context?

---

*Brief compiled from design exploration sessions, April 2026.*  
*Mockup reference: `scout-mockup.html` (generated, available in outputs)*
