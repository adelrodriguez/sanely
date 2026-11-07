export { parseDescriptor, serializeDescriptor } from "#lib/protocol/descriptor.ts"
export type { DescriptorV1 } from "#lib/protocol/descriptor.ts"
export { readEmbed } from "#lib/protocol/embed.ts"
export type { DeploymentEmbed } from "#lib/protocol/embed.ts"
export { TargetResolutionError } from "#lib/protocol/errors.ts"
export type { TargetResolutionErrorReason } from "#lib/protocol/errors.ts"
export {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  createEmbeddedSource,
  createHttpSource,
} from "#lib/protocol/http-source.ts"
export type { HttpSourceInit } from "#lib/protocol/http-source.ts"
export { createStaticSource } from "#lib/protocol/static-source.ts"
export type { Deployment, DeploymentSource, IsDeploymentCurrent } from "#lib/protocol/types.ts"
export type {
  RuntimeEnvironment,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeStorage,
  TimerHandle,
} from "#lib/runtime/environment.ts"
export { DEFAULT_CHECK_TIMEOUT, createDeploymentMonitor } from "#lib/runtime/monitor.ts"
export type {
  CheckStatus,
  DeploymentMonitor,
  DeploymentMonitorOptions,
  DeploymentStatus,
  DeploymentSubscriberOptions,
  ReloadStatus,
} from "#lib/runtime/monitor.ts"

export { getDefaultMonitor, getMonitor } from "#lib/runtime/registry.ts"
