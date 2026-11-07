# About gate evaluation

This page explains how `@sanely/flags` evaluates a gate: why an evaluation never fails, what runs in which order, and how evaluations share provider work.

## The package owns the lifecycle, and you own the provider

Feature flag providers differ in their SDKs, their identity models, and their batch APIs. The package does not try to wrap each SDK. You supply two functions: `identify` returns the subject, and `decide` returns a decision for one flag. The package owns everything around those functions: validation, timeouts, hooks, the cache, coalescing, batches, and the fallback. So one gate API works with LaunchDarkly, PostHog, or your own service, and a change of provider changes only `decide`.

## Why an evaluation never fails

A feature flag decides which code path runs. If the evaluation threw, every call site would need its own error handling, and a provider outage would break features that have nothing to do with the flag. So every gate has a `defaultValue`, and every failure returns it: an identity that is missing, a provider error, a decision of the wrong type, a variant that the gate does not allow, a timeout, or a cancellation.

The cost is that a failure is silent unless you look for it. `details()` tells you the source of each value, and it carries the error when the source is `"default"`. The `error` hook reports each failure in one place.

## Decisions have an explicit type

A provider decision is either `{ type: "boolean", value }` or `{ type: "variant", variant, payload? }`. The package checks the decision against the shape of the gate. A boolean gate rejects a variant decision, and a variant gate rejects a variant that is not in its list. Without the `type` field, the package would have to guess whether `"true"` is a boolean or a variant name. The decision is not the same thing as the returned value: a decision that fails validation returns the default.

## The lifecycle of one evaluation

An evaluation runs these steps in order:

1. Resolve the identity.
2. Run the `before` hooks.
3. Read the cache.
4. On a miss, call the provider, or join a provider call that is already running for the same key.
5. Validate the decision and commit it.
6. Write the decision to the cache.
7. Run the `after` hooks, or the `error` hooks on a failure, and then the `finally` hooks.

The timeout covers steps 1 to 5. The evaluator does not wait for the `after` and `finally` hooks, so an observer cannot add latency. For the same reason, they are not a place for work that must finish before a serverless runtime exits.

Hooks are observers. A hook that throws goes to `onHookError`, and the evaluation goes on with the same result.

## Concurrent evaluations share provider work

Many components can ask for the same flag at the same time, such as ten components that render on one page. Without coalescing, each would call the provider. With coalescing, the first evaluation for an evaluation key is the leader: it calls the provider and writes the cache. The others are followers: they attach to the call of the leader and reuse its decision. Each evaluation still runs its own hooks, and keeps its own error, fallback, and cancellation path.

The evaluation key decides which evaluations can share. By default, it holds the flag key, the gate shape, and the type and value of `distinctId`. The type is part of the key, so `distinctId: 1` and `distinctId: "1"` do not share. When a provider decision depends on other identity fields, such as a plan, the default key would let two different identities share one decision. That is why `evaluationKey` exists. The package never caches or coalesces an anonymous evaluation.

Coalescing changes how often `decide` runs. If `decide` logs an exposure, coalescing would log one exposure for many evaluations. Either turn coalescing off, or move exposure tracking to an `after` hook, which runs once for each evaluation.

## One attachment to provider changes

A factory attaches to the `subscribe` function of the provider at most once at a time. One change broadcaster sends each notification to cache invalidation and to every `changes` listener.

## React evaluations are promises in a cache

React Suspense needs the same promise on each render until it settles. So the React integration keeps evaluation promises in a cache, with one bucket for each evaluator and each batch. The buckets have a size limit and a lifetime. On the server, each request must not see the cached values of another request, so each mount of `GateProvider` without a `cache` prop creates its own cache.
