"""
Accounts app.

`STARTED_AT` is captured at import time and exposed as a process-uptime proxy
to the admin dashboard's System panel. Reading the difference from
`datetime.now(timezone.utc)` at request time gives "how long has this process
been alive" — a coarse signal that pairs with `git_sha` to tell the operator
when a deploy actually rolled.
"""

from datetime import datetime, timezone as _tz

STARTED_AT = datetime.now(_tz.utc)
