# Scout — App Summary

> Reference document for Claude sessions. Covers product, features, brand, and architecture.

---

## What It Is

Scout is a **photo-a-day PWA**. One photo per day. Over time it builds a personal visual archive and time-lapse reel. Part habit tracker, part visual journal, part creative practice tool. Users are prompted each day, shoot a photo, optionally caption it, and receive AI coaching feedback. Completed weeks unlock a shareable grid. The app is invite-only (waitlist).

**Live URL:** scout photo.app  
**UI name:** Scout  
**Auth:** Invite-only via email/password (Supabase)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite 5 |
| Styling | Single CSS template literal in `src/App.jsx` — no Tailwind, no CSS Modules |
| Auth | Supabase (cookie-based, JWT validated on Worker) |
| Storage | Cloudflare R2 (photos, thumbnails, metadata, AI cache) |
| Backend | Cloudflare Workers (`/functions/api/[[route]].js`) |
| Database | Supabase (user auth + waitlist) |
| AI | Anthropic Claude API (claude-haiku-4-5) |
| Deployment | Cloudflare Pages (`npm run deploy`) |
| PWA | Service worker + manifest + icons in `/public/` |
| Email | Resend (waitlist notifications, auth emails from eric@scoutphoto.app) |

**Architecture note:** `src/App.jsx` is a single component (~1,800 lines). All navigation is state-based — no router. All CSS is a `const CSS` string at the top injected via `<style>` tag.

---

## Screens & Navigation

### Full Screen Inventory

| Screen | State Trigger | Dismiss |
|--------|--------------|---------|
| **Splash** | App load | Auto at 2.9s |
| **Onboarding step 1** | First login, not onboarded | "NEXT" button |
| **Onboarding step 2** | After step 1 | "START SHOOTING" |
| **Landing (not authed)** | `!authed && showLanding` | "SIGN IN" or "REQUEST ACCESS" |
| **Login form** | Not authed, after landing | Submit form |
| **Forgot password** | Forgot link on login | "BACK TO SIGN IN" |
| **Reset password** | `PASSWORD_RECOVERY` Supabase event | Form submit |
| **Request access** | "REQUEST ACCESS" on landing | "BACK" |
| **Month calendar** | `activeTab='month'` | Click date → day detail |
| **Day detail (with photo)** | `activeTab='today'`, `dayMeta` exists | Swipe or tap calendar |
| **Today sheet** | Mobile only; today + no photo | Swipe down / dismiss button |
| **Lightbox** | Tap photo in day detail | Tap backdrop, ESC, swipe |
| **Week review — milestone** | Click week-complete chip | "NEXT" → phase 2 |
| **Week review — grid** | After milestone screen | "✕" close button |
| **Tips sheet** | "This week's tips" in theme card | Tap backdrop, "✕" |
| **Nav panel** | Hamburger button | Tap backdrop, hamburger again |
| **Grids page** | Nav panel → "YOUR GRIDS" | Back arrow |
| **Settings sheet** | Nav panel → "SETTINGS" | Tap backdrop |
| **Account sheet** | Nav panel → "ACCOUNT" | Tap backdrop |
| **Support sheet** | Nav panel → "SUPPORT" | Tap backdrop |

### Navigation Flow
```
Not authed:
  Landing → Sign In / Forgot / Request Access

First login:
  Onboarding (name → Day One) → App

Authenticated:
  Month calendar (default)
    ↕ click date
  Day detail
    ↕ swipe L/R between days
  Today (no photo) → Today sheet (mobile)
    → upload library / camera / new prompt

  Hamburger → Nav panel
    → Your Grids (full-screen overlay)
    → Account / Settings / Support (bottom sheets)
    → Sign Out

  Week chip → Week review (milestone → grid → share/download)
```

---

## Features

### Core
- **Daily photo upload** — library picker or camera capture (one per day)
- **Photo replace** — replace today's photo from the date row
- **EXIF extraction** — aperture, shutter, ISO, focal length, camera make/model (client-side binary parsing)
- **EXIF orientation** — all 8 rotation values handled correctly
- **Image compression** — full-res 1200px max (0.78 quality) + thumb 180px max (0.65 quality)
- **Reverse geolocation** — city/state from GPS EXIF via Nominatim API
- **Caption editing** — auto-expanding textarea, auto-saved on blur
- **Photo delete** — dev-only toggle reveals delete button

