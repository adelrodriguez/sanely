export interface Deployment {
  readonly id: string
  readonly builtAt?: Date
}

/**
 * Resolves the target deployment. It must reach a service that the running deployment does not
 * control.
 */
export type TargetResolver = (signal: AbortSignal) => Promise<Deployment>

export type IsDeploymentCurrent = (running: Deployment, target: Deployment) => boolean
