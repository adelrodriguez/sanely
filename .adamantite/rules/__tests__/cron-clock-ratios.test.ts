import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"
import rule from "../cron-clock-ratios.ts"

RuleTester.describe = (name, run) => {
  void describe(name, run)
}
RuleTester.it = (name, run) => {
  void it(name, run)
}
RuleTester.itOnly = (name, run) => {
  void it.only(name, run)
}

const cronSource = "/repo/packages/cron/src/lib/grammar/index.ts"

new RuleTester().run("cron-clock-ratios", rule, {
  invalid: [
    {
      code: "const cycle = 24",
      errors: [{ data: { constant: "HOURS_PER_DAY", value: "24" }, messageId: "clockRatio" }],
      filename: cronSource,
    },
    {
      code: "const isFullCycle = (value: number) => value === 60",
      errors: [{ data: { constant: "MINUTES_PER_HOUR", value: "60" }, messageId: "clockRatio" }],
      filename: cronSource,
    },
    {
      code: "const end = (hour: number) => (hour === 0 ? 24 : hour)",
      errors: [{ messageId: "clockRatio" }],
      filename: "/repo/packages/cron/src/lib/describe/index.ts",
    },
  ],
  valid: [
    {
      code: 'import { HOURS_PER_DAY } from "@sanely/core/time"\nconst cycle = HOURS_PER_DAY',
      filename: cronSource,
    },
    // A type position needs the literal, because a type cannot read a constant's value.
    {
      code: "type Hours = Enumerate<24>\ntype Full = N extends 60 ? true : false",
      filename: cronSource,
    },
    // Other numbers, such as the cron field bounds, are not clock ratios.
    { code: "const hour = [0, 23]\nconst minute = [0, 59]", filename: cronSource },
    // Tests and other packages may use the literals.
    {
      code: "const cycle = 24",
      filename: "/repo/packages/cron/src/lib/grammar/__tests__/index.test.ts",
    },
    { code: "const cycle = 24", filename: "/repo/packages/duration/src/lib/format/index.ts" },
  ],
})
