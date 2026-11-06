export { parseDescriptor, serializeDescriptor } from "./lib/protocol/descriptor"
export type { DescriptorV1 } from "./lib/protocol/descriptor"
export { readEmbed } from "./lib/protocol/embed"
export type { CrispenEmbed } from "./lib/protocol/embed"
export { TargetResolutionError } from "./lib/protocol/errors"
export type { TargetResolutionErrorReason } from "./lib/protocol/errors"
export {
  DEFAULT_DESCRIPTOR_ENDPOINT,
  createEmbeddedSource,
  createHttpSource,
} from "./lib/protocol/http-source"
export type { HttpSourceInit } from "./lib/protocol/http-source"
export { createStaticSource } from "./lib/protocol/static-source"
export type { Deployment, DeploymentSource, IsDeploymentCurrent } from "./lib/protocol/types"
export type {
  RuntimeEnvironment,
  RuntimeEvent,
  RuntimeEventType,
  RuntimeStorage,
  TimerHandle,
} from "./lib/runtime/environment"
export { DEFAULT_CHECK_TIMEOUT, createDeploymentMonitor } from "./lib/runtime/monitor"
export type {
  CheckStatus,
  DeploymentMonitor,
  DeploymentMonitorOptions,
  DeploymentStatus,
  DeploymentSubscriberOptions,
  ReloadStatus,
} from "./lib/runtime/monitor"

export { getDefaultMonitor, getMonitor } from "./lib/runtime/registry"
