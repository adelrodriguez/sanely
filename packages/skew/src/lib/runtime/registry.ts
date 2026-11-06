import type { DeploymentSource } from "#lib/protocol/types.ts"
import { createEmbeddedSource } from "#lib/protocol/http-source.ts"
import type { DeploymentMonitor } from "./monitor"
import { createRegisteredDeploymentMonitor } from "./monitor"

let defaultMonitor: DeploymentMonitor | undefined
let monitors = new WeakMap<DeploymentSource, DeploymentMonitor>()

export function getDefaultMonitor(): DeploymentMonitor {
  if (defaultMonitor === undefined) {
    const monitor = createRegisteredDeploymentMonitor(createEmbeddedSource(), () => {
      if (defaultMonitor === monitor) {
        defaultMonitor = undefined
      }
    })
    defaultMonitor = monitor
  }
  return defaultMonitor
}

export function getMonitor(source: DeploymentSource): DeploymentMonitor {
  const existing = monitors.get(source)
  if (existing !== undefined) {
    return existing
  }

  const monitor = createRegisteredDeploymentMonitor(source, () => {
    if (monitors.get(source) === monitor) {
      monitors.delete(source)
    }
  })
  monitors.set(source, monitor)
  return monitor
}

export function resetRegistry(): void {
  defaultMonitor?.destroy()
  defaultMonitor = undefined

  monitors = new WeakMap()
}
