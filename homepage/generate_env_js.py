#!/usr/bin/env python3
"""Generate homepage/env.js from root .env.local (for static deploy without serve.py)."""

from __future__ import annotations

from pathlib import Path

from serve import ENV_LOCAL, build_env_js

OUT = Path(__file__).resolve().parent / "env.js"


def main() -> None:
    if not ENV_LOCAL.is_file():
        raise SystemExit(
            f"Missing {ENV_LOCAL}. Copy .env.local.example → .env.local and fill EmailJS IDs."
        )
    OUT.write_bytes(build_env_js())
    print(f"Wrote {OUT} from {ENV_LOCAL.name}")


if __name__ == "__main__":
    main()
