import assert from "node:assert/strict"
import {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  TargetResolutionError,
  createDeploymentMonitor,
  createEmbeddedSource,
  createHttpSource,
  createStaticSource,
  getDefaultMonitor,
  getMonitor,
  parseDescriptor,
  readEmbed,
  serializeDescriptor,
} from "@sanely/skew"
import { DeploymentScript, GET, descriptorHandler, withDeploymentCheck } from "@sanely/skew/next"
import { useDeploymentStatus } from "@sanely/skew/react"
import { deploymentCheck } from "@sanely/skew/vite"

const runtimeExports = {
  DeploymentScript,
  GET,
  TargetResolutionError,
  createDeploymentMonitor,
  createEmbeddedSource,
  createHttpSource,
  createStaticSource,
  deploymentCheck,
  descriptorHandler,
  getDefaultMonitor,
  getMonitor,
  parseDescriptor,
  readEmbed,
  serializeDescriptor,
  useDeploymentStatus,
  withDeploymentCheck,
}

for (const [name, exportedValue] of Object.entries(runtimeExports)) {
  assert.equal(typeof exportedValue, "function", `${name} must be a function export`)
}

assert.equal(typeof DEFAULT_DESCRIPTOR_ENDPOINT, "string")
