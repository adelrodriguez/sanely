import type { Deployment, DeploymentSource, IsDeploymentCurrent } from "#lib/protocol/types.ts"
import type { RuntimeEnvironment, TimerHandle } from "./environment"
import type { DeploymentSchedule } from "./scheduler"
import { createBrowserEnvironment } from "./environment"
import {
  DEFAULT_DEPLOYMENT_SCHEDULE,
  DeploymentScheduler,
  MINIMUM_CHECK_INTERVAL,
} from "./scheduler"
import { Subscribable } from "./subscribable"

export type CheckStatus = "checking" | "idle"
export type ReloadStatus = "blocked" | "ready" | "unprotected"

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

export const DEFAULT_CHECK_TIMEOUT = 30_000

const RELOAD_MARKER_KEY = "deployment-check:reload"
const RELOAD_COOLDOWN = 10 * 60_000

export interface DeploymentMonitorOptions {
  readonly checkTimeout?: number
  readonly environment?: RuntimeEnvironment
  readonly isCurrent?: IsDeploymentCurrent
}

interface InternalMonitorOptions extends DeploymentMonitorOptions {
  readonly onDestroy?: () => void
}

export interface DeploymentSubscriberOptions {
  readonly checkInterval?: number
  readonly checkOnReconnect?: boolean
  readonly checkOnSubscribe?: boolean
  readonly checkOnVisible?: boolean
  readonly isCurrent?: IsDeploymentCurrent
}

export interface DeploymentMonitor {
  check(): Promise<DeploymentStatus>
  destroy(): void
  getState(): DeploymentStatus
  reload(): void
  subscribe(
    listener: (state: DeploymentStatus) => void,
    options?: DeploymentSubscriberOptions
  ): () => void
}

