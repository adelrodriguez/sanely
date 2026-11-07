import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"
import rule from "../package-structure.ts"
import { fixture } from "./fixtures.ts"

RuleTester.describe = (name, run) => {
  void describe(name, run)
}
RuleTester.it = (name, run) => {
  void it(name, run)
}
RuleTester.itOnly = (name, run) => {
  void it.only(name, run)
}

new RuleTester().run("package-structure", rule, {
  invalid: [
    { ...fixture("lib/flag/flag.ts"), errors: [{ messageId: "main" }] },
    { ...fixture("integrations/react/react.tsx"), errors: [{ messageId: "main" }] },
    { ...fixture("lib/flag/decision.test.ts"), errors: [{ messageId: "colocate" }] },
    {
      ...fixture("lib/__tests__/retry.test.ts", ["lib/policies/retry.ts"]),
      errors: [{ messageId: "owner" }],
    },
    {
      ...fixture("lib/react/__tests__/other.test.tsx", ["lib/react/index.tsx"]),
      errors: [{ messageId: "owner" }],
    },
    { ...fixture("lib/utility.ts", ["lib/flag/index.ts"]), errors: [{ messageId: "domain" }] },
    { ...fixture("factory.ts"), errors: [{ messageId: "publicEntry" }] },
  ],
  valid: [
    fixture("index.ts"),
    fixture("errors.ts"),
    fixture("lib/fault.ts"),
    fixture("lib/__tests__/fault.test.ts", ["lib/fault.ts"]),
    fixture("lib/flag/index.ts"),
    fixture("lib/flag/__tests__/index.test.ts", ["lib/flag/index.ts"]),
    fixture("integrations/react/__tests__/index.test.tsx", ["integrations/react/index.tsx"]),
    fixture("lib/flag/__tests__/helpers.ts"),
    fixture("__tests__/lifecycle.test.ts"),
    fixture("__tests__/types.test-d.ts"),
  ],
})
