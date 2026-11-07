import { RunBuilder } from "#lib/builder/index.ts"

const root = new RunBuilder()

export const all: RunBuilder["all"] = root.all.bind(root)
export const allSettled: RunBuilder["allSettled"] = root.allSettled.bind(root)
export const flow: RunBuilder["flow"] = root.flow.bind(root)
export const retry: RunBuilder["retry"] = root.retry.bind(root)
export const run: RunBuilder["run"] = root.run.bind(root)
export const runSync: RunBuilder["runSync"] = root.runSync.bind(root)
export const signal: RunBuilder["signal"] = root.signal.bind(root)
export const timeout: RunBuilder["timeout"] = root.timeout.bind(root)
export const wrap: RunBuilder["wrap"] = root.wrap.bind(root)

export { disposer } from "#lib/disposal/index.ts"
export { driveGen as gen } from "#lib/composition/index.ts"

export { retryOptions } from "./lib/policies/retry"
