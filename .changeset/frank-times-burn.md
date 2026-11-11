---
"@sanely/ratelimit": patch
---

Fix a fixed-window denial that reported negative units left after a limit was lowered

When a limit in use dropped below the units already spent in the current window, the memory store reported a negative `remaining`, and the Redis stores returned a store error in place of the denial. The denial now reports 0 units left on every store.
