import { defineRule } from "adamantite/rules"

// The clock ratios that `@sanely/core/time` owns, by the literal that spells them.
const CONSTANTS: ReadonlyMap<number, string> = new Map([
  [24, "HOURS_PER_DAY"],
  [60, "MINUTES_PER_HOUR"],
])

export default defineRule({
  createOnce(context) {
    let checksFile = false
    // A type cannot read a constant's value, so a literal inside a type stays.
    let typeLiteralDepth = 0

    return {
      Literal(node) {
        if (!checksFile || typeLiteralDepth > 0 || typeof node.value !== "number") return
        const constant = CONSTANTS.get(node.value)
        if (constant === undefined) return
        context.report({
          data: { constant, value: String(node.value) },
          messageId: "clockRatio",
          node,
        })
      },
      TSLiteralType() {
        typeLiteralDepth += 1
      },
      "TSLiteralType:exit"() {
        typeLiteralDepth -= 1
      },
      before() {
        const filename = context.filename.replaceAll("\\", "/")
        checksFile = filename.includes("/packages/cron/src/") && !filename.includes("/__tests__/")
        typeLiteralDepth = 0
      },
    }
  },
  meta: {
    docs: {
      description:
        "Read the clock ratios in cron's runtime code from @sanely/core/time instead of writing 24 or 60.",
    },
    messages: {
      clockRatio: "Use {{constant}} from @sanely/core/time instead of the literal {{value}}.",
    },
    schema: [],
    type: "problem",
  },
})
