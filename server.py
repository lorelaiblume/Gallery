#!/usr/bin/env python3
"""Gallery server — serves static files + handles uploads/deletes/gallery API."""

import http.server, socket, json, os, re, uuid
from pathlib import Path

PORT = 8765
BASE_DIR = Path(__file__).parent
UPLOADS_DIR = BASE_DIR / 'uploads'
GALLERY_FILE = BASE_DIR / 'gallery.json'

UPLOADS_DIR.mkdir(exist_ok=True)
if not GALLERY_FILE.exists():
    GALLERY_FILE.write_text('[]')

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]; s.close(); return ip
    except: return "localhost"

def read_gallery():
    try: return json.loads(GALLERY_FILE.read_text())
    except: return []

def write_gallery(data):
    GALLERY_FILE.write_text(json.dumps(data, indent=2))

def parse_multipart(body, boundary):
    if isinstance(boundary, str): boundary = boundary.encode()
    delimiter = b'--' + boundary
    parts = []
    for section in body.split(delimiter)[1:]:
        if section in (b'--\r\n', b'--'): break
        if section.startswith(b'\r\n'): section = section[2:]
        if section.endswith(b'\r\n'): section = section[:-2]
        sep = section.find(b'\r\n\r\n')
        if sep == -1: continue
        headers = section[:sep].decode('utf-8', errors='replace')
        content = section[sep+4:]
        nm = re.search(r'name="([^"]+)"', headers)
        fn = re.search(r'filename="([^"]*)"', headers)
        if nm: parts.append({'name': nm.group(1), 'filename': fn.group(1) if fn else None, 'data': content})
    return parts

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        if self.path == '/api/ip':
            self.send_json({'ip': get_local_ip()})
        elif self.path == '/api/gallery':
            self.send_json(read_gallery())
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/upload':
            ct = self.headers.get('Content-Type', '')
            bm = re.search(r'boundary=(.+)', ct)
            if not bm: self.send_error(400); return
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            parts = parse_multipart(body, bm.group(1).strip())
            fp = next((p for p in parts if p['name'] == 'file' and p['filename']), None)
            category = next((p['data'].decode() for p in parts if p['name'] == 'category'), 'digital')
            if not fp: self.send_error(400); return
            ext = Path(fp['filename']).suffix.lower()
            filename = uuid.uuid4().hex + ext
            (UPLOADS_DIR / filename).write_bytes(fp['data'])
            item = {'id': uuid.uuid4().hex, 'filename': filename, 'category': category, 'title': ''}
            g = read_gallery(); g.append(item); write_gallery(g)
            self.send_json(item)

        elif self.path == '/api/title':
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            g = read_gallery()
            for item in g:
                if item['id'] == data['id']: item['title'] = data['title']; break
            write_gallery(g)
            self.send_json({'ok': True})
        else:
            self.send_error(404)

    def do_DELETE(self):
        m = re.match(r'^/api/delete/(.+)$', self.path)
        if m:
            g = read_gallery()
            item = next((i for i in g if i['id'] == m.group(1)), None)
            if item:
                try: (UPLOADS_DIR / item['filename']).unlink()
                except: pass
                write_gallery([i for i in g if i['id'] != m.group(1)])
            self.send_json({'ok': True})
        else: self.send_error(404)

    def send_json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args): pass  # silence logs

os.chdir(BASE_DIR)
ip = get_local_ip()
print(f"\n  Gallery running!")
print(f"  On this laptop: http://localhost:{PORT}")
print(f"  On your phone:  http://{ip}:{PORT}\n")
http.server.HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