### Calendar & Timeline
- **Month calendar** — scrollable, current month first, thumbnails in filled cells
- **Year listing** — fetches all photo dates for any year
- **Today indicator** — accent color on today's date number
- **Multi-year navigation** — scroll back through all months
- **Week-complete chip** — appears when all 7 days (Sun–Sat) have photos

### Week Review
- **Milestone screen** — full-bleed gold background, "7 DAYS" headline
- **Grid view** — 2-column masonry layout of the week's photos
- **Canvas export** — 1080×1920px PNG grid generated client-side
- **Share** — `navigator.share` with file, fallback to download
- **Download** — PNG to local device

### Grids Page
- Scrollable 3-column grid of all photos (reverse chronological)
- Tap photo → jump to that day's detail view
- Empty state if no photos yet

### AI Features (gated by `aiEnabled` toggle)
See **AI Features** section below.

### Settings
- **Theme** — Light / Dark / System (stored in `localStorage`)
- **AI toggle** — enable/disable all AI features
- **Change password** — collapsible form
- **Sign out**

### Support
- **Feedback & Ideas** — `mailto:eric@scoutphoto.app`
- **Report a Bug** — `mailto:eric@scoutphoto.app`

### Auth
- Email/password sign in
- Forgot password (email reset link)
- Request access (waitlist form — email only)

---

## AI Features

All use **Claude claude-haiku-4-5**. All gated by `aiEnabled` localStorage flag.

### 1. Daily Shoot Prompt
**Trigger:** Auto-fetches when viewing today with no photo (once per day, cached in localStorage)  
**Manual refresh:** Refresh button on today sheet  
**Context sent:** Time of day, weather (open-meteo.com), last 7 captions, weekly theme  
**Output:** One specific, actionable photo suggestion (100 token limit)  
**Cache:** `scout-prompt-{date}` in localStorage

### 2. Photo Feedback
**Trigger:** Auto on upload (if AI enabled)  
**Manual retry:** Feedback card in day detail  
**Input:** Full-res photo as base64  
**Output:** 2–3 sentences — one strength, one improvement (200 token limit)  
**Persistence:** Saved to photo's `meta.json` in R2

### 3. Caption Suggestion
**Trigger:** Bulb icon in caption area  
**Input:** Full-res photo  
**Output:** One evocative single sentence (60 token limit)  
**UX:** Shown below textarea with Accept / Dismiss actions

### 4. Weekly Theme
**Trigger:** Fetched on auth, displayed in sidebar theme card  
**Output:** 2–4 word theme title + one-sentence description  
**Cache:** One theme per ISO week, stored in R2  
**JSON shape:** `{ theme, description, week }`

### 5. Weekly Photography Tips (Deterministic)
**Source:** 52 tips in `src/skills.js`  
**Assignment:** Day-of-year mod 52 → tip index (no API call)  
**Display:** Tips sheet (triggered from theme card), one tip per day of the week  
**Examples:** Rule of Thirds, Golden Hour, Leading Lines, Negative Space, etc.

---

## Brand & Design System (Current — In Production)

### Color Tokens

**Light mode (default):**
```css
--bg:            #FFFDFA     /* Primary background (warm white) */
--bg-secondary:  #F0EEEA
--surface:       #F0EEEA
--border:        #E3E1DD
--text:          #1C1916     /* Primary text (warm black) */
--text-2:        #8C857C     /* Secondary text */
--text-3:        #B5AFA9     /* Tertiary / placeholder */
--accent:        #4F5E2E     /* Sage green — active states, CTAs */
--accent-fg:     #FFFDFA
--terracotta:    #E34822     /* Camera button, selected highlights */
--sage:          #4F5E2E
--gold:          #E2B554     /* Week review milestone background */
--paper:         #FFFDFA
--ink:           #0C0C0C     /* Pure black for high-contrast elements */
--warm-mid:      #8C857C
--rule:          #E3E1DD
```

**Dark mode:**
```css
--bg:            #0C0C0C
--bg-secondary:  #2E2C2B
--surface:       #2E2C2B
--border:        rgba(245,241,235,0.10)
--text:          #FFFDFA
--text-2:        rgba(245,241,235,0.60)
--text-3:        rgba(245,241,235,0.30)
```

