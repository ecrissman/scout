# Scout — Project Context for Claude

## What This App Is

A photo-a-day time-lapse PWA. One photo per day. Over time it builds a personal visual record and time-lapse reel. Part habit app, part journal, part creative practice tool.

- **Live URL:** sightful.pages.dev (Cloudflare Pages project name is still `sightful` from the pre-rename era; custom domain pending)
- **App name in UI:** Scout
- **PWA manifest name:** Scout

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 |
| Styling | Inline CSS string in `src/App.jsx` (see below) |
| Auth | Supabase (cookie-based JWT) |
| Storage | Cloudflare R2 (photo originals + thumbnails + meta JSON) |
| Backend | Cloudflare Pages Functions (`/functions/`) |
| Database | Supabase |
| AI | Anthropic API — captions, prompts, feedback, weekly theme |
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
| `functions/` | Cloudflare Pages Functions (serverless backend) |

---

## Current Design System (Scout v2)

**Source of truth:** [`docs/BRAND.md`](docs/BRAND.md) (v2, April 2026 · post Fraunces/Geist Mono pass). Read this before any brand, voice, typography, or UI decisions. Visual reference: [`docs/brand.html`](docs/brand.html). The live CSS lives in `src/App.jsx`.

**Previous v1 (Sightful) design archived at:** `design-archive/sightful-v1.css`.

### Tokens (v2 `--s2-*`)

```css
/* Paper & ink */
--s2-paper:       #FFFDFA  /* Light */  /* Dark: #0C0C0C */
--s2-paper-2:     #F7F3EC  /* Light */  /* Dark: #1A1A18 */
--s2-grouped-bg:  #F2F1EC  /* Light */  /* Dark: #050505 */
--s2-ink:         #0C0C0C  /* Primary text / CTAs */
--s2-archive:     #3A3A35  /* Light */  /* Dark: #B8B2A3 — secondary text */
--s2-smoke:       #8A8680  /* Light */  /* Dark: #7A7668 — muted / labels */
--s2-bone:        #D8D7D4  /* Light */  /* Dark: #2A2A26 — rules, borders */

/* Press green (accent — only at earned moments) */
--s2-press-green: #007C04  /* Same in light + dark */
```

### Typography

| Role | Family | Loaded |
|------|--------|--------|
| Display / editorial / timer value | **Fraunces** | Google Fonts (variable, italic + roman, opsz 9..144, wght 300..600) |
| Labels, datelines, stamps, primary button | **Geist Mono** | Google Fonts (400/500/600) |
| UI / body / form controls | **SF Pro** (system) | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', …` |

CSS font variables:
- `--s2-serif`: Fraunces, Georgia, serif
- `--s2-mono`: Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace
- `--s2-sans`: SF Pro stack

### Color rules

- Most of the app is ink on paper.
- **Press green** appears only at earned moments — active timer, "New Assignment" stamp, Editor's Note ready banner. Never on nav, form chrome, or as decoration.
- No gradients, no shadows (except the one-layer selected chip in the segmented control).
- Grain textures from v1 are **retired**.

### What's retired (do not reintroduce)

- Flapjack wordmark, Inconsolata body
- Terracotta (`#D6542D`), sage (`#4F5E2E`), gold (`#E2B554`) — aliased for legacy classes but not for new work
- Grain textures, week-review modal, weekly-theme pipeline, v1 Day One-style day-detail sheet

### Theme

Light/dark toggle. Stored in `localStorage` as `scout-theme-pref` ('light' | 'dark' | 'system'). Applied via `data-theme` on `<html>`.

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
| `.lb-*` | Lightbox |

---

## localStorage Keys

All keys use the `scout-` prefix:

| Key | Values | Purpose |
|-----|--------|---------|
| `scout-theme-pref` | 'light' \| 'dark' \| 'system' | Theme preference |
| `scout-ai-enabled` | boolean string | AI features toggle |
| `scout-onboarded` | boolean string | Onboarding complete flag |
| `scout-prompt-*` | cached string | Daily prompt cache (keyed by date) |
| `scout-reviewed-*` | boolean string | Week review seen flags |

---

## AI Features (Anthropic API)

All gated by `aiEnabled` toggle in settings (stored in `localStorage` as `scout-ai-enabled`).
Model: `claude-haiku-4-5-20251001`

| Feature | API Call | Where |
|---------|----------|-------|
| Caption suggestion | `getCaptionSuggestion()` | Day detail |
| Photo feedback | `getFeedback()` | Day detail |
| Today's shoot prompt | `getTodayPrompt()` | Calendar sidebar |
| Weekly theme | `getTheme()` | Calendar sidebar |

---

## External Services

| Service | Purpose | Paid |
|---------|---------|------|
| Supabase | Auth (JWT) + PostgreSQL (waitlist) | ✅ |
| Cloudflare Pages | Hosting + serverless functions | ✅ |
| Cloudflare R2 | Photo storage — bucket: `photo-journal` | ✅ |
| Anthropic API | AI features (claude-haiku-4-5) | ✅ |
| Resend | Waitlist email notifications | ⚠️ Free tier |
| Open-Meteo | Weather data for AI prompts | Free |
| Nominatim (OSM) | Reverse geocoding from EXIF GPS | Free |

---

## Environment Variables

```
VITE_SUPABASE_URL         Supabase project URL
VITE_SUPABASE_ANON_KEY    Supabase anon key
```

Cloudflare secrets (set via `wrangler pages secret put`):
- `ANTHROPIC_API_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `WEBHOOK_SECRET`

---

## Common Commands

```bash
npm run dev       # Local dev server
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to Cloudflare Pages
```

---

## Design & Brand Files

| File | Purpose |
|------|---------|
| [`docs/BRAND.md`](docs/BRAND.md) | **v2 brand guide — source of truth.** Tokens, typography, components, voice, motion. |
| [`docs/brand.html`](docs/brand.html) | Visual brand reference. |
| [`docs/personas/UNIVERSE.md`](docs/personas/UNIVERSE.md), [`docs/personas/MATRIX.md`](docs/personas/MATRIX.md) | Target user personas. |
| [`SCOUT_APP_SUMMARY.md`](SCOUT_APP_SUMMARY.md) | Product/feature summary for Claude sessions. |
| `design-archive/sightful-v1.css` | v1 Sightful design system — archived only. |
