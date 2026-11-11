import type { StandardSchemaV1 } from "@standard-schema/spec"
import { isRecord } from "./guards"

/**
 * The discriminated payload of a `ChannelError`, one variant per failure the library itself can
 * raise. Serializable by construction: the wire envelope ships it across boundaries verbatim and
 * rehydrates it on the other side.
 */
export type ChannelErrorDetail =
  | { code: "closed" }
  | { code: "internal" }
  | { code: "malformed-envelope" }
  | { code: "output-validation"; issues: readonly StandardSchemaV1.Issue[] }
  | { code: "timeout"; path: string; timeoutMs: number }
  | { code: "unknown-channel"; path: string }
  | { code: "validation"; issues: readonly StandardSchemaV1.Issue[] }

type Code = ChannelErrorDetail["code"]

type Guard<T> = (value: unknown) => value is T

type CodeSpec<Detail> = {
  /**
   * Whether the code reveals nothing about the server, so `toWire` and `connect` always let it
   * cross. The rest cross only when the `expose` policy accepts them.
   */
  exposed: boolean
  /**
   * One guard per field, which checks the field when a detail arrives over a wire.
   */
  fields: { [Name in Exclude<keyof Detail, "code">]-?: Guard<Detail[Name]> }
  message: (detail: Detail) => string
}

const isString = (value: unknown): value is string => typeof value === "string"

const isNumber = (value: unknown): value is number => typeof value === "number"

const joinIssues = ({ issues }: { issues: readonly StandardSchemaV1.Issue[] }): string =>
  issues.map((issue) => issue.message).join("; ")

/**
 * How the library handles each code: the wire parser, the field copy, the message, and whether it
 * always crosses a wire all come from here. The type demands one entry per code and one guard per
 * field, so the build fails when this table and `ChannelErrorDetail` disagree.
 */
const CODES: { [C in Code]: CodeSpec<Extract<ChannelErrorDetail, { code: C }>> } = {
  closed: { exposed: false, fields: {}, message: () => "Wire closed" },
  // Exposed so a relayed hidden failure passes through instead of reaching `onHidden` again.
  internal: { exposed: true, fields: {}, message: () => "Internal error" },
  "malformed-envelope": {
    exposed: false,
    fields: {},
    message: () => "Received a value that is not a WireResult envelope",
  },
  // The server's own data failed its schema, so its issues describe the server.
  "output-validation": { exposed: false, fields: { issues: isIssueList }, message: joinIssues },
  timeout: {
    exposed: false,
    fields: { path: isString, timeoutMs: isNumber },
    message: ({ path, timeoutMs }) => `Call to "${path}" timed out after ${timeoutMs}ms`,
  },
  "unknown-channel": {
    exposed: true,
    fields: { path: isString },
    message: ({ path }) => `Unknown channel: "${path}"`,
  },
  validation: { exposed: true, fields: { issues: isIssueList }, message: joinIssues },
}

// One detail's spec, read the way every code allows. Indexing the table by a union of codes yields
// a union of specs, whose `message` TypeScript cannot call with the matching detail.
type AnySpec = {
  exposed: boolean
  fields: Readonly<Record<string, Guard<unknown>>>
  message: (detail: ChannelErrorDetail) => string
}

function specOf(detailCode: Code): AnySpec {
  // Each entry's `message` accepts its own code's detail, which is what every caller passes
  return CODES[detailCode] as AnySpec
}

class ChannelBaseError extends Error {
  constructor(detail: ChannelErrorDetail, options?: ErrorOptions) {
    super(specOf(detail.code).message(detail), options)
    // oxlint-disable-next-line custom-error-definition -- instances present under the public name, ChannelError
    this.name = "ChannelError"
    // Copy the known fields only: a detail rehydrated from a peer must not
    // be able to overwrite `message`, `stack`, or `cause` on the instance.
    Object.assign(this, detailOf(detail))
  }
}

