import { describe, expect, it } from "vitest"
import type { DeploymentSource } from "#index.ts"
import {
  createDeploymentMonitor,
  createHttpSource,
  createStaticSource,
  getDefaultMonitor,
  parseDescriptor,
  serializeDescriptor,
  TargetResolutionError,
} from "#index.ts"

describe("protocol public API", () => {
  it("supports a hand-written deployment source", async () => {
    expect.assertions(1)

    const source: DeploymentSource = {
      resolveTarget() {
        return Promise.resolve({ id: "target" })
      },
      running: { id: "running" },
    }

    await expect(source.resolveTarget(new AbortController().signal)).resolves.toStrictEqual({
      id: "target",
    })
  })

  it("uses one public error class for descriptor and target resolution failures", () => {
    expect.assertions(1)
    expect(() => parseDescriptor("not JSON")).toThrow(TargetResolutionError)
  })

  it.each([
    ["createDeploymentMonitor", createDeploymentMonitor],
    ["createHttpSource", createHttpSource],
    ["createStaticSource", createStaticSource],
    ["getDefaultMonitor", getDefaultMonitor],
    ["parseDescriptor", parseDescriptor],
    ["serializeDescriptor", serializeDescriptor],
  ])("exports the %s function", (_name, exported) => {
    expect.assertions(1)
    expect(exported).toBeTypeOf("function")
  })
})
