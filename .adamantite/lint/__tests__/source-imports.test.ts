import { RuleTester } from "adamantite/rules/testing"
import rule from "../source-imports.ts"
import { fixture } from "./fixtures.ts"

new RuleTester().run("source-imports", rule, {
  invalid: [
    {
      ...fixture("index.ts", ["lib/flag/index.ts"]),
      code: 'export { flag } from "./lib/flag"',
      errors: [{ messageId: "module" }],
      output: 'export { flag } from "#lib/flag/index.ts"',
    },
    {
      ...fixture("lib/flag/index.ts", ["lib/shared/errors.ts"]),
      code: 'import { Fault } from "../shared/errors"',
      errors: [{ messageId: "module" }],
      output: 'import { Fault } from "#lib/shared/errors.ts"',
    },
    {
      ...fixture("integrations/react/index.tsx", ["lib/flag/index.ts"]),
      code: 'export * from "../../lib/flag"',
      errors: [{ messageId: "module" }],
      output: 'export * from "#lib/flag/index.ts"',
    },
    {
      ...fixture("index.ts", ["lib/flag/index.ts"]),
      code: 'import { flag } from "#lib/flag"',
      errors: [{ messageId: "module" }],
      output: 'import { flag } from "#lib/flag/index.ts"',
    },
    {
      ...fixture("lib/flag/index.ts", ["lib/flag/decision.ts"]),
      code: 'import { decision } from "#lib/flag/decision.ts"',
      errors: [{ messageId: "module" }],
      output: 'import { decision } from "./decision.ts"',
    },
    {
      ...fixture("lib/execution/base.ts", ["lib/policies/options.ts"]),
      code: 'import type { Options } from "../policies/options"',
      errors: [{ messageId: "module" }],
      output: 'import type { Options } from "#lib/policies/options.ts"',
    },
    {
      ...fixture("index.ts", ["lib/flag/index.ts"]),
      code: 'await import("./lib/flag")',
      errors: [{ messageId: "module" }],
      output: 'await import("#lib/flag/index.ts")',
    },
  ],
  valid: [
    {
      ...fixture("index.ts", ["lib/flag/index.ts"]),
      code: 'export { flag } from "#lib/flag/index.ts"',
    },
    {
      ...fixture("lib/flag/index.ts", ["lib/flag/decision.ts"]),
      code: 'import { decision } from "./decision"',
    },
    {
      ...fixture("lib/flag/index.ts", ["lib/shared/errors.ts"]),
      code: "const example = 'import { Fault } from \"../shared/errors\"'",
    },
  ],
})