### Typography (v2 — April 2026 brand pass)
- **Display / editorial:** Fraunces (self-hosted variable font at `/public/fonts/Fraunces-VariableFont_SOFT_WONK_opsz_wght.ttf` + italic, opsz 9–144, wght 100–900)
- **Labels / datelines / stamps:** Geist Mono (self-hosted variable font at `/public/fonts/GeistMono-VariableFont_wght.ttf`)
- **UI / body / primary button:** SF Pro (system stack — `-apple-system, BlinkMacSystemFont, 'SF Pro Text', ...`)
- **CSS vars:** `--s2-serif` → Fraunces · `--s2-mono` → Geist Mono · `--s2-sans` → SF Pro stack. Legacy `--brand`/`--serif`/`--sans` aliases kept for unmigrated v1 classes.

Source of truth: `docs/BRAND.md`.

### Design Rules
- Most UI is ink on paper — color only at meaningful moments
- Color used on: camera button (terracotta), active dates (sage), week review (gold), today sheet prompt label (sage)
- No color on nav or interactive chrome
- Dark mode applied to all fixed overlays via `[data-theme="dark"]` CSS selectors

---

## Planned Scout Rebrand (NOT YET IMPLEMENTED)

Full brief: `SCOUT_CREATIVE_BRIEF.md`  
Static mockup: `scout-mockup.html`

### New Color Tokens
```css
--terracotta:  #C4622D   /* Splash, streak, active states, CTAs */
--sage:        #4A6741   /* Prompt strips, empty states, Day One */
--sky:         #5B8FA8   /* Milestone screens, celebrations */
--paper:       #F5F1EB   /* Primary background */
--ink:         #1C1916   /* All text, borders, nav */
--warm-mid:    #8C857C   /* Secondary text, timestamps */
--rule:        rgba(28,25,22,0.1)
```

### New Typography
| Role | Font |
|------|------|
| Wordmark / Display | Taylor Penton — Birdie or Wingman (heavy, ~$25 at taylorpenton.com) |
| UI / Body | DM Sans 300, 400, 500 |

### New Design Rules
- Ink on paper for most of the app
- Color only at: splash, streak counter, active thumb, prompt strips, milestones
- Color **never** on nav or interactive chrome
- Grain texture (SVG fractal noise, opacity 0.12) on all colored blocks (terracotta/sage/sky), NOT on paper

### Open Decisions Before Implementing
- [ ] Taylor font purchased? Which — Birdie or Wingman?
- [ ] Confirm app name: update manifest, title, all UI strings to "Scout"
- [ ] Dark mode: keep current system or design Scout-compatible dark palette?

---

## Backend & API

### Cloudflare Worker (`/functions/api/[[route]].js`)

All routes require `Authorization: Bearer <supabase-jwt>` header. R2 keys are scoped to user ID: `photos/{uid}/{date}/`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/photo/:date` | Fetch photo metadata, caption, feedback |
| POST | `/api/photo/:date` | Upload photo (full, thumb, exif, caption) |
| PUT | `/api/photo/:date/caption` | Update caption only |
| DELETE | `/api/photo/:date` | Delete photo + thumb + metadata |
| GET | `/api/image/:date/full` | Serve full-res photo (auth required) |
| GET | `/api/image/:date/thumb` | Serve thumbnail (auth required) |
| POST | `/api/ai/feedback/:date` | Generate photo feedback via Claude |
| GET | `/api/ai/prompt/:date` | Generate daily shoot prompt |
| POST | `/api/ai/caption/:date` | Suggest caption for photo |
| GET | `/api/theme/current` | Get/generate weekly theme |
| GET | `/api/list/:year` | List all photo dates in a year |
| POST | `/api/waitlist` | Submit waitlist request |

### Storage Layers
- **R2:** `photos/{uid}/{date}/full.jpg`, `thumb.jpg`, `meta.json`; `themes/week-{YYYY-WW}.json`
- **Supabase:** User auth, `waitlist` table (id, name, email, note, created_at)
- **localStorage:** Theme pref, AI toggle, onboarding flag, daily prompt cache
- **Resend:** Transactional email from `eric@scoutphoto.app`; custom SMTP in Supabase

---

## UX Patterns

### Gestures
| Gesture | Surface | Action |
|---------|---------|--------|
| Swipe left/right | Day detail | Navigate prev/next day |
| Swipe left/right | Lightbox | Navigate prev/next photo in gallery |
| Tap photo | Day detail | Open lightbox |
| Tap backdrop | Any modal/sheet | Close |

### Keyboard
- `Escape` — close lightbox, settings, tips
- `Arrow Left / Right` — navigate photos in lightbox

### Animations
| Element | Animation |
|---------|-----------|
| Splash logo | Scale in 0.6s, fade out at 2.2s |
| Today sheet | Slide up 0.38s in, slide down 0.36s out |
| Nav panel | Slide from left 0.32s |
| Grids page | Slide from right 0.32s |
| Week chip | Slide down from top 0.22s |
| Feedback chevron | Rotate 0.22s |

### Responsive Layout
| Breakpoint | Layout |
|-----------|--------|
| < 640px | Tab-based: MONTH tab (calendar) / TODAY tab (day detail). Fixed bottom nav (hidden). |
| 640–1023px | Sidebar 272px (calendar) + main panel (day detail), both always visible |
| ≥ 1024px | Sidebar 300px + main panel |

**Mobile-only:** Today sheet, tab-based navigation  
**Desktop-only:** Sidebar always visible, no tab bar

### Status Bar Color (iOS)
Dynamically updated via `<meta name="theme-color">`:
- Splash / landing: `#0C0C0C`
- Onboarding: `#4F5E2E` (sage)
- Login: `#FFFDFA`
- Today sheet: `#FFFDFA`
- Week review milestone: `#E2B554` (gold)
- Week review grid: `#0C0C0C`
- App (light): `#FFFDFA`
- App (dark): `#0C0C0C`

