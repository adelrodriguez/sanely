// Compile-time checks only: `pnpm run check` enforces this file, and Vitest never runs it.
import type { Plugin } from "vite"
import { describe, expectTypeOf, it } from "vitest"
import type { NextConfigExport } from "#adapters/next/index.ts"
import type {
  Deployment,
  DeploymentMonitor,
  DeploymentMonitorOptions,
  DeploymentStatus,
  TargetResolutionErrorReason,
  TargetResolver,
} from "#index.ts"
import { withDeploymentCheck } from "#adapters/next/index.ts"
import { deploymentCheck } from "#adapters/vite/index.ts"
import { createDeploymentMonitor, fetchDescriptor } from "#index.ts"
import { useDeploymentStatus } from "#integrations/react/index.ts"

describe("DeploymentStatus", () => {
  it("has the three durable status values", () => {
    expectTypeOf<DeploymentStatus["status"]>().toEqualTypeOf<"current" | "stale" | "unknown">()
    expectTypeOf<DeploymentStatus["checkStatus"]>().toEqualTypeOf<"checking" | "idle">()
    expectTypeOf<DeploymentStatus["reloadStatus"]>().toEqualTypeOf<
      "blocked" | "ready" | "unprotected"
    >()
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
  it("reads the embed without options", () => {
    const monitor = createDeploymentMonitor()
    expectTypeOf(monitor).toEqualTypeOf<DeploymentMonitor>()
    expectTypeOf(monitor.getState()).toEqualTypeOf<DeploymentStatus>()
  })

  it("takes a descriptor URL or a target resolver", () => {
    createDeploymentMonitor({ target: "https://deployments.example.com/current.json" })
    createDeploymentMonitor({
      target: fetchDescriptor("/current.json", { credentials: "include" }),
    })
    createDeploymentMonitor({
      running: { id: "running" },
      target: () => Promise.resolve({ id: "target" }),
    })
    expectTypeOf(fetchDescriptor("/current.json")).toEqualTypeOf<TargetResolver>()
    expectTypeOf<TargetResolver>().toEqualTypeOf<(signal: AbortSignal) => Promise<Deployment>>()
  })

  it("takes the comparison and the schedule", () => {
    createDeploymentMonitor({
      checkOnReconnect: false,
      checkOnSubscribe: false,
      checkOnVisible: false,
      isCurrent: (running, target) => running.id === target.id,
    })
    expectTypeOf<DeploymentMonitorOptions["isCurrent"]>().toEqualTypeOf<
      ((running: Deployment, target: Deployment) => boolean) | undefined
    >()
  })

  it("has no lifecycle method and takes no subscriber options", () => {
    const monitor = createDeploymentMonitor()
    // The last unsubscribe stops a monitor, so it has no destroy().
    expectTypeOf<DeploymentMonitor>().not.toHaveProperty("destroy")
    // @ts-expect-error -- the schedule belongs to the monitor, not to each subscriber.
    monitor.subscribe(() => null, { checkInterval: "5m" })
    // @ts-expect-error -- subscribers share the monitor's comparison.
    monitor.subscribe(() => null, { isCurrent: () => false })
  })

  it("rejects a source object", () => {
    // @ts-expect-error -- the running deployment comes from the embed or from options.running.
    createDeploymentMonitor({ resolveTarget: () => Promise.resolve({ id: "target" }) })
  })
})

describe("TargetResolutionError", () => {
  it("names a timeout", () => {
    expectTypeOf<"timeout">().toExtend<TargetResolutionErrorReason>()
  })
})

describe("useDeploymentStatus", () => {
  it("takes an optional monitor and returns the deployment status", () => {
    useDeploymentStatus()
    useDeploymentStatus(createDeploymentMonitor())
    expectTypeOf(useDeploymentStatus).returns.toEqualTypeOf<DeploymentStatus>()
  })

  it("takes no options", () => {
    // @ts-expect-error -- options belong to createDeploymentMonitor.
    useDeploymentStatus({ checkInterval: "5m" })
  })
})

describe("durations", () => {
  it("take milliseconds or a time expression", () => {
    createDeploymentMonitor({ checkInterval: "5m", checkTimeout: "10s" })
    createDeploymentMonitor({ checkInterval: 300_000, checkTimeout: 10_000 })
    createDeploymentMonitor({ checkInterval: "1 minute" })
  })

  it("reject an invalid time expression literal", () => {
    // @ts-expect-error -- "M" is ambiguous between minutes and months.
    createDeploymentMonitor({ checkTimeout: "1M" })
    // @ts-expect-error -- a time expression starts with a number.
    createDeploymentMonitor({ checkInterval: "soon" })
    // @ts-expect-error -- a compound expression needs parse from @sanely/duration.
    createDeploymentMonitor({ checkInterval: "1m 30s" })
  })
})

describe("adapters", () => {
  it("return a Vite plugin and a Next.js config", () => {
    expectTypeOf(deploymentCheck()).toEqualTypeOf<Plugin>()
    expectTypeOf(withDeploymentCheck({})).toExtend<NextConfigExport>()
  })
})
