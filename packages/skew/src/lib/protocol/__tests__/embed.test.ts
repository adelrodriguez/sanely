import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { DeploymentEmbed } from "#lib/protocol/embed.ts"
import { readEmbed } from "#lib/protocol/embed.ts"

function setEmbed(embed: DeploymentEmbed): void {
  globalThis.__DEPLOYMENT_CHECK__ = embed
  onTestFinished(() => {
    globalThis.__DEPLOYMENT_CHECK__ = undefined
  })
}

describe("deployment embed", () => {
  it("reads a valid running deployment and endpoint", () => {
    expect.assertions(1)

    const embed: DeploymentEmbed = {
      endpoint: "/control/deployment.json",
      running: {
        builtAt: "2026-08-09T12:00:00.000Z",
        id: "abc123",
      },
      v: 1,
    }
    setEmbed(embed)

    expect(readEmbed()).toStrictEqual(embed)
  })

  it("reads a load error event", () => {
    expect.assertions(1)

    const embed: DeploymentEmbed = {
      loadErrorEvent: "vite:preloadError",
      running: { id: "abc123" },
      v: 1,
    }
    setEmbed(embed)

    expect(readEmbed()).toStrictEqual(embed)
  })

  it.each([
    ["an empty string", ""],
    ["a number", 1],
  ])("ignores an embed whose load error event is %s", (_label, loadErrorEvent) => {
    expect.assertions(2)

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      /* silence the expected warning */
    })
    onTestFinished(() => {
      warning.mockRestore()
    })
    vi.stubGlobal("__DEPLOYMENT_CHECK__", { loadErrorEvent, running: { id: "abc123" }, v: 1 })
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })

    expect(readEmbed()).toBeUndefined()
    expect(warning).toHaveBeenCalledOnce()
  })

  it("returns undefined when the embed is missing", () => {
    expect.assertions(1)
    expect(readEmbed()).toBeUndefined()
  })

  it("warns and ignores a malformed embed", () => {
    expect.assertions(3)

    let warningIssued = false
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      warningIssued = true
    })
    onTestFinished(() => {
      warning.mockRestore()
    })
    setEmbed({
      running: { id: "" },
      v: 1,
    })

    expect(readEmbed()).toBeUndefined()
    expect(warningIssued).toBe(true)
    expect(warning).toHaveBeenCalledOnce()
  })
})
