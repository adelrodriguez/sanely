export interface CrispenEmbed {
  readonly v: 1
  readonly running: {
    readonly id: string
    readonly builtAt?: string
  }
  readonly endpoint?: string
}

declare global {
  var __CRISPEN__: CrispenEmbed | undefined
}

export function readEmbed(): CrispenEmbed | undefined {
  const embed: unknown = globalThis.__CRISPEN__

  if (embed === undefined) {
    return undefined
  }

  if (!checkIsEmbed(embed)) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- Invalid build-time data must be visible in development.
      console.warn("Crispen ignored a malformed deployment embed.")
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

function checkIsEmbed(value: unknown): value is CrispenEmbed {
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
