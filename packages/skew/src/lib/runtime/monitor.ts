import type { ValidateTimeExpression } from "@sanely/duration"
import { MS_PER_MINUTE, MS_PER_SECOND } from "@sanely/core/time"
import type { Deployment, IsDeploymentCurrent, TargetResolver } from "#lib/protocol/types.ts"
import { readEmbed } from "#lib/protocol/embed.ts"
import { TargetResolutionError } from "#lib/protocol/errors.ts"
import { DEFAULT_DESCRIPTOR_ENDPOINT, fetchDescriptor } from "#lib/protocol/fetch-descriptor.ts"
import type { RuntimeEnvironment, TimerHandle } from "./environment"
import type { DeploymentSchedule } from "./scheduler"
import { createBrowserEnvironment } from "./environment"
import { milliseconds } from "./milliseconds"
import {
  DEFAULT_DEPLOYMENT_SCHEDULE,
  DeploymentScheduler,
  MINIMUM_CHECK_INTERVAL,
} from "./scheduler"

type CheckStatus = "checking" | "idle"
type ReloadStatus = "blocked" | "ready" | "unprotected"

interface DeploymentStatusBase {
  readonly check: () => Promise<DeploymentStatus>
  readonly checkStatus: CheckStatus
  readonly error: Error | null
  readonly reload: () => void
  readonly reloadStatus: ReloadStatus
  readonly running: Deployment
}

export type DeploymentStatus = DeploymentStatusBase
  & (
    | {
        readonly checkedAt: null
        readonly status: "unknown"
        readonly target: null
      }
    | {
        readonly checkedAt: Date
        readonly status: "current" | "stale"
        readonly target: Deployment
      }
  )

type DeploymentStatusChanges = Partial<
  Pick<DeploymentStatusBase, "checkStatus" | "error" | "reloadStatus">
>

interface ReloadMarker {
  readonly at: number
  readonly attempts: number
  readonly from: string
  readonly to: string
}

const DEFAULT_CHECK_TIMEOUT = 30 * MS_PER_SECOND

const RELOAD_MARKER_KEY = "deployment-check:reload"
const RELOAD_COOLDOWN = 10 * MS_PER_MINUTE

export interface DeploymentMonitorOptions<T extends string = never> {
  /**
   * The descriptor URL, or a function that resolves the target deployment. Defaults to the endpoint
   * in the embed.
   */
  readonly target?: string | TargetResolver
  /**
   * The deployment that produced this page. Defaults to the embed. Set it for a preview or a test.
   */
  readonly running?: Deployment
  /**
   * Whether the running deployment is current for the target. Defaults to equal IDs.
   */
  readonly isCurrent?: IsDeploymentCurrent
  readonly checkInterval?: number | ValidateTimeExpression<T>
  readonly checkTimeout?: number | ValidateTimeExpression<T>
  readonly checkOnReconnect?: boolean
  readonly checkOnSubscribe?: boolean
  readonly checkOnVisible?: boolean
  readonly environment?: RuntimeEnvironment
}

export interface DeploymentMonitor {
  check(): Promise<DeploymentStatus>
  getState(): DeploymentStatus
  reload(): void
  /**
   * The first subscriber starts the schedule, and the last unsubscribe stops it and cancels a check
   * in progress.
   */
  subscribe(listener: (state: DeploymentStatus) => void): () => void
}

// The options after parsing. A monitor without a running deployment is inert.
interface MonitorConfiguration {
  readonly checkTimeout: number
  readonly environment: RuntimeEnvironment
  readonly isCurrent: IsDeploymentCurrent
  readonly running: Deployment | undefined
  readonly schedule: DeploymentSchedule
  readonly target: TargetResolver
}

class DeploymentMonitorImplementation implements DeploymentMonitor {
  readonly #settings: MonitorConfiguration
  readonly #listeners = new Set<{ readonly listener: (state: DeploymentStatus) => void }>()
  readonly #reloadGuard: ReloadGuard
  readonly #scheduler: DeploymentScheduler
  #abortController: AbortController | undefined
  #inFlight: Promise<DeploymentStatus> | undefined
  #state: DeploymentStatus

