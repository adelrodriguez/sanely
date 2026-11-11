import { RuleTester } from "adamantite/rules/testing"
import rule from "../time-option-names.ts"
import { fixture } from "./fixtures.ts"

const readsDuration = { dependencies: { "@sanely/duration": "workspace:^" } }
const source = (path = "lib/options/index.ts") => fixture(path, [], readsDuration)

new RuleTester().run("time-option-names", rule, {
  invalid: [
    {
      ...source(),
      code: "type Options = { timeoutMs?: number }",
      errors: [{ messageId: "unit" }],
    },
    {
      ...source(),
      code: "interface Cache { readonly ttlMs: number; pendingTtlSeconds?: number }",
      errors: [{ messageId: "unit" }, { messageId: "unit" }],
    },
    {
      ...source(),
      code: 'type Options = { "delayMinutes": number }',
      errors: [{ messageId: "unit" }],
    },
    {
      ...source(),
      code: "class TimeoutError extends Error { readonly timeoutMs = 0 }",
      errors: [{ messageId: "unit" }],
    },
  ],
  valid: [
    // A unit-free name holds milliseconds or a time expression.
    { ...source(), code: "type Options = { timeout?: number | string; ttl?: number }" },
    // A whole word is not a suffix, and a computed key has no fixed name.
    { ...source(), code: "type Parsed = { milliseconds: number; seconds: number }" },
    { ...source(), code: "type Options = { [key: string]: number; [timeoutMs]: number }" },
    // Tests can name fixtures after the values they hold.
    {
      ...fixture("lib/options/__tests__/index.test.ts", [], readsDuration),
      code: "type Fixture = { timeoutMs: number }",
    },
    // A package that does not read time expressions keeps its unit names.
    { ...fixture("lib/policies/options.ts"), code: "type Retry = { delayMs?: number }" },
    // Only a run-time dependency on duration applies the rule.
    {
      ...fixture("lib/options/index.ts", [], {
        devDependencies: { "@sanely/duration": "workspace:*" },
      }),
      code: "type Options = { timeoutMs?: number }",
    },
  ],
})
