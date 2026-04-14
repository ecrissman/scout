// Privacy Policy and Terms of Service for Scout.
// Plain strings rendered in a legal sheet modal. Update EFFECTIVE_DATE
// when you make material changes.

export const LEGAL_EFFECTIVE_DATE = 'April 13, 2026';
export const LEGAL_CONTACT_EMAIL = 'eric@scoutphoto.app';

export const PRIVACY_POLICY = `
# Privacy Policy

**Effective:** ${'April 13, 2026'}

Scout is a photo-a-day journaling app. We take your privacy seriously because your photos and the patterns in them are personal. This policy explains what we collect, why, and what we do (and don't do) with it.

## What we collect

**Account info.** Your email address and a password hash, so you can sign in. If you sign in with Google, we receive your email and a unique Google user ID.

**Your photos.** The images you upload, their thumbnails, and any caption you write. Photos are stored in Cloudflare R2 (an encrypted object store). Only you can access your photos.

**Photo metadata (EXIF).** When you upload a photo, we read EXIF data your camera wrote into the file — date, time, camera model, and (if present) GPS coordinates. We use this to place photos on your calendar and, if you have AI features on, to generate context-aware prompts.

**Usage data.** Basic app usage — which screens you visit, which features you use, and technical info like browser type, OS, and error logs. This helps us understand what's working and fix bugs. We do **not** track you across other websites.

## What we don't collect

- We don't sell your data. Ever.
- We don't share photos or captions with advertisers.
- We don't use your photos to train AI models.
- We don't track you across the open web.

## How we use your data

- **To run the app.** Store and retrieve your photos, show you your calendar, keep you signed in.
- **AI features (optional).** If you enable AI features in Settings, captions and photo context may be sent to Anthropic's API (Claude) to generate suggested captions, feedback, and daily prompts. Anthropic does not retain or train on this data under their API terms. You can turn AI off at any time in Settings.
- **Weather and location context.** If your photo has GPS data and AI is on, we may query Open-Meteo (weather) and Nominatim (reverse geocoding) to enrich prompts. These requests contain approximate coordinates but no personal identifiers.
- **Product improvement.** Aggregate, anonymized usage data helps us decide what to build and fix.

## Who we share data with

We use a small number of trusted service providers to run Scout. Each receives only what they need to do their job:

- **Supabase** — authentication and account database
- **Cloudflare** — hosting and photo storage (R2)
- **Anthropic** — AI captions and prompts (only if AI is enabled)
- **Resend** — transactional email (waitlist, password reset)
- **Open-Meteo** — weather data for prompts
- **OpenStreetMap / Nominatim** — reverse geocoding for prompts

We do not share your data with anyone else, except when required by law.

## Data retention

Your photos and account data are kept until you delete them or delete your account. When you delete a photo, it's removed from our storage. When you delete your account, all associated photos, captions, and account data are permanently deleted within 30 days.

## Your rights

You can:

- Download all your photos at any time (Settings → Download All Photos).
- Delete any photo from its day view.
- Delete your entire account by emailing ${LEGAL_CONTACT_EMAIL}.
- Turn AI features on or off at any time in Settings.
- Ask us what data we hold about you, and request corrections or deletion.

If you're in the EU, UK, or California, you have additional rights under GDPR and CCPA, including the right to data portability and the right to object to processing. To exercise any of these, email ${LEGAL_CONTACT_EMAIL}.

## Cookies and local storage

Scout uses:

- A secure, HTTP-only authentication cookie to keep you signed in.
- Browser localStorage to remember your theme preference, AI toggle, and a few UI flags (all keys start with \`scout-\`).

We do not use third-party advertising cookies or cross-site trackers.

## Children

Scout is not directed at children under 13 and we do not knowingly collect data from them. If you believe a child has created an account, email ${LEGAL_CONTACT_EMAIL} and we will delete it.

## Changes to this policy

If we make material changes, we'll update the effective date above and notify you via in-app message or email before the changes take effect.

## Contact

Questions or requests: ${LEGAL_CONTACT_EMAIL}
`.trim();

export const TERMS_OF_SERVICE = `
# Terms of Service

**Effective:** ${'April 13, 2026'}

Welcome to Scout. By using the app you agree to these terms. They're written to be readable, not to trick you.

## The service

Scout is a photo-a-day journaling app. You upload one photo per day, and over time Scout builds a personal visual record for you. We provide the software, storage, and optional AI features that power the experience.

## Your account

You're responsible for keeping your account secure. Don't share your password. Tell us right away at ${LEGAL_CONTACT_EMAIL} if you think someone else is using your account.

You must be at least 13 years old to use Scout. If you're under 18, you should have a parent or guardian's permission.

## Your content

**You own your photos.** Full stop. Uploading to Scout doesn't transfer ownership to us.

To run the app, you give us a limited license to store, display, and process your photos — but only for the purpose of providing the service to you. We don't use them for anything else. We don't train AI models on them. We don't show them to other users.

**You're responsible for what you upload.** Don't upload anything you don't have the right to upload, or anything that's illegal, harmful, or violates someone else's rights.

## Things you can't do

Please don't:

- Upload illegal content, CSAM, or anything that violates someone else's privacy or copyright.
- Use Scout to harass, threaten, or harm anyone.
- Try to break the app, scrape it, or reverse engineer it beyond what the law allows.
- Use automated tools to create accounts or upload content in bulk.
- Resell or white-label the service.

If you do any of these things, we may suspend or terminate your account.

## AI features

AI features (captions, feedback, daily prompts) are optional and can be toggled off at any time. They're powered by Anthropic's Claude API. AI output is generated, not authoritative — it may be wrong, quirky, or occasionally weird. Don't rely on it for anything important.

## Service availability

We work hard to keep Scout running, but we can't promise 100% uptime. The app is provided "as is," without warranty of any kind. We're not liable for lost photos caused by events outside our reasonable control — **please back up photos that matter to you**. You can download all your photos at any time from Settings.

## Paid features

Scout may offer paid features in the future. If it does, we'll tell you clearly what's free and what's not, and you'll only be charged for things you explicitly sign up for.

## Ending your account

You can delete your account at any time by emailing ${LEGAL_CONTACT_EMAIL}. We may suspend or terminate accounts that violate these terms, or for any other reason with reasonable notice. If we terminate your account without cause, we'll give you a chance to download your photos first.

## Changes

We may update these terms as Scout evolves. If we make material changes, we'll update the effective date and notify you. Continued use after an update means you accept the new terms.

## Legal

These terms are governed by the laws of the United States. Any disputes will be handled in good faith — reach out to ${LEGAL_CONTACT_EMAIL} before escalating.

## Contact

Questions: ${LEGAL_CONTACT_EMAIL}
`.trim();