  constructor(settings: MonitorConfiguration) {
    this.#settings = settings
    const running = settings.running ?? { id: "" }
    this.#reloadGuard = new ReloadGuard(running, settings.environment)
    this.#scheduler = new DeploymentScheduler(settings.environment, settings.schedule, () => {
      void this.check()
    })
    this.#state = {
      check: this.check.bind(this),
      checkStatus: "idle",
      checkedAt: null,
      error: null,
      reload: this.reload.bind(this),
      reloadStatus: this.#reloadGuard.status,
      running,
      status: "unknown",
      target: null,
    }
  }

  check(): Promise<DeploymentStatus> {
    const { running } = this.#settings
    if (running === undefined) {
      return Promise.resolve(this.#state)
    }

    if (this.#inFlight !== undefined) {
      return this.#abortController?.signal.aborted === true
        ? this.#inFlight.then(() => this.check())
        : this.#inFlight
    }

    const abortController = new AbortController()
    this.#abortController = abortController
    this.#inFlight = this.#performCheck(running, abortController).finally(() => {
      if (this.#abortController === abortController) {
        this.#abortController = undefined
      }
      this.#inFlight = undefined
    })

    return this.#inFlight
  }

  getState(): DeploymentStatus {
    return this.#state
  }

  reload(): void {
    const reloadStatus = this.#reloadGuard.request(this.#state.target)
    if (reloadStatus !== this.#state.reloadStatus) {
      this.#updateState({ reloadStatus })
    }
  }

  subscribe(listener: (state: DeploymentStatus) => void): () => void {
    const subscription = { listener }
    this.#listeners.add(subscription)
    if (this.#listeners.size === 1) {
      this.#start()
    }

    return () => {
      if (this.#listeners.delete(subscription) && this.#listeners.size === 0) {
        this.#stop()
      }
    }
  }

  #start(): void {
    if (this.#settings.running === undefined) {
      return
    }

    this.#scheduler.start()
    if (this.#settings.schedule.checkOnSubscribe) {
      void this.check()
    }
  }

  #stop(): void {
    this.#scheduler.stop()
    // A subscriber that leaves and comes back in the same task, as in React Strict Mode, keeps the
    // check in progress.
    const abortController = this.#abortController
    void Promise.resolve().then(() => {
      if (this.#listeners.size === 0 && this.#abortController === abortController) {
        abortController?.abort()
      }
      return false
    })
  }

  async #performCheck(
    running: Deployment,
    abortController: AbortController
  ): Promise<DeploymentStatus> {
    this.#updateState({ checkStatus: "checking" })
    try {
      const target = await this.#resolveTarget(abortController)
      if (target === null) {
        this.#updateState({ checkStatus: "idle" })
      } else {
        this.#setState({
          ...this.#state,
          checkStatus: "idle",
          checkedAt: new Date(this.#settings.environment.now()),
          error: null,
          reloadStatus: this.#reloadGuard.reconcile(this.#state.target?.id === target.id),
          status: this.#settings.isCurrent(running, target) ? "current" : "stale",
          target,
        })
      }
    } catch (error) {
      this.#updateState({
        checkStatus: "idle",
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }

    return this.#state
  }

  async #resolveTarget(abortController: AbortController): Promise<Deployment | null> {
    const { checkTimeout, environment, target } = this.#settings
    let timeoutHandle: TimerHandle | undefined
    const cancelled = new Promise<null>((resolve) => {
      abortController.signal.addEventListener(
        "abort",
        () => {
          this.#clearTimeout(timeoutHandle)
          resolve(null)
        },
        { once: true }
      )
    })
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = environment.setTimeout(() => {
        reject(new TargetResolutionError("timeout", { checkTimeout }))
        abortController.abort()
      }, checkTimeout)
    })

    try {
      return await Promise.race([cancelled, target(abortController.signal), timeout])
    } finally {
      this.#clearTimeout(timeoutHandle)
    }
  }

  #clearTimeout(handle: TimerHandle | undefined): void {
    if (handle !== undefined) {
      this.#settings.environment.clearTimeout(handle)
    }
  }

  #updateState(changes: DeploymentStatusChanges): void {
    this.#setState({ ...this.#state, ...changes })
  }

  #setState(state: DeploymentStatus): void {
    this.#state = state
    for (const { listener } of this.#listeners) {
      listener(state)
    }
  }
}

class ReloadGuard {
  readonly #environment: RuntimeEnvironment
  readonly #running: Deployment
  // The target whose reload this page already recorded. Another request for it reloads again
  // without counting a second reload.
  #requestedTarget: string | undefined
  #status: ReloadStatus

  constructor(running: Deployment, environment: RuntimeEnvironment) {
    this.#environment = environment
    this.#running = running
    this.#status =
      environment.storage === null
        ? "unprotected"
        : this.#clearSuccessfulReload(environment.storage)
  }

  get status(): ReloadStatus {
    return this.#status
  }

