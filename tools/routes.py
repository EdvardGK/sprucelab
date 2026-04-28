"""
Print the Django URL conf as a flat sorted list, one route per line.

Agent-friendly: stable output, grep-able, no extra packages.

Usage:
    cd backend && python ../tools/routes.py
    cd backend && python ../tools/routes.py --json
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def main() -> int:
    backend = Path(__file__).resolve().parent.parent / "backend"
    sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    import django  # noqa: E402
    django.setup()
    from django.urls import get_resolver  # noqa: E402

    def walk(resolver, prefix: str = "") -> list[str]:
        out: list[str] = []
        for u in resolver.url_patterns:
            pat = prefix + str(u.pattern)
            if hasattr(u, "url_patterns"):
                out.extend(walk(u, pat))
            else:
                out.append(pat)
        return out

    routes = sorted(set(walk(get_resolver())))
    if "--json" in sys.argv:
        json.dump(routes, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        for r in routes:
            print(r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
