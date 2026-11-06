# Rate Limiting

This library counts how often an identity uses something and refuses use beyond a configured limit. The count holds across every application instance that shares a store.

## Language

**Limiter**:
A named definition of one limit: which store counts, which algorithm decides, and how to find the identity.
_Avoid_: Rule, policy, rate limiter (for the definition)

**Limiter factory**:
A function, bound to one store and shared settings, that defines limiters.
_Avoid_: Client, instance

**Store**:
The place that holds counts and applies an algorithm to them in one indivisible step.
_Avoid_: Driver, connector, backend, adapter

**Algorithm**:
The rule that decides whether a request fits: fixed window, sliding window, or token bucket.
_Avoid_: Strategy, limiter (for the algorithm)

**Identity**:
The value a limiter counts against, such as an IP address, a device, or a user. It can have several parts. The global identity, `null`, gives every request that uses it one shared count.
_Avoid_: Key (the key is the identity with the limiter's name in front), identifier, characteristic

**Cost**:
How many units one request spends.
_Avoid_: Rate, weight, requested tokens

**Capacity**:
The most units an identity can hold at one time.
_Avoid_: Max, max tokens

**Reset**:
The moment a denied request can succeed, or the end of the current window for an allowed request.

### Results

**Denial**:
A result in which the store or the cache refused the request.
_Avoid_: Block, rejection

**Store error**:
A result in which the store failed or did not answer in time. A store error is never a success, but the request may have been counted, because a command that timed out can still complete.
_Avoid_: Timeout result, error decision

**Dry run**:
A limiter mode that counts normally but reports a would-be denial instead of refusing.
_Avoid_: Shadow mode, log-only mode
