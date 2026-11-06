export interface Deployment {
  readonly id: string
  readonly builtAt?: Date
}

export interface DeploymentSource {
  readonly running: Deployment

  /**
   * Resolve the target deployment independently of the running deployment.
   */
  resolveTarget(signal: AbortSignal): Promise<Deployment>
}

export type IsDeploymentCurrent = (running: Deployment, target: Deployment) => boolean
