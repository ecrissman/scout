# Scout — Roadmap: May–December 2026

*Last updated: April 23, 2026*

---

## The Year's Remaining Theme

**Ship the habit loop. Then earn the right to grow.**

The first half of 2026 got Scout to a clean, opinionated MVP — daily photo, AI coach, week review, calendar archive. The rest of the year is about two things, in order:

1. **Close the habit loop.** Make the daily return feel inevitable. Notifications, streaks, time-lapse payoff, the week review — these are the rails that turn a new user into a 60-day user.
2. **Open one door carefully.** Once the loop holds, test *one* growth mechanic (sharing or referrals) and *one* monetization path. Not both at once, not five of each.

Invite-only is a feature for now. Trust is the moat. Keep the user count small until retention proves out, then widen the door.

---

## Month-by-Month

### May — Retention instrumentation & streak polish

*The month where we actually learn who's sticking.*

- **Ship basic analytics.** Cloudflare Analytics Engine or PostHog. We need D1/D7/D30 retention, shoot-per-active-day, and AI toggle rate. No guessing anymore.
- **Streak counter, first-class.** Visible on Today. Flame/trail iconography. Include "longest streak" and "current streak" — both matter.
- **One-photo-a-day enforcement audit.** Edge cases: timezone flips, device clock drift, "I shot at 11:58pm, uploaded at 12:02am." Decide the canonical rule and document it.
- **Push notifications (PWA).** One gentle reminder at user-set time. Not "don't break your streak." More "the light is good right now."

### June — Time-lapse payoff

*The single biggest underdelivered promise in the product.*

- **Ship time-lapse export.** 30/60/90/180/365-day video, client-side rendering if possible, R2-cached if not. MP4 + GIF. Shareable.
- **Year view upgrade.** The existing year listing is a data dump. Make it a browseable wall — big thumbnails, scroll velocity matters.
- **Week review v2.** It's already a highlight — push it further. Add the AI weekly summary ("this week you leaned toward shadow and close-ups"). Reuse existing Haiku calls.

### July — Onboarding & first-week experience

*Half our churn happens before Day 7. Fix that.*

- **Rework Day 1–7.** Scripted prompts for the first week — known-good, tested, not AI-generated on day one. Reduce the AI "cold start" problem.
- **Lightweight tutorial moments.** Contextual tooltips the first time a user hits the week chip, the lightbox, the caption field. Kill once seen.
- **Referral invites.** Each user gets 3 invite codes. Low pressure, curated growth. Tracks who invited whom.

### August — Creative depth

*Users who made it to day 60 are asking for more to do. Give them controlled depth, not sprawl.*

- **Themed challenges (opt-in, weekly).** A 7-day "shadows" or "hands" challenge. Uses existing weekly theme infrastructure — just makes it actionable and optional.
- **Private collections / tags.** One lightweight dimension of organization. Max 5 tags, user-defined. Searchable locally, not a full taxonomy.
- **Caption search.** Add an index to R2 meta or a Supabase-side cache. Search your own archive by word.

---

### September — The sharing question

*Scout is a journal. But users have been asking to share. Test one answer carefully.*

- **Public profile (opt-in).** A scout.photo/u/name URL. Read-only grid. No comments, no likes, no feed. Just a portfolio side of the journal.
- **Week-grid share polish.** The canvas export exists — make it drop-dead gorgeous. Watermark ("made with Scout"), format variants (story, square, landscape).
- **Decide: social features yes/no?** Based on sharing telemetry from the public profile. If users aren't sharing, don't build comments.

### October — Monetization test

*Cash flow check-in. We need one clean experiment.*

- **Scout Pro, soft launch.** $5/mo or $40/yr. Benefits: unlimited AI, HD time-lapse export, multi-year exports, early access to new features. Free tier keeps core habit loop.
- **Billing infrastructure.** Stripe. Cloudflare Workers webhook handler. Keep it lean — no org accounts, no team plans, no seat math.
- **Pricing page & messaging.** Keep it honest and direct — "Scout costs money to run. If it's useful, help keep it alive."

### November — iOS decision & platform

*Native is a bet. Don't make it until we have to.*

- **Evaluate: native iOS shell (Capacitor/Expo) vs. stay PWA.** Decision criteria: share-to-Scout flow, camera fidelity, App Store discoverability, notification reliability. Write a one-page memo, decide.
- **Improve camera flow.** Regardless of native/PWA — tighten the tap-to-shutter path. Audit every intermediate screen.
- **Year-in-review, drafted.** The December moment. Storyboard it, script the copy, design the share asset. Build in early December.

### December — Year-in-review moment & breathe

*The emotional high point of the year. Protect it.*

- **Ship Year-in-Review.** Auto-generates for every user with 60+ photos. Time-lapse, top photos (AI-assisted pick), weekly themes recapped, stats. Shareable artifact.
- **Plan 2027.** Look at the data. Write the next 4-month roadmap.
- **One week of no shipping.** Bug fixes only. Get back to inbox zero on user emails.

