const KEY = 'scout-timer-v1';

export function getTimer() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!t?.startedAt || !t?.durationMs) return null;
    return t;
  } catch { return null; }
}

export function startTimer({ date, durationMs, brief }) {
  const t = { date, durationMs, brief: brief || '', startedAt: new Date().toISOString(), notified: false };
  localStorage.setItem(KEY, JSON.stringify(t));
  // Prompt for notification permission lazily so the Time Box always has
  // a chance to ping the user when it expires — even if they've tabbed
  // away. Permission prompts are one-shot on iOS, so we only ask here.
  requestNotifPermission();
  return t;
}

export function clearTimer() {
  localStorage.removeItem(KEY);
}

export function markNotified() {
  const t = getTimer();
  if (!t || t.notified) return;
  localStorage.setItem(KEY, JSON.stringify({ ...t, notified: true }));
}

// "15 min" / "1 hr" / "3 hr" → ms. Returns 0 for Off / null / unrecognized.
export function parseTimeLabel(label) {
  if (!label) return 0;
  const s = String(label).toLowerCase();
  if (s.startsWith('off')) return 0;
  const m = s.match(/(\d+)\s*(min|hr)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return m[2] === 'hr' ? n * 3600000 : n * 60000;
}

export async function requestNotifPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  try { return await Notification.requestPermission(); }
  catch { return 'default'; }
}

// Fire a local notification when the Time Box hits zero. Routes through the
// SW when available (required for installed PWAs / iOS) and falls back to
// the page-level Notification constructor on desktop.
export async function fireTimerNotification() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const payload = {
    body: 'File your take — or let it go.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'scout-timer',
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Time's up", payload);
      return true;
    }
    new Notification("Time's up", payload);
    return true;
  } catch {
    return false;
  }
}
