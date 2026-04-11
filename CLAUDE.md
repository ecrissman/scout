# Sightful / Scout — Project Context for Claude

## What This App Is

A photo-a-day time-lapse PWA. One photo per day. Over time it builds a personal visual record and time-lapse reel. Part habit app, part journal, part creative practice tool.

- **Live URL:** sightful.pages.dev
- **App name in UI:** Sightful (current) → Scout (planned rebrand, not yet implemented)
- **PWA manifest name:** Sightful

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 |
| Styling | Inline CSS string in `src/App.jsx` (see below) |
| Auth | Supabase (cookie-based) |
| Storage | Cloudflare R2 (photo originals + thumbnails) |
| Backend | Cloudflare Workers (`/functions/`) |
| Database | Supabase |
| AI | Anthropic API — captions, prompts, feedback, tagging |
| Deployment | Cloudflare Pages (`npm run deploy` → `wrangler pages deploy dist/`) |
| PWA | Service worker + manifest + icons in `/public/` |

---

## Architecture

### Single-Component App

Everything lives in `src/App.jsx` (~1,700 lines). There are no sub-components, no routing library. Navigation is **entirely state-based** — screens swap in/out via React state variables.

### CSS Architecture

All CSS is a single template literal string `const CSS` at the top of `App.jsx` (lines 7–357), injected into `<head>` via a `<style>` tag. No CSS Modules, no Tailwind, no preprocessors.

To edit styles: edit the `CSS` string directly in `App.jsx`.

### Supporting Files

| File | Purpose |
|------|---------|
| `src/api.js` | Fetch wrapper — all API calls (photo CRUD, AI features, auth) |
| `src/exif.js` | EXIF extraction, image compression, thumbnail generation |
| `src/skills.js` | Photography tips/skills data |
| `src/supabase.js` | Supabase client init |
| `index.html` | Entry HTML, base CSS reset, PWA meta tags |
| `public/manifest.json` | PWA manifest |
| `public/sw.js` | Service worker |
| `functions/` | Cloudflare Worker serverless functions |

---

## Current Design System (V1 — Sightful)

**Archived at:** `design-archive/sightful-v1.css`

### Tokens

```css
/* Light mode */
--bg: #FFFFFF
--bg-secondary: #F5F5F5
--surface: #EBEBEB
--border: rgba(0,0,0,0.10)
--text: #1C1C1C
--text-2: #505050
--text-3: #AEAEB2
--accent: #E06C00          /* Orange — active states, CTAs, today indicator */
--accent-fg: #FFFFFF

/* Dark mode */
--bg: #000000
--bg-secondary: #1C1C1E
--surface: #1C1C1E
--border: rgba(255,255,255,0.10)
--text: #FFFFFF
--text-2: rgba(235,235,245,0.60)
--text-3: rgba(235,235,245,0.30)
```

### Typography

Single font: **DM Sans** (300, 400, 500, 600) — loaded from Google Fonts.
No display font. All font variables (`--brand`, `--serif`, `--sans`) point to DM Sans.

### Theme

Light/dark toggle. Stored in `localStorage` as `still-theme-pref` ('light' | 'dark' | 'system').
Applied via `data-theme` attribute on root element.

---

## Planned Rebrand (Scout — NOT YET IMPLEMENTED)

Full brief: `SCOUT_CREATIVE_BRIEF.md`
Mockup reference: `scout-mockup.html`

### Summary of Direction

Modern photo app with the typographic warmth of 1950s advertising. Handmade letterforms, bold color moments, confident white space.

### Scout Token System

```css
--terracotta: #C4622D   /* Splash · Streak counter · Active state · CTA */
--sage:       #4A6741   /* Prompt strips · Empty states · Day One screen */
--sky:        #5B8FA8   /* Milestone screens · Streak celebrations */
--paper:      #F5F1EB   /* Primary background */
--ink:        #1C1916   /* All text · Borders · Nav · Icons */
--warm-mid:   #8C857C   /* Secondary text · Section labels · Timestamps */
--rule:       rgba(28,25,22,0.1)   /* Dividers · Card borders */
```

### Scout Typography

| Role | Font | Details |
|------|------|---------|
| Wordmark / Display | **Taylor Penton — Birdie or Wingman** | Purchase at taylorpenton.com (~$25). Heavy weight only. |
| UI / Body | **DM Sans** | 300, 400, 500. All interface text. |

