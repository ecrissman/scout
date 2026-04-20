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
  const t = { date, durationMs, brief: brief || '', startedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(t));
  return t;
}

export function clearTimer() {
  localStorage.removeItem(KEY);
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
