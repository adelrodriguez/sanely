---
"@sanely/flags": minor
---

Read past the store with `fresh: true`, and make React `invalidate` and `clear()` do so

`useFlagCache().invalidate(flags)` and `clear()` dropped React's cached values, but the next evaluation read the reader's store, so a Refresh button showed the stored value again. A read now takes `{ fresh: true }`, which skips the store and any provider call in flight, asks the provider, and stores its decision. `invalidate` and `clear()` use it for the next evaluation of the flags they drop.
