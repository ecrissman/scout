// src/push.js
// Web Push subscription glue. Two entry points:
//
//   maybePromptForPush()   — call after a "nice moment" (e.g. user just
//                            filed today's photo). Idempotent: bails out if
//                            we've already prompted, already subscribed,
//                            permission is denied, or push isn't supported.
//
//   unsubscribePush()      — call from the Settings toggle when user opts out.
//
// State tracked in localStorage:
//   scout-push-subscribed : 'yes' | 'no' (we have an active sub)
//   scout-push-prompted   : 'yes'        (we already asked once; don't re-ask)
//
// VAPID public key is read from import.meta.env.VITE_VAPID_PUBLIC_KEY at
// build time. Server uses VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY secrets.

import { supabase } from './supabase.js';

const LS_SUBSCRIBED = 'scout-push-subscribed';
const LS_PROMPTED   = 'scout-push-prompted';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isPushSubscribedLocal() {
  return localStorage.getItem(LS_SUBSCRIBED) === 'yes';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postSubscribe(subscription) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const r = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ subscription: subscription.toJSON(), tz }),
  });
  return r.ok;
}

async function postUnsubscribe(endpoint) {
  const r = await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ endpoint }),
  });
  return r.ok;
}

/**
 * Prompt for permission and subscribe. Returns:
 *   'subscribed' | 'denied' | 'unsupported' | 'no-key' | 'already' | 'error'
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force] — bypass the once-only prompt guard (used
 *   when user explicitly enables push from Settings).
 */
export async function maybePromptForPush(opts = {}) {
  const force = !!opts.force;

  if (!isPushSupported()) return 'unsupported';

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY is not set — skipping prompt');
    return 'no-key';
  }

  // Already subscribed? Refresh the server record but don't prompt again.
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    if (!isPushSubscribedLocal()) {
      // Re-sync (e.g. user reinstalled and the server lost the row).
      await postSubscribe(existing);
      localStorage.setItem(LS_SUBSCRIBED, 'yes');
    }
    return 'already';
  }

  if (Notification.permission === 'denied') return 'denied';
  if (!force && localStorage.getItem(LS_PROMPTED) === 'yes') return 'already';

  // Triggers the browser's permission UI. Must be called from a user-gesture-
  // adjacent context (e.g. inside the post-upload completion handler).
  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  localStorage.setItem(LS_PROMPTED, 'yes');
  if (perm !== 'granted') return 'denied';

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const ok = await postSubscribe(sub);
    if (ok) {
      localStorage.setItem(LS_SUBSCRIBED, 'yes');
      return 'subscribed';
    }
    // Server failed — back the local sub out so we don't get stuck in a
    // broken state.
    await sub.unsubscribe().catch(() => {});
    return 'error';
  } catch (err) {
    console.error('[push] subscribe failed', err);
    return 'error';
  }
}

export async function unsubscribePush() {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await postUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  localStorage.setItem(LS_SUBSCRIBED, 'no');
  return true;
}