### Scout Color Rules

- Most of the app is ink on paper
- Color only at specific, meaningful moments (splash, streak counter, active thumb, prompt strip, milestones)
- Color **never** on nav or interactive chrome
- Grain texture on all full-color background blocks (terracotta, sage, sky) — NOT on paper

### Implementation Priority (when ready)

1. CSS token swap (`:root` variables)
2. Taylor font integration (`@font-face`, self-host in `/public/fonts/`)
3. Splash + onboarding
4. Home screen (most used)
5. Milestone / celebration screens
6. Empty states (Day One)
7. Calendar, year view, settings

### Open Decisions Before Implementing Scout

- [ ] Taylor font purchased? Which — Birdie or Wingman?
- [ ] Confirm app name: Scout (update manifest, title, all UI strings)
- [ ] Dark mode: sunset it, or design a Scout-compatible dark system?

---

## Key Screen Inventory

| Screen | Trigger | Notes |
|--------|---------|-------|
| Splash | On load | `splashDone`, `splashFading` state |
| Onboarding | First launch | 3 steps, `onboardingStep` (1\|2\|3) |
| Login | Not authed | `authed` state, Supabase auth |
| TODAY tab | Default / `activeTab='today'` | Day detail. Landing screen. Swipe L/R = navigate days. |
| MONTH tab | `activeTab='month'` (mobile only) | Scrollable all-months calendar. Anchors to current month. |
| Day detail | Always in TODAY tab | `sel` = selected date key. Defaults to `todayStr`. |
| Photo upload | Empty day, tap area | Hidden `fileRef` input (library). `cameraRef` input (camera, `capture="environment"`). |
| Lightbox | Photo tap | `lightboxOpen` |
| Week review | 7-day complete chip | `weekReview` state |
| Settings sheet | Settings button | `settingsOpen` |

---

## Responsive Breakpoints

```css
/* Mobile < 640px: tab-based. TODAY tab = day detail full screen. MONTH tab = calendar full screen. */
/* 640px+: sidebar (272px, always visible) + main panel side-by-side. No tab bar. */
/* 1024px+: sidebar widens to 300px */
```

Mobile nav: fixed bottom tab bar (`.pj-bottom-nav`) — TODAY / MONTH  
Desktop nav: none needed — both panels always visible  
Tab state: `activeTab` ('today'|'month'). Layout class `.month-active` shows sidebar, hides main on mobile.

---

## CSS Class Naming Conventions

| Prefix | Area |
|--------|------|
| `.ob-*` | Onboarding |
| `.pj-*` | Main layout (topbar, sidebar, nav) |
| `.cal-*`, `.cc`, `.cn` | Calendar grid |
| `.yr-*`, `.yg`, `.yc` | Year view |
| `.dv-*` | Day detail view |
| `.cap-*` | Caption editor |
| `.exif-*` | EXIF metadata display |
| `.review-*` | Week review modal |
| `.tips-*` | Tips sheet |
| `.settings-*` | Settings sheet |
| `.week-*` | Week strip + chip |
| `.shoot-*` | Shoot prompt card |
| `.feedback-*` | AI feedback card |
| `.ob-*` | Onboarding screens |
| `.lb-*` | Lightbox |

---

## AI Features (Anthropic API)

All gated by `aiEnabled` toggle in settings (stored in `localStorage` as `'still-ai'`).

| Feature | API Call | Where |
|---------|----------|-------|
| Caption suggestion | `getCaptionSuggestion()` | Day detail |
| Photo feedback | `getFeedback()` | Day detail |
| Today's shoot prompt | `getTodayPrompt()` | Calendar sidebar |
| Weekly theme | `getTheme()` | Calendar sidebar |

---

## Environment Variables

```
VITE_SUPABASE_URL         Supabase project URL
VITE_SUPABASE_ANON_KEY    Supabase anon key
```

Worker-side secrets configured via Cloudflare dashboard / wrangler secrets.

---

## Common Commands

```bash
npm run dev       # Local dev server
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to Cloudflare Pages
```

---

## Design Files

| File | Purpose |
|------|---------|
| `SCOUT_CREATIVE_BRIEF.md` | Full Scout rebrand brief — typography, color, screen specs, rules |
| `scout-mockup.html` | Static HTML mockup of all Scout screens (open in browser to preview) |
| `design-archive/sightful-v1.css` | Full V1 design system, archived before Scout rebrand |
