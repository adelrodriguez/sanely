---
"@sanely/flags": minor
---

Reject an identity that the React flag cache cannot key when you pass it, instead of during render

The flag cache serializes the `identity` prop of `FlagsProvider`, and it threw a `TypeError` during render for a `Date`, a `bigint`, a `symbol`, or a class instance. The prop's type now rejects a named field of those types, so `identity={{ distinctId, signedUpAt: new Date() }}` fails to compile. Pass a serializable value instead, such as `signedUpAt.toISOString()`.
