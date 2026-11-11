---
"@sanely/flags": patch
---

Fix cases where a reader or `FlagsProvider` silently returned a wrong or stale flag value

- A decision whose payload the flag's parser rejects is no longer stored. A stored one is reported as `validate`, deleted, and sent to the provider.
- A coalesced provider call stores its decision even when the evaluation that started it left first.
- `identifyWith` and `for` reject an identity whose `distinctId` is not a non-empty string or a finite number, so such identities never share decisions.
- The default evaluation key now starts with the provider's `name`, so readers with different providers can share one store. Entries stored under the old key are missed once.
- A change notification that is not an array of flag keys counts as a change to every flag.
- `useFlagCache().invalidate` and `clear()` keep re-rendering readers that React subscribed again, as in strict mode.
- `FlagsProvider` ignores a snapshot or snapshot entry that does not parse, evaluates entries that the server made without an identity, and keeps dropped snapshot values dropped when it remounts.
