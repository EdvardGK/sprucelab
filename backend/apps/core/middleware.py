"""
Request-timing + DB-profiling middleware.

Always emits a ``Server-Timing: total;dur=X`` header on every response
(cost: one ``perf_counter`` delta per request). That alone is enough to
read end-to-end server processing time from Chrome/Firefox devtools'
Network → Timings panel and decompose the wire vs server portion of any
endpoint's latency.

Opt-in DB breakdown: when the request URL has ``?profile=1`` AND either
``DEBUG`` is on or ``settings.PROFILE_QUERIES`` is True, additional
``X-DB-Query-Count`` / ``X-DB-Query-Time-Ms`` / ``Server-Timing: db;…``
fields are added. DB profiling requires ``connection.queries`` to be
populated, which Django only does under ``DEBUG`` or when
``connection.force_debug_cursor`` is set, so the opt-in gate exists for
correctness, not safety.

No timing data leaks anything sensitive — Server-Timing is a public,
spec'd response header consumed by browser devtools.
"""
from __future__ import annotations

import time

from django.conf import settings
from django.db import connection


class QueryCountProfilerMiddleware:
    """Emit Server-Timing on every response; DB breakdown when ?profile=1."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.db_profile_enabled = bool(
            getattr(settings, 'PROFILE_QUERIES', settings.DEBUG)
        )

    def __call__(self, request):
        want_db_profile = (
            self.db_profile_enabled and request.GET.get('profile') == '1'
        )

        queries_before = len(connection.queries) if want_db_profile else 0
        t0 = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        if want_db_profile:
            new_queries = connection.queries[queries_before:]
            db_time_ms = sum(float(q.get('time', 0.0)) for q in new_queries) * 1000.0
            response['X-DB-Query-Count'] = str(len(new_queries))
            response['X-DB-Query-Time-Ms'] = f'{db_time_ms:.2f}'
            response['X-Total-Time-Ms'] = f'{elapsed_ms:.2f}'
            response['Server-Timing'] = (
                f'db;desc="DB queries";dur={db_time_ms:.2f}, '
                f'total;desc="Total request";dur={elapsed_ms:.2f}'
            )
        else:
            response['Server-Timing'] = f'total;dur={elapsed_ms:.2f}'

        return response
