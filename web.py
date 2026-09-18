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
.preview{padding:24px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#fdfaf5 0%,#f8f1e7 100%);min-height:240px;position:relative}
.preview img,.preview video{max-width:100%;max-height:55vh;border-radius:var(--radius-sm);display:block;box-shadow:0 8px 24px -8px rgba(74,34,22,.25),0 2px 8px -2px rgba(74,34,22,.08)}
.status{font-size:13px;color:var(--muted);text-align:center;padding:44px 24px;line-height:1.6;font-weight:500}
.status.error{color:var(--danger)}
.spinner{width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
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
@media(min-width:640px){body{padding:40px}.card{max-width:600px}.header{padding:24px 28px 20px;gap:14px}.badge{width:44px;height:44px;border-radius:13px}.badge svg{width:22px;height:22px}.info h1{font-size:15.5px}.info p{font-size:12.5px;margin-top:4px}.preview{padding:32px;min-height:300px}.preview img,.preview video{max-height:60vh}.actions{padding:20px 28px 24px;gap:12px}.btn{padding:14px 22px;font-size:14px}.btn svg{width:16px;height:16px}}
</style>
</head>
<body>
<div class="card">
<div class="header">
<div class="badge"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
<div class="info"><h1 id="t">CheyaVerse Media</h1><p id="s">Loading…</p></div>
</div>
<div class="preview" id="m"><div class="status"><div class="spinner"></div>Loading media…</div></div>
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
function render(){
m.innerHTML='';
if(vids.includes(ext)){var v=document.createElement('video');v.controls=true;v.autoplay=true;v.muted=true;v.playsInline=true;v.preload='metadata';v.src=url;v.onerror=function(){fail('Media expired or unavailable')};m.appendChild(v)}
else if(imgs.includes(ext)){var i=document.createElement('img');i.alt=fn;i.src=url;i.onerror=function(){fail('Media expired or unavailable')};m.appendChild(i)}
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