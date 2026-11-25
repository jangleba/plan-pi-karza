# Serwer testowy udający wdrożoną aplikację: powłoka HTML, pliki z odciskiem w nazwie, public/ z repozytorium.
import http.server, os, sys
PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public")
STATE = {"sw": open(os.path.join(PUB, "sw.js")).read()}
SHELL = """<!doctype html><html lang=pl><head><meta charset=utf-8><link rel=manifest href=/manifest.webmanifest>
<link rel=stylesheet href=/assets/app-3f9a1c2b.css><title>BallWise</title></head><body><div id=app>shell</div>
<script type=module src=/assets/index-a1b2c3d4.js></script></body></html>"""
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype, extra=None):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(b)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        if self.path == "/__swversion":
            n = int(self.headers["Content-Length"]); v = self.rfile.read(n).decode()
            STATE["sw"] = STATE["sw"].replace('const VERSION = "2026-11-25.1";', f'const VERSION = "{v}";'); return self.send(200, "ok", "text/plain")
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/sw.js": return self.send(200, STATE["sw"], "text/javascript", {"Cache-Control": "no-cache"})
        if p.startswith("/assets/index-"): return self.send(200, "document.getElementById('app').textContent='app-loaded';window.APP_OK=true;", "text/javascript")
        if p.startswith("/assets/app-"): return self.send(200, "body{background:#f7f8fa}", "text/css")
        if p.startswith("/assets/lazy-"): return self.send(200, "export const lazy=1;", "text/javascript")
        if p.startswith("/api/"): return self.send(200, '{"api":true}', "application/json")
        f = os.path.join(PUB, p.lstrip("/"))
        if p != "/" and os.path.isfile(f):
            ct = {"png": "image/png", "svg": "image/svg+xml", "webmanifest": "application/manifest+json", "js": "text/javascript"}.get(f.rsplit(".", 1)[-1], "application/octet-stream")
            return self.send(200, open(f, "rb").read(), ct)
        if "." in p.rsplit("/", 1)[-1]: return self.send(404, "nf", "text/plain")
        return self.send(200, SHELL, "text/html; charset=utf-8")
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
