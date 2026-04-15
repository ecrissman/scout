// src/analytics.js
// PostHog wrapper with opt-out support.
//
// Init is lazy: nothing is loaded until initAnalytics() is called from App
// boot, and nothing fires if the user has opted out (localStorage flag) or
// the env keys are missing (local dev without secrets, previews, etc.).
//
// Event naming: snake_case, verb_object. See PR description for the 12-event
// schema. Never pass PII as properties — use posthog.identify(userId) once
// after auth so events auto-attach to the Supabase user id.

import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const OPTOUT_KEY = 'scout-analytics-optout';

let inited = false;

const isOptedOut = () => localStorage.getItem(OPTOUT_KEY) === 'true';

export function initAnalytics() {
  if (inited) return;
  if (!KEY) return; // missing env var — no-op (local dev, etc.)
  if (isOptedOut()) return;
  posthog.init(KEY, {
    api_host: HOST,
    // Autocapture covers pageviews, clicks, form submits — we still fire
    // explicit events for the 12-event schema so dashboards don't depend on
    // CSS selectors.
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    // No session replay — photos are personal content.
    disable_session_recording: true,
    // Respect Do Not Track browser setting.
    respect_dnt: true,
    persistence: 'localStorage',
    loaded: (ph) => {
      // If a previous session opted out, the flag is re-honored on every
      // boot via the early return above — this is just belt-and-suspenders
      // for mid-session opt-out calls.
      if (isOptedOut()) ph.opt_out_capturing();
    },
  });
  inited = true;
}

export function identify(userId) {
  if (!inited) return;
  if (!userId) return;
  posthog.identify(userId);
}

export function resetIdentity() {
  if (!inited) return;
  posthog.reset();
}

export function track(event, props = {}) {
  if (!inited) return;
  posthog.capture(event, props);
}

// Opt-out toggle for Settings. Persists to localStorage and applies
// immediately. If the user opts back in mid-session and PostHog wasn't
// initialized (because they booted the app while opted out), we lazy-init
// here.
export function setAnalyticsOptOut(optOut) {
  localStorage.setItem(OPTOUT_KEY, String(optOut));
  if (optOut) {
    if (inited) posthog.opt_out_capturing();
    return;
  }
  if (!inited) {
    initAnalytics();
  } else {
    posthog.opt_in_capturing();
  }
}

export function getAnalyticsOptOut() {
  return isOptedOut();
}
