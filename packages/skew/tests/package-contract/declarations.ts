import {
  createDeploymentMonitor,
  fetchDescriptor,
  parseDescriptor,
  type Deployment,
  type DeploymentMonitor,
  type RuntimeEnvironment,
  type TargetResolver,
} from "@sanely/skew"
import {
  DeploymentScript,
  GET,
  descriptorHandler,
  withDeploymentCheck,
  type NextAdapterOptions,
  type NextConfigExport,
} from "@sanely/skew/next"
import { useDeploymentStatus, type DeploymentStatus } from "@sanely/skew/react"
import {
  deploymentCheck,
  type ViteAdapterOptions,
  type DeploymentIdOption,
  type DeploymentPlatform,
} from "@sanely/skew/vite"

const deployment: Deployment = parseDescriptor('{"v":1,"id":"package-contract"}')
const target: TargetResolver = fetchDescriptor("/current.json")
const monitor: DeploymentMonitor = createDeploymentMonitor({
  checkInterval: "5m",
  checkTimeout: "10s",
  running: deployment,
  target,
})
const platform: DeploymentPlatform = "vercel"
const deploymentIdOption: DeploymentIdOption = { platform }
const vitePlugin = deploymentCheck({
  deploymentId: deploymentIdOption,
} satisfies ViteAdapterOptions)
const nextConfig: NextConfigExport = withDeploymentCheck({}, {
  deploymentId: { env: ["DEPLOYMENT_CHECK_SHA", "GIT_SHA"] },
} satisfies NextAdapterOptions)
const declarationContract = {
  appRoute: GET,
  environment: undefined as unknown as RuntimeEnvironment,
  hookStatus: undefined as unknown as DeploymentStatus,
  monitor,
  nextConfig,
  pagesRoute: descriptorHandler,
  scriptComponent: DeploymentScript,
  statusHook: useDeploymentStatus,
  vitePlugin,
}

void declarationContract
