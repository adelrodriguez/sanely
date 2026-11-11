import { describe, expect, it } from "vitest"
import {
  createDeploymentMonitor,
  fetchDescriptor,
  parseDescriptor,
  serializeDescriptor,
  TargetResolutionError,
} from "#index.ts"

describe("public API", () => {
  it("reports a stale deployment from a target resolver", async () => {
    expect.assertions(2)

    const target = { id: "target" }
    const monitor = createDeploymentMonitor({
      running: { id: "running" },
      target: () => Promise.resolve(target),
    })

    const status = await monitor.check()

    expect(status.status).toBe("stale")
    expect(status.target).toBe(target)
  })

  it("reads a descriptor that serializeDescriptor wrote", () => {
    expect.assertions(1)

    const deployment = { builtAt: new Date("2026-11-10T00:00:00.000Z"), id: "abc123" }

    expect(parseDescriptor(serializeDescriptor(deployment))).toStrictEqual(deployment)
  })

  it("uses one public error class for descriptor and target resolution failures", () => {
    expect.assertions(1)
    expect(() => parseDescriptor("not JSON")).toThrow(TargetResolutionError)
  })

  it("resolves a target from a descriptor URL", async () => {
    expect.assertions(1)

    const resolve = fetchDescriptor("/deployment.json", {
      fetch: () =>
        Promise.resolve(
          new Response('{"v":1,"id":"target"}', { headers: { "content-type": "application/json" } })
        ),
    })

    await expect(resolve(new AbortController().signal)).resolves.toStrictEqual({ id: "target" })
  })
})
