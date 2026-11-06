import type { Deployment, DeploymentSource } from "./types"
import { parseDescriptor } from "./descriptor"
import { readEmbed } from "./embed"
import { TargetResolutionError } from "./errors"

export const DEFAULT_DESCRIPTOR_ENDPOINT = "/_crispen/deployment.json"

export type HttpSourceInit = Omit<RequestInit, "cache" | "signal"> & {
  readonly fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

export function createEmbeddedSource(): DeploymentSource | undefined {
  const embed = readEmbed()

  if (embed === undefined) {
    return undefined
  }

  const { builtAt, id } = embed.running
  const running: Deployment = builtAt === undefined ? { id } : { builtAt: new Date(builtAt), id }

  return createHttpSource(running, embed.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT)
}

export function createHttpSource(
  running: Deployment,
  endpoint: string,
  init: HttpSourceInit = {}
): DeploymentSource {
  const { fetch: customFetch, ...requestInit } = init

  return {
    async resolveTarget(signal) {
      let response: Response

      try {
        response = await (customFetch ?? globalThis.fetch)(endpoint, {
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
    },
    running,
  }
}
