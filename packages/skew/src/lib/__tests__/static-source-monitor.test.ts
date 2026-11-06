import { describe, expect, it } from "vitest"
import { createStaticSource } from "#lib/protocol/static-source.ts"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"

describe("static deployment source with a deployment monitor", () => {
  it("can simulate a stale deployment", async () => {
    expect.assertions(2)

    const target = { id: "target" }
    const source = createStaticSource({ id: "running" }, target)
    const monitor = createDeploymentMonitor(source)

    const status = await monitor.check()

    expect(status.status).toBe("stale")
    expect(status.target).toBe(target)
  })
})
