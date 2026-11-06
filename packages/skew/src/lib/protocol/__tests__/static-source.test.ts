import { describe, expect, it } from "vitest"
import { createStaticSource } from "#lib/protocol/static-source.ts"

const controller = new AbortController()

describe("static deployment source", () => {
  it("always resolves the configured target", async () => {
    expect.assertions(3)

    const running = { id: "running" }
    const target = { id: "target" }
    const source = createStaticSource(running, target)

    expect(source.running).toBe(running)
    await expect(source.resolveTarget(controller.signal)).resolves.toBe(target)
    await expect(source.resolveTarget(controller.signal)).resolves.toBe(target)
  })
})
