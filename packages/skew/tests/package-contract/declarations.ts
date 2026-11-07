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
  DeploymentScript,
  GET,
  descriptorHandler,
  withDeploymentCheck,
  type NextAdapterOptions,
  type NextConfigExport,
} from "@sanely/skew/next"
import {
  useDeploymentStatus,
  type DeploymentStatus,
  type DeploymentStatusOptions,
} from "@sanely/skew/react"
import {
  deploymentCheck,
  type ViteAdapterOptions,
  type DeploymentIdOption,
  type DeploymentPlatform,
} from "@sanely/skew/vite"

const deployment: Deployment = parseDescriptor('{"v":1,"id":"package-contract"}')
const monitor: DeploymentMonitor = createDeploymentMonitor(
  createStaticSource(deployment, deployment)
)
const platform: DeploymentPlatform = "vercel"
const deploymentIdOption: DeploymentIdOption = { platform }
const vitePlugin = deploymentCheck({
  deploymentId: deploymentIdOption,
} satisfies ViteAdapterOptions)
const nextConfig: NextConfigExport = withDeploymentCheck({}, {
  deploymentId: { env: ["DEPLOYMENT_CHECK_SHA", "GIT_SHA"] },
} satisfies NextAdapterOptions)
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
  pagesRoute: descriptorHandler,
  reloadStatus: undefined as unknown as ReloadStatus,
  scriptComponent: DeploymentScript,
  statusHook: useDeploymentStatus,
  vitePlugin,
}

void declarationContract
