import assert from "node:assert/strict"
import * as core from "@sanely/skew"
import { DeploymentScript, GET, descriptorHandler, withDeploymentCheck } from "@sanely/skew/next"
import { useDeploymentStatus } from "@sanely/skew/react"
import { deploymentCheck } from "@sanely/skew/vite"

// The root exports exactly these values. A new export is a public API decision.
assert.deepEqual(Object.keys(core).toSorted(), [
  "TargetResolutionError",
  "createDeploymentMonitor",
  "fetchDescriptor",
  "parseDescriptor",
  "serializeDescriptor",
])

const runtimeExports = {
  DeploymentScript,
  GET,
  ...core,
  deploymentCheck,
  descriptorHandler,
  useDeploymentStatus,
  withDeploymentCheck,
}

for (const [name, exportedValue] of Object.entries(runtimeExports)) {
  assert.equal(typeof exportedValue, "function", `${name} must be a function export`)
}

// `@sanely/duration` resolves from the built package, and reads a time expression.
assert.throws(() => core.createDeploymentMonitor({ checkTimeout: "soon" }), {
  name: "InvalidTimeExpressionError",
})

// A monitor resolves a stale target from its options.
const monitor = core.createDeploymentMonitor({
  running: { id: "running" },
  target: () => Promise.resolve({ id: "target" }),
})
const state = await monitor.check()
assert.equal(state.status, "stale")
assert.equal(state.target?.id, "target")
