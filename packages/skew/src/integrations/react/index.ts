"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { DeploymentSource } from "#lib/protocol/types.ts"
import type {
  DeploymentMonitor,
  DeploymentStatus,
  DeploymentSubscriberOptions,
} from "#lib/runtime/monitor.ts"
import { milliseconds } from "#lib/runtime/milliseconds.ts"
import { getDefaultMonitor, getMonitor } from "#lib/runtime/registry.ts"

export interface DeploymentStatusOptions<
  T extends string = never,
> extends DeploymentSubscriberOptions<T> {
  readonly source?: DeploymentSource
}

export function useDeploymentStatus<const T extends string = never>(
  options: DeploymentStatusOptions<T> = {}
): DeploymentStatus {
  const stableOptions = useShallowStableOptions(options)
  const monitor = stableOptions.source ? getMonitor(stableOptions.source) : getDefaultMonitor()
  const subscribe = useCallback(
    (listener: () => void) => monitor.subscribe(listener, stableOptions),
    [monitor, stableOptions]
  )

  return useSyncExternalStore(
    subscribe,
    () => monitor.getState(),
    () => getServerState(monitor)
  )
}

function useShallowStableOptions<T extends string>(
  options: DeploymentStatusOptions<T>
): DeploymentStatusOptions {
  return useMemo(
    // The type requires every option, so a new option fails to compile until the hook passes it on.
    (): {
      readonly [K in keyof Required<DeploymentStatusOptions>]: DeploymentStatusOptions[K]
    } => ({
      checkInterval:
        options.checkInterval === undefined ? undefined : milliseconds(options.checkInterval),
      checkOnReconnect: options.checkOnReconnect,
      checkOnSubscribe: options.checkOnSubscribe,
      checkOnVisible: options.checkOnVisible,
      isCurrent: options.isCurrent,
      source: options.source,
    }),
    [
      options.checkInterval,
      options.checkOnReconnect,
      options.checkOnSubscribe,
      options.checkOnVisible,
      options.isCurrent,
      options.source,
    ]
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

export type {
  CheckStatus,
  DeploymentMonitor,
  DeploymentStatus,
  DeploymentSubscriberOptions,
  ReloadStatus,
} from "#lib/runtime/monitor.ts"
export type { Deployment, DeploymentSource, IsDeploymentCurrent } from "#lib/protocol/types.ts"
