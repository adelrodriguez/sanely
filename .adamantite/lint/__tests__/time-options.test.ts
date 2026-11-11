import { RuleTester } from "adamantite/rules/testing"
import rule from "../time-options.ts"
import { fixture } from "./fixtures.ts"

const usesDuration = { dependencies: { "@sanely/duration": "workspace:^" } }
const source = (path = "lib/runtime/monitor.ts") => fixture(path, [], usesDuration)
const bareNumber = [{ messageId: "bareNumber" }]

new RuleTester().run("time-options", rule, {
  invalid: [
    {
      ...source(),
      code: "export interface MonitorOptions { readonly checkTimeout?: number }",
      errors: bareNumber,
    },
    {
      ...source(),
      code: "export type WindowOptions = { readonly limit: number; readonly window: number }",
      errors: bareNumber,
    },
    // A property inside an intersection still belongs to the options type.
    {
      ...source(),
      code: "type LimiterSettings = Base & { readonly timeout?: number }",
      errors: bareNumber,
    },
    // A nested group of options still takes input.
    {
      ...source(),
      code: "interface RetryOptions { readonly retry: { readonly delay: number } }",
      errors: bareNumber,
    },
    {
      ...source(),
      code: "interface RetryOptions { interval: number; retryDelay: number; ttl: number }",
      errors: [...bareNumber, ...bareNumber, ...bareNumber],
    },
  ],
  valid: [
    // The option already takes a time expression.
    {
      ...source(),
      code: "export interface MonitorOptions<T extends string = never> { readonly checkTimeout?: number | ValidateTimeExpression<T> }",
    },
    // An internal option takes a string that a public option already checked.
    { ...source(), code: "interface InternalOptions { readonly checkTimeout?: number | string }" },
    // A resolved value is plain milliseconds.
    { ...source(), code: "export type FixedWindow = { readonly window: number }" },
    { ...source(), code: "export interface DeploymentSchedule { readonly checkInterval: number }" },
    // A callback receives data, so its argument is not an option.
    {
      ...source(),
      code: "interface RetryOptions { readonly onResult: (result: { readonly duration: number }) => void }",
    },
    {
      ...source(),
      code: "interface RetryOptions { onResult(result: { readonly duration: number }): void }",
    },
    // Other numeric options do not hold a length of time.
    { ...source(), code: "export type WindowOptions = { readonly limit: number }" },
    // Tests write milliseconds on purpose.
    {
      ...fixture("lib/runtime/__tests__/monitor.test.ts", [], usesDuration),
      code: "interface TestOptions { readonly checkTimeout?: number }",
    },
    // A package without duration cannot read time expressions.
    {
      ...fixture("lib/runtime/monitor.ts"),
      code: "export interface MonitorOptions { readonly checkTimeout?: number }",
    },
  ],
})
