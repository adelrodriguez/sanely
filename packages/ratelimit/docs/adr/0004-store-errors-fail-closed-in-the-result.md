# Store errors fail closed in the result

When the store fails or times out, `rateLimit` does not throw and does not consult a policy: it returns a store error, `{ success: false, reason: "storeError", error }`, with no counts. A store error does not undo the command: one that timed out can still complete, so the request may have been counted. Code that only checks `success` therefore refuses the request, which protects spending caps on paid endpoints. Applications that prefer to allow the request or to fall back to a local limiter do so in their own middleware, which already decides the response.

## Considered Options

- **A limiter option, `onStoreError: "deny" | "allow" | { fallback }`.** It mixes shapes, and a fallback hides that each instance counts separately, so the real cap becomes the limit times the number of instances.
- **A policy on the store.** One store serves limits that need different answers, such as a spending cap that must deny and a health check that should allow.
- **A fallback store with a cooldown.** It adds a second timeout that must stay shorter than the limiter's, and nothing enforces that.
- **Upstash and Arcjet fail open.** Upstash allows requests after its timeout and throws on other errors. Arcjet returns an `ERROR` decision that counts as allowed. Both suit abuse protection, where an outage should not take the application down. Neither suits a spending cap.

## Consequences

Placeholder counts are gone: the types force callers to check `reason` before reading `remaining`. A fallback, a fail-open route, or a cooldown can be added later without a breaking change.
