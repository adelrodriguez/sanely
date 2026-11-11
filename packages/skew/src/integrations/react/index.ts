"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { DeploymentMonitor, DeploymentStatus } from "#lib/runtime/monitor.ts"
import { createDeploymentMonitor } from "#lib/runtime/monitor.ts"

let defaultMonitor: DeploymentMonitor | undefined

/**
 * Subscribes the component to `monitor`, or to a monitor that reads the embed. Create a monitor
 * once, at module scope.
 */
export function useDeploymentStatus(monitor?: DeploymentMonitor): DeploymentStatus {
  const resolved = monitor ?? (defaultMonitor ??= createDeploymentMonitor())
  const subscribe = useCallback((listener: () => void) => resolved.subscribe(listener), [resolved])

  return useSyncExternalStore(
    subscribe,
    () => resolved.getState(),
    () => getServerState(resolved)
  )
}

const serverStates = new WeakMap<DeploymentMonitor, DeploymentStatus>()

function getServerState(monitor: DeploymentMonitor): DeploymentStatus {
  const existing = serverStates.get(monitor)
  if (existing !== undefined) {
    return existing
  }

  const state = monitor.getState()
  const serverState: DeploymentStatus = {
    ...state,
    checkStatus: "idle",
    checkedAt: null,
    error: null,
    reloadStatus: "unprotected",
    status: "unknown",
    target: null,
  }
  serverStates.set(monitor, serverState)
  return serverState
}

export type { DeploymentMonitor, DeploymentStatus } from "#lib/runtime/monitor.ts"
export type { Deployment } from "#lib/protocol/types.ts"
