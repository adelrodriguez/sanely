---
"@sanely/skew": patch
---

Count several `reload()` calls in one page as one reload, and start the cooldown at the last reload

The reload guard counted every `reload()` call. A user who clicked **Reload** three times before the page unloaded blocked the guard after two reloads that never landed, so the next click did nothing. The guard now records one request for each page load and target. Further calls for the same target reload the page without counting again.

A blocked `reload()` also restarted the 10-minute cooldown, so a user who kept clicking **Reload** stayed blocked. A blocked request now leaves the record unchanged, and the cooldown runs from the last reload.
