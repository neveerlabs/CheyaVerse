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
MODEL_GIF_PATH = ASSETS_DIR / "model.gif"

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
.media-inner img,.media-inner video{display:block;width:100%;height:100%;object-fit:contain;opacity:0;filter:blur(24px);transform:scale(1.04);transition:opacity .55s ease,filter .55s ease,transform .55s ease;-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;-o-user-drag:none;user-drag:none;-webkit-touch-callout:none;user-select:none;pointer-events:none}
.media-inner video{pointer-events:auto}
.media-inner img.loaded,.media-inner video.loaded{opacity:1;filter:blur(0);transform:scale(1)}
video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel,video::-webkit-media-controls-play-button,video::-webkit-media-controls-timeline,video::-webkit-media-controls-current-time-display,video::-webkit-media-controls-time-remaining-display,video::-webkit-media-controls-mute-button,video::-webkit-media-controls-toggle-closed-captions-button,video::-webkit-media-controls-volume-slider,video::-webkit-media-controls-fullscreen-button,video::-webkit-media-controls-download-button,video::-webkit-media-controls-overlay-play-button,video::-webkit-media-controls-overlay-enclosure{display:none!important;-webkit-appearance:none!important;opacity:0!important;pointer-events:none!important}
.sk-stage{position:absolute;inset:0;overflow:hidden;background:#0a0a0a;z-index:2;transition:opacity .55s ease;pointer-events:none}
.sk-stage.gone{opacity:0}
.sk-blob{position:absolute;border-radius:50%;filter:blur(60px);will-change:transform,opacity}
.sk-blob-1{width:70%;padding-bottom:70%;background:#4a2216;top:-15%;left:-20%;opacity:.75;animation:skFloat1 9s ease-in-out infinite}
.sk-blob-2{width:60%;padding-bottom:60%;background:#6b3120;bottom:-12%;right:-15%;opacity:.7;animation:skFloat2 11s ease-in-out infinite}
.sk-blob-3{width:45%;padding-bottom:45%;background:#8a4a2a;top:35%;left:32%;opacity:.55;animation:skFloat3 8s ease-in-out infinite}
.sk-blob-4{width:40%;padding-bottom:40%;background:#a85a35;top:5%;right:5%;opacity:.35;animation:skFloat2 13s ease-in-out infinite reverse}
@keyframes skFloat1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(18%,12%) scale(1.18)}}
@keyframes skFloat2{0%,100%{transform:translate(0,0) scale(1.08)}50%{transform:translate(-14%,-10%) scale(1)}}
@keyframes skFloat3{0%,100%{transform:translate(0,0) scale(.9);opacity:.4}50%{transform:translate(-15%,20%) scale(1.2);opacity:.85}}
.sk-shimmer{position:absolute;inset:0;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.09) 48%,rgba(255,255,255,.13) 50%,rgba(255,255,255,.09) 52%,transparent 62%);background-size:220% 100%;animation:skShim 2.6s ease-in-out infinite;z-index:3;pointer-events:none}
@keyframes skShim{0%{background-position:220% 0}100%{background-position:-220% 0}}
.sk-vignette{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,transparent 40%,rgba(0,0,0,.35) 100%);z-index:2;pointer-events:none}
.status{font-size:13px;color:#d8cfc2;text-align:center;padding:52px 24px;line-height:1.6;font-weight:500;position:relative;z-index:2}
.status.error{color:#ff8f80}
.lost{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px 20px;text-align:center;position:relative;z-index:2}
.lost img{width:130px;height:130px;object-fit:contain;display:block;-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;-o-user-drag:none;user-drag:none;-webkit-touch-callout:none;user-select:none;pointer-events:none}
.lost .title{font-size:14px;font-weight:600;color:#f3e8dc;letter-spacing:-.01em}
.lost .desc{font-size:12px;color:#b8a999;line-height:1.55;max-width:280px;font-weight:500}
.lost .actions-mini{display:flex;gap:8px;margin-top:4px}
.lost .mini-btn{padding:8px 14px;border-radius:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#f3e8dc;font-size:12px;font-weight:600;text-decoration:none;font-family:inherit;cursor:pointer;transition:background .15s}
.lost .mini-btn:hover{background:rgba(255,255,255,.18)}
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
.sk-actions{padding:16px 20px 20px;display:flex;gap:10px;align-items:stretch}
.sk-btn{flex:1;height:44px;border-radius:var(--radius-sm);background:linear-gradient(100deg,#ece0cd 0%,#f8f1e5 42%,#f4e9d6 55%,#ece0cd 100%);background-size:220% 100%;animation:skBtn 2.6s ease-in-out infinite;filter:blur(.6px);opacity:.9}
.sk-btn-secondary{background:linear-gradient(100deg,#f1e8d8 0%,#fbf6ec 42%,#f5ecdc 55%,#f1e8d8 100%);background-size:220% 100%;animation:skBtn 2.6s ease-in-out infinite .18s}
.sk-btn-icon{flex:0 0 auto;width:46px;background:linear-gradient(100deg,#f0e7d6 0%,#fbf5e8 42%,#f5ecdc 55%,#f0e7d6 100%);background-size:220% 100%;animation:skBtn 2.6s ease-in-out infinite .34s}
@keyframes skBtn{0%{background-position:220% 0}100%{background-position:-220% 0}}
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
.captcha-logo img{width:100%;height:100%;display:block;object-fit:cover;-webkit-user-drag:none;user-drag:none;pointer-events:none}
.captcha-box:hover .captcha-logo{border-color:#d7c8b5;transform:scale(1.05)}
.modal-actions{display:flex;gap:10px}
.modal-actions .btn{flex:1}
@keyframes spin{to{transform:rotate(360deg)}}
@media(min-width:640px){body{padding:40px}.card{max-width:640px}.header{padding:24px 28px 20px;gap:14px}.badge{width:44px;height:44px;border-radius:13px}.badge svg{width:22px;height:22px}.info h1{font-size:15.5px}.info p{font-size:12.5px;margin-top:4px}.media-inner{max-height:70vh}.actions{padding:20px 28px 24px;gap:12px}.btn{padding:14px 22px;font-size:14px}.btn svg{width:16px;height:16px}.btn-icon{width:50px;padding:14px 0}.btn-icon svg{width:18px;height:18px}.sk-actions{padding:20px 28px 24px;gap:12px}.sk-btn{height:48px}.sk-btn-icon{width:50px}}
</style>
</head>
<body>
<div class="card">
<div class="header">
<div class="badge"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
<div class="info"><h1 id="t">CheyaVerse Media</h1><p id="s">Loading…</p></div>
</div>
<div class="preview" id="m"><div class="media-inner"><div class="sk-stage"><div class="sk-blob sk-blob-1"></div><div class="sk-blob sk-blob-2"></div><div class="sk-blob sk-blob-3"></div><div class="sk-blob sk-blob-4"></div><div class="sk-vignette"></div><div class="sk-shimmer"></div></div></div></div>
<div class="actions" id="a" style="display:none"><button class="btn btn-primary" id="d" type="button"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download</span></button><button class="btn btn-secondary" id="o" type="button"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span>Raw</span></button><button class="btn btn-secondary btn-icon" id="cp" type="button" aria-label="Copy Link" title="Copy Link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button></div>
<div class="actions sk-actions" id="a-skel"><div class="sk-btn"></div><div class="sk-btn sk-btn-secondary"></div><div class="sk-btn sk-btn-icon"></div></div>
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
<div class="captcha-logo"><img src="/assets/cheyaverse.jpg" alt="Cheya" draggable="false"></div>
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
var aSkel=document.getElementById('a-skel');
var modal=document.getElementById('modal'),modalGo=document.getElementById('modal-go'),modalCancel=document.getElementById('modal-cancel');
var captchaBox=document.getElementById('captcha-box');
var currentVideo=null,downloadVerified=false;
var FS_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
var FS_EXIT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
var PLAY_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var PAUSE_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
var PLAY_BIG_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var LOST_IMG='<img src="/assets/model.gif" alt="Lost" draggable="false">';
var SK_HTML='<div class="sk-blob sk-blob-1"></div><div class="sk-blob sk-blob-2"></div><div class="sk-blob sk-blob-3"></div><div class="sk-blob sk-blob-4"></div><div class="sk-vignette"></div><div class="sk-shimmer"></div>';
var toastEl=null,toastTimer=null;
function showToast(msg){if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';document.body.appendChild(toastEl)}toastEl.textContent=msg;void toastEl.offsetWidth;toastEl.classList.add('show');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('show')},1600)}
function fallbackCopy(text){var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='-9999px';ta.style.opacity='0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);var ok=false;try{ok=document.execCommand('copy')}catch(e){ok=false}document.body.removeChild(ta);showToast(ok?'Link copied':'Copy failed')}
function copyText(text,msg){if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext){navigator.clipboard.writeText(text).then(function(){showToast(msg)},function(){fallbackCopy(text)})}else{fallbackCopy(text)}}
function copyLink(){copyText(window.location.href,'Link copied')}
cp.addEventListener('click',function(e){e.preventDefault();copyLink()});
function isProtectedTarget(t){if(!t)return false;if(t.tagName==='IMG'||t.tagName==='VIDEO')return true;if(t.closest&&(t.closest('.media-inner')||t.closest('.lost')||t.closest('.captcha-logo')))return true;return false}
document.addEventListener('contextmenu',function(e){if(isProtectedTarget(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('dragstart',function(e){if(isProtectedTarget(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('selectstart',function(e){if(isProtectedTarget(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('mousedown',function(e){if(e.button===2&&isProtectedTarget(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('auxclick',function(e){if(e.button===1&&isProtectedTarget(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('copy',function(e){var t=e.target;if(t&&isProtectedTarget(t)){e.preventDefault()}},true);
document.addEventListener('longpress',function(e){if(isProtectedTarget(e.target)){e.preventDefault()}},true);
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
function revealActions(){if(aSkel)aSkel.style.display='none';a.style.display='flex'}
function dismissSkeleton(sk){if(!sk)return;sk.classList.add('gone');setTimeout(function(){if(sk&&sk.parentNode)sk.parentNode.removeChild(sk)},650)}
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
function attachProtection(el){el.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation()});el.addEventListener('dragstart',function(e){e.preventDefault();e.stopPropagation()});el.addEventListener('selectstart',function(e){e.preventDefault();e.stopPropagation()})}
function buildVideo(){
var inner=document.createElement('div');inner.className='media-inner';
attachProtection(inner);
var sk=document.createElement('div');sk.className='sk-stage';sk.innerHTML=SK_HTML;
inner.appendChild(sk);
var v=document.createElement('video');
v.playsInline=true;v.setAttribute('webkit-playsinline','');v.setAttribute('playsinline','');v.preload='metadata';v.src=url;v.controls=false;v.setAttribute('controlslist','nodownload noplaybackrate noremoteplayback');v.setAttribute('disablepictureinpicture','');v.setAttribute('disableremoteplayback','');v.draggable=false;
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
v.addEventListener('loadedmetadata',function(){applyAspect(inner,v.videoWidth/v.videoHeight);timeEl.textContent='0:00 / '+fmt(v.duration);v.classList.add('loaded');dismissSkeleton(sk);revealActions()});
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
var sk=document.createElement('div');sk.className='sk-stage';sk.innerHTML=SK_HTML;
inner.appendChild(sk);
var i=document.createElement('img');i.alt=fn;i.src=url;i.draggable=false;
var fs=document.createElement('button');fs.className='fs-btn';fs.type='button';fs.innerHTML=FS_SVG;fs.setAttribute('aria-label','Fullscreen');
fs.addEventListener('click',function(e){e.stopPropagation();toggleFs(inner)});
i.addEventListener('load',function(){applyAspect(inner,i.naturalWidth/i.naturalHeight);i.classList.add('loaded');dismissSkeleton(sk);revealActions()});
i.addEventListener('error',function(){fail('Media expired or unavailable')});
inner.appendChild(i);inner.appendChild(fs);
return inner;
}
function render(){
m.innerHTML='';
if(vids.indexOf(ext)!==-1){m.appendChild(buildVideo())}
else if(imgs.indexOf(ext)!==-1){m.appendChild(buildImage())}
else{m.innerHTML='<div class="media-inner"><div class="status">Preview not available for this file type</div></div>';revealActions()}
o.removeAttribute('href');subtitle.textContent=fn+' · available for 24 hours';
}
function fail(msg){
currentVideo=null;
if(aSkel)aSkel.style.display='none';
a.style.display='none';
m.innerHTML='<div class="media-inner"><div class="lost">'+LOST_IMG+'<div class="title">File tidak ditemukan</div><div class="desc">'+msg+'. Kemungkinan link salah, file sudah expired, atau telah dihapus.</div><div class="actions-mini"><a class="mini-btn" href="/">Home</a><a class="mini-btn" href="javascript:location.reload()">Muat Ulang</a></div></div></div>';
var inner=m.querySelector('.media-inner');
if(inner)attachProtection(inner);
subtitle.textContent='Not available';
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#faf6f1;--card:#fff;--text:#1c130a;--muted:#8b7a6b;--accent:#4a2216;--accent-hover:#5f2d1e;--soft:#f5ede2;--soft-hover:#ecdfd0;--border:#ebe2d5;--radius:22px;--radius-sm:12px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);background-image:radial-gradient(circle at 15% 0%,#fefaf3 0%,transparent 55%),radial-gradient(circle at 100% 100%,#f2e6d4 0%,transparent 45%);color:var(--text);min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;position:relative;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background-image:radial-gradient(circle,rgba(74,34,22,.045) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0;mask-image:radial-gradient(circle at 50% 40%,black 20%,transparent 70%);-webkit-mask-image:radial-gradient(circle at 50% 40%,black 20%,transparent 70%)}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 20px 60px -20px rgba(74,34,22,.25),0 4px 12px -4px rgba(74,34,22,.08);width:100%;max-width:440px;padding:8px 32px 32px;text-align:center;position:relative;z-index:1;animation:rise .6s cubic-bezier(.4,0,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
.mascot-wrap{position:relative;margin:-8px auto 4px;width:210px;height:210px;display:flex;align-items:center;justify-content:center;-webkit-touch-callout:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.mascot-wrap::before{content:'';position:absolute;width:170%;height:170%;border-radius:50%;background:radial-gradient(circle,rgba(74,34,22,.1) 0%,transparent 62%);z-index:0;animation:haloPulse 4s ease-in-out infinite;pointer-events:none}
@keyframes haloPulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.08);opacity:.5}}
.mascot-wrap img{width:100%;height:100%;object-fit:contain;display:block;position:relative;z-index:1;filter:drop-shadow(0 12px 22px rgba(74,34,22,.18));-webkit-user-drag:none;-khtml-user-drag:none;-moz-user-drag:none;-o-user-drag:none;user-drag:none;-webkit-touch-callout:none;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;pointer-events:none}
.code-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--soft);border:1px solid var(--border);border-radius:999px;font-size:11px;font-weight:700;color:var(--accent);letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px}
.code-chip::before{content:'';width:6px;height:6px;border-radius:50%;background:#c98866;box-shadow:0 0 0 3px rgba(201,136,102,.2);animation:chipPulse 2s ease-in-out infinite}
@keyframes chipPulse{0%,100%{opacity:1}50%{opacity:.4}}
.title{font-size:24px;font-weight:700;color:var(--text);letter-spacing:-.025em;line-height:1.15;margin-bottom:10px}
.title .num{display:inline-block;background:linear-gradient(135deg,#8a4530 0%,#4a2216 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:800}
.desc{font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:26px;font-weight:500;padding:0 4px}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{padding:12px 22px;border-radius:var(--radius-sm);font-size:13.5px;font-weight:600;text-decoration:none;text-align:center;border:none;cursor:pointer;transition:all .22s cubic-bezier(.4,0,.2,1);display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:inherit;letter-spacing:-.01em;line-height:1;min-width:135px;position:relative;overflow:hidden}
.btn:active{transform:scale(.97)}
.btn svg{width:15px;height:15px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;transition:transform .22s ease}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 6px 18px -6px rgba(74,34,22,.5)}
.btn-primary:hover{background:var(--accent-hover);box-shadow:0 8px 22px -6px rgba(74,34,22,.6)}
.btn-primary:hover svg{transform:translateX(-2px)}
.btn-primary svg{stroke:#fff}
.btn-secondary{background:var(--soft);color:var(--accent);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--soft-hover)}
.btn-secondary:hover svg{transform:translateX(2px)}
.btn-secondary svg{stroke:var(--accent)}
.brand{display:inline-flex;align-items:center;gap:8px;margin-top:26px;font-size:11.5px;color:var(--muted);font-weight:600;letter-spacing:-.005em}
.brand svg{width:14px;height:14px;stroke:var(--accent);stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:420px){.card{padding:6px 22px 26px}.mascot-wrap{width:180px;height:180px}.title{font-size:21px}.desc{font-size:13px}.btn{padding:11px 16px;font-size:13px;min-width:0;flex:1}.actions{flex-wrap:nowrap}}
</style>
</head>
<body>
<div class="card">
<div class="mascot-wrap">
<img src="/assets/model.gif" alt="CheyaVerse mascot" draggable="false">
</div>
<div class="code-chip">Error 404</div>
<div class="title">Halaman <span class="num">Nggak Ketemu</span></div>
<div class="desc">Yah, yang kamu cari udah nggak ada di sini. Bisa jadi URL-nya salah ketik, atau file-nya udah expired &amp; terhapus dari server.</div>
<div class="actions">
<a class="btn btn-primary" href="/"><svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg><span>Ke Home</span></a>
<button class="btn btn-secondary" type="button" onclick="history.length>1?history.back():location.href='/'"><svg viewBox="0 0 24 24"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg><span>Kembali</span></button>
</div>
<div class="brand"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>CheyaVerse Media</span></div>
</div>
<script>
(function(){
function isProtected(t){if(!t)return false;if(t.tagName==='IMG')return true;if(t.closest&&t.closest('.mascot-wrap'))return true;return false}
document.addEventListener('contextmenu',function(e){if(isProtected(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('dragstart',function(e){if(isProtected(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('selectstart',function(e){if(isProtected(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('mousedown',function(e){if(e.button===2&&isProtected(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('auxclick',function(e){if(e.button===1&&isProtected(e.target)){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('copy',function(e){if(isProtected(e.target)){e.preventDefault()}},true);
})();
</script>
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


@lru_cache(maxsize=1)
def _load_model_gif_bytes() -> bytes | None:
    try:
        if MODEL_GIF_PATH.exists():
            return MODEL_GIF_PATH.read_bytes()
    except Exception as exc:
        logger.error(f"Failed to read model.gif: {exc}")
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


async def _handle_model_gif(request: web.Request) -> web.Response:
    data = _load_model_gif_bytes()
    if not data:
        return web.Response(status=404, text="Not found.", content_type="text/plain")
    return web.Response(
        body=data,
        content_type="image/gif",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": "inline",
        },
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
    app.router.add_get("/assets/model.gif", _handle_model_gif)
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

    if MODEL_GIF_PATH.exists():
        logger.info(f"404 mascot loaded: {MODEL_GIF_PATH}")
    else:
        logger.warning(f"404 mascot not found: {MODEL_GIF_PATH}")

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
