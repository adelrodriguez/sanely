import { describe, expect, it, onTestFinished, vi } from "vitest"
import type { CrispenEmbed } from "#lib/protocol/embed.ts"
import { TargetResolutionError } from "#lib/protocol/errors.ts"
import { createEmbeddedSource, createHttpSource } from "#lib/protocol/http-source.ts"

const originalFetch = globalThis.fetch

function mockGlobalFetch() {
  const fetch = vi.spyOn(globalThis, "fetch")
  onTestFinished(() => {
    fetch.mockRestore()
    globalThis.fetch = originalFetch
  })

  return fetch
}

function setEmbed(embed: CrispenEmbed): void {
  globalThis.__CRISPEN__ = embed
  onTestFinished(() => {
    globalThis.__CRISPEN__ = undefined
  })
}

describe("deployment source over HTTP", () => {
  it("resolves the target descriptor without using a browser cache", async () => {
    expect.assertions(2)

    const fetch = mockGlobalFetch().mockResolvedValue(
      new Response('{"v":1,"id":"target"}', {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    )
    const source = createHttpSource({ id: "running" }, "/_crispen/deployment.json")
    const controller = new AbortController()

    await expect(source.resolveTarget(controller.signal)).resolves.toStrictEqual({ id: "target" })
    expect(fetch).toHaveBeenCalledWith("/_crispen/deployment.json", {
      cache: "no-store",
      signal: controller.signal,
    })
  })

  it("passes request settings to a custom fetch implementation", async () => {
    expect.assertions(1)

    const customFetch = vi.spyOn({ fetch: originalFetch }, "fetch").mockResolvedValue(
      new Response('{"v":1,"id":"target"}', {
        headers: { "content-type": "application/json" },
      })
    )
    const source = createHttpSource({ id: "running" }, "/deployment.json", {
      credentials: "include",
      fetch: customFetch,
      headers: { authorization: "Bearer token" },
    })
    const controller = new AbortController()

    await source.resolveTarget(controller.signal)

    expect(customFetch).toHaveBeenCalledWith("/deployment.json", {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: "Bearer token" },
      signal: controller.signal,
    })
  })

  it("reports a network failure with its typed reason", async () => {
    expect.assertions(1)

    const cause = new TypeError("offline")
    mockGlobalFetch().mockRejectedValue(cause)
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    await expect(source.resolveTarget(new AbortController().signal)).rejects.toStrictEqual(
      new TargetResolutionError("network", cause)
    )
  })

  it("rejects an unsuccessful HTTP response before reading its body", async () => {
    expect.assertions(1)

    const response = new Response('{"v":1,"id":"target"}', {
      headers: { "content-type": "application/json" },
      status: 503,
    })
    mockGlobalFetch().mockResolvedValue(response)
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    await expect(source.resolveTarget(new AbortController().signal)).rejects.toStrictEqual(
      new TargetResolutionError("http-status", response)
    )
  })

  it("rejects an HTML SPA fallback before descriptor parsing", async () => {
    expect.assertions(1)

    const response = new Response("<!doctype html><title>App</title>", {
      headers: { "content-type": "text/html" },
    })
    mockGlobalFetch().mockResolvedValue(response)
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    await expect(source.resolveTarget(new AbortController().signal)).rejects.toStrictEqual(
      new TargetResolutionError("not-json", response)
    )
  })

  it("propagates an abort from fetch", async () => {
    expect.assertions(1)

    const abortError = new DOMException("The operation was aborted", "AbortError")
    mockGlobalFetch().mockRejectedValue(abortError)
    const source = createHttpSource({ id: "running" }, "/deployment.json")

    await expect(source.resolveTarget(new AbortController().signal)).rejects.toBe(abortError)
  })

  it("creates the default source from the deployment embed", () => {
    expect.assertions(1)

    setEmbed({
      running: {
        builtAt: "2026-08-09T12:00:00.000Z",
        id: "running",
      },
      v: 1,
    })

    expect(createEmbeddedSource()?.running).toStrictEqual({
      builtAt: new Date("2026-08-09T12:00:00.000Z"),
      id: "running",
    })
  })
})
