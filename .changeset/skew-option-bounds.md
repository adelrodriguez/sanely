---
"@sanely/skew": minor
---

Reject a `checkTimeout` or `checkInterval` that no timer can wait for

`0`, a negative or fractional number, `NaN`, `Infinity`, and any length above 2147483647 ms, such as `"30d"`, made every check time out after 1 ms or made the monitor poll in a tight loop. `createDeploymentMonitor` now throws `InvalidOptionError`, with the `option` and the `value`, for these values and for a string that is not a time expression. A `checkInterval` from 1 to 9999 ms still rises to 10000 ms with a warning.
