import { RuleTester } from "adamantite/rules/testing"
import rule from "../clock-ratios.ts"
import { fixture } from "./fixtures.ts"

const usesCore = { devDependencies: { "@sanely/core": "workspace:*" } }
const source = (path = "lib/schedule/rules.ts") => fixture(path, [], usesCore)

new RuleTester().run("clock-ratios", rule, {
  invalid: [
    { ...source(), code: "const cycle = 60", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const end = hour === 0 ? 24 : hour", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const seconds = ms / 1000", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const ttl = 5 * 60_000", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const day = 86_400_000", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const day = 3_600_000 * 2", errors: [{ messageId: "literal" }] },
    { ...source(), code: "const offset = -60", errors: [{ messageId: "literal" }] },
  ],
  valid: [
    // Other numbers are not clock ratios.
    { ...source(), code: "const hour = 12, day = 31, status = 404" },
    // A type can only spell a ratio as a literal.
    { ...source(), code: "type End = 24 | 0" },
    { ...source(), code: "type Offset = -24 | 0" },
    // Tests check the ratios against literal values on purpose.
    {
      ...fixture("lib/schedule/__tests__/rules.test.ts", [], usesCore),
      code: "expect(cycle).toBe(60)",
    },
    // Core defines the ratios.
    {
      ...fixture("lib/time/constants.ts", [], { name: "@sanely/core" }),
      code: "export const MINUTES_PER_HOUR = 60",
    },
    // A package without core cannot import the ratios.
    { ...fixture("lib/limiter/headers.ts"), code: "const seconds = ms / 1000" },
  ],
})
