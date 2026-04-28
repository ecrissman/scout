import { useState, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { getPhoto, uploadPhoto, updateCaption, deletePhoto, deleteAccount, listYear, thumbUrl, fullUrl, getFeedback, getCaptionSuggestion } from './api';
import { isPushSupported, isPushSubscribedLocal, maybePromptForPush } from './push';
import { extractEXIF, formatExif, compressFile, makeThumb } from './exif';
import { supabase } from './supabase.js';
import { splitBrief, migrateVoiceId } from './personas';
import { initAnalytics, identify, resetIdentity, track } from './analytics';
const ComposeScreen = lazy(() => import('./compose/ComposeScreen.jsx'));
import ScoutWordmark from './ScoutWordmark.jsx';
import { IcUpload, IcHamburger, ChevLeft, ChevRight, IcBulb } from './components/Icons.jsx';
import AuthImage from './components/AuthImage.jsx';
const LegalSheet = lazy(() => import('./components/LegalSheet.jsx'));
const SettingsSheet = lazy(() => import('./components/SettingsSheet.jsx'));
const AccountSheet = lazy(() => import('./components/AccountSheet.jsx'));
import NavPanel from './components/NavPanel.jsx';
import OnboardingFlow from './components/OnboardingFlow.jsx';
import DevPanel from './components/DevPanel.jsx';
import Splash from './components/Splash.jsx';
import MobileGate from './components/MobileGate.jsx';
import './styles/scout.css';

// Dev flags:
//   ?compose=1         — render the v2 Compose tray instead of the main app
//                         (still gated behind the normal auth flow below)
//   ?compose=1&dev=1   — also bypass auth for pure-design iteration. API
//                         calls will 401, but dev params like ?brief= /
//                         ?note= let us preview render states in isolation.
const _composeSilo = new URLSearchParams(window.location.search).get('compose') === '1';
const _composeDev = _composeSilo && new URLSearchParams(window.location.search).get('dev') === '1';
// ?design=1 bypasses the mobile gate so auth + splash screens can be
// previewed at desktop width during design iteration.
const _designPreview = new URLSearchParams(window.location.search).get('design') === '1';

// Mark standalone PWA mode before first paint so CSS can target it
if (window.navigator.standalone) document.documentElement.classList.add('pwa');

// Capture auth params synchronously at module load — Supabase clears the hash
// almost immediately, so by the time any async code runs it's already gone.
const _isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
const _authInUrl = window.location.hash.includes('access_token') ||
  new URLSearchParams(window.location.search).has('code');




// splitBrief + persona metadata live in src/personas.js now (shared with
// ComposeScreen, OnboardingFlow, SettingsSheet).

const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WDAYS    = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function dk(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function today(){ const n=new Date(); return dk(n.getFullYear(),n.getMonth(),n.getDate()); }
function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return {y,m:m-1,d}; }

const stripMarkdown = (text) => {
  if (!text) return '';
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .trim();
};
// ── Week helpers (Sun–Sat) ──────────────────────────────────────────────────
const getWeekDates = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun
  return Array.from({length: 7}, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() - day + i);
    return dk(dd.getFullYear(), dd.getMonth(), dd.getDate());
  });
};
const CONGRATS_MSGS = [
  'Seven days. Seven frames.',
  'Full week. You showed up.',
  'All seven. That\'s the work.',
  'Zero days missed.',
  'A whole week of seeing.',
  'Seven days of light.',
  'The whole week in frame.',
  'Every single day. Nice.',
  'Seven shots. One week.',
  'You didn\'t miss a day.',
];
const getCongratsMsg = (weekStart) => {
  const idx = weekStart.split('-').reduce((s,n)=>s+parseInt(n),0);
  return CONGRATS_MSGS[idx % CONGRATS_MSGS.length];
};
const formatWeekRange = (dates) => {
  const s = new Date(dates[0] + 'T12:00:00');
  const e = new Date(dates[6] + 'T12:00:00');
  const sm = s.toLocaleString('en-US',{month:'short'}), sd = s.getDate();
  const em = e.toLocaleString('en-US',{month:'short'}), ed = e.getDate();
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`;
};

const reverseGeocode = async (lat, lon) => {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    if (!r.ok) return null;
    const d = await r.json();
    const city = d.address?.city || d.address?.town || d.address?.village;
    const state = d.address?.state;
    return city ? (state ? `${city}, ${state}` : city) : null;
  } catch { return null; }
};

const stripFeedback = (text) => {
  if (!text) return '';
  const cleaned = stripMarkdown(text);
  // Remove leading title lines like "Photography Review:", "Photo Feedback:", etc.
  return cleaned.replace(/^[^\n.!?]{0,60}(?:review|feedback|mentor|critique|assessment)[^\n]*\n+/i, '').trim();
};

export default function App() {
  // Pure-design dev mode — render ComposeScreen without the auth + mobile
  // gates. API calls won't work, but ?brief= / ?note= can still paint the
  // anchor screens for visual review.
  if (_composeDev) return <Suspense fallback={null}><ComposeScreen /></Suspense>;
  const todayStr = today();
  const now = new Date();
  const [TY,TM,TD] = [now.getFullYear(),now.getMonth(),now.getDate()];

  // ── Theme: pref is 'light' | 'dark' | 'system', default 'light' ──
  // One-time migration (v1): existing users on the prior 'system' default
  // or who explicitly picked 'dark' are bumped to 'light'. The toggle in
  // Settings still honors any later explicit choice. Drop this migration
  // once dark mode is re-enabled as a first-class option.
  const [themePref, setThemePref] = useState(() => {
    if (!localStorage.getItem('scout-theme-migrated-v1')) {
      localStorage.setItem('scout-theme-pref', 'light');
      localStorage.setItem('scout-theme-migrated-v1', '1');
      return 'light';
    }
    return localStorage.getItem('scout-theme-pref') || 'light';
  });
  const [systemTheme, setSystemTheme] = useState(()=>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const theme = themePref === 'system' ? systemTheme : themePref;

  useEffect(()=>{
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return ()=>mq.removeEventListener('change', handler);
  }, []);

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('scout-theme-pref', themePref);
  }, [theme, themePref]);

  // ── Mobile-only gate: desktop/tablet see a redirect screen ──
  // Phone detection: shortest viewport edge <= 500px + coarse pointer.
  // Capacitor native builds always pass through.
  const [isMobile, setIsMobile] = useState(() => {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
    return coarse && shortEdge <= 500;
  });
  useEffect(() => {
    const check = () => {
      if (window.Capacitor?.isNativePlatform?.()) { setIsMobile(true); return; }
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const shortEdge = Math.min(window.innerWidth, window.innerHeight);
      setIsMobile(coarse && shortEdge <= 500);
    };
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // ── Splash ──
  const [splashDone,   setSplashDone]   = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  useEffect(()=>{
    // ?splash=1 holds the splash indefinitely for design iteration.
    if (new URLSearchParams(window.location.search).get('splash') === '1') return;
    const t1 = setTimeout(()=>setSplashFading(true), 2200);
    const t2 = setTimeout(()=>setSplashDone(true),   2900);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── Settings ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ── Legal (Privacy / Terms) ──
  const [legalOpen, setLegalOpen] = useState(null); // null | 'privacy' | 'terms'
  const [accountOpen,  setAccountOpen]  = useState(false);
  const [devPanelOpen, setDevPanelOpen] = useState(false);

  // ── Auth ──
  const [authed,      setAuthed]      = useState(false);
  const [userEmail,   setUserEmail]   = useState(null);
  const [checking,    setChecking]    = useState(true);
  const [email,       setEmail]       = useState('');
  const [pw,          setPw]          = useState('');
  const [loginErr,    setLoginErr]    = useState('');
  const [loginBusy,   setLoginBusy]   = useState(false);
  const [forgotView,   setForgotView]   = useState(false); // 'request' | 'set' | false
  const [resetMsg,     setResetMsg]     = useState(null);
  const [newPwVal,     setNewPwVal]     = useState('');
  const [resetBusy,    setResetBusy]    = useState(false);
  const [signupView,   setSignupView]   = useState(false); // false | 'form' | 'success'
  const [showLanding,  setShowLanding]  = useState(true);
  const [onboarded,    setOnboarded]    = useState(() => localStorage.getItem('scout-onboarded') === '1');
  const [signupEmail,  setSignupEmail]  = useState('');
  const [signupPw,     setSignupPw]     = useState('');
  const [signupPwConfirm, setSignupPwConfirm] = useState('');
  const [signupBusy,   setSignupBusy]   = useState(false);
  const [signupErr,    setSignupErr]    = useState('');
  const [deleteAccBusy, setDeleteAccBusy] = useState(false);

  // ── Navigation state ──
  const [activeTab,     setActiveTab]     = useState('today');
  const [showTodaySheet, setShowTodaySheet] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [cm, setCm] = useState(TM);
  const [cy, setCy] = useState(TY);
  const [sel,        setSel]        = useState(todayStr);

  // ── Day data ──
  const [dayMeta,    setDayMeta]    = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [caption,    setCaption]    = useState('');
  const [busy,       setBusy]       = useState(false);
  const [photoDates, setPhotoDates] = useState(new Set());

  // ── AI features ──
  const [feedback,           setFeedback]           = useState(null);
  const [briefExpanded,      setBriefExpanded]      = useState(false);
  // Editor's Note full-screen reveal moment — fires once per note, on first
  // view. Keyed by date in localStorage (`scout-note-seen-${date}`). After
  // dismissal, the note lives inline on Today under Field Note.
  const [noteReveal,         setNoteReveal]         = useState(null); // date key or null
  const [noteRevealShown,    setNoteRevealShown]    = useState(0);
  // Edition toast — in-app stand-in for the push notification. Fires when
  // the 20:00 gate lifts while the app is already open. Taps it to open
  // the full-screen reveal; auto-dismisses after 8 seconds.
  const [editionToast,       setEditionToast]       = useState(null); // date key or null
  const [captionSuggestion,  setCaptionSuggestion]  = useState(null);
  const [captionSuggestLoad, setCaptionSuggestLoad] = useState(false);
  const [photoVer,           setPhotoVer]           = useState(()=>Date.now());

  const [lightboxOpen,  setLightboxOpen]  = useState(false);
  const [overflowOpen,  setOverflowOpen]  = useState(false);
  const [locationName,  setLocationName]  = useState(null);
  // AI features are always on. The user-facing toggle was retired; the
  // localStorage key is no longer read or written. Keeping the constant
  // avoids touching the dozens of `aiEnabled && …` call sites scattered
  // through the app — re-introduce a setter here if/when the toggle returns.
  const aiEnabled = true;
  const [briefVoice, setBriefVoice] = useState(() => migrateVoiceId());
  useEffect(() => { localStorage.setItem('scout-brief-voice', briefVoice); }, [briefVoice]);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(()=> localStorage.getItem('scout-analytics-optout') !== 'true');
  const [pushEnabled, setPushEnabled] = useState(()=> isPushSupported() && isPushSubscribedLocal());
  const fileRef        = useRef(null);
  const cameraRef      = useRef(null);
  const captionRef     = useRef(null);
  const lbTouchRef     = useRef(null);
  const swipeTouchRef  = useRef(null);
  const monthScrollRef = useRef(null);
  const dayViewedRef   = useRef(new Set()); // dedupe day_viewed events per session


  useEffect(()=>{
    // Initialize PostHog (no-op if opted out or env keys missing).
    initAnalytics();

    // ── Safari → PWA cookie bridge ──
    // _isStandalone and _authInUrl are captured at module load (synchronously),
    // before Supabase has a chance to clear the URL hash.
    const writeBridgeCookie = (session) => {
      const payload = JSON.stringify({ a: session.access_token, r: session.refresh_token });
      document.cookie = `scout_auth_bridge=${encodeURIComponent(payload)}; max-age=300; path=/; SameSite=Lax`;
    };
    const readBridgeCookie = () => {
      const match = document.cookie.match(/(?:^|;\s*)scout_auth_bridge=([^;]*)/);
      if (!match) return null;
      try { return JSON.parse(decodeURIComponent(match[1])); } catch { return null; }
    };
    const clearBridgeCookie = () => {
      document.cookie = 'scout_auth_bridge=; max-age=0; path=/; SameSite=Lax';
    };

    supabase.auth.getSession().then(async ({ data }) => {
      let session = data.session;

      // PWA: no session in localStorage — check for bridged cookie from Safari OAuth
      if (!session && _isStandalone) {
        const bridged = readBridgeCookie();
        if (bridged) {
          const { data: restored } = await supabase.auth.setSession({ access_token: bridged.a, refresh_token: bridged.r });
          clearBridgeCookie();
          session = restored.session;
        }
      }

      // Safari: just completed OAuth — write bridge cookie so PWA can pick it up
      if (!_isStandalone && _authInUrl && session) {
        writeBridgeCookie(session);
        window.history.replaceState(null, '', window.location.pathname);
      }

      const hasSession = !!session;
      setAuthed(hasSession);
      setUserEmail(session?.user?.email || null);
      if (hasSession) {
        setShowLanding(false);
        // Attach PostHog identity to the Supabase user id. Uses the user id
        // (never email) so events never carry PII.
        identify(session.user.id);
      }
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setForgotView('set'); return; }
      // Don't flip authed during a bridge handoff — we handle that flow separately
      if (!_isStandalone && _authInUrl) return;
      setAuthed(!!session);
      setUserEmail(session?.user?.email || null);
      if (event === 'SIGNED_IN') {
        if (session?.user) {
          identify(session.user.id);
          const provider = session.user.app_metadata?.provider || 'email';
          track('signin_succeeded', { method: provider });
          // Detect freshly-confirmed signup: the user row was created in the
          // last 5 minutes. Close enough to distinguish "first login after
          // email confirmation" from "returning user signing in".
          const createdAt = session.user.created_at
            ? new Date(session.user.created_at).getTime()
            : 0;
          if (createdAt && Date.now() - createdAt < 5 * 60 * 1000) {
            track('signup_confirmed', { method: provider });
          }
        }
      }
      if (event === 'SIGNED_OUT') {
        track('signout');
        resetIdentity();
      }
    });
    return () => subscription.unsubscribe();
  }, []);


  useEffect(()=>{
    const handler = (e) => { if (e.key==='Escape') { setLightboxOpen(false); setSettingsOpen(false); setLegalOpen(null); } };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  }, []);

  // Push notification entry points — the URL param (cold start from a
  // notification tap) and the SW postMessage (warm focus) both navigate to
  // the day specified by the Editor's Note push payload.
  useEffect(() => {
    const openDate = (date) => {
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      setSel(date);
      setActiveTab('today');
      // Notification tap → force-open the Editor's Note reveal, even if the
      // user has already dismissed it for this date. The reveal component
      // paints once `feedback` loads for this day.
      setNoteReveal(date);
      setNoteRevealShown(0);
    };
    try {
      const params = new URLSearchParams(window.location.search);
      const noteDate = params.get('note');
      if (noteDate) {
        openDate(noteDate);
        const url = new URL(window.location.href);
        url.searchParams.delete('note');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
    if ('serviceWorker' in navigator) {
      const onMsg = (e) => { if (e.data?.type === 'open-note') openDate(e.data.date); };
      navigator.serviceWorker.addEventListener('message', onMsg);
      return () => navigator.serviceWorker.removeEventListener('message', onMsg);
    }
  }, []);

  // Sync theme-color meta + html/body background with current screen so iOS status bar matches.
  // useLayoutEffect fires before paint on state changes; the visibilitychange/pageshow listeners
  // handle the case where iOS resets the bar after the app is backgrounded/foregrounded.
  const applyStatusBarColor = useCallback(()=>{
    // Mirror the exact JSX render condition — only treat sheet as "visible" when it actually renders
    const todaySheetVisible = showTodaySheet && sel === todayStr && !dayMeta && !dayLoading;
    let color;
    if (!splashDone)             color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    else if (showLanding)        color = '#0C0C0C';
    else if (!authed)            color = '#0C0C0C';
    else if (lightboxOpen)        color = '#000000';
    else if (todaySheetVisible)  color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    else                         color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = color;
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
  }, [splashDone, showLanding, authed, lightboxOpen, showTodaySheet, sel, todayStr,
      dayMeta, dayLoading, theme]);

  useLayoutEffect(()=>{ applyStatusBarColor(); }, [applyStatusBarColor]);

  useEffect(()=>{
    document.addEventListener('visibilitychange', applyStatusBarColor);
    window.addEventListener('pageshow', applyStatusBarColor);
    return ()=>{
      document.removeEventListener('visibilitychange', applyStatusBarColor);
      window.removeEventListener('pageshow', applyStatusBarColor);
    };
  }, [applyStatusBarColor]);

  const lbGo = useCallback((dateStr) => {
    const p = parseDate(dateStr);
    setSel(dateStr); setCm(p.m); setCy(p.y);
  }, []);

  useEffect(()=>{
    if (!lightboxOpen) return;
    const sorted = [...photoDates].sort();
    const idx = sorted.indexOf(sel);
    const handler = (e) => {
      if (e.key==='ArrowLeft'  && idx > 0)                 lbGo(sorted[idx - 1]);
      if (e.key==='ArrowRight' && idx < sorted.length - 1) lbGo(sorted[idx + 1]);
    };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  }, [lightboxOpen, sel, photoDates, lbGo]);
  useEffect(()=>{
    if (!authed) return;
    listYear(TY).then(dates => {
      const dateSet = new Set(dates);
      setPhotoDates(dateSet);
    });
  }, [authed]);

  useEffect(()=>{
    if (!authed || cy === TY) return;
    listYear(cy).then(dates => {
      if (dates.length) setPhotoDates(prev => new Set([...prev, ...dates]));
    });
  }, [authed, cy]);
  useEffect(()=>{
    if (!authed||!sel) return;
    // Track unique day views per session (deduped so swipes don't spam events)
    if (!dayViewedRef.current.has(sel)) {
      dayViewedRef.current.add(sel);
      track('day_viewed', { is_today: sel === todayStr, has_photo: photoDates.has(sel) });
    }
    setDayLoading(true);
    setFeedback(null);
    setCaptionSuggestion(null);
    setCaptionSuggestLoad(false);
    setLocationName(null);
    getPhoto(sel).then(data=>{
      setDayMeta(data);
      setCaption(data?.caption||'');
      // Prefer the v2 editor note (attached by the Compose flow) over the
      // v1 feedback field; both render inside the same Field Note block.
      const note = data?.editorNote || data?.feedback || null;
      if (note) setFeedback(note);
      // Evening-edition gate: the reveal auto-fires only for today, and
      // only after 20:00 local. Past dates never auto-reveal — tapping
      // an archive tile opens the lightbox, not the note. The banner on
      // the day detail is still how users re-read a past note.
      const nowHour = new Date().getHours();
      const gatedToday = nowHour < 20;
      if (note && sel === todayStr && !gatedToday && !localStorage.getItem(`scout-note-seen-${sel}`)) {
        setNoteReveal(sel);
        setNoteRevealShown(0);
      }
      setDayLoading(false);
      const { lat, lon } = data?.exif || {};
      if (lat != null && lon != null) reverseGeocode(lat, lon).then(name => { if (name) setLocationName(name); });
    });
  }, [sel, authed]);

  // ── Evening edition auto-open at 20:00 ──
  // If the app is open when the gate lifts, fire the reveal on its own
  // without requiring a reload or re-navigation. Recomputes the delay on
  // every dep change, so filing a photo mid-afternoon arms the timer.
  useEffect(() => {
    if (!feedback || sel !== todayStr) return;
    if (localStorage.getItem(`scout-note-seen-${todayStr}`)) return;
    const now = new Date();
    const target = new Date(now);
    target.setHours(20, 0, 0, 0);
    const delay = target - now;
    if (delay <= 0) return; // already past 20:00 — the load-time trigger handled it
    const t = setTimeout(() => {
      if (localStorage.getItem(`scout-note-seen-${todayStr}`)) return;
      setEditionToast(todayStr);
    }, delay);
    return () => clearTimeout(t);
  }, [feedback, sel, todayStr]);

  // ── Edition toast auto-dismiss (8s) ──
  useEffect(() => {
    if (!editionToast) return;
    const t = setTimeout(() => setEditionToast(null), 8000);
    return () => clearTimeout(t);
  }, [editionToast]);

  // ── Typewriter reveal for the Editor's Note full-screen moment ──
  useEffect(() => {
    if (!noteReveal || !feedback) return;
    if (noteRevealShown >= feedback.length) return;
    const t = setTimeout(() => setNoteRevealShown(n => Math.min(feedback.length, n + 1)), 28);
    return () => clearTimeout(t);
  }, [noteReveal, feedback, noteRevealShown]);

  // Map Supabase auth errors to friendlier copy. Falls back to the original
  // string for anything we don't explicitly recognize.
  const friendlyAuthError = (msg) => {
    if (!msg) return '';
    const m = msg.toLowerCase();
    if (m.includes('invalid login credentials')) return 'Wrong email or password.';
    if (m.includes('email not confirmed')) return 'Please confirm your email first.';
    if (m.includes('rate limit')) return 'Too many attempts. Try again in a moment.';
    if (m.includes('user already registered') || m.includes('already been registered'))
      return 'An account with this email already exists.';
    if (m.includes('signups not allowed')) return 'Signups are temporarily disabled.';
    if (m.includes('password should be')) return 'Password must be at least 8 characters.';
    return msg;
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoginBusy(true); setLoginErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setLoginErr(friendlyAuthError(error.message));
    setLoginBusy(false);
  };

  const handleGoogleLogin = async () => {
    setLoginBusy(true); setLoginErr('');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      },
    });
    if (error) { setLoginErr(friendlyAuthError(error.message)); setLoginBusy(false); return; }
    if (data?.url) window.location.href = data.url;
    setLoginBusy(false);
  };

  const handleAppleLogin = async () => {
    setLoginBusy(true); setLoginErr('');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
      },
    });
    if (error) { setLoginErr(friendlyAuthError(error.message)); setLoginBusy(false); return; }
    if (data?.url) window.location.href = data.url;
    setLoginBusy(false);
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault(); setResetBusy(true); setResetMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setResetMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Check your email for a reset link.' });
    setResetBusy(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setSignupErr('');
    if (signupPw !== signupPwConfirm) { setSignupErr('Passwords do not match.'); return; }
    if (signupPw.length < 8) { setSignupErr('Password must be at least 8 characters.'); return; }
    setSignupBusy(true);
    track('signup_submitted');
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPw,
      options: { emailRedirectTo: window.location.origin },
    });
    setSignupBusy(false);
    if (error) { setSignupErr(friendlyAuthError(error.message)); return; }
    // Supabase returns success (not an error) for an email that already exists,
    // to prevent email enumeration attacks. Detect it via data.user.identities
    // being an empty array and surface a friendly error.
    if (data?.user && (data.user.identities?.length ?? 0) === 0) {
      setSignupErr('An account with this email already exists.');
      return;
    }
    setSignupView('success');
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Permanently delete your account and all photos? This cannot be undone.')) return;
    setDeleteAccBusy(true);
    const ok = await deleteAccount();
    if (!ok) {
      alert('Something went wrong. Please try again or contact eric@scoutphoto.app.');
      setDeleteAccBusy(false);
      return;
    }
    await supabase.auth.signOut();
    setDeleteAccBusy(false);
    setSettingsOpen(false);
    setAuthed(false);
    setShowLanding(true);
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault(); setResetBusy(true); setResetMsg(null);
    if (newPwVal.length < 6) { setResetMsg({ ok: false, text: 'Min 6 characters' }); setResetBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPwVal });
    if (error) { setResetMsg({ ok: false, text: error.message }); }
    else { setForgotView(false); setNewPwVal(''); setAuthed(true); }
    setResetBusy(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSettingsOpen(false);
    setAccountOpen(false);
    setAuthed(false);
    setShowLanding(true);
  };

  const [pwNew,         setPwNew]         = useState('');
  const [pwChanging,    setPwChanging]    = useState(false);
  const [pwMsg,         setPwMsg]         = useState(null); // {ok, text}
  const [dlProgress,    setDlProgress]    = useState(null); // null | {done, total}
  const [pwExpanded,    setPwExpanded]    = useState(false);
  const [devDeleteMode,      setDevDeleteMode]      = useState(true);

  const handleChangePassword = async () => {
    if (!pwNew || pwNew.length < 6) { setPwMsg({ ok: false, text: 'Min 6 characters' }); return; }
    setPwChanging(true); setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) { setPwMsg({ ok: false, text: error.message }); }
    else { setPwMsg({ ok: true, text: 'Password updated' }); setPwNew(''); }
    setPwChanging(false);
  };

  const handleDownloadAllPhotos = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const dates = [...photoDates].sort();
    if (!dates.length) return;
    setDlProgress({ done: 0, total: dates.length });
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      try {
        const r = await fetch(fullUrl(date), { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) continue;
        const blob = await r.blob();
        // Try Web Share API first (saves to Photos on iOS)
        const file = new File([blob], `scout-${date}.webp`, { type: 'image/webp' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Scout — ${date}` });
        } else {
          // Fallback: anchor download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `scout-${date}.webp`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          await new Promise(res => setTimeout(res, 400));
        }
      } catch { /* skip failed */ }
      setDlProgress({ done: i + 1, total: dates.length });
    }
    setDlProgress(null);
  };

  const handleDeletePhoto = async () => {
    if (!sel || !dayMeta) return;
    setBusy(true);
    const ok = await deletePhoto(sel);
    if (ok) {
      setDayMeta(null);
      setCaption('');
      setFeedback(null);
      setLocationName(null);
      setPhotoVer(Date.now());
      const next = new Set([...photoDates]);
      next.delete(sel);
      setPhotoDates(next);
    }
    setBusy(false);
  };

  const selectDate = (dateStr) => {
    const p = parseDate(dateStr);
    setSel(dateStr);
    setCm(p.m);
    setCy(p.y);
    if (dateStr === todayStr && !photoDates.has(dateStr)) {
      // Today with no photo: switch to Today tab, show the Compose tray
      setShowTodaySheet(true);
      setActiveTab('today');
    } else {
      setActiveTab('today');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file||!sel) return;
    const fromCamera = e.target === cameraRef.current;
    e.target.value=''; setBusy(true); setFeedback(null);
    try {
      const exif = await extractEXIF(file);
      if (fromCamera && !exif?.model && !exif?.et) {
        console.info('[Scout] Camera EXIF empty — file type:', file.type, 'size:', file.size);
      }
      const fullSrc = await compressFile(file);
      const thumbSrc = await makeThumb(fullSrc);
      const ok = await uploadPhoto(sel, {fullSrc, thumbSrc, exif, caption});
      if (ok) {
        setDayMeta({exif, caption});
        setShowTodaySheet(false);
        setActiveTab('today');
        const newPhotoDates = new Set([...photoDates, sel]);
        setPhotoDates(newPhotoDates);
        setPhotoVer(Date.now());
        track('photo_uploaded', {
          via: fromCamera ? 'camera' : 'library',
          first_photo_ever: newPhotoDates.size === 1,
          is_today: sel === todayStr,
        });
        // Tie the push permission prompt to a positive moment — the user
        // just filed today's photo. maybePromptForPush() self-gates so this
        // only actually prompts once.
        if (aiEnabled && sel === todayStr) {
          maybePromptForPush().then(result => {
            if (result === 'subscribed') setPushEnabled(true);
          });
        }
        if (exif?.lat != null && exif?.lon != null) reverseGeocode(exif.lat, exif.lon).then(name => { if (name) setLocationName(name); });
        else setLocationName(null);
        // Only fire the editor-note pipeline for today's filings. Back-
        // filling a past date is a logistical action, not a creative
        // submission — no note, no 20:00 reveal.
        if (aiEnabled && sel === todayStr) {
          getFeedback(sel).then(result => {
            if (result?.feedback) setFeedback(result.feedback);
          });
        }
      }
    } catch(err){ console.error(err); }
    setBusy(false);
  };

  const navigateDay = (dir) => {
    const [y,m,d] = sel.split('-').map(Number);
    const date = new Date(y, m-1, d);
    date.setDate(date.getDate() + dir);
    const newSel = dk(date.getFullYear(), date.getMonth(), date.getDate());
    if (newSel > todayStr) return;
    // Navigating forward to today with no photo → show the tray, stay on month
    if (newSel === todayStr && !photoDates.has(newSel)) {
      setSel(newSel);
      setActiveTab('today');
      setShowTodaySheet(true);
      return;
    }
    setSel(newSel);
    setCm(date.getMonth());
    setCy(date.getFullYear());
  };

  const dismissPanel = () => {
    setPanelClosing(true);
    setTimeout(() => { setPanelOpen(false); setPanelClosing(false); }, 300);
  };

  const handleDownload = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    const r = await fetch(fullUrl(sel), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scout-${sel}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCaptionSuggest = async () => {
    setCaptionSuggestLoad(true);
    const result = await getCaptionSuggestion(sel);
    if (result?.caption) {
      setCaptionSuggestion(result.caption);
      track('ai_caption_suggested', { accepted: false });
    }
    setCaptionSuggestLoad(false);
  };

  const acceptCaptionSuggestion = () => {
    setCaption(captionSuggestion);
    setCaptionSuggestion(null);
    updateCaption(sel, captionSuggestion);
    setDayMeta(prev => ({ ...prev, caption: captionSuggestion }));
    track('ai_caption_suggested', { accepted: true });
    track('caption_edited', { source: 'ai_suggestion', length: captionSuggestion.length });
  };

  useEffect(()=>{
    const el = captionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [caption]);

  const saveCaption = useCallback(async()=>{
    if (!sel||!dayMeta) return;
    const prevCaption = dayMeta.caption || '';
    if (caption === prevCaption) return;
    await updateCaption(sel, caption);
    setDayMeta(prev=>({...prev, caption}));
    track('caption_edited', { source: 'manual', length: caption.length });
  }, [sel, dayMeta, caption]);

  const calCells = () => {
    const fd=new Date(cy,cm,1).getDay(), dim=new Date(cy,cm+1,0).getDate();
    return [...Array.from({length:fd},(_,i)=>({ghost:true,i})), ...Array.from({length:dim},(_,i)=>({d:i+1}))];
  };

  const {strip, camera} = formatExif(dayMeta?.exif);
  const selParsed  = sel ? parseDate(sel) : null;

  const lbSorted  = [...photoDates].sort();
  const lbIdx     = sel ? lbSorted.indexOf(sel) : -1;
  const lbPrev    = lbIdx > 0 ? lbSorted[lbIdx - 1] : null;
  const lbNext    = lbIdx < lbSorted.length - 1 ? lbSorted[lbIdx + 1] : null;
  const lbLabel   = sel ? new Date(sel + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';

  const splash = !splashDone && <Splash fading={splashFading} theme={theme} />;


  // Desktop/tablet lockout — show a single directive to open on mobile.
  // The ?compose=1 silo and ?design=1 flag bypass the gate so design
  // iteration can happen on desktop during the rebrand; gate resumes
  // once the flags are gone.
  if (!isMobile && !_composeSilo && !_designPreview) return <MobileGate />;

  // PWA receiving OAuth callback directly — show clean dark screen instead of flash
  if (checking && _isStandalone && _authInUrl) return (
    <div style={{position:'fixed',inset:0,background:'#0C0C0C'}} />
  );

  if (checking) return splash || null;

  if (forgotView === 'set') return (
    <form className="s2-auth" onSubmit={handleSetNewPassword} data-theme={theme}>
      <div className="s2-auth-wordmark">
        <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
        <div className="s2-auth-hed">Set a new password</div>
      </div>
      <div className="s2-auth-fields">
        <input className="s2-auth-input" type="password" value={newPwVal}
          onChange={e=>setNewPwVal(e.target.value)} placeholder="New password"
          autoComplete="new-password" autoFocus />
        {resetMsg && (
          resetMsg.ok
            ? <div className="s2-auth-helper" style={{color:'var(--s2-press-green)'}}>{resetMsg.text}</div>
            : <div className="s2-auth-err">{resetMsg.text}</div>
        )}
      </div>
      <div style={{marginTop:20}}>
        <button className="s2-auth-btn s2-auth-btn-primary" type="submit" disabled={resetBusy || !newPwVal}>
          {resetBusy ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </form>
  );

  if (!onboarded) return (
    <OnboardingFlow
      briefVoice={briefVoice}
      setBriefVoice={setBriefVoice}
      onDone={() => { localStorage.setItem('scout-onboarded', '1'); setOnboarded(true); }}
    />
  );

  if (!authed && showLanding) return (
    <>
      {splash}
      <div className="s2-auth">
        <div className="s2-auth-wordmark">
          <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
          <div className="s2-auth-hed">Welcome back</div>
        </div>
        <div style={{marginTop:'auto', paddingTop:24}}>
          <button type="button" className="s2-auth-btn s2-auth-btn-primary" onClick={handleAppleLogin} disabled={loginBusy}>
            <svg className="s2-auth-btn-ico" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Continue with Apple
          </button>
          <button type="button" className="s2-auth-btn" onClick={handleGoogleLogin} disabled={loginBusy}>
            <svg className="s2-auth-btn-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.72.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
          <button type="button" className="s2-auth-btn" onClick={()=>setShowLanding(false)} disabled={loginBusy}>
            <svg className="s2-auth-btn-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            Continue with Email
          </button>
          {loginErr && <div className="s2-auth-err" style={{marginTop:12}}>{loginErr}</div>}
          <div className="s2-auth-footer">
            Don't have an account?{' '}
            <button type="button" className="s2-auth-link" onClick={()=>{ track('signup_started'); setShowLanding(false); setSignupView('form'); }}>
              Sign up
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (!authed) return (
    <>
      {splash}
      {signupView === 'success' ? (
        <div className="s2-auth">
          <div className="s2-auth-wordmark">
            <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
            <div className="s2-auth-hed">Check your email</div>
          </div>
          <div className="s2-auth-helper" style={{marginTop:20}}>
            We sent a confirmation link. Open it, then sign in.
          </div>
          <div style={{marginTop:'auto', paddingTop:24}}>
            <button type="button" className="s2-auth-btn s2-auth-btn-primary" onClick={()=>{ setSignupView(false); setSignupEmail(''); setSignupPw(''); setSignupPwConfirm(''); setSignupErr(''); }}>
              Back to sign in
            </button>
          </div>
        </div>
      ) : signupView === 'form' ? (
        <form className="s2-auth" onSubmit={handleSignup} data-theme={theme}>
          <div className="s2-auth-wordmark">
            <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
            <div className="s2-auth-hed">Create your account</div>
          </div>
          <div className="s2-auth-fields">
            <input className="s2-auth-input" type="email" value={signupEmail}
              onChange={e=>{setSignupEmail(e.target.value);setSignupErr('');}}
              placeholder="Email" autoComplete="email" required autoFocus />
            <input className="s2-auth-input" type="password" value={signupPw}
              onChange={e=>{setSignupPw(e.target.value);setSignupErr('');}}
              placeholder="Password" autoComplete="new-password" required />
            <input className="s2-auth-input" type="password" value={signupPwConfirm}
              onChange={e=>{setSignupPwConfirm(e.target.value);setSignupErr('');}}
              placeholder="Confirm password" autoComplete="new-password" required />
            {signupErr && <div className="s2-auth-err">{signupErr}</div>}
          </div>
          <div style={{marginTop:20}}>
            <button className="s2-auth-btn s2-auth-btn-primary" type="submit"
              disabled={signupBusy || !signupEmail.trim() || !signupPw || !signupPwConfirm}>
              {signupBusy ? 'Creating…' : 'Create account'}
            </button>
          </div>
          <div className="s2-auth-footer">
            <button type="button" className="s2-auth-link" onClick={()=>{ setSignupView(false); setSignupEmail(''); setSignupPw(''); setSignupPwConfirm(''); setSignupErr(''); }}>
              Back to sign in
            </button>
          </div>
        </form>
      ) : forgotView === 'request' ? (
        <form className="s2-auth" onSubmit={handleForgotRequest} data-theme={theme}>
          <div className="s2-auth-wordmark">
            <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
            <div className="s2-auth-hed">Reset your password</div>
          </div>
          <div className="s2-auth-fields">
            <input className="s2-auth-input" type="email" value={email}
              onChange={e=>setEmail(e.target.value)} placeholder="Email"
              autoComplete="email" required autoFocus />
            {resetMsg && (
              resetMsg.ok
                ? <div className="s2-auth-helper" style={{color:'var(--s2-press-green)'}}>{resetMsg.text}</div>
                : <div className="s2-auth-err">{resetMsg.text}</div>
            )}
          </div>
          <div style={{marginTop:20}}>
            <button className="s2-auth-btn s2-auth-btn-primary" type="submit" disabled={resetBusy || !email}>
              {resetBusy ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
          <div className="s2-auth-footer">
            <button type="button" className="s2-auth-link" onClick={()=>{setForgotView(false);setResetMsg(null);}}>
              Back to sign in
            </button>
          </div>
        </form>
      ) : (
        <form className="s2-auth" onSubmit={handleLogin} data-theme={theme}>
          <div className="s2-auth-wordmark">
            <ScoutWordmark size={45} color="#FFFCF6" ruleColor="#007C04" gap={40} />
          </div>
          <div className="s2-auth-fields">
            <input className="s2-auth-input" type="email" value={email}
              onChange={e=>setEmail(e.target.value)} placeholder="Email"
              autoComplete="email" required autoFocus />
            <input className="s2-auth-input" type="password" value={pw}
              onChange={e=>setPw(e.target.value)} placeholder="Enter your password"
              autoComplete="current-password" required />
            {loginErr && <div className="s2-auth-err">{loginErr}</div>}
          </div>
          <div style={{marginTop:20}}>
            <button className="s2-auth-btn s2-auth-btn-primary" type="submit" disabled={loginBusy || !email || !pw}>
              {loginBusy ? 'Signing in…' : 'Continue'}
            </button>
          </div>
          <div className="s2-auth-actions">
            <button type="button" className="s2-auth-text-btn" onClick={()=>setShowLanding(true)}>
              Back
            </button>
            <button type="button" className="s2-auth-text-btn" onClick={()=>{setForgotView('request');setResetMsg(null);}}>
              Forgot password?
            </button>
          </div>
        </form>
      )}
    </>
  );

  // Silo gate: ?compose=1 renders the v2 Compose screen for authed users
  // only. Non-authed users fall through to the normal landing/login flow
  // above so they can sign in first; after auth, this check takes over.
  if (_composeSilo) return <Suspense fallback={null}><ComposeScreen /></Suspense>;

  return (
    <>
    {splash}
    <div className={`pj-layout has-tabbar${activeTab==='calendar'?' tab-calendar':''}${activeTab==='archive'?' tab-archive':''}`} data-theme={theme}>

      <aside className="pj-sidebar">
        {/* Topbar — hamburger only; Calendar and Archive share this. */}
        <div className="pj-topbar">
          <button className="settings-btn" onClick={()=>setPanelOpen(true)} aria-label="Menu">
            <IcHamburger/>
          </button>
        </div>

        {/* ── Archive tab (masonry feed, newest first, month-grouped) ── */}
        <div className="archive-scroll" style={{display: activeTab==='archive' ? 'block' : 'none'}}>
          {photoDates.size > 0 && (
            <div className="page-header">
              <div className="page-header-eyebrow">{photoDates.size} FILED</div>
              <h1 className="page-header-title">Back Issues</h1>
            </div>
          )}
          {photoDates.size===0 ? (
            <div className="archive-empty">
              <div className="archive-empty-lbl">Back Issues</div>
              <div className="archive-empty-h">Nothing filed yet.</div>
              <div className="archive-empty-sub">File today's take and it lands here.</div>
            </div>
          ) : (() => {
            const sorted = [...photoDates].sort().reverse();
            const groups = [];
            let curYM = null, curArr = null;
            for (const d of sorted) {
              const ym = d.slice(0,7);
              if (ym !== curYM) { curYM = ym; curArr = []; groups.push({ ym, dates: curArr }); }
              curArr.push(d);
            }
            return groups.map(({ ym, dates }) => {
              const [gy, gm] = ym.split('-').map(Number);
              const label = `${MONTHS[gm-1]} ${gy}`;
              return (
                <div key={ym}>
                  <div className="archive-month-header">{label}</div>
                  <div className="archive-masonry">
                    {dates.map(d => (
                      <button
                        key={d}
                        className="archive-tile"
                        onClick={() => { setSel(d); const p = parseDate(d); setCm(p.m); setCy(p.y); setLightboxOpen(true); }}
                        aria-label={`Open photo from ${d}`}
                      >
                        <AuthImage src={thumbUrl(d)} alt="" loading="lazy"/>
                      </button>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* ── Calendar tab — scrollable month view, current month first ── */}
        <div className="month-scroll" style={{display: activeTab==='calendar' ? 'block' : 'none'}}>
          <div className="page-header">
            <div className="page-header-eyebrow">{TY}</div>
            <h1 className="page-header-title">Editions</h1>
          </div>
          {Array.from({length:TM+1},(_,i)=> TM - i).map(mi=>{
            const fd=new Date(TY,mi,1).getDay(), dim=new Date(TY,mi+1,0).getDate();
            const cells=[
              ...Array.from({length:fd},(_,i)=>({ghost:true,i})),
              ...Array.from({length:dim},(_,i)=>({d:i+1})),
            ];
            return (
              <div key={mi} id={`month-${TY}-${mi}`} className="month-section">
                <div className="month-section-label">{MONTHS[mi]}</div>
                <div className="cal-wds">{WDAYS.map(d=><div key={d} className="wd">{d[0]}</div>)}</div>
                <div className="cal-grid">
                  {cells.map((cell,i)=>{
                    if (cell.ghost) return <div key={`g${mi}-${i}`} className="cc ghost"/>;
                    const k=dk(TY,mi,cell.d), hasPhoto=photoDates.has(k);
                    const isToday=mi===TM&&cell.d===TD, isSel=k===sel;
                    const isFuture=k>todayStr;
                    return (
                      <div key={k} className={`cc${hasPhoto?' filled':''}${isToday?' tod':''}${isSel&&!isToday?' sel':''}${isFuture?' future':''}`}
                        onClick={isFuture?undefined:()=>selectDate(k)}>
                        {hasPhoto&&<AuthImage src={`${thumbUrl(k)}${k===sel?`?v=${photoVer}`:''}`} alt="" loading="lazy"/>}
                        <span className="cn">{cell.d}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{height:24}}/>
        </div>
      </aside>

      <main className="pj-main"
        onTouchStart={(e)=>{ swipeTouchRef.current = e.touches[0].clientX; }}
        onTouchEnd={(e)=>{
          if (swipeTouchRef.current === null) return;
          const dx = e.changedTouches[0].clientX - swipeTouchRef.current;
          swipeTouchRef.current = null;
          if (Math.abs(dx) < 50) return;
          if (dx > 0) navigateDay(-1);
          else if (sel < todayStr) navigateDay(1);
        }}
      >
        {/* Row 1: brand row — visible on mobile only, hidden on desktop since sidebar has it */}
        <div className="pj-topbar main-brand-row">
          <button className="settings-btn" onClick={()=>setPanelOpen(true)} aria-label="Menu"><IcHamburger/></button>
          <div className="today-date-nav">
            {dayMeta && (
              <div className="overflow-wrap">
                <button className="overflow-btn" onClick={() => setOverflowOpen(o => !o)} aria-label="More options">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/>
                  </svg>
                </button>
                {overflowOpen && <>
                  <div className="overflow-backdrop" onClick={() => setOverflowOpen(false)}/>
                  <div className="overflow-menu">
                    <button className="overflow-item" onClick={() => { setOverflowOpen(false); fileRef.current?.click(); }} disabled={busy}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7h11M3 7l3-3M3 7l3 3"/><path d="M17 13H6M17 13l-3-3M17 13l-3 3"/>
                      </svg>
                      Replace photo
                    </button>
                    <button className="overflow-item" onClick={() => { setOverflowOpen(false); handleDownload(); }}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 15h14"/>
                      </svg>
                      Download
                    </button>
                    {userEmail==='ecrissman@gmail.com'&&(
                      <button className="overflow-item overflow-item-danger" onClick={() => { setOverflowOpen(false); handleDeletePhoto(); }} disabled={busy}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/>
                        </svg>
                        Delete photo
                      </button>
                    )}
                  </div>
                </>}
              </div>
            )}
          </div>
        </div>

        {/* Hidden file inputs — always present so sheet buttons can trigger them */}
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFile}/>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handleFile}/>

        {/* Today with photo or past day */}
        {!(sel===todayStr&&!dayMeta) ? (
          <>
            {/* Editor's Note banner — top-of-page notification strip.
                Pending: quiet reviewing state. Available: press-green dot +
                CTA, taps to open the full-screen Edition reveal. */}
            {dayMeta&&(()=>{
              const EDITION_HOUR = 20;
              const nowH = new Date().getHours();
              const isToday = sel === todayStr;
              const hasNote = !!feedback;
              const gated = isToday && nowH < EDITION_HOUR;
              if (!hasNote && !gated) return null;
              const ready = hasNote && !gated;
              return (
                <button
                  className={`note-banner${ready?' is-ready':''}`}
                  onClick={() => { if (ready) { setNoteReveal(sel); setNoteRevealShown(0); } }}
                  disabled={!ready}
                >
                  <span className="note-banner-dot" aria-hidden="true"/>
                  <span className="note-banner-lbl">Editor's Note</span>
                  <span className="note-banner-sep">·</span>
                  <span className="note-banner-msg">{ready ? "Today's edition is in." : 'Reviewing… posts at 20:00.'}</span>
                  {ready && <span className="note-banner-cta">Read →</span>}
                </button>
              );
            })()}

            {/* Compact dispatch dateline above the photo */}
            <div className="today-dispatch-row">
              {selParsed&&(
                <div className="today-dispatch">
                  Dispatch · {String(selParsed.m+1).padStart(2,'0')}.{String(selParsed.d).padStart(2,'0')}.{String(selParsed.y%100).padStart(2,'0')} · {WDAYS[new Date(selParsed.y,selParsed.m,selParsed.d).getDay()].toUpperCase()}
                </div>
              )}
            </div>

            <div className="pj-main-inner">
              {/* Photo / upload area */}
              <div className="photo-wrap">
                {dayLoading ? (
                  <div className="upload-zone" style={{cursor:'default'}}><div className="up-txt">Loading…</div></div>
                ) : dayMeta ? (
                  <>
                    <div className="photo-wrap-inner">
                      <AuthImage src={`${fullUrl(sel)}?v=${photoVer}`} alt="" onClick={()=>setLightboxOpen(true)}/>
                    </div>
                  </>
                ) : (
                  <div className="upload-zone" onClick={()=>!busy&&fileRef.current?.click()}>
                    <div className="up-icon"><IcUpload/></div>
                    <div className="up-txt">{busy?'Processing…':'Add a photo'}</div>
                  </div>
                )}
              </div>

              {/* EXIF + location */}
              {dayMeta&&(
                <div className="exif-bar">
                  {strip
                    ? <><div className="exif-v">{strip}</div>{camera&&<div className="exif-c">{camera}</div>}</>
                    : <div className="exif-e">No camera data</div>
                  }
                  {locationName&&<div className="exif-e" style={{display:'flex',alignItems:'center',gap:4}}>
                    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.5}}>
                      <path d="M5.5 1C3.015 1 1 3.015 1 5.5c0 3.375 4.5 7.5 4.5 7.5s4.5-4.125 4.5-7.5C10 3.015 7.985 1 5.5 1z"/>
                      <circle cx="5.5" cy="5.5" r="1.5"/>
                    </svg>
                    {locationName}
                  </div>}
                </div>
              )}

              {/* Caption */}
              {dayMeta&&(
                <div className="cap-row">
                  <div className="cap-top">
                    <textarea className="cap-in" placeholder="FIELD NOTE"
                      value={caption} rows={1}
                      onChange={e=>{ setCaption(e.target.value); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
                      onBlur={saveCaption} ref={captionRef}/>
                    {aiEnabled&&(
                      <button className="cap-suggest-btn" onClick={handleCaptionSuggest} disabled={captionSuggestLoad} aria-label="Suggest caption">
                        {captionSuggestLoad ? '…' : <IcBulb/>}
                      </button>
                    )}
                  </div>
                  {captionSuggestion&&(
                    <div className="cap-suggestion">
                      <div className="cap-suggestion-txt">"{captionSuggestion}"</div>
                      <div className="cap-suggestion-actions">
                        <button className="cap-acc" onClick={acceptCaptionSuggestion}>Accept</button>
                        <button className="cap-dis" onClick={()=>setCaptionSuggestion(null)}>Dismiss</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── The Brief chip ──
                  Tap to expand inline. Surfaces the original assignment so
                  the photo stays in context long after filing. */}
              {dayMeta?.compose?.brief&&(() => {
                const { body: briefBody, signature: briefSig } = splitBrief(dayMeta.compose.brief);
                return (
                <div className="brief-chip">
                  <button className="brief-chip-toggle" onClick={()=>setBriefExpanded(v=>!v)}>
                    <span className="brief-chip-lbl">{briefExpanded ? 'Hide the brief' : 'Read the brief'}</span>
                    <svg className={`brief-chip-chev${briefExpanded?' open':''}`} viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M3 5.5l4 4 4-4"/>
                    </svg>
                  </button>
                  <div className={`brief-chip-body${briefExpanded?' open':''}`}>
                    <div className="brief-chip-body-inner">{briefBody}</div>
                    {briefSig && (
                      <div className="note-reveal-sig" style={{ marginTop: 12, paddingBottom: 4 }}>{briefSig}</div>
                    )}
                  </div>
                </div>
                );
              })()}

            </div>
          </>
        ) : (
          <div className="today-empty">
            <div className="today-empty-lbl">No brief filed</div>
            <div className="today-empty-h">Today's brief is waiting.</div>
            <div className="today-empty-sub">Compose it to start your day.</div>
            <button className="s2-btn-primary today-empty-btn" onClick={() => setShowTodaySheet(true)}>
              Open Daily Brief
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom pill tab bar (3 tabs, icon-only) ──
          Hidden while Compose (today-sheet) or Lightbox are covering the screen. */}
      {(() => {
        const composeVisible = showTodaySheet && sel === todayStr && !dayMeta && !dayLoading;
        if (composeVisible || lightboxOpen) return null;
        const switchTab = (t) => {
          try { navigator.vibrate?.(10); } catch { /* ignore */ }
          if (t === 'today') {
            setSel(todayStr);
            setCm(TM); setCy(TY);
          }
          setActiveTab(t);
        };
        return (
          <nav className="s2-tabbar" aria-label="Primary">
            <div className="s2-tabbar-inner">
              <button
                className={`s2-tab-btn${activeTab==='today'?' active':''}`}
                onClick={() => switchTab('today')}
                aria-label="Today"
                aria-current={activeTab==='today' ? 'page' : undefined}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>
                  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>
                </svg>
              </button>
              <button
                className={`s2-tab-btn${activeTab==='archive'?' active':''}`}
                onClick={() => switchTab('archive')}
                aria-label="Back Issues"
                aria-current={activeTab==='archive' ? 'page' : undefined}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1"/>
                  <rect x="13.5" y="3.5" width="7" height="7" rx="1"/>
                  <rect x="3.5" y="13.5" width="7" height="7" rx="1"/>
                  <rect x="13.5" y="13.5" width="7" height="7" rx="1"/>
                </svg>
              </button>
              <button
                className={`s2-tab-btn${activeTab==='calendar'?' active':''}`}
                onClick={() => switchTab('calendar')}
                aria-label="Editions"
                aria-current={activeTab==='calendar' ? 'page' : undefined}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="2"/>
                  <line x1="3.5" y1="9" x2="20.5" y2="9"/>
                  <line x1="8" y1="3" x2="8" y2="6"/>
                  <line x1="16" y1="3" x2="16" y2="6"/>
                </svg>
              </button>
            </div>
          </nav>
        );
      })()}


      {/* v2 Compose tray — mobile only, shows when no photo for today.
          Replaces the v1 today-sheet. Drag-to-dismiss handle is built into
          ComposeScreen; onClose bounces the tab back to MONTH + refetches
          dayMeta so a just-filed photo appears in the main panel. */}
      {showTodaySheet&&sel===todayStr&&!dayMeta&&!dayLoading&&(
        <div className="today-sheet-embed">
          <Suspense fallback={null}>
          <ComposeScreen
            onClose={() => {
              // Close the tray and refetch today's photo. If the user
              // filed, they land on the Today day detail — photo, caption,
              // Field Note. If they dragged to dismiss without filing they
              // stay on Today with the empty-state (no bounce to Month —
              // that reset flow confused users during the v2 rebrand).
              setShowTodaySheet(false);
              getPhoto(todayStr).then(m => {
                if (m) {
                  setDayMeta(m);
                  setCaption(m.caption || '');
                  // Prefer the v2 editor note if present; fall back to
                  // the v1 feedback field for legacy photos.
                  const note2 = m.editorNote || m.feedback || null;
                  if (note2) setFeedback(note2);
                  if (note2 && new Date().getHours() >= 20 && !localStorage.getItem(`scout-note-seen-${todayStr}`)) {
                    setNoteReveal(todayStr);
                    setNoteRevealShown(0);
                  }
                  setPhotoDates(prev => new Set([...prev, todayStr]));
                  setPhotoVer(Date.now());
                }
              });
            }}
            onFiled={() => {
              // Preemptively mark today as having a photo so the month grid fills in.
              setPhotoDates(prev => new Set([...prev, todayStr]));
              setPhotoVer(Date.now());
            }}
          />
          </Suspense>
        </div>
      )}

      {editionToast && (
        <button
          className="edition-toast"
          onClick={() => {
            setNoteReveal(editionToast);
            setNoteRevealShown(0);
            setEditionToast(null);
          }}
        >
          <span className="edition-toast-stamp">Edition</span>
          <span className="edition-toast-msg">Today's edition is out.</span>
          <span className="edition-toast-cta">Read →</span>
        </button>
      )}

      {noteReveal && feedback && (() => {
        const [y, m, d] = noteReveal.split('-').map(Number);
        const rd = new Date(y, m - 1, d);
        const dispatchDate = `${String(m).padStart(2,'0')}.${String(d).padStart(2,'0')}.${String(y%100).padStart(2,'0')}`;
        const revealed = feedback.slice(0, noteRevealShown);
        const typing = noteRevealShown < feedback.length;
        const dismiss = () => {
          try { localStorage.setItem(`scout-note-seen-${noteReveal}`, '1'); } catch {}
          setNoteReveal(null);
          setNoteRevealShown(0);
        };
        return (
          <div className="note-reveal">
            <div className="s2-page-header s2-page-header--right">
              <button className="s2-page-close" onClick={dismiss} aria-label="Close">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path d="M5 5L17 17M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="note-reveal-inner">
              <div className="note-reveal-stamp-wrap">
                <span className="s2-stamp-filed">Edition</span>
              </div>
              <div className="note-reveal-dateline">Dispatch · {dispatchDate} · Evening</div>
              <div className="note-reveal-thumb-wrap">
                <AuthImage className="note-reveal-thumb" src={thumbUrl(noteReveal)} alt="" />
              </div>
              {(() => {
                // Strip the persona's sign-off from the note body and render
                // it on its own line in the same mono/sans treatment used
                // elsewhere. Prevents the "— Novak" showing inline at the
                // end of the body AND as a duplicate signature below.
                const { body: noteBody, signature: noteSig } = splitBrief(feedback || '');
                return (
                  <>
                    <div className="note-reveal-body">{noteBody}</div>
                    <div className="note-reveal-sig">{noteSig || '— The Editor'}</div>
                  </>
                );
              })()}
              <div style={{ flex: 1, minHeight: 32 }} />
              <button className="s2-btn-primary" style={{ marginTop: 24 }} onClick={dismiss}>Close</button>
            </div>
          </div>
        );
      })()}

      {lightboxOpen&&dayMeta&&(
        <div className="lightbox"
          onClick={()=>setLightboxOpen(false)}
          onTouchStart={(e)=>{ lbTouchRef.current = e.touches[0].clientX; }}
          onTouchEnd={(e)=>{
            if (lbTouchRef.current===null) return;
            const dx = e.changedTouches[0].clientX - lbTouchRef.current;
            lbTouchRef.current = null;
            if (Math.abs(dx) < 40) return;
            if (dx > 0 && lbPrev) lbGo(lbPrev);
            if (dx < 0 && lbNext) lbGo(lbNext);
          }}
        >
          <div className="lb-topbar">
            <button className="lb-close" onClick={()=>setLightboxOpen(false)}>×</button>
          </div>
          <div className="lb-photo-area">
            {lbPrev&&<button className="lb-nav lb-prev" onClick={e=>{e.stopPropagation();lbGo(lbPrev);}} aria-label="Previous photo"><ChevLeft/></button>}
            {lbNext&&<button className="lb-nav lb-next" onClick={e=>{e.stopPropagation();lbGo(lbNext);}} aria-label="Next photo"><ChevRight/></button>}
            <AuthImage src={`${fullUrl(sel)}?v=${photoVer}`} alt="" onClick={e=>e.stopPropagation()}/>
          </div>
          {lbSorted.length>1&&<div className="lb-info">{lbLabel} &nbsp;·&nbsp; {lbIdx+1} / {lbSorted.length}</div>}
        </div>
      )}


      {/* Settings sheet */}
      <NavPanel
        open={panelOpen} closing={panelClosing} onDismiss={dismissPanel}
        theme={theme} userEmail={userEmail}
        onAccount={() => setAccountOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onDev={() => setDevPanelOpen(true)}
        onSignOut={handleSignOut}
      />


      <Suspense fallback={null}>
      {settingsOpen && <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themePref={themePref} setThemePref={setThemePref}
        pushEnabled={pushEnabled} setPushEnabled={setPushEnabled}
        analyticsEnabled={analyticsEnabled} setAnalyticsEnabled={setAnalyticsEnabled}
        briefVoice={briefVoice} setBriefVoice={setBriefVoice}
        onOpenLegal={setLegalOpen}
      />}

      {accountOpen && <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        userEmail={userEmail}
        pwExpanded={pwExpanded} setPwExpanded={setPwExpanded}
        pwNew={pwNew} setPwNew={setPwNew}
        pwMsg={pwMsg} setPwMsg={setPwMsg}
        pwChanging={pwChanging}
        handleChangePassword={handleChangePassword}
        handleSignOut={handleSignOut}
        handleDeleteAccount={handleDeleteAccount}
        deleteAccBusy={deleteAccBusy}
        handleDownloadAllPhotos={handleDownloadAllPhotos}
        dlProgress={dlProgress}
        photoDates={photoDates}
      />}

      {legalOpen && <LegalSheet which={legalOpen} onClose={() => setLegalOpen(null)} />}
      </Suspense>

      <DevPanel
        open={devPanelOpen} onClose={() => setDevPanelOpen(false)}
        devDeleteMode={devDeleteMode} setDevDeleteMode={setDevDeleteMode}
        feedback={feedback} setFeedback={setFeedback}
        setNoteReveal={setNoteReveal} setNoteRevealShown={setNoteRevealShown}
        sel={sel}
        briefVoice={briefVoice} setBriefVoice={setBriefVoice}
      />

    </div>
    </>
  );
}
