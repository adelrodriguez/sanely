import {
  DEFAULT_CHECK_TIMEOUT,
  createDeploymentMonitor,
  createStaticSource,
  parseDescriptor,
  type CheckStatus,
  type Deployment,
  type DeploymentMonitor,
  type ReloadStatus,
  type RuntimeEnvironment,
} from "@sanely/skew"
import {
  CrispenScript,
  GET,
  crispenPagesHandler,
  withCrispen,
  type CrispenNextOptions,
  type NextConfigExport,
} from "@sanely/skew/next"
import {
  useDeploymentStatus,
  type DeploymentStatus,
  type DeploymentStatusOptions,
} from "@sanely/skew/react"
import {
  crispen,
  type CrispenViteOptions,
  type DeploymentIdOption,
  type DeploymentPlatform,
} from "@sanely/skew/vite"

const deployment: Deployment = parseDescriptor('{"v":1,"id":"package-contract"}')
const monitor: DeploymentMonitor = createDeploymentMonitor(
  createStaticSource(deployment, deployment)
)
const platform: DeploymentPlatform = "vercel"
const deploymentIdOption: DeploymentIdOption = { platform }
const vitePlugin = crispen({ deploymentId: deploymentIdOption } satisfies CrispenViteOptions)
const nextConfig: NextConfigExport = withCrispen({}, {
  deploymentId: { env: ["CRISPEN_SHA", "GIT_SHA"] },
} satisfies CrispenNextOptions)
const hookOptions = {} satisfies DeploymentStatusOptions
const declarationContract = {
  appRoute: GET,
  checkStatus: undefined as unknown as CheckStatus,
  checkTimeout: DEFAULT_CHECK_TIMEOUT,
  environment: undefined as unknown as RuntimeEnvironment,
  hookOptions,
  hookStatus: undefined as unknown as DeploymentStatus,
  monitor,
  nextConfig,
  pagesRoute: crispenPagesHandler,
  reloadStatus: undefined as unknown as ReloadStatus,
  scriptComponent: CrispenScript,
  statusHook: useDeploymentStatus,
  vitePlugin,
}

void declarationContract
