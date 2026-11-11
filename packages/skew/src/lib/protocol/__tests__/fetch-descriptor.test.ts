import { describe, expect, it, onTestFinished, vi } from "vitest"
import { TargetResolutionError } from "#lib/protocol/errors.ts"
import { fetchDescriptor } from "#lib/protocol/fetch-descriptor.ts"

const originalFetch = globalThis.fetch

function mockGlobalFetch() {
  const fetch = vi.spyOn(globalThis, "fetch")
  onTestFinished(() => {
    fetch.mockRestore()
    globalThis.fetch = originalFetch
  })

  return fetch
}

describe("fetchDescriptor", () => {
  it("resolves the target descriptor without using a browser cache", async () => {
    expect.assertions(2)

    const fetch = mockGlobalFetch().mockResolvedValue(
      new Response('{"v":1,"id":"target"}', {
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    )
    const resolve = fetchDescriptor("/_deployment-check/deployment.json")
    const controller = new AbortController()

    await expect(resolve(controller.signal)).resolves.toStrictEqual({ id: "target" })
    expect(fetch).toHaveBeenCalledWith("/_deployment-check/deployment.json", {
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
    const resolve = fetchDescriptor("/deployment.json", {
      credentials: "include",
      fetch: customFetch,
      headers: { authorization: "Bearer token" },
    })
    const controller = new AbortController()

    await resolve(controller.signal)

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
    const resolve = fetchDescriptor("/deployment.json")

    await expect(resolve(new AbortController().signal)).rejects.toStrictEqual(
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
    const resolve = fetchDescriptor("/deployment.json")

    await expect(resolve(new AbortController().signal)).rejects.toStrictEqual(
      new TargetResolutionError("http-status", response)
    )
  })

  it("rejects an HTML SPA fallback before descriptor parsing", async () => {
    expect.assertions(1)

    const response = new Response("<!doctype html><title>App</title>", {
      headers: { "content-type": "text/html" },
    })
    mockGlobalFetch().mockResolvedValue(response)
    const resolve = fetchDescriptor("/deployment.json")

    await expect(resolve(new AbortController().signal)).rejects.toStrictEqual(
      new TargetResolutionError("not-json", response)
    )
  })

  it("propagates an abort from fetch", async () => {
    expect.assertions(1)

    const abortError = new DOMException("The operation was aborted", "AbortError")
    mockGlobalFetch().mockRejectedValue(abortError)
    const resolve = fetchDescriptor("/deployment.json")

    await expect(resolve(new AbortController().signal)).rejects.toBe(abortError)
  })
})
