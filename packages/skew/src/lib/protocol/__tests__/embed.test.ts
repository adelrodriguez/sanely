import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { CrispenEmbed } from "#lib/protocol/embed.ts"
import { readEmbed } from "#lib/protocol/embed.ts"

function setEmbed(embed: CrispenEmbed): void {
  globalThis.__CRISPEN__ = embed
  onTestFinished(() => {
    globalThis.__CRISPEN__ = undefined
  })
}

describe("deployment embed", () => {
  it("reads a valid running deployment and endpoint", () => {
    expect.assertions(1)

    const embed: CrispenEmbed = {
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
