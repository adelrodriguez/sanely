import { InvalidDecisionError } from "#lib/errors/index.ts"
import { byKind, type Flag } from "./index"

/**
 * A provider's answer for one flag. `payload` is the raw variant payload, before the flag's parser
 * runs.
 */
export type Decision =
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "variant"; readonly variant: string; readonly payload?: unknown }

/**
 * Where a successful evaluation got its decision.
 */
export type DecisionSource = "cache" | "provider"

export const decision = {
  boolean(value: boolean): Decision {
    return { type: "boolean", value }
  },
  variant(variant: string, payload?: unknown): Decision {
    return payload === undefined
      ? { type: "variant", variant }
      : { payload, type: "variant", variant }
  },
}

export function extractDecisionValue(decision: Decision): boolean | string {
  return decision.type === "variant" ? decision.variant : decision.value
}

function invalid(decision: unknown, reason: string): InvalidDecisionError {
  return new InvalidDecisionError({ decision, reason })
}

/**
 * Checks that a decision from a provider or a store fits the flag. Throws `InvalidDecisionError`.
 */
export function validateDecision(decision: unknown, flag: Flag): asserts decision is Decision {
  if (typeof decision !== "object" || decision === null) {
    throw invalid(decision, "expected an object")
  }
  const type: unknown = Reflect.get(decision, "type")
  if (type === "boolean" && typeof Reflect.get(decision, "value") !== "boolean") {
    throw invalid(decision, "a boolean decision needs a boolean value")
  }
  const variant: unknown = Reflect.get(decision, "variant")
  if (type === "variant" && typeof variant !== "string") {
    throw invalid(decision, "a variant decision needs a string variant")
  }
  if (type !== "boolean" && type !== "variant") {
    throw invalid(decision, 'type must be "boolean" or "variant"')
  }
  byKind(flag, {
    boolean: () => {
      if (type !== "boolean") {
        throw invalid(decision, `expected a boolean decision but received a ${type} decision`)
      }
    },
    variant: (variantFlag) => {
      if (type !== "variant") {
        throw invalid(decision, `expected a variant decision but received a ${type} decision`)
      }
      if (typeof variant !== "string" || !variantFlag.variants.includes(variant)) {
        throw invalid(decision, `the flag does not allow the variant "${String(variant)}"`)
      }
    },
  })
}

/**
 * Runs the flag's payload parser on a valid decision. Returns `undefined` when the decision has no
 * payload. Throws `InvalidDecisionError` when the parser throws.
 */
export function parsePayload(flag: Flag, decision: Decision): unknown {
  // A boolean flag carries no payload. A variant flag may have a parser.
  const parser = byKind<((payload: unknown) => unknown) | false | undefined>(flag, {
    boolean: () => false,
    variant: ({ payload }) => payload,
  })
  if (parser === false || decision.type !== "variant" || decision.payload === undefined) {
    return undefined
  }
  if (!parser) {
    return decision.payload
  }
  try {
    return parser(decision.payload)
  } catch (error) {
    throw new InvalidDecisionError(
      { decision, reason: "the payload parser rejected the payload" },
      { cause: error }
    )
  }
}
