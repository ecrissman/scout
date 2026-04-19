import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { getPhoto, uploadPhoto, updateCaption, deletePhoto, deleteAccount, listYear, thumbUrl, fullUrl, getFeedback, getCaptionSuggestion, getTodayPrompt, getTheme, getNextWeekTheme } from './api';
import { extractEXIF, formatExif, compressFile, makeThumb } from './exif';
import { getSkill } from './skills';
import { supabase } from './supabase.js';
import { initAnalytics, identify, resetIdentity, track, setAnalyticsOptOut } from './analytics';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from './legal.js';
import ComposeScreen from './compose/ComposeScreen.jsx';
import ScoutWordmark from './ScoutWordmark.jsx';

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

// Tiny markdown renderer for legal docs. Handles h1/h2, paragraphs, bullet
// lists, and **bold** inline. The input is trusted (our own file) so the
// output is safe to render as-is.
function renderLegal(md) {
  const blocks = md.split(/\n\n+/);
  const inline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    );
  };
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('# ')) return <h1 key={i}>{trimmed.slice(2)}</h1>;
    if (trimmed.startsWith('## ')) return <h2 key={i}>{trimmed.slice(3)}</h2>;
    if (trimmed.startsWith('**Effective:**')) {
      return <p key={i} className="legal-effective">{inline(trimmed)}</p>;
    }
    if (trimmed.split('\n').every(l => l.trim().startsWith('- '))) {
      return (
        <ul key={i}>
          {trimmed.split('\n').map((l, j) => (
            <li key={j}>{inline(l.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{inline(trimmed)}</p>;
  });
}


const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600&family=Geist+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root,[data-theme="light"]{
  /* ── v2 brand tokens (source of truth) ── */
  --s2-paper:#FFFDFA;--s2-paper-2:#F7F3EC;--s2-ink:#0C0C0C;
  --s2-bone:#D8D7D4;--s2-smoke:#8A8680;--s2-archive:#3A3A35;
  --s2-grouped-bg:#F2F1EC;
  --s2-press-green:#007C04;
  --s2-green-50:#F2F7F0;--s2-green-100:#E0ECDE;--s2-green-200:#B8D4B2;
  --s2-green-300:#7FA876;--s2-green-500:#007C04;--s2-green-700:#005A03;
  --s2-green-900:#00330A;
  --s2-warn:#C8102E;--s2-caution:#C89A7E;
  --s2-bg:var(--s2-paper);
  --s2-surface:var(--s2-paper-2);
  --s2-border:var(--s2-bone);
  --s2-text-primary:var(--s2-ink);
  --s2-text-secondary:var(--s2-archive);
  --s2-text-muted:var(--s2-smoke);
  --s2-accent:var(--s2-press-green);
  --s2-serif:'Fraunces',Georgia,'Times New Roman',serif;
  --s2-mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  --s2-sans:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;

  /* ── Type scale (1.18 ratio, 16px base) ── */
  --fs-2xs:10px;--fs-xs:12px;--fs-sm:14px;--fs-base:16px;--fs-md:18px;
  --fs-lg:21px;--fs-xl:25px;--fs-2xl:30px;--fs-3xl:36px;--fs-4xl:44px;

  /* ── v1 tokens aliased to v2 — unmigrated .pj-* / .cal-* / .dv-* / etc. now read v2 values ── */
  --bg:var(--s2-paper);--bg-secondary:var(--s2-paper-2);--surface:var(--s2-paper-2);
  --border:var(--s2-bone);
  --text:var(--s2-ink);--text-2:var(--s2-archive);--text-3:var(--s2-smoke);
  --accent:var(--s2-press-green);--accent-fg:var(--s2-paper);
  --paper:var(--s2-paper);--ink:var(--s2-ink);
  --warm-mid:var(--s2-smoke);--rule:var(--s2-bone);
  /* Legacy accent names — neutralized. Kept alive so unmigrated usages don't break. */
  --terracotta:var(--s2-press-green);--sage:var(--s2-ink);--gold:var(--s2-paper-2);
  --brand:var(--s2-serif);--serif:var(--s2-sans);--sans:var(--s2-sans);
}
[data-theme="dark"]{
  --s2-ink-2:#1A1A18;--s2-bone-dark:#2A2A26;
  --s2-archive-dark:#B8B2A3;--s2-smoke-dark:#7A7668;
  --s2-grouped-bg:#050505;
  --s2-bg:var(--s2-ink);
  --s2-surface:var(--s2-ink-2);
  --s2-border:var(--s2-bone-dark);
  --s2-text-primary:var(--s2-paper);
  --s2-text-secondary:var(--s2-archive-dark);
  --s2-text-muted:var(--s2-smoke-dark);

  /* v1 dark tokens aliased to v2 */
  --bg:var(--s2-ink);--bg-secondary:var(--s2-ink-2);--surface:var(--s2-ink-2);
  --border:var(--s2-bone-dark);
  --text:var(--s2-paper);--text-2:var(--s2-archive-dark);--text-3:var(--s2-smoke-dark);
  --accent:var(--s2-press-green);--accent-fg:var(--s2-ink);
  --rule:rgba(255,253,250,0.08);
}
html,body{height:100%;min-height:100dvh;width:100%;overflow-x:hidden;overscroll-behavior:none;-webkit-overflow-scrolling:touch;background:var(--bg)}

/* ── Onboarding ── */
.ob-wrap{position:fixed;inset:0;background:#4F5E2E;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px}
.ob-hed{font-family:var(--brand);font-size:56px;line-height:1.05;color:#FFFDFA;text-transform:uppercase;text-align:center;margin:0 0 40px;white-space:nowrap}
.ob-hint{font-family:var(--sans);font-size:20px;font-weight:300;line-height:1.5;color:rgba(255,253,250);text-align:center;margin:0}
.ob-cta{position:absolute;top:86%;left:50%;transform:translateX(-50%);width:197px;height:51px;font-family:var(--brand);font-size:20px;color:#FFFDFA;background:#222222;border:none;border-radius:4px;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent}
.ob-cta:active{opacity:.5}

/* ── Splash ── */
.pj-splash{position:fixed;inset:0;background:#0C0C0C;z-index:1000;opacity:1;transition:opacity .6s ease;pointer-events:none;display:flex;align-items:center;justify-content:center}
.pj-splash.fading{opacity:0}
@keyframes splashLogoIn{from{opacity:0;transform:scale(0.82)}to{opacity:1;transform:scale(1)}}
.splash-logo{animation:splashLogoIn 0.6s cubic-bezier(0.2,0,0,1) both}

/* ── Layout ── */
.pj-layout{display:flex;min-height:100dvh;background:var(--bg);font-family:var(--sans);color:var(--text);transition:background .2s,color .2s}
.pj-sidebar{width:100%;display:none;flex-direction:column;overflow-y:auto;max-height:100dvh;flex-shrink:0;background:var(--bg)}
.pj-main{display:flex;flex-direction:column;flex:1;overflow-y:auto;max-height:100dvh;background:var(--bg)}
.pj-layout.tab-calendar .pj-sidebar,.pj-layout.tab-archive .pj-sidebar{display:flex}
.pj-layout.tab-calendar .pj-main,.pj-layout.tab-archive .pj-main{display:none}
@media(min-width:640px){
  .pj-sidebar{width:272px;position:sticky;top:0;height:100dvh;display:flex}
  .pj-main{display:flex;border-left:1px solid var(--border)}
  .pj-layout.tab-calendar .pj-sidebar,.pj-layout.tab-archive .pj-sidebar{display:flex}
  .pj-layout.tab-calendar .pj-main,.pj-layout.tab-archive .pj-main{display:flex}
}
@media(min-width:1024px){.pj-sidebar{width:300px}}

/* ── Bottom pill tab bar (iOS-style, icon-only, 3 tabs) ── */
.s2-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;justify-content:center;padding:10px 0 calc(10px + env(safe-area-inset-bottom));pointer-events:none}
.s2-tabbar-inner{display:flex;align-items:center;gap:6px;background:var(--s2-bg);border:1px solid var(--s2-border);border-radius:999px;padding:6px;box-shadow:0 6px 20px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.06);pointer-events:auto}
[data-theme="dark"] .s2-tabbar-inner{background:var(--s2-ink-2);box-shadow:0 6px 20px rgba(0,0,0,0.4)}
.s2-tab-btn{display:flex;align-items:center;justify-content:center;width:52px;height:44px;border-radius:999px;background:transparent;border:none;cursor:pointer;color:var(--s2-text-muted);-webkit-tap-highlight-color:transparent;transition:background .15s ease,color .15s ease;padding:0}
.s2-tab-btn:active{opacity:0.6}
.s2-tab-btn.active{background:var(--s2-text-primary);color:var(--s2-bg)}
.s2-tab-btn svg{width:22px;height:22px;display:block}
.pj-layout.has-tabbar .pj-main,.pj-layout.has-tabbar .pj-sidebar{padding-bottom:84px}

/* ── Archive (masonry feed) ── */
.archive-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 12px 24px;background:var(--bg)}
.archive-month-header{padding:22px 6px 10px;font-family:var(--s2-mono);font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--s2-text-muted)}
.archive-masonry{column-count:2;column-gap:8px}
.archive-tile{break-inside:avoid;margin:0 0 8px;display:block;cursor:pointer;background:var(--surface);border-radius:4px;overflow:hidden;-webkit-tap-highlight-color:transparent;padding:0;border:none;width:100%}
.archive-tile:active{opacity:0.75}
.archive-tile img{width:100%;height:auto;display:block}
.archive-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 48px;gap:10px;text-align:center}
.archive-empty-lbl{font-family:var(--s2-mono);font-size:12px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--s2-text-muted)}
.archive-empty-sub{font-family:var(--sans);font-size:14px;color:var(--text-2);line-height:1.55;font-weight:300}

/* ── Shared header — used by both sidebar (MONTH) and main (TODAY) ── */
.pj-topbar{display:flex;align-items:center;justify-content:space-between;padding:calc(14px + env(safe-area-inset-top)) 20px 14px;flex-shrink:0;background:var(--bg)}
.week-header-line{display:flex;align-items:center;gap:5px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:4px 0;background:none;border:none}
.week-header-line:active{opacity:0.5}
.week-header-lbl{font-family:var(--s2-mono);font-weight:700;font-size:14px;color:#E2B554;letter-spacing:0.04em}
[data-theme="dark"] .week-header-lbl{color:var(--terracotta)}
.week-header-sep{font-family:var(--s2-mono);font-weight:500;font-size:11px;color:#0C0C0C;opacity:0.4}
.week-header-range{font-family:var(--s2-mono);font-weight:500;font-size:13px;color:#ABABAB;letter-spacing:0.02em}
.week-header-arr{font-size:14px;color:#E2B554;margin-left:1px}
[data-theme="dark"] .week-header-arr{color:var(--terracotta)}
.pj-tab-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#E2B554;margin-left:4px;vertical-align:middle;flex-shrink:0}
[data-theme="dark"] .pj-tab-dot{background:var(--terracotta)}
.settings-btn{min-width:44px;min-height:44px;width:auto;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;color:var(--text);padding:0;flex-shrink:0}
.settings-btn:active{opacity:0.4}
.settings-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
/* TODAY date row — sits below the shared topbar in the main panel */
.today-date-nav{display:flex;align-items:center;flex-shrink:0}
/* On desktop the sidebar already has the wordmark — hide the mobile brand row in main panel */
.main-brand-row{display:flex}
@media(min-width:640px){.main-brand-row{display:none}}

/* ── Calendar header ── */
.cal-head{display:flex;align-items:flex-end;justify-content:space-between;padding:28px 20px 10px;flex-shrink:0}
.cal-m{font-family:var(--sans);font-size:22px;font-weight:300;letter-spacing:-0.01em;line-height:1;color:var(--text)}
.cal-y{font-family:var(--sans);font-size:12px;color:var(--text-3);font-weight:400;margin-top:8px;letter-spacing:0.01em}
.arr{background:none;border:none;padding:8px;margin:0;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;opacity:0.75}
.arr:active{opacity:0.3;transform:scale(0.9)}
.arr:disabled{opacity:.2;cursor:default}
.overflow-wrap{position:relative}
.overflow-btn{background:none;border:none;padding:8px;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;opacity:0.75;-webkit-tap-highlight-color:transparent}
.overflow-btn:active{opacity:0.3}
.overflow-backdrop{position:fixed;inset:0;z-index:199}
.overflow-menu{position:absolute;top:calc(100% + 4px);right:0;background:var(--paper);border:1px solid var(--rule);border-radius:8px;overflow:hidden;z-index:200;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.10)}
.overflow-item{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;background:none;border:none;font-family:var(--sans);font-size:14px;color:var(--ink);cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent;white-space:nowrap}
.overflow-item:active{background:var(--rule)}
.overflow-item svg{flex-shrink:0;opacity:0.6}
.overflow-item-danger{color:#D6542D}
.overflow-item-danger svg{opacity:1}
[data-theme="dark"] .overflow-menu{box-shadow:0 4px 16px rgba(0,0,0,0.4)}
[data-theme="dark"] .overflow-btn{color:var(--text);opacity:1}
.forgot-link{font-family:var(--brand);font-size:16px;line-height:1.51;color:var(--ink);text-transform:uppercase;background:none;border:none;cursor:pointer;padding:2px 0;text-align:center}
.forgot-link:active{opacity:0.4}

/* ── Day-of-week labels ── */
.cal-wds{display:grid;grid-template-columns:repeat(7,1fr);padding:4px 18px;flex-shrink:0}
.wd{text-align:center;font-family:var(--sans);font-size:10px;color:var(--text-3);letter-spacing:0.04em;padding:4px 0 8px;font-weight:500}
.wd:first-child,.wd:last-child{opacity:0.55}

/* ── Calendar grid ── */
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:0 18px;flex-shrink:0}
.cc{aspect-ratio:1;position:relative;overflow:hidden;cursor:pointer;background:var(--surface);border-radius:2px;transition:opacity .15s}
.cc.ghost{opacity:0;pointer-events:none;background:none}
.cc.future{cursor:default;pointer-events:none}
.cc.sel{outline:2px solid var(--accent);outline-offset:-2px}
.cc.tod .cn{color:var(--accent);font-weight:600}
.cc:not(.ghost):active{opacity:.5}
.cc img{width:100%;height:100%;object-fit:cover;display:block;border-radius:2px}
.cn{position:absolute;bottom:3px;right:4px;font-family:var(--sans);font-size:9px;line-height:1;color:var(--text-3);font-variant-numeric:tabular-nums;font-weight:400}
.cc.filled .cn{color:rgba(255,255,255,.9);text-shadow:0 1px 3px rgba(0,0,0,.7)}

/* ── Month scroll view ── */
.month-scroll{flex:1;overflow-y:auto;padding-bottom:76px}
.month-section{margin-bottom:8px}
.month-section-label{padding:18px 20px 6px;font-family:var(--sans);font-size:16px;font-weight:400;letter-spacing:.01em;color:var(--text)}

/* ── Today Sheet ── */
@keyframes sheetSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.today-sheet{position:fixed;inset:0;z-index:50;background:#FFFDFA;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:sheetSlideUp 0.38s cubic-bezier(0.32,0.72,0,1);transition:transform 0.36s cubic-bezier(0.32,0.72,0,1)}
.today-sheet.is-closing{transform:translateY(100%)}
.today-sheet-tray{flex:1;display:flex;flex-direction:column;overflow-y:auto}
.today-sheet-topbar{display:flex;align-items:center;justify-content:center;padding:16px 20px;flex-shrink:0}
.today-sheet-dismiss{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#F0EEEA;border:none;cursor:pointer;padding:0;flex-shrink:0}
.today-sheet-dismiss:active{opacity:.6}
.today-sheet-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 44px}
.today-sheet-prompt-lbl{font-family:var(--s2-mono);font-weight:500;font-size:13px;color:var(--accent);text-align:center;letter-spacing:0.06em;margin-bottom:14px}
.today-sheet-prompt-txt{font-family:var(--sans);font-size:16px;color:var(--text);line-height:1.65;font-weight:300;text-align:center}
.today-sheet-skel{background:#EBEBEB;border-radius:85px;height:12px;margin:5px auto;display:block}
.today-sheet-btns{display:flex;align-items:center;justify-content:center;padding:32px 0 24px;flex-shrink:0}
.today-sheet-cam{display:flex;align-items:center;justify-content:center;width:88px;height:88px;border-radius:50%;background:none;border:none;padding:0;cursor:pointer;transition:opacity .15s,transform .1s}
.today-sheet-cam:active{opacity:.75;transform:scale(0.92)}
.cam-outer{fill:#0C0C0C}
.cam-border{fill:#FFFDFA}
.cam-center{fill:#E2B554}
[data-theme="dark"] .cam-outer{fill:#FFFDFA}
[data-theme="dark"] .cam-border{fill:#0C0C0C}
[data-theme="dark"] .cam-center{fill:#D6542D}
.today-sheet-icon-btn{display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:none;border:none;cursor:pointer;padding:0;margin:0 36px;opacity:0.7}
.today-sheet-icon-btn:active{opacity:.4}
.tip-icon-btn{display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:none;border:none;cursor:pointer;padding:0;margin:0 36px;opacity:0.7;-webkit-tap-highlight-color:transparent;color:inherit}
.tip-icon-btn:active{opacity:.4}
.tip-popup{position:fixed;width:264px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:16px 18px;box-shadow:0 8px 28px rgba(0,0,0,0.18);z-index:500;animation:tipPopIn .16s ease both}
@keyframes tipPopIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.tip-popup-label{font-family:var(--sans);font-size:10px;font-weight:700;color:var(--terracotta);letter-spacing:.1em;margin-bottom:6px}
.tip-popup-name{font-family:var(--sans);font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;line-height:1.3}
.tip-popup-body{font-family:var(--sans);font-size:13px;color:var(--text-2);line-height:1.55}
.theme-next-week{font-family:var(--sans);font-size:13px;font-weight:600;color:var(--text-2);margin-top:8px;padding:0 16px 14px}
@media(min-width:640px){.today-sheet{display:none}}


/* ── Day detail ── */
.pj-main-inner{flex:1;padding:0 20px 40px}
@media(min-width:640px){.pj-main-inner{padding:20px 20px 48px}}
.lightbox{position:fixed;inset:0;background:#000;z-index:100;display:flex;flex-direction:column;align-items:stretch;cursor:zoom-out}
.lightbox img{max-width:100%;max-height:100%;object-fit:contain;cursor:default;display:block}
.lb-close{background:none;border:none;color:#fff;font-size:28px;cursor:pointer;opacity:.5;line-height:1;padding:4px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;align-self:flex-end;pointer-events:auto}
.lb-close:active{opacity:1}
.lb-topbar{flex-shrink:0;height:calc(52px + env(safe-area-inset-top));display:flex;align-items:flex-end;justify-content:flex-end;padding:0 4px 4px;background:transparent;pointer-events:none}
.lb-photo-area{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative;overflow:hidden}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;opacity:.45;cursor:pointer;padding:0;width:52px;height:88px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:opacity .15s}
.lb-nav:hover{opacity:.9}.lb-nav:active{opacity:1;transform:translateY(-50%) scale(.93)}
.lb-nav svg{width:12px;height:20px}
.lb-prev{left:12px}.lb-next{right:12px}
.lb-info{position:absolute;bottom:calc(20px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);font-family:var(--sans);font-size:11px;color:rgba(255,255,255,.45);letter-spacing:.05em;white-space:nowrap;pointer-events:none}

/* ── Photo area ── */
.photo-wrap{width:100%;background:#FFFFFF;padding:12px 11px 11px;box-shadow:0 0 12px 0 rgba(0,0,0,0.16);position:relative;box-sizing:border-box}
.photo-wrap-inner{width:100%;min-height:200px;background:var(--surface);position:relative}
.photo-wrap img{width:100%;height:auto;display:block;cursor:zoom-in}
.photo-overlay-btn{position:absolute;top:12px;background:rgba(255,255,255,0.72);backdrop-filter:blur(12px) saturate(1.8);-webkit-backdrop-filter:blur(12px) saturate(1.8);border:none;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:opacity .15s}
.photo-overlay-btn:active{opacity:0.55}
.photo-overlay-btn svg{width:16px;height:16px;stroke:#000;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.photo-overlay-btn.right{right:12px}
.photo-overlay-btn.left{left:12px}
.photo-overlay-btn.danger svg{stroke:#D9534F}
[data-theme="dark"] .photo-overlay-btn{background:rgba(40,40,40,0.82)}
[data-theme="dark"] .photo-overlay-btn svg{stroke:#FFF}
[data-theme="dark"] .photo-overlay-btn.danger svg{stroke:#FF6B6B}
[data-theme="dark"] .today-sheet{background:#0C0C0C}
[data-theme="dark"] .today-sheet-tray{background:#0C0C0C}
[data-theme="dark"] .today-sheet-dismiss{background:#2E2C2B}
[data-theme="dark"] .today-sheet-skel{background:#2E2C2B}
[data-theme="dark"] .today-sheet-icon-btn{opacity:0.6}
[data-theme="dark"] .today-sheet-icon-btn svg line,[data-theme="dark"] .today-sheet-icon-btn svg path{stroke:#FFFDFA}
[data-theme="dark"] .nav-panel{background:#0C0C0C;box-shadow:6px 0 16px -8px rgba(0,0,0,0.5)}
[data-theme="dark"] .nav-panel-item{color:#FFFDFA}
[data-theme="dark"] .nav-panel-signout{background:#FFFDFA;color:#0C0C0C}
[data-theme="dark"] .nav-panel{box-shadow:4px 0 20px rgba(0,0,0,0.5)}
[data-theme="dark"] .grids-page{background:#0C0C0C}
[data-theme="dark"] .grids-header{border-color:rgba(255,255,255,0.08)}
[data-theme="dark"] .grids-title{color:#FFFDFA}
[data-theme="dark"] .grids-empty-lbl{color:var(--accent)}
[data-theme="dark"] .grids-empty svg{opacity:0.3}
.upload-zone{aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;border:1px dashed var(--border);background:var(--bg-secondary);transition:opacity .15s}
.upload-zone:active{opacity:0.65}
.up-icon svg{width:20px;height:20px;stroke:var(--text-3);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.up-txt{font-family:var(--sans);font-size:11px;color:var(--text-3);letter-spacing:.08em;text-transform:uppercase;text-align:center;line-height:2.4}

/* ── EXIF ── */
.exif-bar{padding:14px 0 16px;border-bottom:1px solid var(--border);margin-top:1px;min-height:38px;display:flex;flex-direction:column;gap:6px}
.exif-v{font-family:var(--sans);font-size:13px;font-weight:400;color:var(--text-2);letter-spacing:0.01em;font-variant-numeric:tabular-nums}
.exif-c{font-family:var(--sans);font-size:12px;color:var(--text-2)}
.exif-e{font-family:var(--sans);font-size:12px;color:var(--text-2);letter-spacing:.04em;margin-top:3px}

/* ── Caption ── */
.cap-row{padding:12px 0;position:relative}
.cap-top{display:flex;align-items:flex-start}
.cap-in{flex:1;background:none;border:none;font-family:var(--sans);font-size:14px;color:var(--text);padding:0;outline:none;caret-color:var(--accent);font-weight:400;min-width:0;line-height:1.55;-webkit-tap-highlight-color:transparent;width:100%;resize:none;overflow:hidden;display:block}
.cap-in::placeholder{color:var(--text-3);font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.cap-suggest-btn{position:absolute;top:0;right:0;background:none;border:none;color:var(--text);cursor:pointer;padding:0;width:44px;height:44px;display:flex;align-items:center;justify-content:flex-end;opacity:0.85}
.cap-suggest-btn:active{opacity:0.4}
.cap-suggest-btn:disabled{opacity:.3;cursor:default}
.cap-suggestion{margin-top:8px;display:flex;align-items:flex-start;gap:10px}
.cap-suggestion-txt{font-family:var(--sans);font-size:14px;color:var(--text-2);font-style:italic;flex:1;line-height:1.5}
.cap-suggestion-actions{display:flex;gap:6px;flex-shrink:0}
.cap-acc{background:var(--accent);border:none;color:var(--accent-fg);font-family:var(--sans);font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;cursor:pointer;border-radius:6px;min-height:36px}
.cap-acc:active{opacity:0.7}
.cap-dis{background:none;border:1px solid var(--border);color:var(--text-3);font-family:var(--sans);font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;cursor:pointer;border-radius:6px;min-height:36px}
.cap-dis:active{opacity:0.6}

/* ── Weekly theme card ── */
.theme-card{margin:12px 16px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.theme-card-toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.theme-card-left{flex:1;min-width:0}
.theme-card-lbl{font-family:var(--sans);font-size:12px;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;font-weight:500;margin-bottom:5px}
.theme-card-title{font-family:var(--sans);font-size:16px;color:var(--text);font-weight:400;line-height:1.3}
.theme-card-chev{width:14px;height:14px;stroke:var(--ink);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s ease;flex-shrink:0;margin-left:8px}
[data-theme="dark"] .theme-card-chev{stroke:var(--paper)}
.theme-card-chev.open{transform:rotate(180deg)}
.theme-card-body{overflow:hidden;max-height:0;transition:max-height .35s ease}
.theme-card-body.open{max-height:400px}
.theme-card-desc{font-family:var(--sans);font-size:14px;color:var(--text-2);line-height:1.6;font-weight:300;padding:0 16px 12px}
.theme-tips-link{display:block;width:100%;background:none;border:none;border-top:1px solid var(--border);padding:10px 16px;font-family:var(--sans);font-size:12px;color:var(--accent);cursor:pointer;text-align:left;letter-spacing:.02em;-webkit-tap-highlight-color:transparent}
.theme-tips-link:active{opacity:0.5}

/* ── Feedback (collapsible, auto-triggered) ── */
.feedback-card{margin-top:0}

/* ── Edition toast (in-app push stand-in) ── */
.edition-toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:210;display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--text);color:var(--bg);border:none;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.22);cursor:pointer;font-family:var(--sans);-webkit-tap-highlight-color:transparent;max-width:calc(100vw - 32px);animation:editionToastIn .32s cubic-bezier(0.32,0.72,0,1)}
.edition-toast:active{opacity:.8}
.edition-toast-stamp{font-size:10px;letter-spacing:.22em;text-transform:uppercase;padding:4px 8px;border:1px solid var(--bg);border-radius:2px;opacity:.85;flex-shrink:0}
.edition-toast-msg{font-size:14px;font-weight:500;letter-spacing:-0.005em;flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.edition-toast-cta{font-size:12px;letter-spacing:.06em;opacity:.75;flex-shrink:0}
@keyframes editionToastIn{from{opacity:0;transform:translate(-50%,20px)}to{opacity:1;transform:translate(-50%,0)}}

/* ── Editor's Note full-screen reveal (first view) ── */
.note-reveal{position:fixed;inset:0;z-index:220;background:var(--bg);display:flex;flex-direction:column;animation:pagePushIn .32s cubic-bezier(0.32,0.72,0,1);padding-bottom:env(safe-area-inset-bottom)}
.note-reveal-inner{display:flex;flex-direction:column;flex:1;padding:0 28px 28px;overflow-y:auto}
.note-reveal-stamp-wrap{display:flex;justify-content:center;margin-top:40px;margin-bottom:28px}
.note-reveal-dateline{font-family:var(--sans);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--text-3);text-align:center;margin-bottom:32px}
.note-reveal-body{font-family:var(--serif);font-size:22px;line-height:1.35;letter-spacing:-0.015em;color:var(--text);margin-bottom:20px}
.note-reveal-sig{font-family:var(--sans);font-size:13px;color:var(--text-3);letter-spacing:.02em}

/* ── Editor's Note banner (top of Today) ── */
.note-banner{display:flex;align-items:center;gap:8px;width:calc(100% - 40px);margin:4px 20px 0;padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;font-family:var(--sans);color:var(--text);text-align:left;cursor:default;-webkit-tap-highlight-color:transparent}
.note-banner.is-ready{cursor:pointer;border-color:var(--accent)}
.note-banner.is-ready:active{opacity:.7}
.note-banner-dot{width:6px;height:6px;border-radius:50%;background:var(--text-3);flex-shrink:0}
.note-banner.is-ready .note-banner-dot{background:var(--accent);box-shadow:0 0 0 3px rgba(0,124,4,0.16)}
.note-banner-lbl{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:500;color:var(--accent);flex-shrink:0}
.note-banner-sep{color:var(--text-3);flex-shrink:0}
.note-banner-msg{font-size:13px;color:var(--text-2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.note-banner-cta{font-size:12px;color:var(--text);letter-spacing:.02em;font-weight:500;flex-shrink:0}

/* ── Dispatch dateline above photo (Today) ── */
.today-dispatch-row{padding:14px 20px 10px;flex-shrink:0}
.today-dispatch{font-family:var(--s2-mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--text-3)}

/* ── "Read the brief" chip ── */
.brief-chip{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.brief-chip-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;padding:6px 0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.brief-chip-toggle:active{opacity:.5}
.brief-chip-lbl{font-family:var(--sans);font-size:12px;color:var(--text-2);letter-spacing:.08em;text-transform:uppercase;font-weight:500}
.brief-chip-chev{width:14px;height:14px;stroke:var(--text-2);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s ease;flex-shrink:0}
.brief-chip-chev.open{transform:rotate(180deg)}
.brief-chip-body{overflow:hidden;max-height:0;transition:max-height .35s ease}
.brief-chip-body.open{max-height:1000px}
.brief-chip-body-inner{font-family:var(--serif);font-size:16px;color:var(--text-2);line-height:1.55;padding:12px 0 4px}
.feedback-toggle{display:flex;align-items:center;justify-content:space-between;padding:20px 0 14px;cursor:pointer;border-top:1px solid var(--border);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.feedback-toggle-lbl{font-family:var(--sans);font-size:12px;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;font-weight:500}
.feedback-toggle-chev{width:14px;height:14px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s ease;flex-shrink:0}
.feedback-toggle-chev.open{transform:rotate(180deg)}
.feedback-body{overflow:hidden;max-height:0;transition:max-height .35s ease}
.feedback-body.open{max-height:1000px}
.feedback-txt{font-family:var(--sans);font-size:15px;color:var(--text);line-height:1.6;font-weight:300;padding-bottom:16px}

/* ── Tips sheet ── */
.tips-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:600;display:flex;align-items:flex-end}
.tips-sheet{width:100%;background:var(--bg);border-radius:20px 20px 0 0;padding:0 0 calc(40px + env(safe-area-inset-bottom));border-top:1px solid var(--border);max-height:88dvh;overflow-y:auto;overscroll-behavior:contain}
.tips-handle{width:36px;height:4px;background:var(--text-3);border-radius:2px;margin:10px auto 0;opacity:0.3}
.tips-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 4px}
.tips-title{font-family:var(--sans);font-size:17px;font-weight:500;color:var(--text);letter-spacing:-0.01em}
.tips-week{font-family:var(--sans);font-size:11px;color:var(--text-3);letter-spacing:.04em;padding:0 20px 14px}
.tips-close{background:none;border:none;color:var(--text-3);cursor:pointer;font-size:18px;padding:0;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;opacity:0.6;line-height:1}
.tips-close:active{opacity:1}
.tips-list{padding:0 20px}
.tips-row{display:flex;gap:14px;padding:16px 0;border-top:1px solid var(--border)}
.tips-row-day{width:28px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:5px;padding-top:2px}
.tips-dow{font-family:var(--sans);font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:.04em;text-transform:uppercase}
.tips-dot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.tips-name{font-family:var(--sans);font-size:15px;font-weight:500;color:var(--text);margin-bottom:5px}
.tips-body{font-family:var(--sans);font-size:14px;color:var(--text-2);line-height:1.6;font-weight:300}
.theme-tips-link{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:13px;color:var(--accent);padding:4px 16px 14px;display:block;text-align:left;letter-spacing:.02em;-webkit-tap-highlight-color:transparent;width:100%}
.theme-tips-link:active{opacity:0.5}

/* ── Week strip — removed ── */

/* ── Auth Bridge (Safari → PWA handoff) ── */
@keyframes bridgeFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.auth-bridge{position:fixed;inset:0;background:#0C0C0C;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;z-index:9999}
.auth-bridge-inner{display:flex;flex-direction:column;align-items:center;animation:bridgeFadeIn .5s ease both}
.auth-bridge-logo{width:72px;margin-bottom:40px;opacity:0.9}
.auth-bridge-title{font-family:var(--brand);font-size:26px;color:#FFFDFA;letter-spacing:.02em;margin-bottom:10px}
.auth-bridge-sub{font-family:var(--sans);font-size:13px;color:rgba(245,241,235,0.45);text-align:center;line-height:1.7;margin-bottom:52px;max-width:240px}
.auth-bridge-hint{font-family:var(--sans);font-size:11px;color:rgba(245,241,235,0.25);letter-spacing:.08em;text-transform:uppercase;text-align:center}

/* ── Mobile gate (desktop/tablet lockout) — dark only ── */
.mobile-gate{position:fixed;inset:0;background:#0C0C0C;display:flex;align-items:center;justify-content:center;padding:40px;z-index:9999}
.mobile-gate-inner{display:flex;flex-direction:column;align-items:center;text-align:center;max-width:420px}
.mobile-gate-title{font-family:var(--brand);font-size:34px;color:#FFFDFA;letter-spacing:.01em;margin:0 0 14px;font-weight:400;line-height:1.15}
.mobile-gate-body{font-family:var(--sans);font-size:15px;color:rgba(245,241,235,0.55);line-height:1.7;margin:0 0 28px;font-weight:300}
.mobile-gate-url{font-family:var(--sans);font-size:13px;color:#FFFDFA;font-weight:600;letter-spacing:.04em;padding:10px 16px;border:1px solid rgba(245,241,235,0.2);border-radius:4px;text-transform:uppercase}

/* ── Login ── */
.pj-login{position:fixed;inset:0;background:var(--paper)}
.login-logo{position:absolute;top:10.3%;left:50%;transform:translateX(-50%);width:80px;height:80px}
.login-fields{display:contents}
.login-field-lbl{position:absolute;left:45px;font-family:var(--s2-mono);font-weight:600;font-size:16px;line-height:1.51;color:var(--ink)}
.login-in{position:absolute;left:45px;right:45px;background:none;border:none;border-bottom:4px solid var(--ink);font-family:var(--sans);font-size:20px;font-weight:300;color:var(--ink);padding:0 0 8px;outline:none;-webkit-appearance:none;border-radius:0}
.login-in::placeholder{color:rgba(28,25,22,0.2)}
.login-btn{position:absolute;top:60.9%;left:50%;transform:translateX(-50%);width:150px;height:51px;font-family:var(--brand);font-size:20px;line-height:1.51;color:#FFFDFA;background:#222222;border:none;border-radius:4px;cursor:pointer;text-align:center;transition:opacity .15s;padding:0;white-space:nowrap}
.login-btn:active{opacity:0.5}
.login-btn:disabled{opacity:.3;cursor:default}
.forgot-link{position:absolute;top:88.5%;left:0;right:0;font-family:var(--s2-mono);font-weight:600;font-size:16px;line-height:1.51;color:var(--ink);text-transform:uppercase;background:none;border:none;cursor:pointer;text-align:center;padding:0}
.forgot-link:active{opacity:0.4}
.login-footer{display:contents}
.login-err{position:absolute;top:70%;left:45px;right:45px;font-family:var(--sans);font-size:10px;color:#B03030;letter-spacing:.04em;text-align:center}
.login-divider{position:absolute;top:72.5%;left:45px;right:45px;display:flex;align-items:center;gap:12px;font-family:var(--sans);font-size:11px;color:var(--warm-mid);letter-spacing:.08em}
.login-divider::before,.login-divider::after{content:'';flex:1;height:1px;background:var(--rule)}
.google-btn{position:absolute;top:78%;left:50%;transform:translateX(-50%);width:calc(100% - 90px);max-width:280px;height:48px;display:flex;align-items:center;justify-content:center;gap:10px;background:none;border:1.5px solid var(--ink);border-radius:4px;font-family:var(--sans);font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;letter-spacing:.04em;transition:opacity .15s}
.google-btn:active{opacity:0.5}
.google-btn:disabled{opacity:.3;cursor:default}

/* ── Settings sheet ── */
.settings-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;display:flex;align-items:flex-end;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.settings-sheet{width:100%;background:var(--bg);border-radius:20px 20px 0 0;padding:0 0 calc(40px + env(safe-area-inset-bottom));border-top:1px solid var(--border);max-height:88dvh;overflow-y:auto}
.settings-handle{width:36px;height:4px;background:var(--text-3);border-radius:2px;margin:10px auto 0;opacity:0.3}
.settings-title{font-family:var(--sans);font-size:17px;font-weight:500;color:var(--text);padding:18px 20px 4px;letter-spacing:-0.01em}
.settings-section{margin-top:24px;padding:0 16px}
.settings-section-label{font-family:var(--sans);font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;padding:0 4px}
.settings-group{background:var(--bg-secondary);border-radius:12px;overflow:hidden}
.settings-row{display:flex;align-items:center;padding:0 16px;min-height:50px;gap:12px;border-bottom:1px solid var(--border)}
.settings-row:last-child{border-bottom:none}
.settings-row-label{font-family:var(--sans);font-size:15px;color:var(--text);flex:1;line-height:1.3}
.settings-row-sub{font-family:var(--sans);font-size:12px;color:var(--text-3);margin-top:2px}
.settings-row-btn{background:none;border:none;cursor:pointer;display:flex;align-items:center;width:100%;min-height:50px;padding:0 16px;gap:12px;border-bottom:1px solid var(--border);-webkit-tap-highlight-color:transparent;text-align:left;transition:opacity .15s}
.settings-row-btn:last-child{border-bottom:none}
.settings-row-btn:active{opacity:0.5}
.settings-row-chev{width:7px;height:12px;stroke:var(--text-3);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;opacity:0.5}
.settings-pw-row{display:flex;flex-direction:row;align-items:stretch;gap:10px;width:100%}
.settings-pw-input{flex:1;min-width:0;box-sizing:border-box;font-family:var(--sans);font-size:15px;color:var(--text);background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 14px;outline:none;-webkit-appearance:none}
.settings-pw-input:focus{border-color:var(--text-3)}
.settings-pw-input::placeholder{color:var(--text-3)}
.settings-pw-submit{flex-shrink:0;align-self:stretch;font-family:var(--sans);font-size:14px;font-weight:600;color:var(--accent-fg);background:var(--accent);border:none;border-radius:10px;padding:0 20px;cursor:pointer;min-height:44px;white-space:nowrap}
.settings-pw-submit:disabled{opacity:.35;cursor:default}
.settings-pw-submit:active:not(:disabled){opacity:.85}
.settings-seg{display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;flex-shrink:0}
.settings-seg-btn{padding:7px 14px;background:none;border:none;border-right:1px solid var(--border);font-family:var(--sans);font-size:13px;color:var(--text-2);cursor:pointer;transition:background .15s,color .15s}
.settings-seg-btn:last-child{border-right:none}
.settings-seg-btn.active{background:var(--text);color:var(--bg);font-weight:500}
.settings-seg-btn:active:not(.active){opacity:0.5}

/* ── Settings toggle ── */
.ai-toggle{width:51px;height:31px;border-radius:16px;border:none;cursor:pointer;transition:background .25s;position:relative;flex-shrink:0;padding:0}
.ai-toggle.on{background:var(--accent)}
.ai-toggle.off{background:var(--border);filter:brightness(1.5)}
.ai-toggle-thumb{position:absolute;top:2px;width:27px;height:27px;border-radius:50%;background:#FFFFFF;box-shadow:0 1px 4px rgba(0,0,0,0.25);transition:left .25s;pointer-events:none}
.ai-toggle.on .ai-toggle-thumb{left:22px}
.ai-toggle.off .ai-toggle-thumb{left:2px}

/* ── Legal sheet (Privacy / Terms) ── */
.legal-sheet{width:100%;background:var(--bg);border-radius:20px 20px 0 0;border-top:1px solid var(--border);height:92dvh;display:flex;flex-direction:column;overflow:hidden}
.legal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;flex-shrink:0;border-bottom:1px solid var(--border)}
.legal-title{font-family:var(--sans);font-size:17px;font-weight:500;color:var(--text);letter-spacing:-0.01em}
.legal-close{background:none;border:none;font-family:var(--sans);font-size:14px;color:var(--text-2);cursor:pointer;padding:4px 8px;-webkit-tap-highlight-color:transparent}
.legal-close:active{opacity:0.5}
.legal-content{flex:1;overflow-y:auto;padding:24px 22px calc(40px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
.legal-content h1{font-family:var(--brand);font-size:28px;font-weight:400;color:var(--text);text-transform:uppercase;letter-spacing:0.01em;margin:0 0 8px}
.legal-content h2{font-family:var(--sans);font-size:14px;font-weight:600;color:var(--text);text-transform:uppercase;letter-spacing:0.06em;margin:28px 0 10px}
.legal-content p{font-family:var(--sans);font-size:14px;font-weight:300;line-height:1.65;color:var(--text);margin:0 0 14px}
.legal-content ul{list-style:none;margin:0 0 14px;padding:0}
.legal-content li{font-family:var(--sans);font-size:14px;font-weight:300;line-height:1.6;color:var(--text);padding-left:18px;position:relative;margin-bottom:8px}
.legal-content li::before{content:'·';position:absolute;left:6px;top:-1px;color:var(--text-2);font-weight:700}
.legal-content strong{font-weight:600;color:var(--text)}
.legal-content .legal-effective{font-family:var(--sans);font-size:12px;color:var(--text-2);margin:0 0 22px;letter-spacing:0.02em}

/* Inline legal link (login screen) */
.legal-link-row{position:absolute;bottom:calc(24px + env(safe-area-inset-bottom));left:0;right:0;text-align:center;font-family:var(--sans);font-size:11px;color:var(--warm-mid);letter-spacing:0.04em;z-index:2}
.legal-link-row button{background:none;border:none;font:inherit;color:var(--warm-mid);cursor:pointer;text-decoration:underline;padding:4px 6px;-webkit-tap-highlight-color:transparent}
.legal-link-row button:active{opacity:0.5}

/* ── Nav panel (left slide-in) ── */
@keyframes navPanelIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes navPanelOut{from{transform:translateX(0)}to{transform:translateX(-100%)}}
.nav-panel-backdrop{position:fixed;inset:0;z-index:200;background:transparent}
.nav-panel{position:fixed;left:0;top:0;bottom:0;width:189px;z-index:201;background:#FFFDFA;box-shadow:4px 0 20px rgba(0,0,0,0.18);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:navPanelIn 0.32s cubic-bezier(0.32,0.72,0,1)}
.nav-panel.is-closing{animation:navPanelOut 0.28s cubic-bezier(0.32,0.72,0,1) forwards}
.nav-panel-header{display:flex;align-items:center;padding:18px 21px 10px;flex-shrink:0}
.nav-panel-wordmark{display:inline-flex;align-items:center}
.nav-panel-nav{display:flex;flex-direction:column;gap:22px;padding:32px 21px 0;flex:1}
.nav-panel-item{background:none;border:none;cursor:pointer;padding:0;font-family:var(--s2-sans,-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif);font-weight:500;font-size:17px;color:#0C0C0C;letter-spacing:-0.01em;text-align:left;-webkit-tap-highlight-color:transparent;line-height:1.2}
.nav-panel-item:active{opacity:.4}
.nav-panel-footer{padding:21px;flex-shrink:0}
.nav-panel-signout{width:109px;height:36px;background:#0C0C0C;border:none;border-radius:3px;cursor:pointer;font-family:var(--brand);font-size:16px;color:#FFFDFA;letter-spacing:0.02em;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}
.nav-panel-signout:active{opacity:.7}

/* ── Gallery page ── */
@keyframes gridsPageIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes gridsPageOut{from{transform:translateX(0)}to{transform:translateX(100%)}}
.grids-page{position:fixed;inset:0;z-index:150;background:#FFFDFA;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);animation:gridsPageIn 0.32s cubic-bezier(0.32,0.72,0,1)}
.grids-page.is-closing{animation:gridsPageOut 0.28s cubic-bezier(0.32,0.72,0,1) forwards}
.grids-header{display:flex;align-items:center;padding:14px 20px;flex-shrink:0;gap:8px}
.grids-back{background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;width:36px;height:36px;color:var(--text);-webkit-tap-highlight-color:transparent}
.grids-back:active{opacity:.4}
.grids-title{font-family:var(--s2-mono);font-weight:500;font-size:14px;letter-spacing:0.06em;color:#0C0C0C}
.grids-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 48px;gap:12px}
.grids-empty-lbl{font-family:var(--s2-mono);font-weight:500;font-size:13px;letter-spacing:0.06em;color:var(--accent)}
.grids-empty-sub{font-family:var(--sans);font-size:15px;color:var(--text-2);text-align:center;line-height:1.6;font-weight:300}
/* ══════════════════════════════════════════════════════════════════
   Scout v2 — brand primitives (prefix: .s2-)
   "iOS defaults for function, Scout for emotion."
   Coexists with v1 styles during the phased rebrand.
   ══════════════════════════════════════════════════════════════════ */

/* Screen shell: standard iOS grouped-list background */
.s2-screen{min-height:100dvh;background:var(--s2-grouped-bg);color:var(--s2-text-primary);font-family:var(--s2-sans);-webkit-font-smoothing:antialiased}

/* Nav bar: 44pt, centered wordmark, SF Pro flanks */
.s2-nav{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:44px;padding:0 16px;background:var(--s2-grouped-bg);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px)}
.s2-nav-left{justify-self:start}
.s2-nav-center{justify-self:center;display:flex;align-items:center}
.s2-nav-right{justify-self:end}
.s2-nav-btn{background:none;border:none;padding:6px 0;font-family:var(--s2-sans);font-size:17px;color:var(--s2-text-primary);cursor:pointer;-webkit-tap-highlight-color:transparent}
.s2-nav-btn:active{opacity:.4}
.s2-nav-btn.accent{color:var(--s2-press-green)}

/* Screen title: Fraunces */
.s2-title-block{padding:8px 20px 20px}
.s2-title{font-family:var(--s2-serif);font-size:32px;line-height:1.05;letter-spacing:-0.02em;color:var(--s2-text-primary);margin:0}
.s2-dateline{font-family:var(--s2-mono);font-size:11px;letter-spacing:0.02em;color:var(--s2-text-muted);margin-top:6px}

/* Section label: mono uppercase (MOOD, TIME, CONSTRAINT) */
.s2-section-label{font-family:var(--s2-mono);font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.15em;color:var(--s2-text-muted);padding:20px 20px 6px;margin:0}

/* Grouped list */
.s2-list{margin:0 16px;background:var(--s2-bg);border-radius:10px;overflow:hidden}
.s2-list-row{display:flex;align-items:center;min-height:44px;padding:10px 16px;background:var(--s2-bg);font-family:var(--s2-sans);font-size:16px;color:var(--s2-text-primary);cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative}
.s2-list-row + .s2-list-row::before{content:'';position:absolute;top:0;left:16px;right:0;height:0.5px;background:rgba(0,0,0,0.1)}
[data-theme="dark"] .s2-list-row + .s2-list-row::before{background:rgba(255,253,250,0.1)}
.s2-list-row:active{background:rgba(0,0,0,0.04)}
[data-theme="dark"] .s2-list-row:active{background:rgba(255,253,250,0.04)}
.s2-list-row-label{flex:1;font-weight:400}
.s2-list-row-value{color:var(--s2-text-muted);font-size:16px;margin-right:6px}
.s2-list-row-trail{font-family:var(--s2-mono);font-size:12px;color:var(--s2-press-green);letter-spacing:0.02em;margin-left:8px}
.s2-list-row-chevron{width:7px;height:12px;color:var(--s2-text-muted);opacity:0.5;flex-shrink:0;margin-left:8px}

/* Segmented control (iOS-style) */
.s2-segmented{display:flex;margin:0 16px;padding:2px;background:rgba(120,120,128,0.12);border-radius:9px;gap:0}
.s2-segmented-option{flex:1;padding:7px 10px;background:transparent;border:none;font-family:var(--s2-sans);font-size:13px;font-weight:500;color:var(--s2-text-primary);cursor:pointer;border-radius:7px;-webkit-tap-highlight-color:transparent;transition:background .15s ease}
.s2-segmented-option.active{background:var(--s2-bg);box-shadow:0 3px 8px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04)}
[data-theme="dark"] .s2-segmented-option.active{box-shadow:0 3px 8px rgba(0,0,0,0.4)}

/* Primary button: Scout-styled (Geist Mono, filled ink) */
.s2-btn-primary{display:block;width:100%;padding:15px 0;background:var(--s2-text-primary);color:var(--s2-bg);font-family:var(--s2-mono);font-size:14px;font-weight:500;letter-spacing:0.1em;border:none;border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .15s ease}
.s2-btn-primary:active{opacity:0.75}
.s2-btn-primary:disabled{opacity:0.4;cursor:not-allowed}

/* Secondary button: iOS text-only */
.s2-btn-secondary{background:none;border:none;padding:12px;font-family:var(--s2-sans);font-size:17px;color:var(--s2-text-primary);cursor:pointer;-webkit-tap-highlight-color:transparent}
.s2-btn-secondary:active{opacity:0.4}

/* Tertiary button: smaller, muted text link. Used for quiet "undo"-style
   actions like Recompose on the Brief screen — always-present but visually
   recessive so it doesn't compete with Take photo / Choose from library. */
.s2-btn-tertiary{background:none;border:none;padding:8px;font-family:var(--s2-mono);font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:var(--s2-text-muted);cursor:pointer;-webkit-tap-highlight-color:transparent}
.s2-btn-tertiary:active{opacity:0.4}

/* Filed stamp — rotated, Press Green, rubber-stamp feel */
.s2-stamp-filed{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1.5px solid var(--s2-press-green);border-radius:2px;font-family:var(--s2-mono);font-size:11px;font-weight:500;letter-spacing:0.3em;text-transform:uppercase;color:var(--s2-press-green);transform:rotate(-1.5deg);background:transparent}

/* Dispatch / New Assignment pill */
.s2-stamp-dispatch{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1.5px solid var(--s2-press-green);border-radius:2px;font-family:var(--s2-mono);font-size:9px;font-weight:500;letter-spacing:0.25em;text-transform:uppercase;color:var(--s2-press-green);background:transparent}
.s2-stamp-dispatch::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--s2-press-green);flex-shrink:0}

/* Utility text styles */
.s2-mono{font-family:var(--s2-mono);letter-spacing:0.02em}
.s2-serif{font-family:var(--s2-serif);letter-spacing:-0.015em}
.s2-muted{color:var(--s2-text-muted)}
.s2-accent{color:var(--s2-press-green)}

/* Tray — a full-surface bottom sheet that presents a screen-level flow
   (e.g. Compose). Rounded top, a single drag handle at the top (no bar,
   no Cancel). Default surface is the iOS grouped-list background so card
   rows pop on the Compose form; brand-moment stages (Brief/Filed/
   Uploading) override via s2-tray--paper to use --s2-bg (paper in light,
   ink in dark). NEVER hardcode --s2-paper — that made paper text +
   primary-button fills invisible in dark mode. */
.s2-tray{position:relative;min-height:100dvh;background:var(--s2-grouped-bg);color:var(--s2-text-primary);font-family:var(--s2-sans);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;overflow:hidden}
.s2-tray.s2-tray--paper{background:var(--s2-bg)}
/* Push-nav page header — close × on the right. Replaces the old tray drag
   handle with an explicit dismiss affordance. */
.s2-page-header{display:flex;align-items:center;padding:8px 8px 0 8px;padding-top:calc(env(safe-area-inset-top,0px) + 8px);min-height:48px;flex-shrink:0}
.s2-page-header--right{justify-content:flex-end}
.s2-page-close{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;background:none;border:none;color:var(--s2-text-primary);cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:8px}
.s2-page-close:active{opacity:0.5}

/* Icon-only chrome button — used for things like Recompose-as-refresh on
   the Brief screen. Square 36px touch target, currentColor so the icon
   inherits press-green / ink based on context. */
.s2-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;background:none;border:none;color:var(--s2-text-muted);cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:8px;transition:color .15s ease,background .15s ease}
.s2-icon-btn:active{opacity:0.5}
.s2-icon-btn:hover{color:var(--s2-text-primary)}

/* Typewriter caret — blinks at the end of the brief while characters are
   still being revealed. Inline so it sits flush against the last char. */
.s2-typewriter-caret{display:inline-block;margin-left:1px;color:var(--s2-press-green);animation:s2-caret-blink 1s steps(1) infinite;font-family:var(--s2-mono);font-size:0.75em;vertical-align:0.05em}
@keyframes s2-caret-blink{50%{opacity:0}}

/* Bottom sheet (iOS-style action picker) */
.s2-sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;display:flex;align-items:flex-end;justify-content:center;animation:s2-sheet-fade .2s ease}
.s2-sheet{width:100%;max-width:640px;background:var(--s2-bg);border-top-left-radius:16px;border-top-right-radius:16px;padding-bottom:env(safe-area-inset-bottom,20px);max-height:80dvh;display:flex;flex-direction:column;animation:s2-sheet-slide .25s cubic-bezier(0.2,0,0,1)}
.s2-sheet-handle{width:36px;height:5px;background:rgba(0,0,0,0.18);border-radius:3px;margin:8px auto 4px}
[data-theme="dark"] .s2-sheet-handle{background:rgba(255,253,250,0.24)}
.s2-sheet-header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 4px}
.s2-sheet-list{overflow-y:auto;padding:4px 0 12px}
.s2-sheet-row{width:100%;text-align:left;background:transparent;border:none}
@keyframes s2-sheet-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes s2-sheet-fade{from{opacity:0}to{opacity:1}}

/* Loading spinner for primary button — tiny, inherits color */
.s2-spinner{display:inline-block;width:14px;height:14px;border:1.5px solid currentColor;border-top-color:transparent;border-radius:50%;animation:s2-spin .7s linear infinite;vertical-align:-2px;margin-right:8px}
@keyframes s2-spin{to{transform:rotate(360deg)}}

/* Today tray embed — full-viewport ComposeScreen on mobile only. Hidden on
   tablet+ since the main panel renders day detail side-by-side with the
   sidebar there. */
.today-sheet-embed{position:fixed;inset:0;z-index:50;animation:sheetSlideUp 0.38s cubic-bezier(0.32,0.72,0,1)}
@media(min-width:640px){.today-sheet-embed{display:none}}

/* ══════════════════════════════════════════════════════════════════
   Scout v2 — Auth flow (splash, welcome, sign-in forms)
   Paper splash → ink welcome → ink sign-in.
   Continue buttons use Apple HIG shape (56h × 10r). SF Pro 14/700.
   ══════════════════════════════════════════════════════════════════ */

/* Splash — theme-aware. Paper surface + ink type in light mode; ink
   surface + paper type in dark. Hardcoding paper here caused the splash
   to flash cream at dark-mode users before transitioning into the rest
   of the (dark-adapted) app. */
.s2-splash{position:fixed;inset:0;background:var(--s2-bg);color:var(--s2-text-primary);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1000;opacity:1;transition:opacity .6s ease;pointer-events:none;font-family:var(--s2-sans);-webkit-font-smoothing:antialiased}
.s2-splash.fading{opacity:0}
.s2-splash-tag{font-family:var(--s2-sans);font-size:20px;line-height:1.45;color:var(--s2-text-primary);text-align:center;margin-top:32px;font-weight:400;letter-spacing:-0.005em}

/* Auth scene — ink surface for welcome + every sign-in form. */
.s2-auth{position:fixed;inset:0;background:var(--s2-ink);color:var(--s2-paper);display:flex;flex-direction:column;font-family:var(--s2-sans);padding:0 24px env(safe-area-inset-bottom,24px);-webkit-font-smoothing:antialiased;overflow-y:auto}
.s2-auth-wordmark{display:flex;flex-direction:column;align-items:center;margin-top:14vh}
.s2-auth-hed{margin-top:22px;font-family:var(--s2-sans);font-size:20px;font-weight:400;color:var(--s2-paper);letter-spacing:-0.005em;text-align:center}

/* Continue buttons — 56px tall, 10px radius, SF Pro 700 14/0.01em. */
.s2-auth-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:56px;border-radius:10px;font-family:var(--s2-sans);font-size:14px;font-weight:700;letter-spacing:0.01em;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .15s;border:1px solid rgba(255,253,250,0.28);background:var(--s2-ink);color:var(--s2-paper)}
.s2-auth-btn + .s2-auth-btn{margin-top:12px}
.s2-auth-btn:active{opacity:0.65}
.s2-auth-btn:disabled{opacity:0.4;cursor:not-allowed}
.s2-auth-btn-primary{background:var(--s2-paper);color:var(--s2-ink);border-color:var(--s2-bone)}
.s2-auth-btn-primary:active{opacity:0.75}

/* Footer link — "Don't have an account? Sign up" */
.s2-auth-footer{font-family:var(--s2-sans);font-size:14px;color:rgba(255,253,250,0.6);text-align:center;margin-top:20px;padding-bottom:16px}
.s2-auth-footer .s2-auth-link{color:var(--s2-paper)}
.s2-auth-link{color:var(--s2-paper);font-weight:700;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;font-size:inherit;letter-spacing:inherit;-webkit-tap-highlight-color:transparent}
.s2-auth-link:active{opacity:0.6}

/* Inputs — dark w/ 1px white-alpha border; swap to paper fill on focus/filled. */
.s2-auth-fields{margin-top:40px;display:flex;flex-direction:column;gap:12px}
.s2-auth-input{width:100%;height:56px;padding:0 18px;border-radius:10px;font-family:var(--s2-sans);font-size:16px;color:var(--s2-paper);background:var(--s2-ink);border:1px solid rgba(255,253,250,0.28);outline:none;transition:background .15s,color .15s,border-color .15s;-webkit-appearance:none;appearance:none}
.s2-auth-input::placeholder{color:rgba(255,253,250,0.36)}
.s2-auth-input:focus,.s2-auth-input:not(:placeholder-shown){background:var(--s2-paper);color:var(--s2-ink);border-color:rgba(255,253,250,0.28)}
.s2-auth-input:focus::placeholder,.s2-auth-input:not(:placeholder-shown)::placeholder{color:var(--s2-smoke)}

/* Inline errors + helpers */
.s2-auth-err{font-family:var(--s2-sans);font-size:13px;color:#E06D6D;margin-top:4px;text-align:center}
.s2-auth-helper{font-family:var(--s2-sans);font-size:13px;color:rgba(255,253,250,0.6);margin-top:4px;text-align:center}
.s2-auth-actions{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
.s2-auth-text-btn{background:none;border:none;padding:12px 4px;font-family:var(--s2-sans);font-size:14px;font-weight:500;color:rgba(255,253,250,0.75);cursor:pointer;-webkit-tap-highlight-color:transparent}
.s2-auth-text-btn:active{opacity:0.5}
`;

(() => {
  let s = document.getElementById('pj-css');
  if (!s) { s = document.createElement('style'); s.id = 'pj-css'; document.head.appendChild(s); }
  s.textContent = CSS;
})();

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

// ── Icons ──
const IcUpload = ()=><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IcTip = ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
const IcHamburger = ()=><svg width="20" height="14" viewBox="0 0 20 14" fill="none"><line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="0" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const ChevLeft  = ()=><svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ChevRight = ()=><svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M1 1L8 7.5L1 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IcBulb = ()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 5 11.93V17H7v-3.07A7 7 0 0 1 12 2z"/></svg>;

function AuthImage({ src, alt, ...props }) {
  const [blobSrc, setBlobSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setBlobSrc(null);
    setLoaded(false);
    if (!src) return;
    let url;
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return;
      fetch(src, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.blob() : null)
        .then(blob => { if (blob) { url = URL.createObjectURL(blob); setBlobSrc(url); } });
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src]);
  return <img src={blobSrc || ''} alt={alt} onLoad={() => setLoaded(true)}
    style={{opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease'}} {...props} />;
}

export default function App() {
  // Pure-design dev mode — render ComposeScreen without the auth + mobile
  // gates. API calls won't work, but ?brief= / ?note= can still paint the
  // anchor screens for visual review.
  if (_composeDev) return <ComposeScreen />;
  const todayStr = today();
  const now = new Date();
  const [TY,TM,TD] = [now.getFullYear(),now.getMonth(),now.getDate()];

  const weekKey = useMemo(() => {
    const d = new Date(todayStr + 'T12:00:00');
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay()); // rewind to Sunday
    const y = sunday.getFullYear();
    const m = String(sunday.getMonth() + 1).padStart(2, '0');
    const day = String(sunday.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [todayStr]);

  // ── Theme: pref is 'light' | 'dark' | 'system', default 'system' ──
  const [themePref, setThemePref] = useState(()=>
    localStorage.getItem('scout-theme-pref') || 'system'
  );
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

  // ── Onboarding ──
  const [showOnboarding, setShowOnboarding] = useState(false);

  const syncObColor = (step) => {
    const color = '#FFFDFA';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.documentElement.style.background = color;
    document.body.style.background = color;
  };

  useEffect(() => { syncObColor(showOnboarding || null); }, [showOnboarding]);

  const finishOnboarding = () => {
    localStorage.setItem('scout-onboarded', '1');
    syncObColor(null);
    setShowOnboarding(false);
  };

  // ── Settings ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ── Legal (Privacy / Terms) ──
  const [legalOpen, setLegalOpen] = useState(null); // null | 'privacy' | 'terms'
  const [accountOpen,  setAccountOpen]  = useState(false);
  const [supportOpen,  setSupportOpen]  = useState(false);
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
  const [signupEmail,  setSignupEmail]  = useState('');
  const [signupPw,     setSignupPw]     = useState('');
  const [signupPwConfirm, setSignupPwConfirm] = useState('');
  const [signupBusy,   setSignupBusy]   = useState(false);
  const [signupErr,    setSignupErr]    = useState('');
  const [deleteAccBusy, setDeleteAccBusy] = useState(false);

  // ── Navigation state ──
  const [activeTab,     setActiveTab]     = useState('today');
  const [showTodaySheet, setShowTodaySheet] = useState(true);
  const [sheetClosing, setSheetClosing] = useState(false);
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
  const [feedbackLoading,    setFeedbackLoading]    = useState(false);
  const [feedbackError,      setFeedbackError]      = useState(null);
  const [feedbackExpanded,   setFeedbackExpanded]   = useState(true);
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
  const [shootPrompt,        setShootPrompt]        = useState(null);
  const [promptLoading,      setPromptLoading]      = useState(false);
  const [photoVer,           setPhotoVer]           = useState(()=>Date.now());

  const [lightboxOpen,  setLightboxOpen]  = useState(false);
  const [overflowOpen,  setOverflowOpen]  = useState(false);
  const [locationName,  setLocationName]  = useState(null);
  const [aiEnabled,    setAiEnabled]    = useState(()=> localStorage.getItem('scout-ai-enabled') !== 'false');
  useEffect(()=>{ localStorage.setItem('scout-ai-enabled', String(aiEnabled)); }, [aiEnabled]);
  const [tipsEnabled,  setTipsEnabled]  = useState(()=> localStorage.getItem('scout-tips-enabled') === 'true');
  useEffect(()=>{ localStorage.setItem('scout-tips-enabled', String(tipsEnabled)); }, [tipsEnabled]);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(()=> localStorage.getItem('scout-analytics-optout') !== 'true');
  const [weekTheme,    setWeekTheme]    = useState(null);
  const [nextWeekTheme, setNextWeekTheme] = useState(null);
  const [tipPopupOpen,  setTipPopupOpen]  = useState(false);
  const [themeExpanded,setThemeExpanded]= useState(false);
  const fileRef        = useRef(null);
  const cameraRef      = useRef(null);
  const captionRef     = useRef(null);
  const lbTouchRef     = useRef(null);
  const swipeTouchRef  = useRef(null);
  const tipBtnRef      = useRef(null);
  const monthScrollRef = useRef(null);
  const promptFiredRef = useRef(null); // stores the date string the prompt was last fired for
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
      if (hasSession && !localStorage.getItem('scout-onboarded')) setShowOnboarding(true);
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
        if (!localStorage.getItem('scout-onboarded')) setShowOnboarding(true);
      }
      if (event === 'SIGNED_OUT') {
        track('signout');
        resetIdentity();
      }
    });
    return () => subscription.unsubscribe();
  }, []);


  useEffect(()=>{
    const handler = (e) => { if (e.key==='Escape') { setLightboxOpen(false); setSettingsOpen(false); setTipsOpen(false); setLegalOpen(null); } };
    window.addEventListener('keydown', handler);
    return ()=>window.removeEventListener('keydown', handler);
  }, []);

  // Sync theme-color meta + html/body background with current screen so iOS status bar matches.
  // useLayoutEffect fires before paint on state changes; the visibilitychange/pageshow listeners
  // handle the case where iOS resets the bar after the app is backgrounded/foregrounded.
  const applyStatusBarColor = useCallback(()=>{
    // Mirror the exact JSX render condition — only treat sheet as "visible" when it actually renders
    const todaySheetVisible = showTodaySheet && sel === todayStr && !dayMeta && !dayLoading;
    let color;
    if (!splashDone)             color = '#FFFDFA';
    else if (showLanding)        color = '#0C0C0C';
    else if (showOnboarding)     color = '#FFFDFA';
    else if (!authed)            color = '#0C0C0C';
    else if (lightboxOpen)        color = '#000000';
    else if (todaySheetVisible)  color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    else                         color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = color;
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
  }, [splashDone, showLanding, showOnboarding, authed, lightboxOpen, showTodaySheet, sel, todayStr,
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
    if (!authed || !aiEnabled) return;
    getTheme().then(t => { if (t?.theme) setWeekTheme(t); });
  }, [authed, aiEnabled, weekKey]);

  useEffect(()=>{
    if (!authed || !aiEnabled) return;
    setNextWeekTheme(null); // clear stale value when week changes
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const thisSunday = new Date(date);
    thisSunday.setDate(date.getDate() - date.getDay());
    const nextSunday = new Date(thisSunday);
    nextSunday.setDate(thisSunday.getDate() + 7);
    const pad = n => String(n).padStart(2,'0');
    const nextSundayStr = `${nextSunday.getFullYear()}-${pad(nextSunday.getMonth()+1)}-${pad(nextSunday.getDate())}`;
    getNextWeekTheme(nextSundayStr).then(t => { if (t?.theme) setNextWeekTheme(t); });
  }, [authed, aiEnabled, weekKey]);

  useEffect(()=>{
    if (!tipPopupOpen) return;
    const close = () => setTipPopupOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tipPopupOpen]);

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
    setFeedbackLoading(false);
    setFeedbackError(null);
    setFeedbackExpanded(true);
    setCaptionSuggestion(null);
    setCaptionSuggestLoad(false);
    // Reset prompt state when navigating away from today
    if (sel !== todayStr) {
      setShootPrompt(null);
      setPromptLoading(false);
      // Don't reset promptFiredRef here — it's date-keyed and self-manages
    }
    setLocationName(null);
    getPhoto(sel).then(data=>{
      setDayMeta(data);
      setCaption(data?.caption||'');
      // Prefer the v2 editor note (attached by the Compose flow) over the
      // v1 feedback field; both render inside the same Field Note block.
      const note = data?.editorNote || data?.feedback || null;
      if (note) setFeedback(note);
      // Evening-edition gate: for today's note, suppress the reveal until
      // 20:00 local. Past-dated notes aren't gated (they were held back
      // when originally filed). Seen flag is per-date.
      const nowHour = new Date().getHours();
      const gatedToday = sel === todayStr && nowHour < 20;
      if (note && sel && !gatedToday && !localStorage.getItem(`scout-note-seen-${sel}`)) {
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

  // ── Auto-fetch today's prompt when viewing today with no photo ──
  useEffect(()=>{
    if (!authed || !aiEnabled || sel !== todayStr || dayLoading || dayMeta) return;
    // Use date string in ref so the prompt re-fires correctly when the day rolls over
    if (promptFiredRef.current === todayStr) return;
    // Check localStorage cache first — prompt should only generate once per day
    const cacheKey = `scout-prompt-${todayStr}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setShootPrompt(cached);
      promptFiredRef.current = todayStr;
      track('ai_prompt_viewed', { date: todayStr, source: 'cache' });
      return;
    }
    promptFiredRef.current = todayStr;
    setPromptLoading(true);
    getTodayPrompt(sel).then(data=>{
      if (data?.prompt) {
        setShootPrompt(data.prompt);
        localStorage.setItem(cacheKey, data.prompt);
        track('ai_prompt_viewed', { date: todayStr, source: 'fetch' });
      }
      setPromptLoading(false);
    });
  }, [sel, dayMeta, dayLoading, authed, aiEnabled, todayStr]);


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
    setShowLanding(true);
  };

  const [pwNew,         setPwNew]         = useState('');
  const [pwChanging,    setPwChanging]    = useState(false);
  const [pwMsg,         setPwMsg]         = useState(null); // {ok, text}
  const [dlProgress,    setDlProgress]    = useState(null); // null | {done, total}
  const [pwExpanded,    setPwExpanded]    = useState(false);
  const [devDeleteMode,      setDevDeleteMode]      = useState(true);
  const [tipsOpen,           setTipsOpen]           = useState(false);

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
    e.target.value=''; setBusy(true); setFeedback(null); setFeedbackExpanded(true);
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
        if (exif?.lat != null && exif?.lon != null) reverseGeocode(exif.lat, exif.lon).then(name => { if (name) setLocationName(name); });
        else setLocationName(null);
        // Auto-trigger feedback
        if (aiEnabled) {
          setFeedbackLoading(true);
          setFeedbackError(null);
          getFeedback(sel).then(result => {
            if (result?.feedback) setFeedback(result.feedback);
            else setFeedbackError(result?.error ?? 'Couldn\'t get feedback. Try again.');
            setFeedbackLoading(false);
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

  const dismissTodaySheet = () => {
    setSheetClosing(true);
    setTimeout(() => { setShowTodaySheet(false); setSheetClosing(false); }, 360);
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

  const handleFeedback = async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    const result = await getFeedback(sel);
    if (result?.feedback) setFeedback(result.feedback);
    else setFeedbackError(result?.error ?? 'Couldn\'t get feedback. Try again.');
    setFeedbackLoading(false);
  };

  useEffect(()=>{
    const el = captionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [caption]);

  const handleGetPrompt = async () => {
    setPromptLoading(true);
    const data = await getTodayPrompt(sel);
    if (data?.prompt) setShootPrompt(data.prompt);
    setPromptLoading(false);
  };

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

  const splash = !splashDone && (
    <div className={`s2-splash${splashFading?' fading':''}`}>
      <ScoutWordmark size={56} color={theme === 'dark' ? '#FFFCF6' : '#0C0C0C'} ruleColor="#007C04" />
      <div className="s2-splash-tag">
        One photograph a day.<br />Nothing more.
      </div>
    </div>
  );


  // Desktop/tablet lockout — show a single directive to open on mobile.
  // The ?compose=1 silo and ?design=1 flag bypass the gate so design
  // iteration can happen on desktop during the rebrand; gate resumes
  // once the flags are gone.
  if (!isMobile && !_composeSilo && !_designPreview) return (
    <div className="mobile-gate">
      <div className="mobile-gate-inner">
        <h1 className="mobile-gate-title">Scout lives on your phone</h1>
        <p className="mobile-gate-body">
          A photo a day, wherever you are. Open Scout on your phone to get started.
        </p>
        <span className="mobile-gate-url">scoutphoto.app</span>
      </div>
    </div>
  );

  // PWA receiving OAuth callback directly — show clean dark screen instead of flash
  if (checking && _isStandalone && _authInUrl) return (
    <div style={{position:'fixed',inset:0,background:'#0C0C0C'}} />
  );

  if (checking) return splash || null;

  if (forgotView === 'set') return (
    <form className="s2-auth" onSubmit={handleSetNewPassword} data-theme={theme}>
      <div className="s2-auth-wordmark">
        <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
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

  if (!authed && showLanding) return (
    <>
      {splash}
      <div className="s2-auth">
        <div className="s2-auth-wordmark">
          <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
          <div className="s2-auth-hed">Welcome back</div>
        </div>
        <div style={{marginTop:'auto', paddingTop:24}}>
          <button type="button" className="s2-auth-btn s2-auth-btn-primary" onClick={handleAppleLogin} disabled={loginBusy}>
             Continue with Apple
          </button>
          <button type="button" className="s2-auth-btn" onClick={handleGoogleLogin} disabled={loginBusy}>
            Continue with Google
          </button>
          <button type="button" className="s2-auth-btn" onClick={()=>setShowLanding(false)} disabled={loginBusy}>
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
            <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
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
            <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
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
            <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
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
            <ScoutWordmark size={56} color="#FFFCF6" ruleColor="#007C04" />
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
  if (_composeSilo) return <ComposeScreen />;

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
          {photoDates.size===0 ? (
            <div className="archive-empty">
              <div className="archive-empty-lbl">No photos yet</div>
              <div className="archive-empty-sub">File one and it lands here.</div>
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
              const label = `${MONTHS[gm-1]} ${gy}`.toUpperCase();
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
              {dayMeta?.compose?.brief&&(
                <div className="brief-chip">
                  <button className="brief-chip-toggle" onClick={()=>setBriefExpanded(v=>!v)}>
                    <span className="brief-chip-lbl">{briefExpanded ? 'Hide the brief' : 'Read the brief'}</span>
                    <svg className={`brief-chip-chev${briefExpanded?' open':''}`} viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M3 5.5l4 4 4-4"/>
                    </svg>
                  </button>
                  <div className={`brief-chip-body${briefExpanded?' open':''}`}>
                    <div className="brief-chip-body-inner">{dayMeta.compose.brief}</div>
                  </div>
                </div>
              )}

            </div>
          </>
        ) : null}
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
                  <circle cx="12" cy="12" r="9"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <button
                className={`s2-tab-btn${activeTab==='archive'?' active':''}`}
                onClick={() => switchTab('archive')}
                aria-label="Archive"
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
                aria-label="Calendar"
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
              <div className="note-reveal-body">
                {revealed}
                {typing && <span className="s2-typewriter-caret" aria-hidden="true">▍</span>}
              </div>
              <div className="note-reveal-sig">— The Editor</div>
              <div style={{ flex: 1 }} />
              <button className="s2-btn-primary" onClick={dismiss}>Close</button>
            </div>
          </div>
        );
      })()}

      {tipPopupOpen&&(()=>{
        const tip = getSkill(sel);
        const rect = tipBtnRef.current?.getBoundingClientRect();
        const bottom = rect ? window.innerHeight - rect.top + 12 : 150;
        const right  = rect ? window.innerWidth - rect.right + 8  : 24;
        return (
          <div className="tip-popup" style={{bottom, right}}>
            <div className="tip-popup-label">TODAY'S TIP</div>
            <div className="tip-popup-name">{tip.n}</div>
            <div className="tip-popup-body">{tip.t}</div>
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

      {/* Tips sheet */}
      {tipsOpen&&(
        <div className="tips-backdrop" onClick={()=>setTipsOpen(false)}>
          <div className="tips-sheet" onClick={e=>e.stopPropagation()}>
            <div className="tips-handle"/>
            <div className="tips-header">
              <div className="tips-title">This Week's Tips</div>
              <button className="tips-close" onClick={()=>setTipsOpen(false)}>✕</button>
            </div>
            <div className="tips-week">{formatWeekRange(getWeekDates(todayStr))}</div>
            <div className="tips-list">
              {getWeekDates(todayStr).map((date)=>{
                const s = getSkill(date);
                const dow = WDAYS[new Date(date+'T12:00:00').getDay()];
                const hasPhoto = photoDates.has(date);
                const isFuture = date > todayStr;
                return (
                  <div key={date} className="tips-row">
                    <div className="tips-row-day">
                      <span className="tips-dow">{dow.slice(0,1)}</span>
                      {hasPhoto&&<div className="tips-dot"/>}
                    </div>
                    <div style={{flex:1}}>
                      <div className="tips-name">{s.n}</div>
                      <div className="tips-body">{s.t}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Settings sheet */}
      {/* ── Nav Panel ── */}
      {panelOpen&&(
        <div className="nav-panel-backdrop" onClick={dismissPanel}>
          <div className={`nav-panel${panelClosing?' is-closing':''}`} onClick={e=>e.stopPropagation()}>
            <div className="nav-panel-header">
              <span className="nav-panel-wordmark">
                <ScoutWordmark size={26} color={theme === 'dark' ? '#FFFCF6' : '#0C0C0C'} hideRule />
              </span>
            </div>
            <nav className="nav-panel-nav">
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setAccountOpen(true); },310); }}>Account</button>
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setSettingsOpen(true); },310); }}>Settings</button>
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setSupportOpen(true); },310); }}>Support</button>
              {userEmail==='ecrissman@gmail.com'&&(
                <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setDevPanelOpen(true); },310); }}>Developer</button>
              )}
              <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}}/>
              <button className="nav-panel-item" style={{color:'var(--accent)'}} onClick={()=>{ dismissPanel(); handleSignOut(); }}>Sign Out</button>
            </nav>
          </div>
        </div>
      )}


      {/* ── Settings tray: Appearance + Features ── */}
      {settingsOpen&&(
        <div className="settings-backdrop" onClick={()=>setSettingsOpen(false)}>
          <div className="settings-sheet" onClick={e=>e.stopPropagation()}>
            <div className="settings-handle"/>
            <div className="settings-title">Settings</div>

            <div className="settings-section">
              <div className="settings-section-label">Appearance</div>
              <div className="settings-group">
                <div className="settings-row">
                  <span className="settings-row-label">Theme</span>
                  <div className="settings-seg">
                    {(['light','system','dark']).map(opt=>(
                      <button key={opt} className={`settings-seg-btn${themePref===opt?' active':''}`} onClick={()=>setThemePref(opt)}>
                        {opt==='light'?'Light':opt==='dark'?'Dark':'Auto'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Features</div>
              <div className="settings-group">
                <div className="settings-row">
                  <div style={{flex:1}}>
                    <div className="settings-row-label">AI Features</div>
                    <div className="settings-row-sub">Captions, feedback & prompts</div>
                  </div>
                  <button className={`ai-toggle${aiEnabled?' on':' off'}`} onClick={()=>setAiEnabled(v=>!v)} aria-label={aiEnabled?'Disable AI':'Enable AI'}>
                    <div className="ai-toggle-thumb"/>
                  </button>
                </div>
                <div className="settings-row">
                  <div style={{flex:1}}>
                    <div className="settings-row-label">Photography Tips</div>
                    <div className="settings-row-sub">Weekly skill tips in the theme card</div>
                  </div>
                  <button className={`ai-toggle${tipsEnabled?' on':' off'}`} onClick={()=>setTipsEnabled(v=>!v)} aria-label={tipsEnabled?'Disable tips':'Enable tips'}>
                    <div className="ai-toggle-thumb"/>
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Privacy</div>
              <div className="settings-group">
                <div className="settings-row">
                  <div style={{flex:1}}>
                    <div className="settings-row-label">Analytics</div>
                    <div className="settings-row-sub">Anonymous usage data to improve Scout</div>
                  </div>
                  <button
                    className={`ai-toggle${analyticsEnabled?' on':' off'}`}
                    onClick={()=>{
                      const next = !analyticsEnabled;
                      setAnalyticsEnabled(next);
                      setAnalyticsOptOut(!next);
                    }}
                    aria-label={analyticsEnabled?'Disable analytics':'Enable analytics'}
                  >
                    <div className="ai-toggle-thumb"/>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Account tray ── */}
      {accountOpen&&(
        <div className="settings-backdrop" onClick={()=>setAccountOpen(false)}>
          <div className="settings-sheet" onClick={e=>e.stopPropagation()}>
            <div className="settings-handle"/>
            <div className="settings-title">Account</div>

            <div className="settings-section">
              <div className="settings-group">
                <div className="settings-row">
                  <span className="settings-row-label" style={{fontSize:13,color:'var(--text-2)',fontFamily:'var(--sans)'}}>{userEmail}</span>
                </div>
                <button className="settings-row-btn" onClick={()=>{setPwExpanded(v=>!v);setPwMsg(null);}}>
                  <span className="settings-row-label">Change Password</span>
                  <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
                </button>
                {pwExpanded&&(
                  <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:8,padding:'12px 16px',minHeight:'auto'}}>
                    <div className="settings-pw-row">
                      <input className="settings-pw-input" type="password" value={pwNew}
                        onChange={e=>{setPwNew(e.target.value);setPwMsg(null);}}
                        placeholder="New password" autoComplete="new-password"/>
                      <button type="button" className="settings-pw-submit" onClick={handleChangePassword} disabled={pwChanging||!pwNew}>
                        {pwChanging?'…':'Save'}
                      </button>
                    </div>
                    {pwMsg&&<div style={{fontFamily:'var(--sans)',fontSize:12,color:pwMsg.ok?'var(--accent)':'#B03030'}}>{pwMsg.text}</div>}
                  </div>
                )}
                <button className="settings-row-btn" onClick={handleSignOut}>
                  <span className="settings-row-label" style={{color:'#D9534F'}}>Sign Out</span>
                </button>
                <button className="settings-row-btn" onClick={handleDeleteAccount} disabled={deleteAccBusy}>
                  <span className="settings-row-label" style={{color:'#D9534F'}}>
                    {deleteAccBusy ? 'Deleting…' : 'Delete Account'}
                  </span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Photos</div>
              <div className="settings-group">
                <button className="settings-row-btn" onClick={handleDownloadAllPhotos} disabled={!!dlProgress||photoDates.size===0}>
                  <span className="settings-row-label">
                    {dlProgress ? `Downloading… ${dlProgress.done} of ${dlProgress.total}` : 'Download All Photos'}
                  </span>
                  {!dlProgress&&<svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Support tray ── */}
      {supportOpen&&(
        <div className="settings-backdrop" onClick={()=>setSupportOpen(false)}>
          <div className="settings-sheet" onClick={e=>e.stopPropagation()}>
            <div className="settings-handle"/>
            <div className="settings-title">Support</div>

            <div className="settings-section">
              <div className="settings-group">
                <a className="settings-row-btn" href="mailto:eric@scoutphoto.app?subject=Scout%20Feedback%20%2F%20Feature%20Request" style={{textDecoration:'none'}}>
                  <span className="settings-row-label">Feedback & Ideas</span>
                  <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
                </a>
                <a className="settings-row-btn" href="mailto:eric@scoutphoto.app?subject=Scout%20Bug%20Report" style={{textDecoration:'none'}}>
                  <span className="settings-row-label">Report a Bug</span>
                  <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
                </a>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">Legal</div>
              <div className="settings-group">
                <button className="settings-row-btn" onClick={()=>{ setSupportOpen(false); setLegalOpen('privacy'); }}>
                  <span className="settings-row-label">Privacy Policy</span>
                  <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
                </button>
                <button className="settings-row-btn" onClick={()=>{ setSupportOpen(false); setLegalOpen('terms'); }}>
                  <span className="settings-row-label">Terms of Service</span>
                  <svg className="settings-row-chev" viewBox="0 0 7 12"><polyline points="1,1 6,6 1,11"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Legal sheet (Privacy / Terms) ── */}
      {legalOpen&&(
        <div className="settings-backdrop" onClick={()=>setLegalOpen(null)}>
          <div className="legal-sheet" onClick={e=>e.stopPropagation()}>
            <div className="legal-header">
              <div className="legal-title">{legalOpen==='privacy'?'Privacy Policy':'Terms of Service'}</div>
              <button className="legal-close" onClick={()=>setLegalOpen(null)}>Close</button>
            </div>
            <div className="legal-content">
              {renderLegal(legalOpen==='privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE)}
            </div>
          </div>
        </div>
      )}

      {devPanelOpen&&(
        <div className="settings-backdrop" onClick={()=>setDevPanelOpen(false)}>
          <div className="settings-sheet" onClick={e=>e.stopPropagation()}>
            <div className="settings-handle"/>
            <div className="settings-title">Developer</div>
            <div className="settings-section">
              <div className="settings-section-label">Tools</div>
              <div className="settings-group">
                <div className="settings-row">
                  <span className="settings-row-label">Delete Mode</span>
                  <button className={`ai-toggle${devDeleteMode?' on':' off'}`} onClick={()=>setDevDeleteMode(v=>!v)} aria-label="Toggle delete mode">
                    <div className="ai-toggle-thumb"/>
                  </button>
                </div>
                <button className="settings-row-btn" onClick={()=>{ localStorage.removeItem('scout-onboarded'); setShowOnboarding(true); setDevPanelOpen(false); }}>
                  <span className="settings-row-label">Reset Onboarding</span>
                  <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>replay first-run flow</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
}
