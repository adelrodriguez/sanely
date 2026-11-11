---
"@sanely/rpc": patch
---

Fix `sendPort` never posting the port when called right after `await win.loadURL(...)`

Electron resolves `loadURL` while `webContents.isLoading()` is still true, so `sendPort` waited for a `did-finish-load` event that had already fired. `sendPort` now waits for `did-stop-loading`, the event that ends loading.