---

## New Feature Ideas — Curated Shortlist

### Habit & retention

- **Streak counter & longest-streak tracking.** *What:* Persistent visible streak on Today with milestone chips (7/30/100/365). *Why:* Streaks are the strongest extrinsic motivator for daily apps and we're leaving this on the table.
- **"Light right now" push notifications.** *What:* Opt-in, time-of-day aware push — triggered by sunset proximity or user-set shoot time. *Why:* Ties the reminder to something useful ("golden hour in 20 min"), not nagging.
- **Grace day / one missed day doesn't kill the streak.** *What:* A forgiving streak rule — one skip per 7 days allowed. *Why:* Brittle streaks are churn events. A forgiving rule keeps users engaged after a bad week.

### Creative depth

- **Time-lapse export (the headline feature we've been promising).** *What:* Generate a 30/60/90/365-day video from your photos, client-rendered when possible. *Why:* This is the core product promise. Shipping it completes the value loop.
- **Themed weekly challenges (opt-in).** *What:* Users can join a 7-day theme — shadows, hands, windows. Weekly theme AI already handles the copy. *Why:* Gives experienced users something to level into without diluting the core one-a-day simplicity.
- **AI weekly recap in the week review.** *What:* At the end of a completed week, a 2-sentence observation ("you leaned into shadow this week"). *Why:* Makes the week review feel seen and smart without adding a new surface.

### Sharing & social

- **Public profile pages (opt-in, read-only).** *What:* A scout.photo/u/yourname URL showing your archive as a clean grid. No social features attached. *Why:* Addresses the "can I show people?" question without importing social media's toxicity.
- **Premium share cards for week/month/year milestones.** *What:* Higher-quality canvas exports with layout variants (story, square, landscape). *Why:* Free organic growth loop when users share — every shared image is an ad for the app.

### Monetization

- **Scout Pro — $5/mo or $40/yr.** *What:* Unlimited AI feedback + high-res time-lapse + priority export + early feature access. *Why:* Scout has real API and storage costs. A small Pro tier keeps the lights on without paywalling the habit loop.
- **Annual "print your year" offering (partner integration).** *What:* At year-end, offer a printed photo book of your year via a Blurb/Artifact Uprising API. *Why:* Real object, real emotional value, easy margin, fits brand.

### Platform

- **Caption & photo search.** *What:* Index captions and date/location/EXIF for local search. *Why:* An archive you can't search isn't an archive — it's a pile.
- **Year view, upgraded.** *What:* A full scrollable wall of every photo in a year, zoomable. *Why:* The visual archive payoff is a big part of the pitch; the current year list underdelivers on it.

---

## Explicitly Not Doing

- **A feed of other users' photos.** Scout is a journal, not Instagram. The moment we add a public feed, we inherit every content-moderation, comparison-anxiety, and engagement-loop problem social apps have.
- **Multiple photos per day.** The constraint is the product. One photo. Period. (We may allow a "burst" UX that picks the best one, but the artifact is still one photo.)
- **Filters / heavy in-app editing.** Users have Photos, Lightroom, Darkroom. We don't need to compete there. Minor adjustments (crop, rotate) only if they unblock shipping.
- **A full Android-native app this year.** PWA covers it. If iOS decision in November goes native, Android is a 2027 conversation.
- **Comments, likes, follows.** If we ever add social, it won't be with these primitives. They reshape the product's soul.

---

## Key Bets & Open Questions

1. **Does the time-lapse payoff actually land?**
   *Bet:* Shipping time-lapse export in June is the biggest retention unlock of the year.
   *What we need to know:* Do users who generate their first time-lapse have meaningfully better D90 retention than those who don't? If yes, everything downstream of it (sharing, Pro tier) gets easier.

2. **Will anyone pay?**
   *Bet:* $5/mo Pro converts at 3–5% of active users.
   *What we need to know:* October test. If conversion is under 2%, we revisit pricing, value prop, or the entire model — maybe it's a one-time purchase, maybe it's a print-on-demand business, maybe it's free forever and we find a sponsor.

3. **PWA vs. native iOS — when's the breaking point?**
   *Bet:* PWA holds through end of year. Push notifications and share-to-Scout are the two pressure points.
   *What we need to know:* By November, do we have clear user-reported friction that's costing us installs? If yes, Capacitor shell in Q1 2027. If no, keep the PWA bet running.

4. **Invite-only or open the doors?**
   *Bet:* Stay invite-only through at least October. Quality of feedback loop > growth.
   *What we need to know:* Post-referral-codes in July, are our active users actually using their invites? If yes, the waitlist is working as a filter. If no, we may need to open up earlier than planned.

---

## How to Read This Roadmap

- Monthly blocks are a north star, not a contract. Ship when ready.
- Every feature gets a spec before it gets built. No exceptions.
- Re-read this doc on the first Monday of each month. If something feels wrong, change it in writing.
- When in doubt: one photo, one day, minimum friction. That's the product.
