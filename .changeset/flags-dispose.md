---
"@sanely/flags": minor
---

Dispose a reader with `flags.dispose()` or `using flags = createFlags(...)`

A reader attached a listener to its provider on its first identified read and never removed it, so a server that made one reader per request kept every reader alive and ran every one of them on each change notification. Readers now have `dispose()`, also available through `using`, which drops the reader's decision memory and detaches the provider. If the provider's detach function throws, `dispose()` rethrows the error after the decision memory is gone. Create one reader for the process, or dispose a reader that you make for one request.
