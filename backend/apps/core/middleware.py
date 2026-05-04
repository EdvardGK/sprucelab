"""
Dev-only profiling middleware.

When DEBUG is on (or settings.PROFILE_QUERIES is True), responses to requests
that include ``?profile=1`` get extra headers describing what the request did:

  X-DB-Query-Count: 7
  X-DB-Query-Time-Ms: 23.4
  Server-Timing: db;dur=23.4

The Server-Timing header is read natively by Chrome/Firefox devtools (Network
tab → Timings panel), so this gives an at-a-glance view of DB cost on any
endpoint without standing up Silk or the debug toolbar.

Cost when not profiling: zero work — the early-out check is a single attribute
read on the request object.

Production safe by default: middleware is registered in MIDDLEWARE but the
profile gate is opt-in per-request via the query param, AND the whole feature
is disabled when DEBUG is False unless settings.PROFILE_QUERIES is explicitly
set. No timing data leaks to anonymous users in prod.
"""
from __future__ import annotations

import time

from django.conf import settings
from django.db import connection


class QueryCountProfilerMiddleware:
    """Adds X-DB-Query-Count / X-DB-Query-Time-Ms headers when ?profile=1."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.enabled = bool(getattr(settings, 'PROFILE_QUERIES', settings.DEBUG))

    def __call__(self, request):
        if not self.enabled or request.GET.get('profile') != '1':
            return self.get_response(request)

        # Snapshot query log boundary so we don't double-count nested middleware.
        queries_before = len(connection.queries)
        t0 = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        new_queries = connection.queries[queries_before:]
        db_time_ms = sum(float(q.get('time', 0.0)) for q in new_queries) * 1000.0

        response['X-DB-Query-Count'] = str(len(new_queries))
        response['X-DB-Query-Time-Ms'] = f'{db_time_ms:.2f}'
        response['X-Total-Time-Ms'] = f'{elapsed_ms:.2f}'
        response['Server-Timing'] = (
            f'db;desc="DB queries";dur={db_time_ms:.2f}, '
            f'total;desc="Total request";dur={elapsed_ms:.2f}'
        )
        return response
