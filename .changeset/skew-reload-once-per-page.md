---
"@sanely/skew": patch
---

Count several `reload()` calls in one page as one reload

The reload guard counted every `reload()` call. A user who clicked **Reload** three times before the page unloaded blocked the guard after two reloads that never landed, so the next click did nothing. The guard now records one request for each page load and target. Further calls for the same target reload the page without counting again.
