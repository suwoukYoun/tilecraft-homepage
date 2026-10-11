#!/usr/bin/env python3
"""
Tile Craft local server
- Serves project root (site + assets)
- Live-scans assets for /catalog.json and /api/catalog
- Background watcher keeps catalog.json fresh so new folders appear automatically
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import threading
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from generate_catalog import ASSETS, OUT, write_catalog

ROOT = Path(__file__).resolve().parent  # QtProject/Homepage
ENV_LOCAL = ROOT / ".env.local"
CONSULT_DIR = ROOT / "private"
CONSULT_FILE = CONSULT_DIR / "consultations.csv"
CONSULT_LOCK = threading.Lock()
CONSULT_FIELDS = [
    "recordedAt",
    "space",
    "spaceNote",
    "widthM",
    "heightM",
    "style",
    "artwork",
    "note",
    "email",
    "referenceFile",
    "launchConfirmed",
]


def load_env_local(path: Path = ENV_LOCAL) -> dict[str, str]:
    """Parse KEY=VALUE pairs from .env.local (no secrets logged)."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


def build_env_js() -> bytes:
    env = load_env_local()
    public_key = env.get("EMAILJS_PUBLIC_KEY", "")
    service_id = env.get("EMAILJS_SERVICE_ID", "")
    template_id = env.get("EMAILJS_TEMPLATE_ID", "")

    def esc(value: str) -> str:
        return (
            value.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "")
        )

    js = (
        "/* Generated from .env.local — do not commit */\n"
        "window.__EMAILJS__ = {\n"
        f"  publicKey: '{esc(public_key)}',\n"
        f"  serviceId: '{esc(service_id)}',\n"
        f"  templateId: '{esc(template_id)}'\n"
        "};\n"
    )
    return js.encode("utf-8")


def assets_fingerprint() -> str:
    """Cheap change detector for assets tree."""
    if not ASSETS.is_dir():
        return ""
    parts: list[str] = []
    for path in ASSETS.rglob("*"):
        try:
            st = path.stat()
            parts.append(f"{path.relative_to(ASSETS)}:{st.st_mtime_ns}:{st.st_size}")
        except OSError:
            continue
    return str(hash(tuple(parts)))


def watch_assets(interval: float = 2.0) -> None:
    last = None
    while True:
        try:
            fp = assets_fingerprint()
            if fp != last:
                write_catalog()
                last = fp
                print(f"[catalog] refreshed → {OUT.name}", flush=True)
        except Exception as exc:
            print(f"[catalog] watch error: {exc}", flush=True)
        time.sleep(interval)


def clip_field(value, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit]


def append_consultation(payload: dict) -> None:
    row = {
        "recordedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "space": clip_field(payload.get("space"), 40),
        "spaceNote": clip_field(payload.get("spaceNote"), 80),
        "widthM": clip_field(payload.get("widthM"), 12),
        "heightM": clip_field(payload.get("heightM"), 12),
        "style": clip_field(payload.get("style"), 120),
        "artwork": clip_field(payload.get("artwork"), 120),
        "note": clip_field(payload.get("note"), 140),
        "email": clip_field(payload.get("email"), 120),
        "referenceFile": clip_field(payload.get("referenceFile"), 180),
        "launchConfirmed": "예" if payload.get("launchConfirmed") else "아니오",
    }
    if not row["space"] or not row["widthM"] or not row["heightM"] or not row["style"] or "@" not in row["email"]:
        raise ValueError("incomplete consultation")
    CONSULT_DIR.mkdir(exist_ok=True)
    with CONSULT_LOCK:
        new_file = not CONSULT_FILE.exists()
        with CONSULT_FILE.open("a", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CONSULT_FIELDS)
            if new_file:
                writer.writeheader()
            writer.writerow(row)


class TileCraftHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_catalog(self):
        payload = write_catalog()
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_env_js(self):
        body = build_env_js()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_plain(self, path: Path):
        if not path.is_file():
            self.send_error(404, "File not found")
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/catalog.json", "/api/catalog"):
            self._send_catalog()
            return

        if path == "/env.js":
            self._send_env_js()
            return

        if path == "/robots.txt":
            self._send_plain(ROOT / "robots.txt")
            return

        if path == "/sitemap.xml":
            sitemap = ROOT / "sitemap.xml"
            if not sitemap.is_file():
                self.send_error(404, "File not found")
                return
            body = sitemap.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path.startswith("/private"):
            self.send_error(404, "File not found")
            return

        if path in ("/", "/index.html"):
            try:
                write_catalog()
            except Exception:
                pass

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/consultations":
            self.send_error(404, "File not found")
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > 8000:
            self.send_error(400, "Bad request")
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("not an object")
            append_consultation(payload)
        except Exception as exc:
            print(f"[consultation] rejected: {exc}", flush=True)
            self.send_error(400, "Bad request")
            return
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    parser = argparse.ArgumentParser(description="Tile Craft local server")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    write_catalog()
    threading.Thread(target=watch_assets, kwargs={"interval": 2.0}, daemon=True).start()

    if ENV_LOCAL.is_file():
        print(f"[emailjs] loaded keys from {ENV_LOCAL.name}")
    else:
        print(f"[emailjs] missing {ENV_LOCAL.name} — copy .env.local.example and fill EmailJS IDs")

    httpd = ThreadingHTTPServer((args.host, args.port), TileCraftHandler)
    print(f"Tile Craft -> http://{args.host}:{args.port}/")
    print("Watching assets/ - new category folders appear in NAV automatically.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