---

## Project Structure

```
/Users/crissman/Apps/Scout/
├── src/
│   ├── App.jsx               # Entire app (~1,800 lines). Single component.
│   │                         # const CSS at top (injected via <style>).
│   │                         # State-based navigation, no router.
│   ├── api.js                # All API fetch wrappers
│   ├── exif.js               # EXIF extraction + image compression/thumbnail
│   ├── skills.js             # 52 photography tips (deterministic by date)
│   ├── supabase.js           # Supabase client init
│   └── index.jsx             # React entry point
├── functions/
│   └── api/
│       └── [[route]].js      # Cloudflare Worker — all /api/* routes
├── public/
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   ├── icon-192.png          # PWA icon
│   ├── icon-512.png          # PWA icon
│   ├── scout-wordmark.svg    # Current wordmark (ink)
│   ├── trail.svg             # Decorative SVG (onboarding step 2)
│   ├── personas/             # Editor illustrations (Novak, Calder, Walsh)
│   └── fonts/
│       ├── Fraunces-VariableFont_SOFT_WONK_opsz_wght.ttf
│       ├── Fraunces-Italic-VariableFont_SOFT_WONK_opsz_wght.ttf
│       └── GeistMono-VariableFont_wght.ttf
├── CLAUDE.md                 # Project context for Claude sessions
├── SCOUT_APP_SUMMARY.md      # This file
├── SCOUT_CREATIVE_BRIEF.md   # Full rebrand brief
├── scout-mockup.html         # Static HTML mockup of planned Scout screens
├── design-archive/
│   └── sightful-v1.css       # Archived V1 design system
├── index.html                # Entry HTML, PWA meta tags
├── vite.config.js
├── wrangler.toml             # Cloudflare Pages config
└── package.json
```

---

## Developer-Only Features

Visible when signed in as `ecrissman@gmail.com` in the Account sheet:

| Feature | Description |
|---------|-------------|
| **Delete Mode** | Toggle to show delete button on photos |
| **Reset Week Reviews** | Clear `scout-reviewed-*` localStorage flags |
| **Reset Onboarding** | Remove `scout-onboarded` flag, re-trigger first-run |
| **Show Week Review** | Manually open review screen for current week's dates |
| **Show Splash** | Replay splash screen animation |

---

## Common Commands

```bash
npm run dev       # Local dev server (HMR)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run deploy    # Build + deploy to Cloudflare Pages
```

---

## Key LocalStorage Keys

| Key | Values | Purpose |
|-----|--------|---------|
| `scout-theme-pref` | `'light'` \| `'dark'` \| `'system'` | Theme preference |
| `scout-ai-enabled` | `'true'` \| `'false'` | AI features toggle |
| `scout-onboarded` | `'1'` | One-time onboarding complete flag |
| `scout-prompt-{YYYY-MM-DD}` | prompt string | Cache daily shoot prompt |
