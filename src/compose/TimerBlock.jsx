import { useEffect, useState } from 'react';
import { getTimer, clearTimer } from './timer';

const fmtRemaining = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
};

export default function TimerBlock() {
  const [timer, setTimer] = useState(getTimer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => {
      setNow(Date.now());
      setTimer(getTimer());
    }, 1000);
    return () => clearInterval(i);
  }, []);

  if (!timer) return null;

  const startedMs = new Date(timer.startedAt).getTime();
  const expiresMs = startedMs + timer.durationMs;
  const remaining = expiresMs - now;
  const expired = remaining <= 0;
  const pct = expired ? 100 :
    Math.max(0, Math.min(100, ((timer.durationMs - remaining) / timer.durationMs) * 100));
  const expiresLabel = new Date(expiresMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (expired) {
    return (
      <div className="s2-timer-card s2-timer-expired">
        <div className="s2-timer-row">
          <span className="s2-timer-label">Time's up</span>
          <span className="s2-timer-meta">was {expiresLabel}</span>
        </div>
        <div className="s2-timer-expired-body">File your take — or let it go.</div>
        <button className="s2-timer-dismiss" onClick={() => { clearTimer(); setTimer(null); }}>
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="s2-timer-card">
      <div className="s2-timer-row">
        <span className="s2-timer-label">Time Box</span>
        <span className="s2-timer-meta">expires {expiresLabel}</span>
      </div>
      <div className="s2-timer-val">{fmtRemaining(remaining)}</div>
      <div className="s2-timer-progress"><div className="s2-timer-bar" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
