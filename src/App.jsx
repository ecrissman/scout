import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { getPhoto, uploadPhoto, updateCaption, deletePhoto, listYear, thumbUrl, fullUrl, getFeedback, getCaptionSuggestion, getTodayPrompt, getTheme, requestAccess } from './api';
import { extractEXIF, formatExif, compressFile, makeThumb } from './exif';
import { getSkill } from './skills';
import { supabase } from './supabase.js';

// Mark standalone PWA mode before first paint so CSS can target it
if (window.navigator.standalone) document.documentElement.classList.add('pwa');


const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inconsolata:wdth,wght@75..125,200..900&display=swap');
@font-face{font-family:'Flapjack';src:url('/fonts/TAYFlapjack.woff2') format('woff2'),url('/fonts/TAYFlapjack.woff') format('woff'),url('/fonts/TAYFlapjack.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root,[data-theme="light"]{
  --bg:#FFFDFA;--bg-secondary:#F0EEEA;--surface:#F0EEEA;
  --border:#E3E1DD;
  --text:#1C1916;--text-2:#8C857C;--text-3:#B5AFA9;
  --accent:#4F5E2E;--accent-fg:#FFFDFA;
  --terracotta:#E34822;--sage:#4F5E2E;--gold:#E2B554;--paper:#FFFDFA;--ink:#0C0C0C;
  --warm-mid:#8C857C;--rule:#E3E1DD;
  --brand:'Flapjack','Inconsolata',system-ui,sans-serif;
  --serif:'Inconsolata',system-ui,monospace;
  --sans:'Inconsolata',system-ui,monospace;
}
[data-theme="dark"]{
  --bg:#0C0C0C;--bg-secondary:#2E2C2B;--surface:#2E2C2B;
  --border:rgba(245,241,235,0.10);
  --text:#FFFDFA;--text-2:rgba(245,241,235,0.60);--text-3:rgba(245,241,235,0.30);
  --accent:#4F5E2E;--accent-fg:#FFFDFA;
  --terracotta:#E34822;--sage:#4F5E2E;--gold:#E2B554;--paper:#FFFDFA;--ink:#0C0C0C;
  --warm-mid:#8C857C;--rule:rgba(28,25,22,0.1);
}
html,body{height:100%;min-height:100dvh;width:100%;overflow-x:hidden;overscroll-behavior:none;-webkit-overflow-scrolling:touch;background:var(--bg)}

/* ── Onboarding ── */
.ob-wrap{position:fixed;inset:0;background:#4F5E2E;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px}
.ob-hed{font-family:var(--brand);font-size:56px;line-height:1.05;color:#FFFDFA;text-transform:uppercase;text-align:center;margin:0 0 28px;white-space:nowrap}
.ob-hint{font-family:var(--sans);font-size:15px;font-weight:300;line-height:1.5;color:rgba(255,253,250,0.6);text-align:center;margin:0}
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
.pj-layout.month-active .pj-sidebar{display:flex}
.pj-layout.month-active .pj-main{display:none}
@media(min-width:640px){
  .pj-sidebar{width:272px;position:sticky;top:0;height:100dvh;display:flex}
  .pj-main{display:flex;border-left:1px solid var(--border)}
  .pj-layout.month-active .pj-sidebar{display:flex}
  .pj-layout.month-active .pj-main{display:flex}
}
@media(min-width:1024px){.pj-sidebar{width:300px}}

/* ── Shared header — used by both sidebar (MONTH) and main (TODAY) ── */
.pj-topbar{display:flex;align-items:center;justify-content:space-between;padding:calc(14px + env(safe-area-inset-top)) 20px 14px;flex-shrink:0;background:var(--bg)}
.week-header-line{display:flex;align-items:center;gap:5px;cursor:pointer;-webkit-tap-highlight-color:transparent;padding:4px 0;background:none;border:none}
.week-header-line:active{opacity:0.5}
.week-header-lbl{font-family:Inconsolata,monospace;font-weight:700;font-size:14px;color:#E2B554;letter-spacing:0.04em}
.week-header-sep{font-family:Inconsolata,monospace;font-weight:500;font-size:11px;color:#0C0C0C;opacity:0.4}
.week-header-range{font-family:Inconsolata,monospace;font-weight:500;font-size:13px;color:#ABABAB;letter-spacing:0.02em}
.week-header-arr{font-size:14px;color:#E2B554;margin-left:1px}
.pj-tab-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#E2B554;margin-left:4px;vertical-align:middle;flex-shrink:0}
.settings-btn{min-width:44px;min-height:44px;width:auto;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;color:var(--text);padding:0;flex-shrink:0}
.settings-btn:active{opacity:0.4}
.settings-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
/* TODAY date row — sits below the shared topbar in the main panel */
.today-date-row{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;flex-shrink:0;gap:8px}
.today-date-left{flex:1;min-width:0}
.today-date-lg{font-family:var(--sans);font-size:20px;font-weight:300;letter-spacing:-0.01em;color:var(--text);line-height:1}
.today-dow-sm{font-family:var(--sans);font-size:12px;color:var(--text-2);letter-spacing:0.04em;text-transform:uppercase;margin-top:3px}
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
.overflow-item-danger{color:#E34822}
.overflow-item-danger svg{opacity:1}
[data-theme="dark"] .overflow-menu{box-shadow:0 4px 16px rgba(0,0,0,0.4)}
[data-theme="dark"] .overflow-btn{color:var(--ink);opacity:1}
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
.today-sheet-prompt-lbl{font-family:Inconsolata,monospace;font-weight:500;font-size:13px;color:#4F5E2E;text-align:center;letter-spacing:0.06em;margin-bottom:14px}
.today-sheet-prompt-txt{font-family:var(--sans);font-size:16px;color:var(--text);line-height:1.65;font-weight:300;text-align:center}
.today-sheet-skel{background:#EBEBEB;border-radius:85px;height:12px;margin:5px auto;display:block}
.today-sheet-btns{display:flex;align-items:center;justify-content:center;padding:32px 0 24px;flex-shrink:0}
.today-sheet-cam{display:flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;background:none;border:none;padding:0;cursor:pointer;transition:opacity .15s,transform .1s}
.today-sheet-cam:active{opacity:.75;transform:scale(0.92)}
.today-sheet-icon-btn{display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:none;border:none;cursor:pointer;padding:0;margin:0 36px;opacity:0.7}
.today-sheet-icon-btn:active{opacity:.4}
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
[data-theme="dark"] .nav-panel-close{color:#FFFDFA}
[data-theme="dark"] .nav-panel-item{color:#FFFDFA}
[data-theme="dark"] .nav-panel-signout{background:#FFFDFA;color:#0C0C0C}
[data-theme="dark"] .nav-panel{box-shadow:4px 0 20px rgba(0,0,0,0.5)}
[data-theme="dark"] .grids-page{background:#0C0C0C}
[data-theme="dark"] .grids-header{border-color:rgba(255,255,255,0.08)}
[data-theme="dark"] .grids-title{color:#FFFDFA}
[data-theme="dark"] .gallery-year-header{background:#0C0C0C;border-color:rgba(255,255,255,0.08)}
[data-theme="dark"] .gallery-triptych{background:rgba(255,255,255,0.06)}
[data-theme="dark"] .gallery-triptych-cell{background:#2E2C2B}
[data-theme="dark"] .gallery-strip-cells{background:rgba(255,255,255,0.06)}
[data-theme="dark"] .gallery-strip-cell{background:#2E2C2B}
[data-theme="dark"] .grids-empty-lbl{color:var(--accent)}
[data-theme="dark"] .grids-empty svg{opacity:0.3}
.upload-zone{aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;border:1px dashed var(--border);background:var(--bg-secondary);transition:opacity .15s}
.upload-zone:active{opacity:0.65}
.up-icon svg{width:20px;height:20px;stroke:var(--text-3);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.up-txt{font-family:var(--sans);font-size:11px;color:var(--text-3);letter-spacing:.08em;text-transform:uppercase;text-align:center;line-height:2.4}

/* ── EXIF ── */
.exif-bar{padding:14px 0 16px;border-bottom:1px solid var(--border);margin-top:1px;min-height:38px;display:flex;flex-direction:column;gap:5px}
.exif-v{font-family:var(--sans);font-size:13px;font-weight:400;color:var(--text-2);letter-spacing:0.01em;font-variant-numeric:tabular-nums;line-height:1.4}
.exif-c{font-family:var(--sans);font-size:12px;color:var(--text-2)}
.exif-e{font-family:var(--sans);font-size:12px;color:var(--text-2);letter-spacing:.04em}

/* ── Caption ── */
.cap-row{padding:12px 0;position:relative}
.cap-top{display:flex;align-items:flex-start}
.cap-in{flex:1;background:none;border:none;font-family:var(--sans);font-size:16px;color:var(--text);padding:0;outline:none;caret-color:var(--accent);font-weight:300;min-width:0;line-height:1.55;-webkit-tap-highlight-color:transparent;width:100%;resize:none;overflow:hidden;display:block}
.cap-in::placeholder{color:var(--text-3)}
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
.theme-card-chev{width:14px;height:14px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s ease;flex-shrink:0;margin-left:8px}
.theme-card-chev.open{transform:rotate(180deg)}
.theme-card-body{overflow:hidden;max-height:0;transition:max-height .35s ease}
.theme-card-body.open{max-height:400px}
.theme-card-desc{font-family:var(--sans);font-size:14px;color:var(--text-2);line-height:1.6;font-weight:300;padding:0 16px 12px}
.theme-tips-link{display:block;width:100%;background:none;border:none;border-top:1px solid var(--border);padding:10px 16px;font-family:var(--sans);font-size:12px;color:var(--accent);cursor:pointer;text-align:left;letter-spacing:.02em;-webkit-tap-highlight-color:transparent}
.theme-tips-link:active{opacity:0.5}

/* ── Feedback (collapsible, auto-triggered) ── */
.feedback-card{margin-top:0}
.feedback-toggle{display:flex;align-items:center;justify-content:space-between;padding:20px 0 14px;cursor:pointer;border-top:1px solid var(--border);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.feedback-toggle-lbl{font-family:var(--sans);font-size:12px;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;font-weight:500}
.feedback-toggle-chev{width:14px;height:14px;stroke:var(--accent);fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;transition:transform .22s ease;flex-shrink:0}
.feedback-toggle-chev.open{transform:rotate(180deg)}
.feedback-body{overflow:hidden;max-height:0;transition:max-height .35s ease}
.feedback-body.open{max-height:1000px}
.feedback-txt{font-family:var(--sans);font-size:15px;color:var(--text);line-height:1.6;font-weight:300;padding-bottom:16px}

/* ── Week Review ── */
@keyframes reviewIn{from{opacity:0}to{opacity:1}}
/* Phase 1: Milestone full-screen */
.review-milestone{position:fixed;inset:0;background:#E2B554;z-index:900;animation:reviewIn .35s ease both}
.review-ms-body{display:contents}
.review-ms-num{position:absolute;top:27.2%;left:15px;right:15px;font-family:var(--brand);font-size:200px;line-height:1.2;color:var(--ink);text-transform:uppercase;text-align:center}
.review-ms-unit{position:absolute;top:51.2%;left:15px;right:15px;font-family:var(--brand);font-size:56px;line-height:1.2;color:var(--ink);text-transform:uppercase;text-align:center}
.review-ms-msg{position:absolute;top:23.9%;left:15px;right:15px;font-family:var(--brand);font-size:27px;line-height:1.51;color:var(--ink);text-transform:uppercase;text-align:center}
.review-ms-next{position:absolute;top:86.4%;left:0;right:0;display:flex;justify-content:center}
.review-ms-next-btn{width:150px;height:51px;background:#222222;border:none;border-radius:4px;cursor:pointer;font-family:var(--brand);font-size:20px;color:#FFFDFA;letter-spacing:0.01em;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center}
.review-ms-next-btn:active{opacity:.7}
/* Phase 2: Grid */
.review-backdrop{position:fixed;inset:0;background:#0C0C0C;z-index:900;display:flex;flex-direction:column;animation:reviewIn .25s ease both}
.review-header{padding:calc(env(safe-area-inset-top) + 8px) 8px 32px;flex-shrink:0;display:flex;flex-direction:column;align-items:stretch}
.review-x{align-self:flex-end;background:none;border:none;color:rgba(245,241,235,0.5);cursor:pointer;font-size:20px;line-height:1;padding:4px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center}
.review-x:active{opacity:0.5}
.review-congrats{font-family:var(--brand);font-size:24px;color:#F5F1EB;line-height:1.51;text-align:center;padding:16px 20px}
.review-grid{display:flex;gap:4px;flex:1;min-height:0;overflow:hidden;padding:0 20px 4px}
.review-col{flex:1;display:flex;flex-direction:column;gap:4px;min-height:0}
.review-strip{flex:1;overflow:hidden;background:#2C2C2C;min-height:0}
.review-strip img{width:100%;height:100%;object-fit:cover;display:block}
.review-actions{display:flex;justify-content:space-around;padding:36px 26px calc(env(safe-area-inset-bottom) + 56px);flex-shrink:0}
.review-action-btn{background:none;border:none;color:#F5F1EB;font-family:var(--sans);font-size:21px;font-weight:400;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;padding:16px 24px;transition:opacity .15s}
.review-action-btn:active{opacity:0.5}
.review-action-btn:disabled{opacity:0.4}

/* ── First photo congrats ── */
.first-photo-modal{position:fixed;inset:0;background:#E2B554;z-index:900;animation:reviewIn .35s ease both}
.fpm-l1{position:absolute;top:34%;left:15px;right:15px;font-family:var(--brand);font-size:72px;line-height:1.0;color:#0C0C0C;text-transform:uppercase;text-align:center}
.fpm-l2{position:absolute;top:44%;left:15px;right:15px;font-family:var(--brand);font-size:72px;line-height:1.0;color:#0C0C0C;text-transform:uppercase;text-align:center}
.fpm-cta{position:absolute;top:86%;left:50%;transform:translateX(-50%);width:180px;height:51px;font-family:var(--brand);font-size:20px;color:#FFFDFA;background:#0C0C0C;border:none;border-radius:4px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.fpm-cta:active{opacity:.5}

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

/* ── Week chip (day view) ── */
@keyframes chipIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.week-chip{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--gold);border:none;border-radius:10px;cursor:pointer;margin-bottom:16px;animation:chipIn .22s ease both;-webkit-tap-highlight-color:transparent}
.week-chip:active{opacity:0.75}
.week-chip-dot{font-size:15px;color:rgba(28,25,22,0.7);flex-shrink:0;line-height:1}
.week-chip-text{flex:1;font-family:var(--sans);font-size:13px;font-weight:600;color:var(--ink);letter-spacing:.01em}
.week-chip-sub{font-family:var(--sans);font-size:11px;color:rgba(28,25,22,0.55);margin-top:2px}
.week-chip-arr{font-family:var(--sans);font-size:14px;font-weight:600;letter-spacing:.1em;color:var(--ink);flex-shrink:0;opacity:0.6}

/* ── Login ── */
.pj-login{position:fixed;inset:0;background:var(--paper)}
.login-logo{position:absolute;top:10.3%;left:50%;transform:translateX(-50%);width:80px;height:80px}
.login-fields{display:contents}
.login-field-lbl{position:absolute;left:45px;font-family:Inconsolata,monospace;font-weight:600;font-size:16px;line-height:1.51;color:var(--ink)}
.login-in{position:absolute;left:45px;right:45px;background:none;border:none;border-bottom:4px solid var(--ink);font-family:var(--sans);font-size:20px;font-weight:300;color:var(--ink);padding:0 0 8px;outline:none;-webkit-appearance:none;border-radius:0}
.login-in::placeholder{color:rgba(28,25,22,0.2)}
.login-btn{position:absolute;top:60.9%;left:50%;transform:translateX(-50%);width:150px;height:51px;font-family:var(--brand);font-size:20px;line-height:1.51;color:#FFFDFA;background:#222222;border:none;border-radius:4px;cursor:pointer;text-align:center;transition:opacity .15s;padding:0;white-space:nowrap}
.login-btn:active{opacity:0.5}
.login-btn:disabled{opacity:.3;cursor:default}
.forgot-link{position:absolute;top:88.5%;left:0;right:0;font-family:Inconsolata,monospace;font-weight:600;font-size:16px;line-height:1.51;color:var(--ink);text-transform:uppercase;background:none;border:none;cursor:pointer;text-align:center;padding:0}
.forgot-link:active{opacity:0.4}
.login-footer{display:contents}
.login-err{position:absolute;top:68%;left:45px;right:45px;font-family:var(--sans);font-size:10px;color:#B03030;letter-spacing:.04em}

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

/* ── Nav panel (left slide-in) ── */
@keyframes navPanelIn{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@keyframes navPanelOut{from{transform:translateX(0)}to{transform:translateX(-100%)}}
.nav-panel-backdrop{position:fixed;inset:0;z-index:200;background:transparent}
.nav-panel{position:fixed;left:0;top:0;bottom:0;width:189px;z-index:201;background:#FFFDFA;box-shadow:4px 0 20px rgba(0,0,0,0.18);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:navPanelIn 0.32s cubic-bezier(0.32,0.72,0,1)}
.nav-panel.is-closing{animation:navPanelOut 0.28s cubic-bezier(0.32,0.72,0,1) forwards}
.nav-panel-header{display:flex;align-items:center;padding:14px 21px;position:relative;flex-shrink:0}
.nav-panel-wordmark{position:absolute;left:67px;right:0;text-align:left;font-family:var(--brand);font-size:30px;line-height:1.2;color:var(--sage);pointer-events:none;letter-spacing:0.01em}
.nav-panel-close{background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;width:36px;height:36px;position:relative;z-index:1;color:#0C0C0C}
.nav-panel-close:active{opacity:.5}
.nav-panel-nav{display:flex;flex-direction:column;gap:30px;padding:32px 21px 0;flex:1}
.nav-panel-item{background:none;border:none;cursor:pointer;padding:0;font-family:Inconsolata,monospace;font-weight:500;font-size:14px;color:#0C0C0C;letter-spacing:0.04em;text-align:left;-webkit-tap-highlight-color:transparent;line-height:1.2}
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
.grids-title{font-family:Inconsolata,monospace;font-weight:500;font-size:14px;letter-spacing:0.06em;color:#0C0C0C}
.grids-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 48px;gap:12px}
.grids-empty-lbl{font-family:Inconsolata,monospace;font-weight:500;font-size:13px;letter-spacing:0.06em;color:#4F5E2E}
.grids-empty-sub{font-family:var(--sans);font-size:15px;color:var(--text-2);text-align:center;line-height:1.6;font-weight:300}
.gallery-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:env(safe-area-inset-bottom)}
.gallery-year-header{position:sticky;top:0;z-index:2;background:#FFFDFA;padding:10px 20px 8px;font-family:Inconsolata,monospace;font-size:11px;font-weight:500;letter-spacing:0.1em;color:var(--text-3);border-bottom:1px solid var(--border)}
.gallery-month-card{-webkit-tap-highlight-color:transparent;padding-bottom:24px}
.gallery-triptych{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);cursor:pointer}
.gallery-triptych:active{opacity:0.8}
.gallery-triptych-cell{aspect-ratio:1;overflow:hidden;background:var(--surface);position:relative}
.gallery-triptych-cell img{width:100%;height:100%;object-fit:cover;display:block}
.gallery-month-meta{display:flex;align-items:center;padding:10px 16px;gap:8px;cursor:pointer}
.gallery-month-label{font-family:Inconsolata,monospace;font-size:12px;font-weight:500;letter-spacing:0.08em;color:var(--text);flex:1}
.gallery-month-count{font-family:Inconsolata,monospace;font-size:11px;font-weight:500;letter-spacing:0.04em;color:var(--text-3)}
.gallery-month-chevron{width:16px;height:16px;display:flex;align-items:center;justify-content:center;color:var(--text-3);flex-shrink:0;transition:transform 0.2s}
.gallery-month-chevron.open{transform:rotate(180deg)}
.gallery-strips{border-bottom:1px solid var(--border)}
.gallery-strip-row{cursor:pointer;-webkit-tap-highlight-color:transparent;border-top:1px solid var(--border)}
.gallery-strip-row:active{opacity:0.7}
.gallery-strip-cells{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border)}
.gallery-strip-cell{aspect-ratio:1;overflow:hidden;background:var(--surface);position:relative}
.gallery-strip-cell img{width:100%;height:100%;object-fit:cover;display:block}
.gallery-strip-meta{display:flex;align-items:center;padding:6px 16px}
.gallery-strip-dates{font-family:Inconsolata,monospace;font-size:10px;font-weight:500;letter-spacing:0.04em;color:var(--text-3);flex:1}
.gallery-strip-count{font-family:Inconsolata,monospace;font-size:10px;color:var(--text-3)}
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

  // ── Splash ──
  const [splashDone,   setSplashDone]   = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  useEffect(()=>{
    const t1 = setTimeout(()=>setSplashFading(true), 2200);
    const t2 = setTimeout(()=>setSplashDone(true),   2900);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── Onboarding ──
  const [showOnboarding, setShowOnboarding] = useState(false);

  const syncObColor = (step) => {
    const color = step ? '#4F5E2E' : '#FFFDFA';
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
  const [accessView,   setAccessView]   = useState(false); // false | 'form' | 'success'
  const [showLanding,  setShowLanding]  = useState(true);
  const [reqEmail,     setReqEmail]     = useState('');
  const [reqBusy,      setReqBusy]      = useState(false);
  const [reqErr,       setReqErr]       = useState(null);

  // ── Navigation state ──
  const [activeTab,     setActiveTab]     = useState('month');
  const [showTodaySheet, setShowTodaySheet] = useState(true);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [gridsOpen, setGridsOpen] = useState(false);
  const [gridsClosing, setGridsClosing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState(null); // 'YYYY-MM' | null
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
  const [weekTheme,    setWeekTheme]    = useState(null);
  const [themeExpanded,setThemeExpanded]= useState(false);
  const [weekReview,    setWeekReview]   = useState(null);
  const [reviewPhase,   setReviewPhase]  = useState('milestone'); // 'milestone' | 'grid'
  const [reviewImages,  setReviewImages] = useState([]); // {date,url,w,h}
  const [reviewBuilding,setReviewBuilding]=useState(false);
  const [firstPhotoModal, setFirstPhotoModal] = useState(false);
  const fileRef        = useRef(null);
  const cameraRef      = useRef(null);
  const captionRef     = useRef(null);
  const lbTouchRef     = useRef(null);
  const swipeTouchRef  = useRef(null);
  const monthScrollRef = useRef(null);
  const promptFiredRef = useRef(false);


  useEffect(()=>{
    supabase.auth.getSession().then(({ data }) => {
      const hasSession = !!data.session;
      setAuthed(hasSession);
      setUserEmail(data.session?.user?.email || null);
      if (hasSession) setShowLanding(false); // already authed — skip landing, clear dark status bar
      if (hasSession && !localStorage.getItem('scout-onboarded')) setShowOnboarding(true);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setForgotView('set'); return; }
      setAuthed(!!session);
      setUserEmail(session?.user?.email || null);
      if (event === 'SIGNED_IN' && !localStorage.getItem('scout-onboarded')) setShowOnboarding(true);
    });
    return () => subscription.unsubscribe();
  }, []);


  useEffect(()=>{
    const handler = (e) => { if (e.key==='Escape') { setLightboxOpen(false); setSettingsOpen(false); setTipsOpen(false); } };
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
    if (!splashDone)             color = '#0C0C0C';
    else if (showLanding)        color = '#0C0C0C';
    else if (showOnboarding)     color = '#4F5E2E';
    else if (!authed)            color = '#FFFDFA';
    else if (todaySheetVisible)  color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    else if (weekReview)         color = reviewPhase === 'milestone' ? '#E2B554' : '#0C0C0C';
    else                         color = theme === 'dark' ? '#0C0C0C' : '#FFFDFA';
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = color;
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
  }, [splashDone, showLanding, showOnboarding, authed, showTodaySheet, sel, todayStr,
      dayMeta, dayLoading, weekReview, reviewPhase, theme]);

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
      setActiveTab('month');
    });
  }, [authed]);

  useEffect(()=>{
    if (!authed || !aiEnabled) return;
    getTheme().then(t => { if (t?.theme) setWeekTheme(t); });
  }, [authed, aiEnabled, weekKey]);

  useEffect(()=>{
    if (!weekReview) { setReviewImages([]); return; }
    let cancelled = false;
    const urls = [];
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const imgs = await Promise.all(weekReview.dates.map(async (date) => {
        if (!photoDates.has(date)) return { date, url: null, w: 4, h: 3 };
        try {
          const r = await fetch(fullUrl(date), { headers: { Authorization: `Bearer ${token}` } });
          if (!r.ok) return { date, url: null, w: 4, h: 3 };
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const { w, h } = await new Promise(res => {
            const img = new Image();
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => res({ w: 4, h: 3 });
            img.src = url;
          });
          return { date, url, w, h };
        } catch { return { date, url: null, w: 4, h: 3 }; }
      }));
      if (!cancelled) setReviewImages(imgs);
    })();
    return () => { cancelled = true; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [weekReview]);

  useEffect(()=>{
    if (!authed || cy === TY) return;
    listYear(cy).then(dates => {
      if (dates.length) setPhotoDates(prev => new Set([...prev, ...dates]));
    });
  }, [authed, cy]);
  useEffect(()=>{
    if (!authed||!sel) return;
    setDayLoading(true);
    setFeedback(null);
    setFeedbackLoading(false);
    setFeedbackError(null);
    setFeedbackExpanded(true);
    setCaptionSuggestion(null);
    setCaptionSuggestLoad(false);
    // Only reset prompt state when navigating away from today (not when returning to it)
    if (sel !== todayStr) {
      setShootPrompt(null);
      setPromptLoading(false);
      promptFiredRef.current = false;
    }
    setLocationName(null);
    getPhoto(sel).then(data=>{
      setDayMeta(data);
      setCaption(data?.caption||'');
      if (data?.feedback) setFeedback(data.feedback);
      setDayLoading(false);
      const { lat, lon } = data?.exif || {};
      if (lat != null && lon != null) reverseGeocode(lat, lon).then(name => { if (name) setLocationName(name); });
    });
  }, [sel, authed]);

  // ── Auto-fetch today's prompt when viewing today with no photo ──
  useEffect(()=>{
    if (!authed || !aiEnabled || sel !== todayStr || dayLoading || dayMeta) return;
    if (promptFiredRef.current) return;
    // Check localStorage cache first — prompt should only generate once per day
    const cacheKey = `scout-prompt-${todayStr}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setShootPrompt(cached);
      promptFiredRef.current = true;
      return;
    }
    promptFiredRef.current = true;
    setPromptLoading(true);
    getTodayPrompt(sel).then(data=>{
      if (data?.prompt) {
        setShootPrompt(data.prompt);
        localStorage.setItem(cacheKey, data.prompt);
      }
      setPromptLoading(false);
    });
  }, [sel, dayMeta, dayLoading, authed, aiEnabled]);


  const handleLogin = async (e) => {
    e.preventDefault(); setLoginBusy(true); setLoginErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setLoginErr(error.message);
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

  const handleRequestAccess = async (e) => {
    e.preventDefault(); setReqBusy(true); setReqErr(null);
    const result = await requestAccess({ email: reqEmail });
    if (result.ok) { setAccessView('success'); }
    else if (result.error === 'already_submitted') { setReqErr('This email has already been submitted. We\'ll be in touch!'); }
    else { setReqErr(result.error); }
    setReqBusy(false);
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
  const [devShowPromptTray,  setDevShowPromptTray]  = useState(false);
  const [tipsOpen,           setTipsOpen]           = useState(false);
  const [justCompletedDate,  setJustCompletedDate]  = useState(null);

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
      // Today with no photo: stay on month, show the tray
      setShowTodaySheet(true);
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
        if (newPhotoDates.size === 1) setFirstPhotoModal(true);
        if (exif?.lat != null && exif?.lon != null) reverseGeocode(exif.lat, exif.lon).then(name => { if (name) setLocationName(name); });
        else setLocationName(null);
        // Check if Sun–Sat week is now complete
        const weekDates = getWeekDates(sel);
        const weekComplete = weekDates.every(d => newPhotoDates.has(d));
        if (weekComplete) setJustCompletedDate(sel);
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
      setActiveTab('month');
      setShowTodaySheet(true);
      return;
    }
    setSel(newSel);
    setCm(date.getMonth());
    setCy(date.getFullYear());
  };

  const dismissTodaySheet = () => {
    setSheetClosing(true);
    setTimeout(() => { setShowTodaySheet(false); setSheetClosing(false); setActiveTab('month'); }, 360);
  };
  const dismissPanel = () => {
    setPanelClosing(true);
    setTimeout(() => { setPanelOpen(false); setPanelClosing(false); }, 300);
  };
  const dismissGrids = () => {
    setGridsClosing(true);
    setTimeout(() => { setGridsOpen(false); setGridsClosing(false); }, 300);
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
    if (result?.caption) setCaptionSuggestion(result.caption);
    setCaptionSuggestLoad(false);
  };

  const acceptCaptionSuggestion = () => {
    setCaption(captionSuggestion);
    setCaptionSuggestion(null);
    updateCaption(sel, captionSuggestion);
    setDayMeta(prev => ({ ...prev, caption: captionSuggestion }));
  };

  const buildReviewCanvas = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const cw = 1080, gap = 6, colW = Math.floor((cw - gap) / 2);
    // Fetch full-res images
    const loaded = await Promise.all((weekReview?.dates || []).map(async (date) => {
      if (!photoDates.has(date)) return null;
      try {
        const r = await fetch(fullUrl(date), { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return null;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        return await new Promise(res => {
          const img = new Image();
          img.onload = () => res({ img, w: img.naturalWidth, h: img.naturalHeight, url });
          img.onerror = () => { URL.revokeObjectURL(url); res(null); };
          img.src = url;
        });
      } catch { return null; }
    }));
    // Distribute to 2 cols (shortest-weight first), then normalise both cols to same height
    const cols = [[],[]]; const colWeight = [0,0];
    loaded.forEach(item => {
      const w = item ? item.h/item.w : 0.75;
      const c = colWeight[0] <= colWeight[1] ? 0 : 1;
      cols[c].push(item); colWeight[c] += w;
    });
    const targetH = 1920; // fixed canvas height for flush bottom
    const drawCol = (colItems, xOffset, totalWeight) => {
      let y = 0;
      colItems.forEach((item, i) => {
        const isLast = i === colItems.length - 1;
        const w = item ? item.h/item.w : 0.75;
        // Last item fills remaining height to guarantee flush bottom
        const h = isLast ? targetH - y : Math.round((w / totalWeight) * (targetH - gap * (colItems.length - 1)));
        ctx.save();
        ctx.beginPath(); ctx.rect(xOffset, y, colW, h); ctx.clip();
        if (item) {
          const scale = Math.max(colW / item.img.naturalWidth, h / item.img.naturalHeight);
          const sw = item.img.naturalWidth * scale, sh = item.img.naturalHeight * scale;
          ctx.drawImage(item.img, xOffset + (colW - sw) / 2, y + (h - sh) / 2, sw, sh);
        } else {
          ctx.fillStyle = '#1c1c1c'; ctx.fillRect(xOffset, y, colW, h);
        }
        ctx.restore();
        y += h + (isLast ? 0 : gap);
      });
    };
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, cw, targetH);
    drawCol(cols[0], 0, colWeight[0]);
    drawCol(cols[1], colW + gap, colWeight[1]);
    loaded.forEach(item => { if (item?.url) URL.revokeObjectURL(item.url); });
    return canvas;
  };

  const canvasToBlob = (canvas, type) => new Promise(resolve => canvas.toBlob(resolve, type));

  const handleDownloadReview = async () => {
    if (reviewBuilding) return;
    setReviewBuilding(true);
    try {
      const canvas = await buildReviewCanvas();
      const blob = await canvasToBlob(canvas, 'image/png');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scout-week-${weekReview.dates[0]}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally { setReviewBuilding(false); }
  };

  const handleShareReview = async () => {
    if (reviewBuilding) return;
    setReviewBuilding(true);
    try {
      const canvas = await buildReviewCanvas();
      const blob = await canvasToBlob(canvas, 'image/png');
      const file = new File([blob], `scout-week-${weekReview.dates[0]}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch { /* user cancelled share */ } finally { setReviewBuilding(false); }
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
    await updateCaption(sel, caption);
    setDayMeta(prev=>({...prev, caption}));
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
    <div className={`pj-splash${splashFading?' fading':''}`}>
      <svg className="splash-logo" width="150" height="150" viewBox="0 0 150 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M107.208 0.00366211C130.892 0.303702 150 19.5966 150 43.3525V62.333C150 65.4455 147.477 67.9688 144.364 67.9688C141.252 67.9688 138.728 65.4455 138.728 62.333V43.3525C138.728 25.6348 124.365 11.2716 106.647 11.2715H87.667C84.5545 11.2715 82.0312 8.7483 82.0312 5.63576C82.0312 2.52321 84.5545 0 87.667 0H106.647L107.208 0.00366211Z" fill="#4F5E2E"/>
        <path d="M11.2715 106.647C11.2716 124.365 25.6348 138.728 43.3525 138.728H62.333C65.4455 138.728 67.9688 141.252 67.9688 144.364C67.9688 147.477 65.4455 150 62.333 150H43.3525C19.5966 150 0.303705 130.892 0.00366211 107.208L0 106.647V87.667C0 84.5545 2.52321 82.0312 5.63576 82.0312C8.7483 82.0312 11.2715 84.5545 11.2715 87.667V106.647Z" fill="#F5F1EB"/>
        <path d="M150 106.647L149.996 107.208C149.699 130.706 130.706 149.699 107.208 149.996L106.647 150H87.667C84.5545 150 82.0312 147.477 82.0312 144.364C82.0312 141.252 84.5545 138.728 87.667 138.728H106.647C124.365 138.728 138.728 124.365 138.728 106.647V87.667C138.728 84.5545 141.252 82.0312 144.364 82.0312C147.477 82.0312 150 84.5545 150 87.667V106.647Z" fill="#F5F1EB"/>
        <path d="M67.9688 5.63576C67.9688 8.7483 65.4455 11.2715 62.333 11.2715H43.3525C25.6348 11.2716 11.2716 25.6348 11.2715 43.3525V62.333C11.2715 65.4455 8.7483 67.9688 5.63576 67.9688C2.52321 67.9688 0 65.4455 0 62.333V43.3525C4.83256e-05 19.4096 19.4096 5.07358e-05 43.3525 0H62.333C65.4455 0 67.9688 2.52321 67.9688 5.63576Z" fill="#F5F1EB"/>
        <path d="M79.0104 115.671C71.0927 115.441 62.9312 112.611 57.7619 108.287C55.036 106.063 52.8696 103.952 50.9748 101.694C49.6673 100.236 49.6341 99.4132 50.6814 97.8602C52.3881 95.4564 54.1058 93.327 55.6906 91.3402C56.2226 90.7693 56.749 90.0614 57.026 90.0502C57.4416 90.0334 58.0233 90.6967 58.7381 91.2172C59.3198 91.8805 59.9015 92.5437 60.4778 93.0698C61.3476 93.9962 62.356 94.9169 63.3644 95.8376C66.3895 98.5998 71.6586 101.958 75.997 102.882C76.4181 103.002 77.1162 103.111 77.6703 103.089L77.8088 103.083C81.4048 102.801 85.8653 99.8741 86.2534 95.7381C86.5638 93.116 86.2038 91.0704 85.0348 89.6067C81.8158 85.4789 77.2448 82.2297 72.962 79.2436C70.6792 77.6876 68.3965 76.1315 66.3908 74.5643L66.2468 74.4328C63.5208 72.2079 60.9224 69.7032 58.1632 66.6556C54.1021 62.2871 52.6728 57.8124 53.5762 52.6941C55.3997 42.8691 61.5282 36.5786 71.5793 34.6622C72.6819 34.4804 73.7846 34.2985 74.8927 34.2538C75.0312 34.2482 75.3083 34.2371 75.4468 34.2315C80.018 34.047 84.6389 35.0967 89.5867 37.3692C92.8446 39.0233 95.2603 40.4366 97.4045 41.9982C98.701 43.182 99.4324 44.1139 99.4711 45.0737C99.5043 45.8965 99.1274 46.8731 98.058 47.8777C97.6591 48.3058 97.3986 48.7284 96.9996 49.1565C95.8028 50.4409 94.6114 51.8624 93.1264 52.8838C92.3119 53.3287 91.7689 53.6253 91.3533 53.642C90.7992 53.6644 90.2341 53.4125 89.5194 52.892C87.6577 51.4563 85.9291 49.8779 84.35 48.5681C81.7682 46.4748 78.8371 46.0437 75.9171 45.8868C75.6401 45.898 75.5015 45.9036 75.2245 45.9148L75.086 45.9204C72.4541 46.0266 69.6005 47.5152 68.0434 50.1875C66.4697 52.4486 66.7244 55.3225 68.5194 58.5464C71.0569 62.9764 75.6112 65.8142 79.4841 68.9542L79.6281 69.0858C80.631 69.8694 81.4897 70.5214 82.4871 71.1679C83.3458 71.82 84.1991 72.335 85.0634 73.1242C86.6369 74.2968 88.3545 75.6009 89.9225 76.6364L90.6428 77.2941C95.0752 80.5488 97.8731 84.5563 99.3411 89.9909C101.452 97.597 99.0799 104.148 92.1147 110.335C88.4909 113.365 84.2631 115.184 79.0104 115.671Z" fill="#F5F1EB"/>
        <path d="M107.208 0.00366211C130.892 0.303702 150 19.5966 150 43.3525V62.333C150 65.4455 147.477 67.9688 144.364 67.9688C141.252 67.9688 138.728 65.4455 138.728 62.333V43.3525C138.728 25.6348 124.365 11.2716 106.647 11.2715H87.667C84.5545 11.2715 82.0312 8.7483 82.0312 5.63576C82.0312 2.52321 84.5545 0 87.667 0H106.647L107.208 0.00366211Z" fill="#4F5E2E"/>
      </svg>
    </div>
  );

  if (checking) return splash || null;

  if (showOnboarding) {
    return (
      <div className="ob-wrap">
        <h2 className="ob-hed">ONE PHOTO<br/>EVERY DAY</h2>
        <p className="ob-hint">
          Follow your guide or make your own path.
        </p>
        <button type="button" className="ob-cta" onClick={finishOnboarding}>
          LET'S GO
        </button>
      </div>
    );
  }

  if (forgotView === 'set') return (
    <form className="pj-login" onSubmit={handleSetNewPassword} data-theme={theme}>
      <img src="/scout-logo-m.svg" className="login-logo" alt="Scout" />
      <div className="login-fields">
        <div className="login-field-lbl" style={{top:'37.1%'}}>NEW PASSWORD</div>
        <input className="login-in" type="password" value={newPwVal} style={{top:'41%'}}
          onChange={e=>setNewPwVal(e.target.value)} placeholder="" autoComplete="new-password" />
        {resetMsg && <div className={resetMsg.ok ? '' : 'login-err'} style={resetMsg.ok?{fontFamily:'var(--sans)',fontSize:12,color:'var(--accent)',marginTop:8}:{}}>{resetMsg.text}</div>}
        <button className="login-btn" type="submit" disabled={resetBusy || !newPwVal}>
          {resetBusy ? 'Saving…' : 'SET PASSWORD -->'}
        </button>
      </div>
      <div/>
    </form>
  );

  if (!authed && showLanding) return (
    <>
      {splash}
      <div style={{position:'fixed',inset:0,background:'#0C0C0C',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:0}}>
        <img src="/scout-lockup.svg" alt="Scout" style={{width:150,marginBottom:80}} />
        <button
          type="button"
          onClick={()=>setShowLanding(false)}
          style={{width:150,height:51,background:'#222222',border:'none',borderRadius:4,cursor:'pointer',fontFamily:'var(--brand)',fontSize:20,color:'#FFFDFA',letterSpacing:'0.01em'}}
        >SIGN IN &gt;</button>
        <button
          type="button"
          onClick={()=>{ setShowLanding(false); setAccessView('form'); }}
          style={{position:'absolute',bottom:80,fontFamily:'Inconsolata, monospace',fontWeight:600,fontSize:16,color:'#F5F1EB',background:'none',border:'none',cursor:'pointer',letterSpacing:'0.05em'}}
        >REQUEST ACCESS</button>
      </div>
    </>
  );

  if (!authed) return (
    <>
      {splash}
      {accessView === 'success' ? (
        <div className="pj-login" data-theme={theme}>
          <img src="/scout-logo-m.svg" className="login-logo" alt="Scout" />
          <div style={{position:'absolute',top:'37.7%',left:0,right:0,fontFamily:'Inconsolata,monospace',fontWeight:400,fontSize:16,lineHeight:1.7,color:'#000000',textAlign:'center'}}>
            You're on the list!<br/>We'll be in touch soon.
          </div>
          <button type="button" className="login-btn" onClick={()=>{ setAccessView(false); setReqEmail(''); }}>
            BACK
          </button>
        </div>
      ) : accessView === 'form' ? (
        <form className="pj-login" onSubmit={handleRequestAccess} data-theme={theme}>
          <img src="/scout-logo-m.svg" className="login-logo" alt="Scout" />
          <div className="login-fields">
            <div className="login-field-lbl" style={{top:'37.1%'}}>EMAIL</div>
            <input className="login-in" type="email" value={reqEmail} style={{top:'41%'}}
              onChange={e=>{setReqEmail(e.target.value);setReqErr(null);}}
              placeholder="" autoComplete="email" />
            {reqErr && <div className="login-err">{reqErr}</div>}
            <button className="login-btn" type="submit" disabled={reqBusy || !reqEmail.trim()}>
              {reqBusy ? 'Submitting…' : 'REQUEST ACCESS >'}
            </button>
          </div>
          <div className="login-footer">
            <button type="button" className="forgot-link" onClick={()=>{ setAccessView(false); setReqErr(null); }}>
              &lt;-- Back to Sign in
            </button>
          </div>
        </form>
      ) : forgotView === 'request' ? (
        <form className="pj-login" onSubmit={handleForgotRequest} data-theme={theme}>
          <img src="/scout-logo-m.svg" className="login-logo" alt="Scout" />
          <div className="login-fields">
            <div className="login-field-lbl" style={{top:'37.1%'}}>EMAIL</div>
            <input className="login-in" type="email" value={email} style={{top:'41%'}}
              onChange={e=>setEmail(e.target.value)} placeholder="" autoComplete="email" />
            {resetMsg && <div style={resetMsg.ok?{fontFamily:'var(--sans)',fontSize:12,color:'var(--accent)',position:'absolute',top:'48%',left:45}:{fontFamily:'var(--sans)',fontSize:10,color:'#B03030',position:'absolute',top:'48%',left:45}}>{resetMsg.text}</div>}
            <button className="login-btn" type="submit" disabled={resetBusy || !email}>
              {resetBusy ? 'Sending…' : 'RESET >'}
            </button>
          </div>
          <div className="login-footer">
            <button type="button" className="forgot-link" onClick={()=>{setForgotView(false);setResetMsg(null);}}>
              BACK TO SIGN IN
            </button>
          </div>
        </form>
      ) : (
        <form className="pj-login" onSubmit={handleLogin} data-theme={theme}>
          <img src="/scout-logo-m.svg" className="login-logo" alt="Scout" />
          <div className="login-field-lbl" style={{top:'37.1%'}}>EMAIL</div>
          <input className="login-in" type="email" value={email} style={{top:'41%'}}
            onChange={e=>setEmail(e.target.value)} placeholder="" autoComplete="email" />
          <div className="login-field-lbl" style={{top:'48.3%'}}>PASSWORD</div>
          <input className="login-in" type="password" value={pw} style={{top:'52%'}}
            onChange={e=>setPw(e.target.value)} placeholder="" autoComplete="current-password" />
          {loginErr && <div className="login-err">{loginErr}</div>}
          <button className="login-btn" type="submit" disabled={loginBusy || !email || !pw}>
            {loginBusy ? 'Signing in…' : 'SIGN IN >'}
          </button>
          <button type="button" className="forgot-link" onClick={()=>{setForgotView('request');setResetMsg(null);}}>
            FORGOT PASSWORD?
          </button>
        </form>
      )}
    </>
  );

  const hasCompleteWeek = (() => {
    const checked = new Set();
    for (const d of [...photoDates].sort().reverse()) {
      const wd = getWeekDates(d);
      if (checked.has(wd[0])) continue;
      checked.add(wd[0]);
      if (wd.every(dd => photoDates.has(dd))) return true;
    }
    return false;
  })();

  return (
    <>
    {splash}
    <div className={`pj-layout${activeTab==='month'?' month-active':''}`} data-theme={theme}>

      <aside className="pj-sidebar">
        {/* Topbar — wordmark + settings. On desktop: always visible. On mobile: MONTH tab only. */}
        <div className="pj-topbar">
          <button className="settings-btn" onClick={()=>setPanelOpen(true)} aria-label="Menu">
            <IcHamburger/>
          </button>
          {(()=>{
            const checked = new Set();
            for (const d of [...photoDates].sort().reverse()) {
              const wd = getWeekDates(d);
              if (checked.has(wd[0])) continue;
              checked.add(wd[0]);
              if (wd.every(dd => photoDates.has(dd))) {
                return (
                  <button className="week-header-line" onClick={()=>{ setWeekReview({dates:wd}); setReviewPhase('milestone'); }}>
                    <span className="week-header-lbl">WEEK COMPLETE</span>
                    <span className="week-header-sep">|</span>
                    <span className="week-header-range">{formatWeekRange(wd)}</span>
                    <span className="week-header-arr">→</span>
                  </button>
                );
              }
            }
            return null;
          })()}
        </div>

        {/* Weekly theme card — expandable: title always visible, desc + tips on expand */}
        {weekTheme&&aiEnabled&&(
          <div className="theme-card">
            <div className="theme-card-toggle" onClick={()=>setThemeExpanded(v=>!v)}>
              <div className="theme-card-left">
                <div className="theme-card-lbl">THEME</div>
                <div className="theme-card-title">{weekTheme.theme}</div>
              </div>
              <svg className={`theme-card-chev${themeExpanded?' open':''}`} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div className={`theme-card-body${themeExpanded?' open':''}`}>
              {weekTheme.description&&<div className="theme-card-desc">{weekTheme.description}</div>}
              <button className="theme-tips-link" onClick={()=>setTipsOpen(true)}>
                This week's practice
              </button>
            </div>
          </div>
        )}

        {/* Scrollable month view — current month first, then past months */}
        <div className="month-scroll">
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
            <button className="arr" onClick={() => navigateDay(-1)} aria-label="Previous day"><ChevLeft/></button>
            <button className="arr" onClick={() => navigateDay(1)} disabled={sel >= todayStr} aria-label="Next day"><ChevRight/></button>
            <button className="arr" onClick={() => setActiveTab('month')} aria-label="Month view" style={{position:'relative'}}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="16" height="15" rx="1.5"/><path d="M2 7.5h16"/><path d="M6.5 2v2.5M13.5 2v2.5"/>
                <rect x="5" y="10.5" width="2.5" height="2.5" rx=".4" fill="currentColor" stroke="none"/><rect x="8.75" y="10.5" width="2.5" height="2.5" rx=".4" fill="currentColor" stroke="none"/><rect x="12.5" y="10.5" width="2.5" height="2.5" rx=".4" fill="currentColor" stroke="none"/>
              </svg>
              {hasCompleteWeek && <span style={{position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:'#E2B554',display:'block',pointerEvents:'none'}}/>}
            </button>
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
            {/* Row 2: date text + photo actions */}
            <div className="today-date-row">
              <div className="today-date-left">
                {selParsed&&<div className="today-date-lg">{selParsed.d} {MONTHS[selParsed.m]}</div>}
                {selParsed&&<div className="today-dow-sm">{WDAYS[new Date(selParsed.y,selParsed.m,selParsed.d).getDay()]} · {selParsed.y}</div>}
              </div>
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

              {/* Feedback — collapsible, auto-triggered on upload */}
              {dayMeta&&aiEnabled&&(feedback||feedbackLoading||feedbackError)&&(
                <div className="feedback-card">
                  <div className="feedback-toggle" onClick={()=>setFeedbackExpanded(x=>!x)}>
                    <div className="feedback-toggle-lbl">Scout's take</div>
                    <svg className={`feedback-toggle-chev${feedbackExpanded?' open':''}`} viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div className={`feedback-body${feedbackExpanded?' open':''}`}>
                    {feedbackLoading&&<div style={{fontFamily:'var(--sans)',fontSize:13,color:'var(--text-3)',paddingBottom:16}}>Reading the frame…</div>}
                    {feedbackError&&<div style={{fontFamily:'var(--sans)',fontSize:12,color:'#B03030',paddingBottom:16}}>{feedbackError}</div>}
                    {feedback&&<div className="feedback-txt">{stripFeedback(feedback)}</div>}
                  </div>
                </div>
              )}

            </div>
          </>
        ) : null}
      </main>


      {/* Today Sheet — mobile only, shows when no photo for today (or dev override) */}
      {showTodaySheet&&sel===todayStr&&(!dayMeta||devShowPromptTray)&&!dayLoading&&(
        <div className={`today-sheet${sheetClosing?' is-closing':''}`}>
          <div className="today-sheet-tray">
            <div className="today-sheet-topbar">
              <button className="today-sheet-dismiss" onClick={dismissTodaySheet} aria-label="Dismiss">
                <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
                  <polyline points="1,1 7,7 13,1" stroke="#0C0C0C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="today-sheet-body">
              <div className="today-sheet-prompt-lbl">TODAY'S SHOT</div>
              {aiEnabled&&shootPrompt&&!promptLoading ? (
                <div className="today-sheet-prompt-txt">{shootPrompt}</div>
              ) : (
                <>
                  <div className="today-sheet-skel" style={{width:'80%'}}/>
                  <div className="today-sheet-skel" style={{width:'80%'}}/>
                  <div className="today-sheet-skel" style={{width:'52%'}}/>
                </>
              )}
            </div>
            <div className="today-sheet-btns">
              <button className="today-sheet-icon-btn" onClick={()=>fileRef.current?.click()} aria-label="Upload from library">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 13V4M10 4L7 7M10 4L13 7" stroke="#292929" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="#292929" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button className="today-sheet-cam" onClick={()=>cameraRef.current?.click()} disabled={busy} aria-label="Take photo">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <rect width="80" height="80" rx="40" fill="#0C0C0C"/>
                  <rect x="3.5" y="3.5" width="73" height="73" rx="36.5" fill="#FFFDFA"/>
                  <rect x="7" y="7" width="66" height="66" rx="33" fill="#E34822"/>
                </svg>
              </button>
              <div style={{width:44,height:44,margin:'0 36px'}}/>

            </div>
          </div>
        </div>
      )}

      {firstPhotoModal && (
        <div className="first-photo-modal">
          <div className="fpm-l1">DAY ONE</div>
          <div className="fpm-l2">LOGGED</div>
          <button className="fpm-cta" onClick={() => setFirstPhotoModal(false)}>KEEP GOING</button>
        </div>
      )}

      {weekReview&&(()=>{
        if (reviewPhase === 'milestone') return (
          <div className="review-milestone">
            <div className="review-ms-body">
              <div className="review-ms-num">7</div>
              <div className="review-ms-unit">DAYS</div>
              <div className="review-ms-msg">NOT BAD AT ALL.</div>
            </div>
            <div className="review-ms-next">
              <button className="review-ms-next-btn" onClick={()=>{ setReviewPhase('grid'); }}>
                NEXT
              </button>
            </div>
          </div>
        );
        // Phase 2: grid
        const imgs = (reviewImages.length ? reviewImages : weekReview.dates.filter(d=>photoDates.has(d)).map(d=>({date:d,url:null,w:4,h:3}))).filter(img=>photoDates.has(img.date));
        const cols = [[],[]]; const colW = [0,0];
        imgs.forEach(img => { const c = colW[0]<=colW[1]?0:1; cols[c].push(img); colW[c]+=img.h/img.w; });
        return (
          <div className="review-backdrop">
            <div className="review-header">
              <button className="review-x" onClick={()=>{ setWeekReview(null); setReviewPhase('milestone'); }} aria-label="Close">✕</button>
            </div>
            <div className="review-grid">
              {cols.map((colImgs, ci)=>(
                <div className="review-col" key={ci}>
                  {colImgs.map(imgData=>(
                    <div className="review-strip" key={imgData.date} style={{flexGrow: imgData.h/imgData.w}}>
                      {imgData.url
                        ? <img src={imgData.url} alt=""/>
                        : <div style={{width:'100%',height:'100%',background:'#2a2520'}}/>
                      }
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="review-actions">
              <button className="review-action-btn" onClick={handleShareReview} disabled={reviewBuilding}>Share</button>
              <button className="review-action-btn" onClick={handleDownloadReview} disabled={reviewBuilding}>Download</button>
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
              <button className="nav-panel-close" onClick={dismissPanel} aria-label="Close menu">
                <IcHamburger/>
              </button>
              <span className="nav-panel-wordmark">SCOUT</span>
            </div>
            <nav className="nav-panel-nav">
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setGridsOpen(true); },310); }}>GALLERY</button>
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setAccountOpen(true); },310); }}>ACCOUNT</button>
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setSettingsOpen(true); },310); }}>SETTINGS</button>
              <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setSupportOpen(true); },310); }}>SUPPORT</button>
              {userEmail==='ecrissman@gmail.com'&&(
                <button className="nav-panel-item" onClick={()=>{ dismissPanel(); setTimeout(()=>{ setDevPanelOpen(true); },310); }}>DEVELOPER</button>
              )}
              <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}}/>
              <button className="nav-panel-item" style={{color:'var(--accent)'}} onClick={()=>{ dismissPanel(); handleSignOut(); }}>SIGN OUT</button>
            </nav>
          </div>
        </div>
      )}

      {/* ── Gallery Page ── */}
      {gridsOpen&&(
        <div className={`grids-page${gridsClosing?' is-closing':''}`}>
          <div className="grids-header">
            <button className="grids-back" onClick={dismissGrids} aria-label="Back">
              <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
                <polyline points="9,1 1,8.5 9,16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="grids-title">GALLERY</span>
          </div>

          {photoDates.size===0 ? (
            <div className="grids-empty">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#4F5E2E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.4}}>
                <rect x="4" y="8" width="40" height="34" rx="3"/>
                <circle cx="24" cy="25" r="9"/>
                <circle cx="24" cy="25" r="4" fill="#4F5E2E" stroke="none" opacity="0.4"/>
                <path d="M16 8V5M32 8V5"/>
              </svg>
              <div className="grids-empty-lbl">NO PHOTOS YET</div>
              <div className="grids-empty-sub">Start shooting to build your gallery.</div>
            </div>
          ) : (()=>{
            const monthMap = {};
            for (const d of photoDates) {
              const ym = d.slice(0,7);
              if (!monthMap[ym]) monthMap[ym] = new Set();
              monthMap[ym].add(d);
            }
            const sortedMonths = Object.keys(monthMap).sort().reverse();
            const yearGroups = {};
            for (const ym of sortedMonths) {
              const yr = ym.slice(0,4);
              if (!yearGroups[yr]) yearGroups[yr] = [];
              yearGroups[yr].push(ym);
            }
            const sortedYears = Object.keys(yearGroups).sort().reverse();

            const getFeatured = (datesSet) => {
              const arr = [...datesSet].sort();
              const n = arr.length;
              if (n<=3) return arr;
              return [arr[0], arr[Math.floor(n/2)], arr[n-1]];
            };

            const getWeeksForMonth = (ym) => {
              const [y,m] = ym.split('-').map(Number);
              const daysInMo = new Date(y,m,0).getDate();
              const weeks=[], seen=new Set();
              for (let d=1; d<=daysInMo; d++) {
                const dk2=`${ym}-${String(d).padStart(2,'0')}`;
                const wd=getWeekDates(dk2);
                const wk=wd[0];
                if (!seen.has(wk)){ seen.add(wk); weeks.push({weekStart:wk,dates:wd}); }
              }
              return weeks;
            };

            return (
              <div className="gallery-scroll">
                {sortedYears.map(yr=>(
                  <div key={yr}>
                    {sortedYears.length>1 && (
                      <div className="gallery-year-header">{yr}</div>
                    )}
                    {yearGroups[yr].map(ym=>{
                      const datesSet = monthMap[ym];
                      const [ymY,ymM] = ym.split('-').map(Number);
                      const monthName = `${MONTHS_S[ymM-1]} ${ymY}`;
                      const daysInMo = new Date(ymY,ymM,0).getDate();
                      const isExpanded = expandedMonth===ym;
                      const featured = getFeatured(datesSet);

                      return (
                        <div key={ym} className="gallery-month-card">
                          <div className="gallery-triptych" onClick={()=>setExpandedMonth(isExpanded?null:ym)}>
                            {[0,1,2].map(i=>(
                              <div key={i} className="gallery-triptych-cell">
                                {featured[i] && <AuthImage src={thumbUrl(featured[i])} alt=""/>}
                              </div>
                            ))}
                          </div>
                          <div className="gallery-month-meta" onClick={()=>setExpandedMonth(isExpanded?null:ym)}>
                            <span className="gallery-month-label">{monthName}</span>
                            <span className="gallery-month-count">{datesSet.size} / {daysInMo}</span>
                            <span className={`gallery-month-chevron${isExpanded?' open':''}`}>
                              <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                <polyline points="1,1 5,5 9,1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          </div>
                          {isExpanded && (
                            <div className="gallery-strips">
                              {getWeeksForMonth(ym).map(({weekStart,dates})=>{
                                const filledInWeek = dates.filter(d=>datesSet.has(d));
                                if (filledInWeek.length===0) return null;
                                return (
                                  <div key={weekStart} className="gallery-strip-row"
                                    onClick={()=>{ setWeekReview({dates}); setReviewPhase('grid'); }}>
                                    <div className="gallery-strip-cells">
                                      {dates.map(d=>(
                                        <div key={d} className="gallery-strip-cell">
                                          {datesSet.has(d) && <AuthImage src={thumbUrl(d)} alt=""/>}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="gallery-strip-meta">
                                      <span className="gallery-strip-dates">{formatWeekRange(dates)}</span>
                                      <span className="gallery-strip-count">{filledInWeek.length}/7</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
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
                <div className="settings-row">
                  <div style={{flex:1}}>
                    <div className="settings-row-label">Show Prompt Tray</div>
                    <div className="settings-row-sub">display even when photo exists</div>
                  </div>
                  <button className={`ai-toggle${devShowPromptTray?' on':' off'}`} onClick={()=>setDevShowPromptTray(v=>!v)} aria-label="Toggle prompt tray">
                    <div className="ai-toggle-thumb"/>
                  </button>
                </div>
                <button className="settings-row-btn" onClick={()=>{ Object.keys(localStorage).filter(k=>k.startsWith('scout-reviewed-')).forEach(k=>localStorage.removeItem(k)); }}>
                  <span className="settings-row-label">Reset Week Reviews</span>
                  <span style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text-3)'}}>clears seen flags</span>
                </button>
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
