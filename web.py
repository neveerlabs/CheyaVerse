import asyncio
import sys

import aiohttp
from aiohttp import web

from config import PUBLIC_URL, WEB_HOST, WEB_PORT
from logger import logger

VIEWER_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#faf6f1">
<title>CheyaVerse Media</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#faf6f1;--card:#fff;--text:#1c130a;--muted:#8b7a6b;--accent:#4a2216;--accent-hover:#5f2d1e;--soft:#f5ede2;--soft-hover:#ecdfd0;--border:#ebe2d5;--danger:#b23a2e;--radius:20px;--radius-sm:12px;--transition:.2s cubic-bezier(.4,0,.2,1)}
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
.preview{padding:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#fdfaf5 0%,#f8f1e7 100%);min-height:200px;position:relative;overflow:hidden}
.media-inner{position:relative;display:inline-block;max-width:100%;max-height:60vh;line-height:0;border-radius:10px;overflow:hidden;background:#000;box-shadow:0 8px 28px -10px rgba(74,34,22,.35),0 2px 8px -2px rgba(74,34,22,.1)}
.media-inner img,.media-inner video{display:block;max-width:100%;max-height:60vh;width:auto;height:auto;object-fit:contain;opacity:0;filter:blur(24px);transform:scale(1.04);transition:opacity .5s ease,filter .5s ease,transform .5s ease}
.media-inner img.loaded,.media-inner video.loaded{opacity:1;filter:blur(0);transform:scale(1)}
video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-panel,video::-webkit-media-controls-play-button,video::-webkit-media-controls-timeline,video::-webkit-media-controls-current-time-display,video::-webkit-media-controls-time-remaining-display,video::-webkit-media-controls-mute-button,video::-webkit-media-controls-toggle-closed-captions-button,video::-webkit-media-controls-volume-slider,video::-webkit-media-controls-fullscreen-button,video::-webkit-media-controls-download-button,video::-webkit-media-controls-overlay-play-button,video::-webkit-media-controls-overlay-enclosure{display:none!important;-webkit-appearance:none!important;opacity:0!important;pointer-events:none!important}
.skeleton{position:absolute;inset:16px;border-radius:10px;background:linear-gradient(90deg,#efe2ce 0%,#faf2e5 25%,#efe2ce 50%,#faf2e5 75%,#efe2ce 100%);background-size:200% 100%;animation:shimmer 1.8s ease-in-out infinite;z-index:0}
.skeleton::after{content:'';position:absolute;inset:0;border-radius:10px;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.35) 0%,transparent 60%);animation:pulse 2.2s ease-in-out infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.85}}
.skeleton.hidden{opacity:0;transition:opacity .4s ease;pointer-events:none}
.status{font-size:13px;color:var(--muted);text-align:center;padding:52px 24px;line-height:1.6;font-weight:500;position:relative;z-index:2}
.status.error{color:var(--danger)}
.loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none;opacity:1;transition:opacity .3s ease}
.loader.hidden{opacity:0}
.spinner{width:32px;height:32px;border:3px solid rgba(74,34,22,.12);border-top-color:var(--accent);border-radius:50%;animation:spin .9s linear infinite;filter:drop-shadow(0 2px 6px rgba(74,34,22,.15))}
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
.media-inner:fullscreen{max-width:none;max-height:none;width:100vw;height:100vh;border-radius:0;display:flex;align-items:center;justify-content:center;background:#000}
.media-inner:fullscreen img,.media-inner:fullscreen video{max-width:100vw;max-height:100vh;width:auto;height:auto}
.media-inner:-webkit-full-screen{max-width:none;max-height:none;width:100vw;height:100vh;border-radius:0;background:#000}
.actions{padding:16px 20px 20px;display:flex;gap:10px}
.btn{flex:1;padding:13px 18px;border-radius:var(--radius-sm);font-size:13.5px;font-weight:600;text-decoration:none;text-align:center;border:none;cursor:pointer;transition:all var(--transition);display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:inherit;letter-spacing:-.01em;line-height:1}
.btn:active{transform:scale(.97)}
.btn svg{width:15px;height:15px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 4px 14px -3px rgba(74,34,22,.35)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-primary svg{stroke:#fff}
.btn-secondary{background:var(--soft);color:var(--accent);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--soft-hover)}
.btn-secondary svg{stroke:var(--accent)}
@media(min-width:640px){body{padding:40px}.card{max-width:640px}.header{padding:24px 28px 20px;gap:14px}.badge{width:44px;height:44px;border-radius:13px}.badge svg{width:22px;height:22px}.info h1{font-size:15.5px}.info p{font-size:12.5px;margin-top:4px}.preview{padding:20px;min-height:240px}.media-inner,.media-inner img,.media-inner video{max-height:65vh}.actions{padding:20px 28px 24px;gap:12px}.btn{padding:14px 22px;font-size:14px}.btn svg{width:16px;height:16px}}
</style>
</head>
<body>
<div class="card">
<div class="header">
<div class="badge"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
<div class="info"><h1 id="t">CheyaVerse Media</h1><p id="s">Loading…</p></div>
</div>
<div class="preview" id="m"><div class="skeleton"></div><div class="loader"><div class="spinner"></div></div></div>
<div class="actions" id="a" style="display:none"><a class="btn btn-primary" id="d" download><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download</span></a><a class="btn btn-secondary" id="o" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg><span>Open Raw</span></a></div>
</div>
<script>
(function(){
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
var m=document.getElementById('m'),a=document.getElementById('a'),d=document.getElementById('d'),o=document.getElementById('o');
var FS_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
var FS_EXIT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
var PLAY_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var PAUSE_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
var PLAY_BIG_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
function fmt(s){if(!isFinite(s)||s<0)return '0:00';var mm=Math.floor(s/60);var ss=Math.floor(s%60);return mm+':'+(ss<10?'0':'')+ss}
function clearLoading(){var sk=m.querySelector('.skeleton');if(sk)sk.classList.add('hidden');var ld=m.querySelector('.loader');if(ld)ld.classList.add('hidden')}
function requestFs(el){var r=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(r){try{var res=r.call(el);if(res&&res.catch)res.catch(function(){})}catch(e){}}}
function exitFs(){var e=document.exitFullscreen||document.webkitExitFullscreen||document.msExitFullscreen;if(e){try{var res=e.call(document);if(res&&res.catch)res.catch(function(){})}catch(err){}}}
function toggleFs(el){if(document.fullscreenElement||document.webkitFullscreenElement){exitFs()}else{requestFs(el)}}
function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement)}
function updateAllFsIcons(){var inners=document.querySelectorAll('.media-inner');for(var k=0;k<inners.length;k++){var b=inners[k].querySelector('.fs-btn');if(b)b.innerHTML=isFs()?FS_EXIT_SVG:FS_SVG}}
document.addEventListener('fullscreenchange',updateAllFsIcons);
document.addEventListener('webkitfullscreenchange',updateAllFsIcons);
function buildVideo(){
var inner=document.createElement('div');inner.className='media-inner';
var v=document.createElement('video');
v.playsInline=true;v.setAttribute('webkit-playsinline','');v.setAttribute('playsinline','');v.preload='metadata';v.src=url;
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
v.addEventListener('loadedmetadata',function(){timeEl.textContent='0:00 / '+fmt(v.duration);v.classList.add('loaded');clearLoading()});
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
var i=document.createElement('img');i.alt=fn;i.src=url;
var fs=document.createElement('button');fs.className='fs-btn';fs.type='button';fs.innerHTML=FS_SVG;fs.setAttribute('aria-label','Fullscreen');
fs.addEventListener('click',function(e){e.stopPropagation();toggleFs(inner)});
i.addEventListener('load',function(){i.classList.add('loaded');clearLoading()});
i.addEventListener('error',function(){fail('Media expired or unavailable')});
inner.appendChild(i);inner.appendChild(fs);
return inner;
}
function render(){
m.innerHTML='<div class="skeleton"></div><div class="loader"><div class="spinner"></div></div>';
if(vids.indexOf(ext)!==-1){m.appendChild(buildVideo())}
else if(imgs.indexOf(ext)!==-1){m.appendChild(buildImage())}
else{m.innerHTML='<div class="status">Preview not available for this file type</div>'}
d.href=dl;d.setAttribute('download',fn);o.href=url;a.style.display='flex';subtitle.textContent=fn+' · available for 24 hours';
}
function fail(msg){m.innerHTML='<div class="status error">'+msg+'</div>';subtitle.textContent='Not available';a.style.display='none'}
render();
})();
</script>
</body>
</html>
"""


async def _handle_root(request: web.Request) -> web.Response:
    return web.Response(text="CheyaVerse viewer online.", content_type="text/plain")


async def _handle_viewer(request: web.Request) -> web.Response:
    try:
        return web.Response(text=VIEWER_HTML, content_type="text/html")
    except Exception as exc:
        logger.error(f"Failed to render viewer: {exc}")
        return web.Response(status=500, text="Internal server error.", content_type="text/plain")


async def _handle_download(request: web.Request) -> web.Response:
    media = request.match_info.get("media", "").strip()
    filename = request.match_info.get("filename", "file").strip() or "file"

    if not media:
        return web.Response(status=400, text="Invalid media link.", content_type="text/plain")

    safe_name = (
        filename
        .replace('"', "")
        .replace("\\", "")
        .replace("\r", "")
        .replace("\n", "")
    ) or "file"

    url = f"https://litter.catbox.moe/{media}"

    try:
        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    logger.warning(f"Upstream {media} returned HTTP {resp.status}")
                    return web.Response(
                        status=resp.status,
                        text="Media not available.",
                        content_type="text/plain",
                    )
                data = await resp.read()
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
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


async def _on_shutdown(app: web.Application) -> None:
    logger.info("Web application shutdown.")


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", _handle_root)
    app.router.add_get("/m/{media}/{filename}", _handle_viewer)
    app.router.add_get("/download/{media}/{filename}", _handle_download)
    app.on_shutdown.append(_on_shutdown)
    return app


async def _run_server() -> int:
    logger.info("CheyaVerse webapp is starting...")

    if PUBLIC_URL:
        logger.info(f"Public viewer base: {PUBLIC_URL}")

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
