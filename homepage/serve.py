#!/usr/bin/env python3
"""
Tile Craft local server
- Serves project root (homepage + assets)
- Live-scans assets for /homepage/catalog.json and /api/catalog
- Background watcher keeps catalog.json fresh so new folders appear automatically
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from generate_catalog import ASSETS, OUT, scan_catalog, write_catalog

ROOT = Path(__file__).resolve().parent.parent  # QtProject/Homepage
ENV_LOCAL = ROOT / ".env.local"


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


class TileCraftHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_catalog(self):
        cats = scan_catalog()
        write_catalog(cats)
        body = json.dumps(
            {
                "generatedAt": datetime.now().isoformat(timespec="seconds"),
                "assetRoot": "../assets",
                "categories": cats,
            },
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
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

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/homepage/catalog.json", "/catalog.json", "/api/catalog"):
            self._send_catalog()
            return

        if path in ("/homepage/env.js", "/env.js"):
            self._send_env_js()
            return

        if path in ("/", "/homepage", "/homepage/"):
            try:
                write_catalog()
            except Exception:
                pass
            self.path = "/homepage/index.html"

        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    parser = argparse.ArgumentParser(description="Tile Craft homepage server")
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
    print(f"Tile Craft -> http://{args.host}:{args.port}/homepage/")
    print("Watching assets/ - new category folders appear in NAV automatically.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
