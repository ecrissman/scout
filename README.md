# SCOUT

A minimal daily photo journal app — private, PWA-ready, syncs across all your devices.

**Stack:** React + Vite → Cloudflare Pages (frontend) + Cloudflare R2 (photo storage) + Cloudflare Pages Functions (auth + API)

---

## Setup

### 1. Prerequisites

- [Node.js](https://nodejs.org) 18+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)

### 2. Install dependencies

```bash
npm install
```

### 3. Create your R2 bucket

In the Cloudflare dashboard:
1. Go to **R2 Object Storage** → **Create bucket**
2. Name it exactly `photo-journal`
3. Leave all other settings as default

### 4. Generate your auth tokens

You need two values — a **password** you'll type to log in, and a **token** the app uses internally (any random string):

```bash
# Generate a random token (copy this output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep both values somewhere safe.

### 5. Add your app icon

Place two PNG files in the `public/` folder:
- `public/icon-192.png` — 192×192px
- `public/icon-512.png` — 512×512px

These become your home screen icon. Any square image works.

### 6. Deploy to Cloudflare Pages

```bash
# Build the app
npm run build

# Deploy (first time creates the project)
npx wrangler pages deploy dist --project-name photo-journal
```

### 7. Configure environment variables

In the Cloudflare dashboard:
1. Go to **Workers & Pages** → **photo-journal** → **Settings** → **Environment variables**
2. Add these two variables (for **Production** environment):

| Variable name   | Value                              |
|-----------------|------------------------------------|
| `AUTH_PASSWORD` | The password you chose in step 4   |
| `AUTH_TOKEN`    | The random token from step 4       |

### 8. Bind your R2 bucket

Still in the Cloudflare dashboard:
1. Go to **Settings** → **Functions** → **R2 bucket bindings**
2. Add a binding:
   - **Variable name:** `PHOTOS`
   - **R2 bucket:** `photo-journal`

### 9. Redeploy

After setting environment variables and bindings, trigger a new deployment:
```bash
npm run deploy
```

Your app is now live at `https://photo-journal.pages.dev` (or your custom domain).

---

## Add to Home Screen (PWA)

**iPhone/iPad:**
1. Open your app URL in Safari
2. Tap the Share button → **Add to Home Screen**
3. Tap **Add**

**Android:**
1. Open your app URL in Chrome
2. Tap the three-dot menu → **Add to Home screen**
3. Tap **Add**

---

## Local Development

For local dev with a real R2 bucket:

```bash
# Log into Cloudflare
npx wrangler login

# Run locally (uses real R2 in preview mode)
npx wrangler pages dev dist --r2=PHOTOS:photo-journal
```

Or run the frontend only (API calls will fail without the Worker):
```bash
npm run dev
```

---

## Project Structure

```
photo-journal/
├── functions/
│   └── api/
│       └── [[route]].js   ← Cloudflare Worker (auth + R2 API)
├── public/
│   ├── manifest.json       ← PWA manifest
│   ├── sw.js               ← Service worker (offline shell)
│   ├── icon-192.png        ← App icon (you provide)
│   └── icon-512.png        ← App icon (you provide)
├── src/
│   ├── App.jsx             ← Main component (responsive layout)
│   ├── api.js              ← API client
│   ├── exif.js             ← EXIF parser + image compression
│   ├── skills.js           ← 30 rotating photography skills
│   └── main.jsx            ← Entry point + SW registration
├── index.html
├── package.json
├── vite.config.js
└── wrangler.toml
```

---

## Notes

- **Photos are private** — all API routes require your auth cookie. The R2 bucket is never publicly accessible.
- **No egress fees** — Cloudflare R2 charges $0 for data served. For a personal journal you'll stay well within the free tier indefinitely.
- **Cross-device sync** — photos upload to R2 and are available on any device you log into.
- **Offline shell** — the service worker caches the app shell so it loads instantly even offline. Photo data requires a connection.
