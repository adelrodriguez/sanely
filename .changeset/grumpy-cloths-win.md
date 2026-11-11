---
"@sanely/try": patch
---

Keep a `timeout` deadline steady when the system clock changes

A deadline now counts the time that passes on the monotonic clock. An NTP correction or a manual clock change used to end a `timeout` run early with a `TimeoutError`, or let it run late.