class DeploymentMonitorImplementation
  extends Subscribable<(state: DeploymentStatus) => void, DeploymentSubscriberOptions>
  implements DeploymentMonitor
{
  readonly #checkTimeout: number
  readonly #defaultIsCurrent: IsDeploymentCurrent
  #isCurrent: IsDeploymentCurrent
  readonly #source: DeploymentSource | undefined
  readonly #environment: RuntimeEnvironment
  readonly #reloadGuard: ReloadGuard
  #abortController: AbortController | undefined
  #destroyed = false
  readonly #onDestroy: (() => void) | undefined
  #inFlight: Promise<DeploymentStatus> | undefined
  readonly #scheduler: DeploymentScheduler
  #state: DeploymentStatus

  constructor(source: DeploymentSource | undefined, options: InternalMonitorOptions) {
    super()
    this.#checkTimeout = options.checkTimeout ?? DEFAULT_CHECK_TIMEOUT
    this.#environment = options.environment ?? createBrowserEnvironment()
    this.#defaultIsCurrent = options.isCurrent ?? ((running, target) => running.id === target.id)
    this.#isCurrent = this.#defaultIsCurrent
    this.#onDestroy = options.onDestroy
    this.#source = source
    const running = source?.running ?? { id: "" }
    this.#reloadGuard = new ReloadGuard(running, this.#environment)
    if (source === undefined && process.env.NODE_ENV !== "production" && "document" in globalThis) {
      // eslint-disable-next-line no-console -- Missing adapter data must be visible in development.
      console.warn(
        "[deployment-check] The monitor is inert because no adapter registered a deployment embed."
      )
    }
    this.#scheduler = new DeploymentScheduler(this.#environment, () => {
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
    const source = this.#source
    if (this.#destroyed || source === undefined) {
      return Promise.resolve(this.#state)
    }

    if (this.#inFlight !== undefined) {
      return this.#abortController?.signal.aborted === true
        ? this.#inFlight.then(() => this.check())
        : this.#inFlight
    }

    const abortController = new AbortController()
    this.#abortController = abortController
    this.#inFlight = this.#performCheck(source, abortController).finally(() => {
      if (this.#abortController === abortController) {
        this.#abortController = undefined
      }
      this.#inFlight = undefined
    })

    return this.#inFlight
  }

  async #performCheck(
    source: DeploymentSource,
    abortController: AbortController
  ): Promise<DeploymentStatus> {
    this.#updateState({ checkStatus: "checking" })
    try {
      const target = await this.#resolveTarget(source, abortController)
      if (target === null) {
        this.#updateState({ checkStatus: "idle" })
      } else {
        this.#setState({
          ...this.#state,
          checkStatus: "idle",
          checkedAt: new Date(this.#environment.now()),
          error: null,
          reloadStatus: this.#reloadGuard.reconcile(this.#state.target?.id === target.id),
          status: this.#isCurrent(source.running, target) ? "current" : "stale",
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

  async #resolveTarget(
    source: DeploymentSource,
    abortController: AbortController
  ): Promise<Deployment | null> {
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
      timeoutHandle = this.#environment.setTimeout(() => {
        reject(
          new Error(
            `[deployment-check] The deployment check timed out after ${this.#checkTimeout}ms.`
          )
        )
        abortController.abort()
      }, this.#checkTimeout)
    })

    try {
      return await Promise.race([cancelled, source.resolveTarget(abortController.signal), timeout])
    } finally {
      this.#clearTimeout(timeoutHandle)
    }
  }

  #clearTimeout(handle: TimerHandle | undefined): void {
    if (handle !== undefined) {
      this.#environment.clearTimeout(handle)
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return
    }

    this.#destroyed = true
    this.#abortController?.abort()
    this.#scheduler.stop()
    this.listeners.clear()
    this.#onDestroy?.()
  }

  getState(): DeploymentStatus {
    return this.#state
  }

  reload(): void {
    if (this.#destroyed) {
      return
    }

    const reloadStatus = this.#reloadGuard.request(this.#state.target)
    if (reloadStatus !== this.#state.reloadStatus) {
      this.#updateState({ reloadStatus })
    }
  }

  override subscribe(
    listener: (state: DeploymentStatus) => void,
    options: DeploymentSubscriberOptions = {}
  ): () => void {
    if (this.#destroyed) {
      return () => {
        // A destroyed monitor has no subscription to remove.
      }
    }

    return super.subscribe(listener, options)
  }

  protected override onSubscribe(): void {
    if (this.#source === undefined) {
      return
    }

    const schedule = this.#reconcile()
    this.#scheduler.update(schedule)

    if (this.listeners.size === 1 && schedule.checkOnSubscribe) {
      void this.check()
    }
  }

  protected override onUnsubscribe(): void {
    const schedule = this.#reconcile()
    if (this.listeners.size === 0) {
      const abortController = this.#abortController
      void Promise.resolve().then(() => {
        if (this.listeners.size === 0 && this.#abortController === abortController) {
          abortController?.abort()
        }
        return false
      })
      this.#scheduler.stop()
      return
    }

    this.#scheduler.update(schedule)
  }

  #reconcile(): DeploymentSchedule {
    let checkInterval = Number.POSITIVE_INFINITY
    let checkOnReconnect = false
    let checkOnSubscribe = false
    let checkOnVisible = false
    let isCurrent: IsDeploymentCurrent | undefined

    for (const { options } of this.listeners) {
      checkInterval = Math.min(
        checkInterval,
        options.checkInterval ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkInterval
      )
      checkOnReconnect ||= options.checkOnReconnect ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnReconnect
      checkOnSubscribe ||= options.checkOnSubscribe ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnSubscribe
      checkOnVisible ||= options.checkOnVisible ?? DEFAULT_DEPLOYMENT_SCHEDULE.checkOnVisible
      isCurrent ??= options.isCurrent
    }

    this.#isCurrent = isCurrent ?? this.#defaultIsCurrent
    if (checkInterval < MINIMUM_CHECK_INTERVAL) {
      // eslint-disable-next-line no-console -- Excessive polling is a deployment configuration error.
      console.warn(`[deployment-check] Increased checkInterval to ${MINIMUM_CHECK_INTERVAL}ms.`)
    }

    return {
      checkInterval: Math.max(checkInterval, MINIMUM_CHECK_INTERVAL),
      checkOnReconnect,
      checkOnSubscribe,
      checkOnVisible,
    }
  }

  #updateState(changes: DeploymentStatusChanges): void {
    this.#setState({ ...this.#state, ...changes })
  }

  #setState(state: DeploymentStatus): void {
    this.#state = state
    for (const { listener } of this.listeners) {
      listener(state)
    }
  }
}

class ReloadGuard {
  readonly #environment: RuntimeEnvironment
  readonly #running: Deployment
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
    if (storage === null || this.#status === "unprotected" || target === null) {
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
    let attempts: number
    try {
      const previous = ReloadGuard.#readReloadMarker(storage)
      const repeated =
        previous !== undefined
        && previous.from === this.#running.id
        && previous.to === target.id
        && this.#environment.now() - previous.at < RELOAD_COOLDOWN
      attempts = repeated ? previous.attempts + 1 : 0
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

    if (attempts >= 2) {
      return "blocked"
    }

    this.#environment.reload()
    return "ready"
  }
}

export function createDeploymentMonitor(
  source?: DeploymentSource,
  options: DeploymentMonitorOptions = {}
): DeploymentMonitor {
  return new DeploymentMonitorImplementation(source, options)
}

export function createRegisteredDeploymentMonitor(
  source: DeploymentSource | undefined,
  onDestroy: () => void
): DeploymentMonitor {
  return new DeploymentMonitorImplementation(source, { onDestroy })
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
