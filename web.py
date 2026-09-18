import asyncio
import html
import re
import secrets
import sys
import time
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

import aiohttp
from aiohttp import web

from config import PUBLIC_URL, WEB_HOST, WEB_PORT
from logger import logger

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
LOGO_PATH = ASSETS_DIR / "cheyaverse.jpg"

VIEWER_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#faf6f1">
<!--OG_META-->
<title>CheyaVerse Media</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#faf6f1;--card:#fff;--text:#1c130a;--muted:#8b7a6b;--accent:#4a2216;--accent-hover:#5f2d1e;--soft:#f5ede2;--soft-hover:#ecdfd0;--border:#ebe2d5;--danger:#b23a2e;--ok:#2f7d32;--radius:20px;--radius-sm:12px;--transition:.2s cubic-bezier(.4,0,.2,1)}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);background-image:radial-gradient(circle at 15% 0%,#fefaf3 0%,transparent 55%),radial-gradient(circle at 100% 100%,#f2e6d4 0%,transparent 45%);color:var(--text);min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 12px 40px -12px rgba(74,34,22,.18),0 2px 8px -2px rgba(74,34,22,.06);width:100%;max-width:540px;overflow:hidden;animation:rise .5s cubic-bezier(.4,0,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.header{padding:20px 22px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
.badge{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent) 0%,#6b3120 100%);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px -2px rgba(74,34,22,.3)}
.badge svg{width:20px;height:20px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.info{min-width:0;flex:1}
.info h1{font-size:14.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.015em;line-height:1.3}
.info p{font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;font-weight:500}
.preview{padding:0;background:#0a0a0a;position:relative;overflow:hidden}
.media-inner{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:4/3;max-height:70vh;line-height:0;overflow:hidden;background:#0a0a0a;-webkit-touch-callout:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.media-inner img,.media-inner video{display:block;width:100%;height:100%;object-fit:contain;opacity:0;filter:blur(24px);transform:scale(1.04);transition:opacity .5s ease,filter .5s ease,transform .5s ease;-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;-o-user-drag:none;user-drag:none;-webkit-touch-callout:none;pointer-events:none}
.media-inner video{pointer-events:auto}
.media-inner img.loaded,.media-inner video.loaded{opacity:1;filter:blur(0);transform:scale(1)}
video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel,video::-webkit-media-controls-play-button,video::-webkit-media-controls-timeline,video::-webkit-media-controls-current-time-display,video::-webkit-media-controls-time-remaining-display,video::-webkit-media-controls-mute-button,video::-webkit-media-controls-toggle-closed-captions-button,video::-webkit-media-controls-volume-slider,video::-webkit-media-controls-fullscreen-button,video::-webkit-media-controls-download-button,video::-webkit-media-controls-overlay-play-button,video::-webkit-media-controls-overlay-enclosure{display:none!important;-webkit-appearance:none!important;opacity:0!important;pointer-events:none!important}
.skeleton{position:absolute;inset:0;background:linear-gradient(90deg,#1a1512 0%,#2a221c 25%,#1a1512 50%,#2a221c 75%,#1a1512 100%);background-size:200% 100%;animation:shimmer 1.8s ease-in-out infinite;z-index:0}
.skeleton::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.06) 0%,transparent 60%);animation:pulse 2.2s ease-in-out infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.85}}
.skeleton.hidden{opacity:0;transition:opacity .4s ease;pointer-events:none}
.status{font-size:13px;color:#d8cfc2;text-align:center;padding:52px 24px;line-height:1.6;font-weight:500;position:relative;z-index:2}
.status.error{color:#ff8f80}
.lost{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px 20px;text-align:center;position:relative;z-index:2}
.lost svg{width:130px;height:130px;display:block}
.lost .title{font-size:14px;font-weight:600;color:#f3e8dc;letter-spacing:-.01em}
.lost .desc{font-size:12px;color:#b8a999;line-height:1.55;max-width:280px;font-weight:500}
.lost .actions-mini{display:flex;gap:8px;margin-top:4px}
.lost .mini-btn{padding:8px 14px;border-radius:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#f3e8dc;font-size:12px;font-weight:600;text-decoration:none;font-family:inherit;cursor:pointer;transition:background .15s}
.lost .mini-btn:hover{background:rgba(255,255,255,.18)}
.loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;opacity:1;transition:opacity .3s ease}
.loader.hidden{opacity:0}
.spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;animation:spin .9s linear infinite;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}
@keyframes spin{to{transform:rotate(360deg)}}
.fs-btn{position:absolute;top:10px;right:10px;z-index:10;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.18);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s,transform .15s;padding:0}
.fs-btn:hover{background:rgba(0,0,0,.72)}
.fs-btn:active{transform:scale(.92)}
.fs-btn svg{width:18px;height:18px;display:block}
.play-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:8;width:68px;height:68px;border-radius:50%;background:rgba(0,0,0,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:2px solid rgba(255,255,255,.25);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .18s,background .2s;padding:0}
.play-overlay:hover{transform:translate(-50%,-50%) scale(1.06);background:rgba(0,0,0,.72)}
.play-overlay:active{transform:translate(-50%,-50%) scale(.96)}
.play-overlay svg{width:26px;height:26px;fill:#fff;margin-left:3px;display:block}
.controls{position:absolute;bottom:0;left:0;right:0;z-index:6;display:flex;align-items:center;gap:10px;padding:24px 12px 10px;background:linear-gradient(0deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.5) 55%,transparent 100%)}
.ctrl-btn{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:none;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s;padding:0}
.ctrl-btn:hover{background:rgba(255,255,255,.3)}
.ctrl-btn svg{width:13px;height:13px;fill:#fff;display:block}
.progress{flex:1;height:4px;-webkit-appearance:none;appearance:none;background:linear-gradient(to right,#fff var(--p,0%),rgba(255,255,255,.28) var(--p,0%));border-radius:999px;outline:none;cursor:pointer;padding:0;margin:0;min-width:0}
.progress::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;border:none;box-shadow:0 0 0 3px rgba(255,255,255,.18),0 1px 3px rgba(0,0,0,.5);cursor:pointer;transition:transform .15s}
.progress::-webkit-slider-thumb:hover{transform:scale(1.15)}
.progress::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#fff;border:none;cursor:pointer;box-shadow:0 0 0 3px rgba(255,255,255,.18)}
.progress::-moz-range-track{background:transparent;border:none;height:4px}
.time{font-size:11.5px;font-weight:600;color:#fff;letter-spacing:.02em;font-variant-numeric:tabular-nums;flex-shrink:0;text-shadow:0 1px 2px rgba(0,0,0,.5);white-space:nowrap}
.media-inner:fullscreen{max-width:none;max-height:none;width:100vw;height:100vh;aspect-ratio:auto;border-radius:0;background:#000}
.media-inner:fullscreen img,.media-inner:fullscreen video{max-width:none;max-height:none;width:100%;height:100%}
.media-inner:-webkit-full-screen{max-width:none;max-height:none;width:100vw;height:100vh;aspect-ratio:auto;border-radius:0;background:#000}
.actions{padding:16px 20px 20px;display:flex;gap:10px;align-items:stretch}
.btn{flex:1;padding:13px 18px;border-radius:var(--radius-sm);font-size:13.5px;font-weight:600;text-decoration:none;text-align:center;border:none;cursor:pointer;transition:all var(--transition);display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:inherit;letter-spacing:-.01em;line-height:1;min-width:0}
.btn:active{transform:scale(.97)}
.btn svg{width:15px;height:15px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 4px 14px -3px rgba(74,34,22,.35)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-primary svg{stroke:#fff}
.btn-secondary{background:var(--soft);color:var(--accent);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--soft-hover)}
.btn-secondary svg{stroke:var(--accent)}
.btn-icon{flex:0 0 auto;width:46px;padding:13px 0;gap:0}
.btn-icon svg{width:17px;height:17px}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(8px);background:rgba(28,19,10,.94);color:#fff;padding:11px 18px;border-radius:10px;font-size:12.5px;font-weight:600;letter-spacing:-.005em;box-shadow:0 10px 30px -8px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;z-index:9999}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.modal-backdrop{position:fixed;inset:0;background:rgba(28,19,10,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10000;opacity:0;pointer-events:none;transition:opacity .22s ease}
.modal-backdrop.show{opacity:1;pointer-events:auto}
.modal{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:26px 24px 22px;max-width:380px;width:100%;box-shadow:0 20px 60px -12px rgba(74,34,22,.4);text-align:center;transform:scale(.95) translateY(8px);transition:transform .28s cubic-bezier(.4,0,.2,1)}
.modal-backdrop.show .modal{transform:scale(1) translateY(0)}
.modal h2{font-size:15.5px;font-weight:600;color:var(--text);letter-spacing:-.015em;margin-bottom:6px}
.modal p{font-size:12.5px;color:var(--muted);margin-bottom:18px;line-height:1.55;font-weight:500}
.captcha-box{display:flex;align-items:center;gap:14px;padding:16px 18px;background:linear-gradient(135deg,#ffffff 0%,#fbf7f2 100%);border:1.5px solid #ede4d7;border-radius:14px;cursor:pointer;user-select:none;transition:border-color .18s ease,background .18s ease,box-shadow .18s ease,transform .15s ease;margin-bottom:18px;text-align:left;min-height:74px;position:relative;overflow:hidden;box-shadow:0 2px 8px -2px rgba(74,34,22,.06)}
.captcha-box::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 100% 0%,rgba(74,34,22,.05) 0%,transparent 60%);pointer-events:none}
.captcha-box:hover{border-color:#d7c8b5;box-shadow:0 4px 14px -4px rgba(74,34,22,.12);transform:translateY(-1px)}
.captcha-box:active{transform:translateY(0) scale(.995)}
.captcha-box.checking{cursor:wait;opacity:.9}
.captcha-box.passed{cursor:default;border-color:#c8e6c9;background:linear-gradient(135deg,#f5fbf6 0%,#ecf6ed 100%)}
.captcha-box.failed{border-color:#ffcdd2;background:linear-gradient(135deg,#fff6f6 0%,#ffeeee 100%)}
.captcha-check{width:32px;height:32px;border:2px solid #cfc2b1;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;transition:border-color .18s,background .18s;box-shadow:inset 0 1px 2px rgba(74,34,22,.04)}
.captcha-box:hover .captcha-check{border-color:#a89684}
.captcha-box.passed .captcha-check{background:var(--ok);border-color:var(--ok);box-shadow:0 2px 6px -1px rgba(47,125,50,.4)}
.captcha-box.failed .captcha-check{background:var(--danger);border-color:var(--danger)}
.captcha-check svg{width:20px;height:20px;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;position:absolute;opacity:0;transition:opacity .22s;stroke:#fff}
.captcha-box.passed .captcha-check-icon{opacity:1;stroke-dasharray:24;stroke-dashoffset:24;animation:drawCheck .4s ease forwards}
@keyframes drawCheck{to{stroke-dashoffset:0}}
.captcha-box.failed .captcha-x-icon{opacity:1;animation:shakeX .4s ease}
@keyframes shakeX{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.captcha-spinner{width:18px;height:18px;border:2px solid rgba(74,34,22,.15);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;opacity:0;position:absolute;transition:opacity .2s}
.captcha-box.checking .captcha-spinner{opacity:1}
.captcha-box.passed .captcha-spinner,.captcha-box.failed .captcha-spinner{opacity:0}
.captcha-text{flex:1;line-height:1.3;min-width:0}
.captcha-title{font-size:13.5px;font-weight:600;color:#2a1f15;letter-spacing:-.01em}
.captcha-sub{font-size:11px;color:#a89684;font-weight:500;margin-top:3px;letter-spacing:.01em}
.captcha-logo{width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid #ede4d7;background:#f5ede2;box-shadow:0 2px 8px -2px rgba(74,34,22,.15);transition:transform .2s ease,border-color .18s}
.captcha-logo img{width:100%;height:100%;display:block;object-fit:cover}
.captcha-box:hover .captcha-logo{border-color:#d7c8b5;transform:scale(1.05)}
.modal-actions{display:flex;gap:10px}
.modal-actions .btn{flex:1}
@media(min-width:640px){body{padding:40px}.card{max-width:640px}.header{padding:24px 28px 20px;gap:14px}.badge{width:44px;height:44px;border-radius:13px}.badge svg{width:22px;height:22px}.info h1{font-size:15.5px}.info p{font-size:12.5px;margin-top:4px}.media-inner{max-height:70vh}.actions{padding:20px 28px 24px;gap:12px}.btn{padding:14px 22px;font-size:14px}.btn svg{width:16px;height:16px}.btn-icon{width:50px;padding:14px 0}.btn-icon svg{width:18px;height:18px}}
</style>
</head>
<body>
<div class="card">
<div class="header">
<div class="badge"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
<div class="info"><h1 id="t">CheyaVerse Media</h1><p id="s">Loading…</p></div>
</div>
<div class="preview" id="m"><div class="skeleton"></div><div class="loader"><div class="spinner"></div></div></div>
<div class="actions" id="a" style="display:none"><button class="btn btn-primary" id="d" type="button"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download</span></button><button class="btn btn-secondary" id="o" type="button"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span>Raw</span></button><button class="btn btn-secondary btn-icon" id="cp" type="button" aria-label="Copy Link" title="Copy Link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button></div>
</div>
<div class="modal-backdrop" id="modal">
<div class="modal">
<h2>Verification Required</h2>
<p>Complete the verification below to download the file.</p>
<div class="captcha-box" id="captcha-box" role="checkbox" tabindex="0" aria-checked="false">
<div class="captcha-check">
<div class="captcha-spinner"></div>
<svg class="captcha-check-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
<svg class="captcha-x-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
</div>
<div class="captcha-text">
<div class="captcha-title">I am not a robot</div>
<div class="captcha-sub">Protected by CheyaVerse</div>
</div>
<div class="captcha-logo"><img src="/assets/cheyaverse.jpg" alt="Cheya"></div>
</div>
<div class="modal-actions">
<button class="btn btn-secondary" id="modal-cancel" type="button">Cancel</button>
<button class="btn btn-primary" id="modal-go" type="button" disabled>Unduh</button>
</div>
</div>
</div>
<script>
(function(){
var NONCE="__CAPTCHA_NONCE__";
var p=window.location.pathname.split('/').filter(Boolean);
var media=p[1],fn=p[2]||'file';
try{fn=decodeURIComponent(fn)}catch(e){}
try{media=decodeURIComponent(media||'')}catch(e){}
var subtitle=document.getElementById('s');
if(!media){fail('Invalid media link');return}
subtitle.textContent=fn;
var url='https://litter.catbox.moe/'+media;
var dl='/download/'+encodeURIComponent(media)+'/'+encodeURIComponent(fn);
var ext=(media.split('.').pop()||'').toLowerCase();
var vids=['mp4','webm','mov','mkv','avi','m4v'];
var imgs=['jpg','jpeg','png','gif','webp','bmp','svg'];
var m=document.getElementById('m'),a=document.getElementById('a'),d=document.getElementById('d'),o=document.getElementById('o'),cp=document.getElementById('cp');
var modal=document.getElementById('modal'),modalGo=document.getElementById('modal-go'),modalCancel=document.getElementById('modal-cancel');
var captchaBox=document.getElementById('captcha-box');
var currentVideo=null,downloadVerified=false;
var FS_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
var FS_EXIT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
var PLAY_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var PAUSE_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
var PLAY_BIG_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var LOST_SVG='<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="lgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a3a22"/><stop offset="1" stop-color="#4a2216"/></linearGradient></defs><ellipse cx="100" cy="186" rx="46" ry="6" fill="#000" opacity=".35"><animate attributeName="rx" values="46;38;46" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".35;.2;.35" dur="3s" repeatCount="indefinite"/></ellipse><g><animateTransform attributeName="transform" type="translate" values="0,0; 0,-12; 0,0" dur="3s" repeatCount="indefinite"/><path d="M100 58 C 66 58 44 84 44 122 C 44 158 68 180 100 180 C 132 180 156 158 156 122 C 156 84 134 58 100 58 Z" fill="url(#lgA)"/><ellipse cx="80" cy="118" rx="9" ry="11" fill="#faf6f1"><animate attributeName="ry" values="11;1.5;11" dur="4.2s" repeatCount="indefinite" keyTimes="0;0.5;1"/></ellipse><ellipse cx="120" cy="118" rx="9" ry="11" fill="#faf6f1"><animate attributeName="ry" values="11;1.5;11" dur="4.2s" repeatCount="indefinite" keyTimes="0;0.5;1"/></ellipse><circle r="3.2" fill="#1c130a"><animate attributeName="cx" values="80;76;80;84;80" dur="6s" repeatCount="indefinite"/><animate attributeName="cy" values="120;120;120;120;120" dur="6s" repeatCount="indefinite"/></circle><circle r="3.2" fill="#1c130a"><animate attributeName="cx" values="120;116;120;124;120" dur="6s" repeatCount="indefinite"/><animate attributeName="cy" values="120;120;120;120;120" dur="6s" repeatCount="indefinite"/></circle><path d="M88 152 Q100 144 112 152" stroke="#faf6f1" stroke-width="2.5" fill="none" stroke-linecap="round"/></g><g><animateTransform attributeName="transform" type="translate" values="0,0; 0,-10; 0,0" dur="2.4s" repeatCount="indefinite"/><text x="158" y="72" font-family="Inter,sans-serif" font-size="36" font-weight="700" fill="#f3e8dc" opacity=".85" text-anchor="middle">?</text><animate attributeName="opacity" values=".85;.35;.85" dur="2.4s" repeatCount="indefinite"/></g></svg>';
var toastEl=null,toastTimer=null;
function showToast(msg){if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';document.body.appendChild(toastEl)}toastEl.textContent=msg;void toastEl.offsetWidth;toastEl.classList.add('show');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('show')},1600)}
function fallbackCopy(text){var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='-9999px';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);var ok=false;try{ok=document.execCommand('copy')}catch(e){ok=false}document.body.removeChild(ta);showToast(ok?'Link copied':'Copy failed')}
function copyText(text,msg){if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext){navigator.clipboard.writeText(text).then(function(){showToast(msg)},function(){fallbackCopy(text)})}else{fallbackCopy(text)}}
function copyLink(){copyText(window.location.href,'Link copied')}
cp.addEventListener('click',function(e){e.preventDefault();copyLink()});
document.addEventListener('contextmenu',function(e){var t=e.target;if(t&&(t.tagName==='IMG'||t.tagName==='VIDEO'||(t.closest&&t.closest('.media-inner')))){e.preventDefault()}});
document.addEventListener('dragstart',function(e){var t=e.target;if(t&&(t.tagName==='IMG'||t.tagName==='VIDEO'||(t.closest&&t.closest('.media-inner')))){e.preventDefault()}});
document.addEventListener('selectstart',function(e){var t=e.target;if(t&&(t.tagName==='IMG'||t.tagName==='VIDEO'||(t.closest&&t.closest('.media-inner')))){e.preventDefault()}});
var signals={moves:0,keys:0,touches:0,start:Date.now()};
if('onpointermove' in window){document.addEventListener('pointermove',function(){signals.moves++},{passive:true})}
else{document.addEventListener('mousemove',function(){signals.moves++},{passive:true})}
document.addEventListener('touchmove',function(){signals.touches++},{passive:true});
document.addEventListener('touchstart',function(){signals.touches++},{passive:true});
document.addEventListener('keydown',function(e){var tag=(e.target&&e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;signals.keys++});
function claimCaptcha(){
var elapsed=(Date.now()-signals.start)/1000;
var total=signals.moves+signals.keys+signals.touches;
if(elapsed<0.6||total<3){return Promise.resolve({ok:false,error:'bot'})}
return fetch('/captcha/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:NONCE,signals:{moves:signals.moves,keys:signals.keys,touches:signals.touches,elapsed:elapsed}})}).then(function(r){return r.json()}).catch(function(){return {ok:false}});
}
function tryCaptcha(){
if(captchaBox.classList.contains('passed'))return;
if(captchaBox.classList.contains('checking'))return;
captchaBox.classList.remove('failed');
captchaBox.classList.add('checking');
setTimeout(function(){
claimCaptcha().then(function(res){
captchaBox.classList.remove('checking');
if(res&&res.ok){
captchaBox.classList.add('passed');
captchaBox.setAttribute('aria-checked','true');
downloadVerified=true;
modalGo.disabled=false;
}else{
captchaBox.classList.add('failed');
captchaBox.setAttribute('aria-checked','false');
setTimeout(function(){captchaBox.classList.remove('failed')},1400);
}
});
},500);
}
captchaBox.addEventListener('click',tryCaptcha);
captchaBox.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();tryCaptcha()}});
function fmt(s){if(!isFinite(s)||s<0)return '0:00';var mm=Math.floor(s/60);var ss=Math.floor(s%60);return mm+':'+(ss<10?'0':'')+ss}
function clearLoading(){var sk=m.querySelector('.skeleton');if(sk)sk.classList.add('hidden');var ld=m.querySelector('.loader');if(ld)ld.classList.add('hidden')}
function applyAspect(el,ratio){if(!el||!isFinite(ratio)||ratio<=0)return;var r=Math.min(Math.max(ratio,0.5),2.5);el.style.aspectRatio=r}
function requestFs(el){var r=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(r){try{var res=r.call(el);if(res&&res.catch)res.catch(function(){})}catch(e){}}}
function exitFs(){var e=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;if(e){try{var res=e.call(document);if(res&&res.catch)res.catch(function(){})}catch(err){}}}
function toggleFs(el){if(document.fullscreenElement||document.webkitFullscreenElement){exitFs()}else{requestFs(el)}}
function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement)}
function updateAllFsIcons(){var inners=document.querySelectorAll('.media-inner');for(var k=0;k<inners.length;k++){var b=inners[k].querySelector('.fs-btn');if(b)b.innerHTML=isFs()?FS_EXIT_SVG:FS_SVG}}
document.addEventListener('fullscreenchange',updateAllFsIcons);
document.addEventListener('webkitfullscreenchange',updateAllFsIcons);
function openCaptchaModal(){
modal.classList.add('show');
if(downloadVerified){captchaBox.classList.add('passed');captchaBox.setAttribute('aria-checked','true');modalGo.disabled=false}
}
function closeCaptchaModal(){modal.classList.remove('show')}
modalCancel.addEventListener('click',function(){closeCaptchaModal()});
modal.addEventListener('click',function(e){if(e.target===modal){closeCaptchaModal()}});
function startDownload(){if(!downloadVerified){openCaptchaModal();return}window.location.href=dl+'?nonce='+encodeURIComponent(NONCE)}
d.addEventListener('click',function(e){e.preventDefault();startDownload()});
modalGo.addEventListener('click',function(){if(!downloadVerified)return;closeCaptchaModal();window.location.href=dl+'?nonce='+encodeURIComponent(NONCE)});
o.addEventListener('click',function(e){e.preventDefault();var inner=m.querySelector('.media-inner');if(inner){toggleFs(inner)}});
document.addEventListener('keydown',function(e){
var tag=(e.target&&e.target.tagName||'').toLowerCase();
if(tag==='input'||tag==='textarea'||tag==='select')return;
if(e.key==='Escape'){if(modal.classList.contains('show')){closeCaptchaModal();e.preventDefault();return}}
if(e.key==='f'||e.key==='F'){var inner=m.querySelector('.media-inner');if(inner){toggleFs(inner);e.preventDefault()}return}
if(!currentVideo)return;
var v=currentVideo;
if(e.code==='Space'){e.preventDefault();if(v.paused){var pr=v.play();if(pr&&pr.catch)pr.catch(function(){})}else{v.pause()}}
else if(e.code==='ArrowLeft'){e.preventDefault();v.currentTime=Math.max(0,v.currentTime-5)}
else if(e.code==='ArrowRight'){e.preventDefault();if(isFinite(v.duration)&&v.duration>0)v.currentTime=Math.min(v.duration,v.currentTime+5)}
else if(e.code==='ArrowUp'){e.preventDefault();v.volume=Math.min(1,v.volume+0.1)}
else if(e.code==='ArrowDown'){e.preventDefault();v.volume=Math.max(0,v.volume-0.1)}
else if(e.key==='m'||e.key==='M'){e.preventDefault();v.muted=!v.muted}
});
function attachProtection(el){el.addEventListener('contextmenu',function(e){e.preventDefault()});el.addEventListener('dragstart',function(e){e.preventDefault()});el.addEventListener('selectstart',function(e){e.preventDefault()})}
function buildVideo(){
var inner=document.createElement('div');inner.className='media-inner';
attachProtection(inner);
var v=document.createElement('video');
v.playsInline=true;v.setAttribute('webkit-playsinline','');v.setAttribute('playsinline','');v.preload='metadata';v.src=url;v.controls=false;v.setAttribute('controlslist','nodownload noplaybackrate noremoteplayback');v.setAttribute('disablepictureinpicture','');v.setAttribute('disableremoteplayback','');
currentVideo=v;
var fs=document.createElement('button');fs.className='fs-btn';fs.type='button';fs.innerHTML=FS_SVG;fs.setAttribute('aria-label','Fullscreen');
fs.addEventListener('click',function(e){e.stopPropagation();toggleFs(inner)});
var po=document.createElement('button');po.className='play-overlay';po.type='button';po.innerHTML=PLAY_BIG_SVG;po.setAttribute('aria-label','Play');
var ctr=document.createElement('div');ctr.className='controls';
ctr.innerHTML='<button class="ctrl-btn" type="button" aria-label="Toggle">'+PLAY_SVG+'</button><input type="range" class="progress" min="0" max="1000" value="0" step="1"><span class="time">0:00 / 0:00</span>';
inner.appendChild(v);inner.appendChild(fs);inner.appendChild(po);inner.appendChild(ctr);
var toggleBtn=ctr.querySelector('.ctrl-btn');
var progress=ctr.querySelector('.progress');
var timeEl=ctr.querySelector('.time');
function updateToggleIcon(){toggleBtn.innerHTML=v.paused?PLAY_SVG:PAUSE_SVG}
function updatePlayOverlay(){po.style.display=(v.paused&&!v.ended)?'flex':'none'}
v.addEventListener('loadedmetadata',function(){applyAspect(inner,v.videoWidth/v.videoHeight);timeEl.textContent='0:00 / '+fmt(v.duration);v.classList.add('loaded');clearLoading()});
v.addEventListener('play',function(){updateToggleIcon();updatePlayOverlay()});
v.addEventListener('pause',function(){updateToggleIcon();updatePlayOverlay()});
v.addEventListener('ended',function(){updateToggleIcon();updatePlayOverlay()});
v.addEventListener('timeupdate',function(){if(!v.duration||!isFinite(v.duration))return;var pct=(v.currentTime/v.duration)*100;progress.value=Math.floor(pct*10);progress.style.setProperty('--p',pct+'%');timeEl.textContent=fmt(v.currentTime)+' / '+fmt(v.duration)});
progress.addEventListener('input',function(){if(!v.duration||!isFinite(v.duration))return;var pct=progress.value/1000;v.currentTime=pct*v.duration});
function togglePlay(){if(v.paused){var pr=v.play();if(pr&&pr.catch)pr.catch(function(){})}else{v.pause()}}
toggleBtn.addEventListener('click',function(e){e.stopPropagation();togglePlay()});
po.addEventListener('click',function(e){e.stopPropagation();togglePlay()});
v.addEventListener('click',function(){togglePlay()});
v.addEventListener('error',function(){fail('Media expired or unavailable')});
updateToggleIcon();updatePlayOverlay();
var pr=v.play();if(pr&&pr.catch)pr.catch(function(){});
return inner;
}
function buildImage(){
var inner=document.createElement('div');inner.className='media-inner';
attachProtection(inner);
var i=document.createElement('img');i.alt=fn;i.src=url;i.draggable=false;
var fs=document.createElement('button');fs.className='fs-btn';fs.type='button';fs.innerHTML=FS_SVG;fs.setAttribute('aria-label','Fullscreen');
fs.addEventListener('click',function(e){e.stopPropagation();toggleFs(inner)});
i.addEventListener('load',function(){applyAspect(inner,i.naturalWidth/i.naturalHeight);i.classList.add('loaded');clearLoading()});
i.addEventListener('error',function(){fail('Media expired or unavailable')});
inner.appendChild(i);inner.appendChild(fs);
return inner;
}
function render(){
m.innerHTML='<div class="skeleton"></div><div class="loader"><div class="spinner"></div></div>';
if(vids.indexOf(ext)!==-1){m.appendChild(buildVideo())}
else if(imgs.indexOf(ext)!==-1){m.appendChild(buildImage())}
else{m.innerHTML='<div class="status">Preview not available for this file type</div>'}
o.removeAttribute('href');a.style.display='flex';subtitle.textContent=fn+' · available for 24 hours';
}
function fail(msg){
currentVideo=null;
m.innerHTML='<div class="lost">'+LOST_SVG+'<div class="title">File tidak ditemukan</div><div class="desc">'+msg+'. Kemungkinan link salah, file sudah expired, atau telah dihapus.</div><div class="actions-mini"><a class="mini-btn" href="/">Home</a><a class="mini-btn" href="javascript:location.reload()">Muat Ulang</a></div></div>';
subtitle.textContent='Not available';
a.style.display='none';
}
render();
})();
</script>
</body>
</html>
"""

NOT_FOUND_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#faf6f1">
<title>404 · CheyaVerse</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#faf6f1;--card:#fff;--text:#1c130a;--muted:#8b7a6b;--accent:#4a2216;--accent-hover:#5f2d1e;--soft:#f5ede2;--soft-hover:#ecdfd0;--border:#ebe2d5;--radius:20px;--radius-sm:12px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);background-image:radial-gradient(circle at 15% 0%,#fefaf3 0%,transparent 55%),radial-gradient(circle at 100% 100%,#f2e6d4 0%,transparent 45%);color:var(--text);min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 12px 40px -12px rgba(74,34,22,.18),0 2px 8px -2px rgba(74,34,22,.06);width:100%;max-width:460px;padding:44px 32px 34px;text-align:center;animation:rise .5s cubic-bezier(.4,0,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.mascot{width:180px;height:180px;display:block;margin:0 auto 4px}
.title{font-size:22px;font-weight:700;color:var(--text);letter-spacing:-.02em;margin-bottom:8px;line-height:1.2}
.title .num{color:var(--accent)}
.desc{font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:26px;font-weight:500}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{padding:12px 20px;border-radius:var(--radius-sm);font-size:13.5px;font-weight:600;text-decoration:none;text-align:center;border:none;cursor:pointer;transition:all .2s cubic-bezier(.4,0,.2,1);display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:inherit;letter-spacing:-.01em;line-height:1;min-width:130px}
.btn:active{transform:scale(.97)}
.btn svg{width:15px;height:15px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 4px 14px -3px rgba(74,34,22,.35)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-primary svg{stroke:#fff}
.btn-secondary{background:var(--soft);color:var(--accent);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--soft-hover)}
.btn-secondary svg{stroke:var(--accent)}
.brand{display:inline-flex;align-items:center;gap:8px;margin-top:22px;font-size:11.5px;color:var(--muted);font-weight:500;letter-spacing:-.005em}
.brand svg{width:14px;height:14px;stroke:var(--accent);stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
</style>
</head>
<body>
<div class="card">
<svg class="mascot" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#7a3a22"/>
<stop offset="1" stop-color="#4a2216"/>
</linearGradient>
<radialGradient id="cheekG" cx="50%" cy="50%">
<stop offset="0" stop-color="#c66a4a" stop-opacity=".55"/>
<stop offset="100%" stop-color="#c66a4a" stop-opacity="0"/>
</radialGradient>
</defs>
<ellipse cx="100" cy="188" rx="46" ry="6" fill="#4a2216" opacity=".12">
<animate attributeName="rx" values="46;38;46" dur="3s" repeatCount="indefinite"/>
<animate attributeName="opacity" values=".12;.07;.12" dur="3s" repeatCount="indefinite"/>
</ellipse>
<g>
<animateTransform attributeName="transform" type="translate" values="0,0; 0,-10; 0,0" dur="3s" repeatCount="indefinite"/>
<path d="M100 56 C 66 56 44 82 44 120 C 44 158 68 182 100 182 C 132 182 156 158 156 120 C 156 82 134 56 100 56 Z" fill="url(#bodyG)"/>
<ellipse cx="70" cy="132" rx="12" ry="7" fill="url(#cheekG)"/>
<ellipse cx="130" cy="132" rx="12" ry="7" fill="url(#cheekG)"/>
<ellipse cx="80" cy="118" rx="9" ry="11" fill="#faf6f1">
<animate attributeName="ry" values="11;1.5;11" dur="4.2s" repeatCount="indefinite" keyTimes="0;0.5;1"/>
</ellipse>
<ellipse cx="120" cy="118" rx="9" ry="11" fill="#faf6f1">
<animate attributeName="ry" values="11;1.5;11" dur="4.2s" repeatCount="indefinite" keyTimes="0;0.5;1"/>
</ellipse>
<circle r="3.2" fill="#1c130a">
<animate attributeName="cx" values="80;75;80;85;80" dur="6s" repeatCount="indefinite"/>
<animate attributeName="cy" values="120;121;120;121;120" dur="6s" repeatCount="indefinite"/>
</circle>
<circle r="3.2" fill="#1c130a">
<animate attributeName="cx" values="120;115;120;125;120" dur="6s" repeatCount="indefinite"/>
<animate attributeName="cy" values="120;121;120;121;120" dur="6s" repeatCount="indefinite"/>
</circle>
<path d="M88 148 Q100 140 112 148" stroke="#faf6f1" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</g>
<g>
<animateTransform attributeName="transform" type="translate" values="0,0; 0,-9; 0,0" dur="2.4s" repeatCount="indefinite"/>
<text x="160" y="70" font-family="Inter,sans-serif" font-size="34" font-weight="700" fill="#4a2216" opacity=".9" text-anchor="middle">?</text>
<animate attributeName="opacity" values=".9;.4;.9" dur="2.4s" repeatCount="indefinite"/>
</g>
<g>
<animateTransform attributeName="transform" type="translate" values="0,0; 0,-13; 0,0" dur="3.4s" repeatCount="indefinite"/>
<text x="42" y="88" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#4a2216" opacity=".55" text-anchor="middle">?</text>
</g>
</svg>
<div class="title">Halaman <span class="num">404</span></div>
<div class="desc">Yah, halaman yang kamu cari nggak ketemu. Bisa jadi URL-nya salah ketik, atau media-nya udah expired &amp; terhapus dari server.</div>
<div class="actions">
<a class="btn btn-primary" href="/"><svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg><span>Home</span></a>
<button class="btn btn-secondary" type="button" onclick="history.length>1?history.back():location.href='/'"><svg viewBox="0 0 24 24"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg><span>Kembali</span></button>
</div>
<div class="brand"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>CheyaVerse Media</span></div>
</div>
</body>
</html>
"""

MEDIA_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 30
RATE_LIMIT_CLEANUP_INTERVAL = 300

MAX_PROXY_BYTES = 50 * 1024 * 1024

CAPTCHA_TTL = 900

VIDEO_EXTS = {"mp4", "webm", "mov", "mkv", "avi", "m4v"}
IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "bmp"}

_download_hits: dict[str, list[float]] = defaultdict(list)
_last_rate_cleanup: float = 0.0

_captcha_nonces: dict[str, float] = {}
_captcha_verified: dict[str, float] = {}


def _client_ip(request: web.Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return request.remote or "unknown"


def _cleanup_rate_limit(now: float) -> None:
    cutoff = now - RATE_LIMIT_WINDOW
    stale = [ip for ip, hits in _download_hits.items() if not hits or hits[-1] < cutoff]
    for ip in stale:
        _download_hits.pop(ip, None)


def _rate_limited(ip: str) -> bool:
    global _last_rate_cleanup
    now = time.monotonic()
    if now - _last_rate_cleanup > RATE_LIMIT_CLEANUP_INTERVAL:
        _cleanup_rate_limit(now)
        _last_rate_cleanup = now

    hits = _download_hits[ip]
    cutoff = now - RATE_LIMIT_WINDOW
    while hits and hits[0] < cutoff:
        hits.pop(0)

    if len(hits) >= RATE_LIMIT_MAX:
        return True

    hits.append(now)
    return False


def _cleanup_captcha_stores(now: float) -> None:
    for store in (_captcha_nonces, _captcha_verified):
        stale = [k for k, exp in store.items() if exp < now]
        for k in stale:
            store.pop(k, None)


@lru_cache(maxsize=1)
def _load_logo_bytes() -> bytes | None:
    try:
        if LOGO_PATH.exists():
            return LOGO_PATH.read_bytes()
    except Exception as exc:
        logger.error(f"Failed to read logo file: {exc}")
    return None


def _build_og_tags(request: web.Request, media: str, filename: str) -> str:
    ext = media.rsplit(".", 1)[-1].lower() if "." in media else ""
    litter_url = f"https://litter.catbox.moe/{media}"
    base = PUBLIC_URL or f"{request.scheme}://{request.host}"
    viewer_url = f"{base}{request.path}"

    safe_fn = html.escape(filename or "file", quote=True)
    safe_url = html.escape(viewer_url, quote=True)
    safe_media = html.escape(litter_url, quote=True)
    desc = "CheyaVerse Media \u00b7 Available for 24 hours"

    tags = [
        '<meta property="og:site_name" content="CheyaVerse">',
        f'<meta property="og:title" content="{safe_fn}">',
        f'<meta property="og:description" content="{desc}">',
        f'<meta property="og:url" content="{safe_url}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{safe_fn}">',
        f'<meta name="twitter:description" content="{desc}">',
    ]

    if ext in VIDEO_EXTS:
        tags.extend([
            '<meta property="og:type" content="video.other">',
            f'<meta property="og:video" content="{safe_media}">',
            f'<meta property="og:video:secure_url" content="{safe_media}">',
            '<meta property="og:video:type" content="video/mp4">',
        ])
    elif ext in IMAGE_EXTS:
        tags.extend([
            '<meta property="og:type" content="website">',
            f'<meta property="og:image" content="{safe_media}">',
            f'<meta property="og:image:secure_url" content="{safe_media}">',
            f'<meta name="twitter:image" content="{safe_media}">',
        ])
    else:
        tags.append('<meta property="og:type" content="website">')

    return "\n".join(tags)


async def _handle_root(request: web.Request) -> web.Response:
    return web.Response(text="CheyaVerse viewer online.", content_type="text/plain")


async def _handle_logo(request: web.Request) -> web.Response:
    data = _load_logo_bytes()
    if not data:
        return web.Response(status=404, text="Not found.", content_type="text/plain")
    return web.Response(
        body=data,
        content_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


async def _handle_viewer(request: web.Request) -> web.Response:
    try:
        media = request.match_info.get("media", "")
        filename = request.match_info.get("filename", "file")
        og = _build_og_tags(request, media, filename)

        now = time.monotonic()
        _cleanup_captcha_stores(now)
        nonce = secrets.token_urlsafe(24)
        _captcha_nonces[nonce] = now + CAPTCHA_TTL

        page = VIEWER_HTML.replace("<!--OG_META-->", og)
        page = page.replace("__CAPTCHA_NONCE__", html.escape(nonce, quote=True))
        return web.Response(text=page, content_type="text/html")
    except Exception as exc:
        logger.error(f"Failed to render viewer: {exc}")
        return web.Response(status=500, text="Internal server error.", content_type="text/plain")


async def _handle_captcha_claim(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "bad_request"}, status=400)

    nonce = str(payload.get("nonce") or "").strip()
    signals = payload.get("signals") or {}

    if not nonce or nonce not in _captcha_nonces:
        return web.json_response({"ok": False, "error": "invalid_nonce"}, status=400)

    now = time.monotonic()
    if _captcha_nonces.get(nonce, 0) < now:
        _captcha_nonces.pop(nonce, None)
        return web.json_response({"ok": False, "error": "expired"}, status=400)

    try:
        moves = int(signals.get("moves", 0))
        keys = int(signals.get("keys", 0))
        touches = int(signals.get("touches", 0))
        elapsed = float(signals.get("elapsed", 0))
    except Exception:
        return web.json_response({"ok": False, "error": "bad_signals"}, status=400)

    total = moves + keys + touches
    if elapsed < 0.6 or total < 3:
        return web.json_response({"ok": False, "error": "bot_suspected"}, status=400)

    _captcha_nonces.pop(nonce, None)
    _captcha_verified[nonce] = now + CAPTCHA_TTL
    return web.json_response({"ok": True})


async def _handle_download(request: web.Request) -> web.Response:
    ip = _client_ip(request)
    if _rate_limited(ip):
        logger.warning(f"Rate limit exceeded for {ip}")
        return web.Response(
            status=429,
            text="Too many requests, please slow down.",
            content_type="text/plain",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)},
        )

    media = request.match_info.get("media", "").strip()
    filename = request.match_info.get("filename", "file").strip() or "file"

    if not media or not MEDIA_RE.match(media):
        return web.Response(status=400, text="Invalid media link.", content_type="text/plain")

    nonce = (request.query.get("nonce") or "").strip()
    now = time.monotonic()
    expiry = _captcha_verified.get(nonce)
    if not nonce or not expiry or expiry < now:
        if nonce:
            _captcha_verified.pop(nonce, None)
        logger.warning(f"Download without valid captcha for {ip}")
        return web.Response(
            status=403,
            text="Captcha verification required.",
            content_type="text/plain",
        )
    _captcha_verified.pop(nonce, None)

    safe_name = (
        filename
        .replace('"', "")
        .replace("\\", "")
        .replace("\r", "")
        .replace("\n", "")
    ) or "file"

    if len(safe_name) > 200:
        safe_name = safe_name[:200]

    url = f"https://litter.catbox.moe/{media}"

    try:
        timeout = aiohttp.ClientTimeout(total=120, connect=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    logger.warning(f"Upstream {media} returned HTTP {resp.status}")
                    return web.Response(
                        status=resp.status,
                        text="Media not available.",
                        content_type="text/plain",
                    )

                cl = resp.headers.get("Content-Length")
                if cl:
                    try:
                        if int(cl) > MAX_PROXY_BYTES:
                            logger.warning(f"Media {media} too large ({cl} bytes)")
                            return web.Response(
                                status=413,
                                text="Media too large.",
                                content_type="text/plain",
                            )
                    except ValueError:
                        pass

                content_type = resp.headers.get("Content-Type", "application/octet-stream")

                chunks: list[bytes] = []
                total = 0
                async for chunk in resp.content.iter_chunked(64 * 1024):
                    total += len(chunk)
                    if total > MAX_PROXY_BYTES:
                        logger.warning(f"Media {media} exceeded size limit during streaming")
                        return web.Response(
                            status=413,
                            text="Media too large.",
                            content_type="text/plain",
                        )
                    chunks.append(chunk)
                data = b"".join(chunks)
    except aiohttp.ClientError as exc:
        logger.error(f"Upstream client error for {media}: {exc}")
        return web.Response(status=502, text="Upstream error.", content_type="text/plain")
    except asyncio.TimeoutError:
        logger.error(f"Upstream timeout for {media}")
        return web.Response(status=504, text="Upstream timeout.", content_type="text/plain")
    except Exception as exc:
        logger.error(f"Download proxy failed for {media}: {exc}")
        return web.Response(status=502, text="Upstream error.", content_type="text/plain")

    return web.Response(
        body=data,
        content_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


async def _handle_404(request: web.Request) -> web.Response:
    return web.Response(
        text=NOT_FOUND_HTML,
        content_type="text/html",
        status=404,
    )


async def _on_shutdown(app: web.Application) -> None:
    logger.info("Web application shutdown.")


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", _handle_root)
    app.router.add_get("/assets/cheyaverse.jpg", _handle_logo)
    app.router.add_get("/m/{media}/{filename}", _handle_viewer)
    app.router.add_post("/captcha/claim", _handle_captcha_claim)
    app.router.add_get("/download/{media}/{filename}", _handle_download)
    app.router.add_route("*", "/{tail:.*}", _handle_404)
    app.on_shutdown.append(_on_shutdown)
    return app


async def _run_server() -> int:
    logger.info("CheyaVerse webapp is starting...")

    if PUBLIC_URL:
        logger.info(f"Public viewer base: {PUBLIC_URL}")

    logger.info("CheyaShield captcha enabled on /download.")

    if LOGO_PATH.exists():
        logger.info(f"Captcha logo loaded: {LOGO_PATH}")
    else:
        logger.warning(f"Captcha logo not found: {LOGO_PATH}")

    app = create_app()
    runner = web.AppRunner(app)

    try:
        await runner.setup()
        site = web.TCPSite(runner, WEB_HOST, WEB_PORT)
        await site.start()
        logger.info(f"Web viewer listening on http://{WEB_HOST}:{WEB_PORT}")
    except OSError as exc:
        logger.error(f"Failed to bind web server on {WEB_HOST}:{WEB_PORT}: {exc}")
        await runner.cleanup()
        return 1
    except Exception as exc:
        logger.error(f"Failed to start web server: {exc}")
        await runner.cleanup()
        return 1

    stop = asyncio.Event()
    loop = asyncio.get_event_loop()

    import signal
    for sig_name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, sig_name, None)
        if sig is None:
            continue
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            pass

    try:
        await stop.wait()
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Shutting down web server...")
        try:
            await runner.cleanup()
        except Exception as exc:
            logger.error(f"Runner cleanup failed: {exc}")
        logger.info("CheyaVerse webapp has shut down.")

    return 0


def main() -> int:
    try:
        return asyncio.run(_run_server())
    except KeyboardInterrupt:
        logger.info("Manual shutdown (CTRL+C).")
        return 0
    except Exception as exc:
        logger.error(f"Crash at entry point: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