  reconcile(targetMatches: boolean): ReloadStatus {
    if (this.#status !== "unprotected" && !(this.#status === "blocked" && targetMatches)) {
      this.#status = "ready"
    }

    return this.#status
  }

  request(target: Deployment | null): ReloadStatus {
    const storage = this.#environment.storage
    if (
      storage === null
      || this.#status === "unprotected"
      || target === null
      || target.id === this.#requestedTarget
    ) {
      this.#environment.reload()
      return this.#status
    }

    this.#status = this.#requestReload(target, storage)
    return this.#status
  }

  #clearSuccessfulReload(storage: NonNullable<RuntimeEnvironment["storage"]>): ReloadStatus {
    try {
      const marker = ReloadGuard.#readReloadMarker(storage)
      if (marker !== undefined && marker.from !== this.#running.id) {
        storage.removeItem(RELOAD_MARKER_KEY)
      }

      return "ready"
    } catch {
      return "unprotected"
    }
  }

  static #readReloadMarker(
    storage: NonNullable<RuntimeEnvironment["storage"]>
  ): ReloadMarker | undefined {
    const value = storage.getItem(RELOAD_MARKER_KEY)
    if (value === null) {
      return undefined
    }

    try {
      const marker: unknown = JSON.parse(value)

      return checkIsReloadMarker(marker) ? marker : undefined
    } catch {
      return undefined
    }
  }

  #requestReload(
    target: Deployment,
    storage: NonNullable<RuntimeEnvironment["storage"]>
  ): ReloadStatus {
    try {
      const previous = ReloadGuard.#readReloadMarker(storage)
      const repeated =
        previous !== undefined
        && previous.from === this.#running.id
        && previous.to === target.id
        && this.#environment.now() - previous.at < RELOAD_COOLDOWN
      const attempts = repeated ? previous.attempts + 1 : 0
      // A blocked request leaves the record unchanged, so the cooldown runs from the last reload.
      if (attempts >= 2) {
        return "blocked"
      }

      storage.setItem(
        RELOAD_MARKER_KEY,
        JSON.stringify({
          at: this.#environment.now(),
          attempts,
          from: this.#running.id,
          to: target.id,
        } satisfies ReloadMarker)
      )
    } catch {
      this.#environment.reload()
      return "unprotected"
    }

    this.#requestedTarget = target.id
    this.#environment.reload()
    return "ready"
  }
}

export function createDeploymentMonitor<const T extends string = never>(
  options: DeploymentMonitorOptions<T> = {}
): DeploymentMonitor {
  const embed = readEmbed()
  const running = options.running ?? readRunningDeployment(embed)
  const checkInterval = milliseconds(
    options.checkInterval ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkInterval
  )
  if (checkInterval < MINIMUM_CHECK_INTERVAL) {
    console.warn(`[deployment-check] Increased checkInterval to ${MINIMUM_CHECK_INTERVAL}ms.`)
  }
  if (running === undefined && process.env.NODE_ENV !== "production" && "document" in globalThis) {
    console.warn(
      "[deployment-check] The monitor is inert because no adapter registered a deployment embed."
    )
  }

  const target = options.target ?? embed?.endpoint ?? DEFAULT_DESCRIPTOR_ENDPOINT

  return new DeploymentMonitorImplementation({
    checkTimeout: milliseconds(options.checkTimeout ?? DEFAULT_CHECK_TIMEOUT),
    environment: options.environment ?? createBrowserEnvironment(),
    isCurrent: options.isCurrent ?? ((left, right) => left.id === right.id),
    running,
    schedule: {
      checkInterval: Math.max(checkInterval, MINIMUM_CHECK_INTERVAL),
      checkOnReconnect: options.checkOnReconnect ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnReconnect,
      checkOnSubscribe: options.checkOnSubscribe ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnSubscribe,
      checkOnVisible: options.checkOnVisible ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnVisible,
    },
    target: typeof target === "string" ? fetchDescriptor(target) : target,
  })
}

function readRunningDeployment(embed: ReturnType<typeof readEmbed>): Deployment | undefined {
  if (embed === undefined) {
    return undefined
  }

  const { builtAt, id } = embed.running
  return builtAt === undefined ? { id } : { builtAt: new Date(builtAt), id }
}

function checkIsReloadMarker(value: unknown): value is ReloadMarker {
  return (
    typeof value === "object"
    && value !== null
    && "at" in value
    && typeof value.at === "number"
    && "attempts" in value
    && typeof value.attempts === "number"
    && "from" in value
    && typeof value.from === "string"
    && "to" in value
    && typeof value.to === "string"
  )
}
