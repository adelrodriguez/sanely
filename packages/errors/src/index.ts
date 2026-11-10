/**
 * Base abstract fault class.
 *
 * Extend directly or use {@link Tagged} to define tagged subclasses.
 */
export { Fault } from "#lib/fault.ts"

/**
 * Type guard for Fault instances.
 *
 * Uses `instanceof Fault` and therefore is not cross-realm safe. Use serialization/deserialization
 * when crossing process/realm boundaries.
 */
export { isFault } from "#lib/fault.ts"

/**
 * Finds the first node in a fault's cause chain, head included, that is an instance of the given
 * class. Returns `undefined` for non-Fault values.
 *
 * Use `registry.findCause` to find a registered fault by tag.
 */
export { findCause } from "#lib/fault.ts"

/**
 * Factory for creating tagged Fault subclasses.
 *
 * The two calls allow the tag and field types to be inferred independently.
 *
 * @example
 *   ;```ts
 *   import * as Fault from "@sanely/errors"
 *
 *   class NotFoundError extends Fault.Tagged("NotFoundError")<{ resource: string }>() {}
 *   const error = new NotFoundError({ resource: "user" })
 *   ```
 */
export { Tagged } from "#lib/tagged.ts"

/**
 * Creates a fault registry from tagged constructors.
 *
 * Registries provide creation, wrapping, matching, and (de)serialization helpers scoped to the
 * registered fault union.
 *
 * @example
 *   ;```ts
 *   import * as Fault from "@sanely/errors"
 *
 *   class TimeoutError extends Fault.Tagged("TimeoutError")() {}
 *   const AppFault = Fault.registry({ TimeoutError })
 *
 *   const wrapped = AppFault.wrap(new Error("root")).as("TimeoutError")
 *   ```
 */
export { registry } from "#lib/registry.ts"

/**
 * Merges multiple fault registries into one.
 *
 * Throws `RegistryMergeConflictError` from `@sanely/errors/errors` when duplicate tags map to
 * different constructors.
 */
export { merge } from "#lib/registry.ts"

/**
 * Standalone union-driven tag matcher for a single tag.
 */
export { matchTag } from "#lib/match.ts"

/**
 * Standalone union-driven tag matcher using a handler map.
 */
export { matchTags } from "#lib/match.ts"

/**
 * Serializes any caught value to the wire format.
 *
 * Faults encode themselves; native `Error`s become `UnknownError` and any other thrown value
 * becomes `UnknownThrown`.
 */
export { toSerializable } from "#lib/fault.ts"

/**
 * Deserializes a generic fault from the wire format.
 *
 * Accepts any value and throws `InvalidPayloadError` when the envelope or any cause is malformed.
 * Use `registry.fromSerializable` when you want subclass reconstruction for registered tags.
 */
export { fromSerializable } from "#lib/reviver.ts"

/**
 * Type guard for wire payloads.
 *
 * Returns `true` exactly when `fromSerializable` accepts the value, because both use the same
 * check. Payload and `meta` values are not deep-validated.
 */
export { isSerializableFault } from "#lib/reviver.ts"
