import aiohttp
from aiohttp import web

from logger import logger

VIEWER_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CheyaVerse — Media</title>
<style>
:root{--bg:#f7f3ed;--card:#fff;--text:#2a1a12;--muted:#8a7a6a;--accent:#4a2216;--soft:#f0ebe3;--border:#ece5db;--r:14px}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;-webkit-font-smoothing:antialiased}
.card{background:var(--card);border-radius:var(--r);box-shadow:0 2px 20px rgba(74,34,22,.06);width:100%;max-width:680px;overflow:hidden;border:1px solid var(--border)}
.h{padding:18px 22px;border-bottom:1px solid var(--border)}
.h h1{font-size:16px;font-weight:600;word-break:break-all}
.h p{font-size:12px;color:var(--muted);margin-top:3px}
.m{padding:20px;display:flex;align-items:center;justify-content:center;background:#fbf8f3;min-height:220px}
.m img,.m video{max-width:100%;max-height:62vh;border-radius:10px;display:block}
.s{font-size:13px;color:var(--muted);text-align:center;padding:40px 20px}
.s.err{color:#b23a2e}
.a{padding:14px 20px 20px;display:flex;gap:10px}
.b{flex:1;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;text-align:center;border:none;cursor:pointer;transition:opacity .12s}
.b:active{opacity:.75}
.bp{background:var(--accent);color:#fff}
.bs{background:var(--soft);color:var(--accent)}
@media(min-width:640px){body{padding:40px}.h{padding:22px 28px}.m{padding:28px}.a{padding:18px 28px 24px}}
</style>
</head>
<body>
<div class="card">
<div class="h"><h1 id="t">CheyaVerse</h1><p id="s">Loading…</p></div>
<div class="m" id="m"><div class="s">Loading media…</div></div>
<div class="a" id="a" style="display:none"><a class="b bp" id="d" download>Download</a><a class="b bs" id="o" target="_blank" rel="noopener">Open Raw</a></div>
</div>
<script>
(function(){
var p=window.location.pathname.split('/').filter(Boolean);
var media=p[1],fn=p[2]||'file';
try{fn=decodeURIComponent(fn)}catch(e){}
try{media=decodeURIComponent(media||'')}catch(e){}
document.getElementById('t').textContent=fn;
if(!media){fail('Invalid media link.');return}
var url='https://litter.catbox.moe/'+media;
var dl='/download/'+encodeURIComponent(media)+'/'+encodeURIComponent(fn);
var ext=(media.split('.').pop()||'').toLowerCase();
var vids=['mp4','webm','mov','mkv','avi','m4v'];
var imgs=['jpg','jpeg','png','gif','webp','bmp','svg'];
var m=document.getElementById('m'),a=document.getElementById('a'),d=document.getElementById('d'),o=document.getElementById('o'),s=document.getElementById('s');
function render(){
m.innerHTML='';
if(vids.includes(ext)){var v=document.createElement('video');v.controls=true;v.autoplay=true;v.muted=true;v.playsInline=true;v.src=url;v.onerror=function(){fail('Media expired or unavailable.')};m.appendChild(v)}
else if(imgs.includes(ext)){var i=document.createElement('img');i.alt=fn;i.src=url;i.onerror=function(){fail('Media expired or unavailable.')};m.appendChild(i)}
else{m.innerHTML='<div class="s">Preview not available. Use buttons below.</div>'}
d.href=dl;d.setAttribute('download',fn);o.href=url;a.style.display='flex';s.textContent='Available for 24 hours';
}
function fail(msg){m.innerHTML='<div class="s err">'+msg+'</div>';s.textContent='Not available';a.style.display='none'}
render();
})();
</script>
</body>
</html>
"""


async def _handle_root(request: web.Request) -> web.Response:
    return web.Response(text="CheyaVerse viewer online.", content_type="text/plain")


async def _handle_viewer(request: web.Request) -> web.Response:
    return web.Response(text=VIEWER_HTML, content_type="text/html")


async def _handle_download(request: web.Request) -> web.Response:
    media = request.match_info.get("media", "").strip()
    filename = request.match_info.get("filename", "file").strip() or "file"
    if not media:
        return web.Response(status=400, text="Invalid media link.", content_type="text/plain")

    url = f"https://litter.catbox.moe/{media}"
    try:
        timeout = aiohttp.ClientTimeout(total=90)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return web.Response(
                        status=resp.status,
                        text="Media not available.",
                        content_type="text/plain",
                    )
                data = await resp.read()
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
    except Exception as exc:
        logger.error(f"Download proxy failed for {media}: {exc}")
        return web.Response(status=502, text="Upstream error.", content_type="text/plain")

    safe_name = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return web.Response(
        body=data,
        content_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", _handle_root)
    app.router.add_get("/m/{media}/{filename}", _handle_viewer)
    app.router.add_get("/download/{media}/{filename}", _handle_download)
    return app


async def start_web(host: str, port: int) -> web.AppRunner:
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info(f"Web viewer listening on http://{host}:{port}")
    return runner