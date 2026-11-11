import type { TargetResolver } from "./types"
import { parseDescriptor } from "./descriptor"
import { TargetResolutionError } from "./errors"

export const DEFAULT_DESCRIPTOR_ENDPOINT = "/_deployment-check/deployment.json"

type FetchDescriptorInit = Omit<RequestInit, "cache" | "signal"> & {
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

/**
 * Resolves the target from a descriptor at `url`. Each request bypasses the HTTP cache.
 */
export function fetchDescriptor(url: string, init: FetchDescriptorInit = {}): TargetResolver {
  const { fetch: customFetch, ...requestInit } = init

  return async (signal) => {
    let response: Response

    try {
      response = await (customFetch ?? globalThis.fetch)(url, {
        ...requestInit,
        cache: "no-store",
        signal,
      })
    } catch (error) {
      if ((error instanceof DOMException && error.name === "AbortError") || signal.aborted) {
        throw error
      }

      throw new TargetResolutionError("network", error)
    }

    if (!response.ok) {
      throw new TargetResolutionError("http-status", response)
    }

    if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
      throw new TargetResolutionError("not-json", response)
    }

    return parseDescriptor(await response.text())
  }
}
