# About flag evaluation

This page explains how `@sanely/flags` evaluates a flag: why flags are values, why an evaluation never fails, what runs in which order, and how evaluations share provider work.

## Flags are values in code

A flag definition holds a key, a default, and its variants. It does not hold a provider or an identity. Code reads a flag by passing the definition to a reader, as in `flags.get(theme)`, and not by a string key.

This follows the [flags-as-code principles](https://flags-sdk.dev/docs/principles/flags-as-code) of the Flags SDK. Each read site has the same shape. The default lives on the declaration, so it is the same at every read site. Your editor can find every read of a flag and jump to its declaration. A change of provider changes the reader, not the read sites.

Unlike the Flags SDK, a flag here is not a function that you call. A flag that held its provider would import the server's SDK into every module that reads it, so the server and the browser could not share one declaration. The reader holds the provider instead. Each runtime creates its own reader, and both read the same flag values. Tests pass a fake provider to a reader, with no global override.

## The package owns the lifecycle, and the provider owns the decision

Feature flag services differ in their SDKs, their identity models, and their bulk APIs. A provider adapts one service: `defineProvider` takes a function that decides one flag or several flags, and the provider's identity type comes from that function. The package owns everything around the provider: identity resolution, validation, timeouts, hooks, the store, coalescing, batches, and the fallback.

## Why an evaluation never fails

A feature flag decides which code path runs. If an evaluation threw, every read site would need its own error handling, and a provider outage would break features that have nothing to do with the flag. So every flag has a default, and every failure returns it: a missing identity, a provider error, a decision that does not fit the flag, a timeout, or a cancellation.

The cost is that a failure is silent unless you look for it. `details` reports the source of each value, and it carries a tagged error when the source is `"default"`. The `error` hook reports each failure in one place. Failures outside an evaluation's result, such as a hook or store failure, go to `onError`.

## Decisions have an explicit type

A provider decision is either `{ type: "boolean", value }` or `{ type: "variant", variant, payload? }`. The package checks the decision against the flag. A boolean flag rejects a variant decision, and a variant flag rejects a variant that is not in its list. Without the `type` field, the package would have to guess whether `"true"` is a boolean or a variant name. The decision is not the same thing as the returned value: a decision that fails validation returns the default.

## The lifecycle of one evaluation

An evaluation runs these steps in order:

1. Resolve the identity.
2. Run the `before` hooks.
3. Read the store.
4. On a miss, call the provider, or join a provider call that is already running for the same evaluation key.
5. Validate the decision, and parse its payload.
6. Write the decision to the store.
7. Run the `after` hooks, or the `error` hooks on a failure, and then the `finally` hooks.

The timeout covers steps 1 to 5. A read does not wait for the `after` and `finally` hooks, so an observer cannot add latency. For the same reason, they are not a place for work that must finish before a serverless runtime exits.

## Concurrent evaluations share provider work

Many components can ask for the same flag at the same time, such as ten components on one page. Without coalescing, each would call the provider. With coalescing, the first evaluation for an evaluation key is the leader: it calls the provider and writes the store. The others are followers: they attach to the leader's call and reuse its decision. Each evaluation still runs its own hooks, and keeps its own error, fallback, and cancellation path.

The evaluation key decides which evaluations can share. By default, it holds the provider's `name`, the flag key, the flag kind, the variants, and the type and value of `distinctId`. The type is part of the key, so `distinctId: 1` and `distinctId: "1"` do not share. When a decision depends on other identity fields, such as a plan, the default key would let two different identities share one decision. That is why the `key` option exists. The package never stores or coalesces an anonymous evaluation, because many visitors share one anonymous subject.

Coalescing changes how often the provider runs. If the provider logs an exposure, coalescing would log one exposure for many evaluations. Either turn coalescing off, or track exposures in an `after` hook, which runs once for each evaluation.

A batch adds one more level of sharing. The flags of a batch that need provider work in one tick join one flush round, and the round sends each flag key to the provider once.

## One attachment to provider changes

A reader attaches to the provider's `subscribe` function at most once at a time. One change broadcaster sends each notification to store invalidation and to every reader listener.

## Server rendering has one evaluator of record

When the server and the browser both evaluate a flag, they can disagree, and React reports a hydration mismatch. A snapshot avoids that. The server evaluates the flags and serializes their values for one identity. The browser's first render reads the same values without suspending. Later reads can go through a provider that calls the application's own endpoint, so only the server's SDK evaluates.

## React evaluations are promises in a cache

React Suspense needs the same promise on each render until it settles. So the React integration keeps evaluation promises in a cache, with one bucket for each list of flags. The buckets have a size limit and a lifetime. On the server, a request must not see the cached values of another request, so each `FlagsProvider` mount has its own cache, and the hooks refuse to run without one.
