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
import { CrispenScript, GET, crispenPagesHandler, withCrispen } from "@sanely/skew/next"
import { useDeploymentStatus } from "@sanely/skew/react"
import { crispen } from "@sanely/skew/vite"

const runtimeExports = {
  CrispenScript,
  GET,
  TargetResolutionError,
  createDeploymentMonitor,
  createEmbeddedSource,
  createHttpSource,
  createStaticSource,
  crispen,
  crispenPagesHandler,
  getDefaultMonitor,
  getMonitor,
  parseDescriptor,
  readEmbed,
  serializeDescriptor,
  useDeploymentStatus,
  withCrispen,
}

for (const [name, exportedValue] of Object.entries(runtimeExports)) {
  assert.equal(typeof exportedValue, "function", `${name} must be a function export`)
}

assert.equal(typeof DEFAULT_DESCRIPTOR_ENDPOINT, "string")
