import type { Deployment } from "./types"
import { TargetResolutionError } from "./errors"

export interface DescriptorV1 {
  readonly v: 1
  readonly id: string
  readonly builtAt?: string
}

interface DescriptorCandidate {
  readonly builtAt?: unknown
  readonly id?: unknown
  readonly v?: unknown
}

export function serializeDescriptor(deployment: Deployment): string {
  const descriptor: DescriptorV1 =
    deployment.builtAt === undefined
      ? { id: deployment.id, v: 1 }
      : { builtAt: deployment.builtAt.toISOString(), id: deployment.id, v: 1 }

  return JSON.stringify(descriptor, ["v", "id", "builtAt"])
}

export function parseDescriptor(text: string): Deployment {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch {
    throw new TargetResolutionError("invalid-json", text)
  }

  if (!checkIsDescriptorCandidate(value) || !checkIsSupportedVersion(value.v)) {
    throw new TargetResolutionError("unsupported-version", text)
  }

  if (!checkIsDeploymentId(value.id)) {
    throw new TargetResolutionError("invalid-shape", text)
  }

  const builtAt = checkIsTimestamp(value.builtAt) ? new Date(value.builtAt) : undefined

  if (builtAt === undefined || Number.isNaN(builtAt.getTime())) {
    return { id: value.id }
  }

  return { builtAt, id: value.id }
}

function checkIsDescriptorCandidate(value: unknown): value is DescriptorCandidate {
  return typeof value === "object" && value !== null
}

function checkIsSupportedVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
}

function checkIsDeploymentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function checkIsTimestamp(value: unknown): value is string {
  return typeof value === "string"
}