/**
 * The single error class for every failure the library raises — `code` discriminates, and each code
 * carries its own typed fields:
 *
 * - `validation` (`issues`) — a schema rejected the caller's input; the caller's fault
 * - `output-validation` (`issues`) — the resolver's result failed the leaf's `output` schema; the
 *   server's fault, so edges should not blame (or inform) the caller
 * - `unknown-channel` (`path`) — the path is not in the contract
 * - `timeout` (`path`, `timeoutMs`) — a `connect` call the peer never answered
 * - `closed` — the wire was torn down; the close reason is in `cause`
 * - `internal` — the other side failed and hid why (`toWire` and `connect` hide failures by default);
 *   the real error went to its `onHidden`
 * - `malformed-envelope` — `fromWire` received a value that is not a `WireResult` (a gateway error
 *   page, a proxy 502)
 *
 * `instanceof ChannelError` then `error.code === "..."` narrows the fields. Anything a resolver
 * throws is not wrapped: an error that is not a `ChannelError` came from application code.
 */
// oxlint-disable-next-line no-redeclare -- the type and the constructor below share the public name, like a class
export type ChannelError = ChannelBaseError & ChannelErrorDetail

// The base class assigns the detail's fields onto the instance; this cast is what lets the type
// system see them, making `code` narrow the per-code fields after an `instanceof` check.
export const ChannelError = ChannelBaseError as unknown as new (
  detail: ChannelErrorDetail,
  options?: ErrorOptions
) => ChannelError

/**
 * Whether a code always crosses a wire with its message and fields. See `CodeSpec.exposed`.
 */
export function isAlwaysExposed(detailCode: Code): boolean {
  return CODES[detailCode].exposed
}

/**
 * Recovers the serializable detail from an instance (or narrows a detail to its known fields) — the
 * wire envelope's half of the round trip `new ChannelError(detailOf(error))`.
 */
export function detailOf(detail: ChannelErrorDetail): ChannelErrorDetail {
  const copy: Record<string, unknown> = { code: detail.code }

  for (const name of Object.keys(specOf(detail.code).fields)) {
    copy[name] = Reflect.get(detail, name)
  }

  // The copy holds exactly the fields the table lists for this code
  return copy as ChannelErrorDetail
}

/**
 * Validates an untrusted value as a `ChannelErrorDetail` — a detail that arrives over a wire is
 * only as trustworthy as the peer. Returns `undefined` for an unknown code or mistyped fields.
 */
export function parseDetail(value: unknown): ChannelErrorDetail | undefined {
  if (!isRecord(value) || !isCode(value.code)) {
    return undefined
  }

  const guards = Object.entries(specOf(value.code).fields)

  if (!guards.every(([name, guard]) => guard(value[name]))) {
    return undefined
  }

  // Every field the table lists for this code passed its guard
  return detailOf(value as ChannelErrorDetail)
}

function isCode(value: unknown): value is Code {
  return typeof value === "string" && Object.hasOwn(CODES, value)
}

function isIssueList(value: unknown): value is readonly StandardSchemaV1.Issue[] {
  return Array.isArray(value) && everySlot(value, isIssue)
}

// The Standard Schema issue shape: a string `message` and an optional `path` of property keys or
// `{ key }` segments. Consumers walk `path` freely, so a malformed one must not get through.
function isIssue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  const { message, path } = value

  return (
    typeof message === "string"
    && (path === undefined || (Array.isArray(path) && everySlot(path, isPathSegment)))
  )
}

// `Array.prototype.every` skips empty slots, and structured clone (MessagePort, workers) preserves
// them, so `new Array(1)` would pass. Walk the indices instead, failing on the first hole — without
// copying: a compact sparse array can claim a huge `length`, and `Array.from` would allocate it all.
// A dense array is only as long as what the peer actually sent.
function everySlot(array: readonly unknown[], predicate: (value: unknown) => boolean): boolean {
  for (let index = 0; index < array.length; index += 1) {
    if (!(index in array) || !predicate(array[index])) {
      return false
    }
  }

  return true
}

function isPathSegment(value: unknown): boolean {
  if (isPropertyKey(value)) {
    return true
  }

  return isRecord(value) && isPropertyKey(value.key)
}

function isPropertyKey(value: unknown): value is PropertyKey {
  return typeof value === "string" || typeof value === "number" || typeof value === "symbol"
}
