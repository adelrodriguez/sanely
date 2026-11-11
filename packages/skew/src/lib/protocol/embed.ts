export interface DeploymentEmbed {
  readonly v: 1
  readonly running: {
    readonly id: string
    readonly builtAt?: string
  }
  readonly endpoint?: string
}

// The global that adapters assign the embed to. `declare global` below must use the same name.
export const EMBED_GLOBAL = "__DEPLOYMENT_CHECK__"

declare global {
  var __DEPLOYMENT_CHECK__: DeploymentEmbed | undefined
}

export function readEmbed(): DeploymentEmbed | undefined {
  const embed: unknown = globalThis[EMBED_GLOBAL]

  if (embed === undefined) {
    return undefined
  }

  if (!checkIsEmbed(embed)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[deployment-check] Ignored a malformed deployment embed.")
    }

    return undefined
  }

  return embed
}

interface EmbedCandidate {
  readonly endpoint?: unknown
  readonly running?: unknown
  readonly v?: unknown
}

interface RunningCandidate {
  readonly builtAt?: unknown
  readonly id?: unknown
}

function checkIsEmbed(value: unknown): value is DeploymentEmbed {
  if (!checkIsEmbedCandidate(value)) {
    return false
  }

  const { v, running, endpoint } = value

  if (v !== 1 || (endpoint !== undefined && typeof endpoint !== "string")) {
    return false
  }

  if (!checkIsRunningCandidate(running)) {
    return false
  }

  const { id, builtAt } = running

  return (
    typeof id === "string"
    && id.length > 0
    && (builtAt === undefined || typeof builtAt === "string")
  )
}

function checkIsEmbedCandidate(value: unknown): value is EmbedCandidate {
  return typeof value === "object" && value !== null
}

function checkIsRunningCandidate(value: unknown): value is RunningCandidate {
  return typeof value === "object" && value !== null
}
