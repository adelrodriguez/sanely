// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import type { Plugin } from "vite"
import { describe, expectTypeOf, it } from "vitest"
import type { NextConfigExport } from "#adapters/next/index.ts"
import type {
  CheckStatus,
  Deployment,
  DeploymentMonitor,
  DeploymentStatus,
  IsDeploymentCurrent,
  ReloadStatus,
} from "#index.ts"
import { withDeploymentCheck } from "#adapters/next/index.ts"
import { deploymentCheck } from "#adapters/vite/index.ts"
import { createDeploymentMonitor, createStaticSource } from "#index.ts"
import { useDeploymentStatus } from "#integrations/react/index.ts"

describe("DeploymentStatus", () => {
  it("has the three durable status values", () => {
    expectTypeOf<DeploymentStatus["status"]>().toEqualTypeOf<"current" | "stale" | "unknown">()
    expectTypeOf<CheckStatus>().toEqualTypeOf<"checking" | "idle">()
    expectTypeOf<ReloadStatus>().toEqualTypeOf<"blocked" | "ready" | "unprotected">()
  })

  it("has a target and a check time after a successful check", () => {
    const status = {} as DeploymentStatus
    if (status.status === "unknown") {
      expectTypeOf(status.target).toEqualTypeOf<null>()
      expectTypeOf(status.checkedAt).toEqualTypeOf<null>()
    } else {
      expectTypeOf(status.target).toEqualTypeOf<Deployment>()
      expectTypeOf(status.checkedAt).toEqualTypeOf<Date>()
    }
  })
})

describe("createDeploymentMonitor", () => {
  it("returns a monitor for a deployment source", () => {
    const deployment: Deployment = { id: "A" }
    const monitor = createDeploymentMonitor(createStaticSource(deployment, deployment))
    expectTypeOf(monitor).toEqualTypeOf<DeploymentMonitor>()
    expectTypeOf(monitor.getState()).toEqualTypeOf<DeploymentStatus>()
  })

  it("accepts an isCurrent comparison", () => {
    expectTypeOf<IsDeploymentCurrent>().toEqualTypeOf<
      (running: Deployment, target: Deployment) => boolean
    >()
  })
})

describe("useDeploymentStatus", () => {
  it("returns the deployment status", () => {
    expectTypeOf(useDeploymentStatus).returns.toEqualTypeOf<DeploymentStatus>()
  })
})

describe("adapters", () => {
  it("return a Vite plugin and a Next.js config", () => {
    expectTypeOf(deploymentCheck()).toEqualTypeOf<Plugin>()
    expectTypeOf(withDeploymentCheck({})).toExtend<NextConfigExport>()
  })
})
