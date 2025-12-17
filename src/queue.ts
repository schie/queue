import { QueueStatus } from './_enums.ts'
export { QueueStatus }

/**
 * Configuration options for a Queue instance.
 *
 * @interface QueueOptions
 *
 * @property {function} [onStatusChange] - Optional callback function that is invoked whenever the queue's status changes.
 * The callback receives the new status as a parameter.
 *
 * @property {boolean} [pauseOnError] - Optional flag that determines whether the queue should pause processing
 * when an error occurs. If set to `true`, the queue will pause on error; otherwise, it will continue processing.
 * Defaults to `false` if not specified.
 */
export interface QueueOptions {
  onStatusChange?: (status: QueueStatus) => void
  pauseOnError?: boolean
}

export class Queue {
  private queue: Array<() => Promise<void>> = []
  private _status: QueueStatus = QueueStatus.Idle
  private runner: Promise<void> | null = null
  private resumeResolve: (() => void) | null = null
  private lastError: Error | null = null
  private pauseOnError: boolean

  // generation token to avoid status races across cancel/resurrects
  private version = 0

  public onStatusChange?: (status: QueueStatus) => void

  /**
   * Creates a queue with optional status notification callback and error pausing behavior.
   */
  public constructor(options: QueueOptions = {}) {
    const { onStatusChange, pauseOnError = false } = options
    this.onStatusChange = onStatusChange
    this.pauseOnError = pauseOnError
    this.onStatusChange?.(QueueStatus.Idle)
  }

  /**
   * Current processing status of the queue.
   */
  public get status() {
    return this._status
  }

  private setStatus(next: QueueStatus) {
    if (this._status !== next) {
      this._status = next
      this.onStatusChange?.(next)
    }
  }

  /**
   * True when the queue is actively processing tasks.
   */
  public get isProcessing() {
    return this._status === QueueStatus.Processing
  }
  /**
   * True when processing is paused.
   */
  public get isPaused() {
    return this._status === QueueStatus.Paused
  }
  /**
   * True after cancellation has been requested.
   */
  public get isCancelled() {
    return this._status === QueueStatus.Cancelled
  }
  /**
   * True when there is no runner and no pending work.
   */
  public get isIdle() {
    return this._status === QueueStatus.Idle
  }

  /**
   * Number of tasks waiting to be processed.
   */
  public get size() {
    return this.queue.length
  }

  /**
   * Captured error from the last failed task when pause-on-error is enabled.
   */
  public get lastTaskError(): Error | null {
    return this.lastError
  }

  /**
   * Clears the stored lastTaskError value.
   */
  public clearLastError() {
    this.lastError = null
  }

  /**
   * Enqueues a new task and starts processing if idle, resurrecting a cancelled queue.
   */
  public addTask(task: () => Promise<void>) {
    this.enqueue(task, 'end')
  }

  /**
   * Enqueues a task to run next (ahead of other pending tasks) without preempting the current task.
   */
  public addNextTask(task: () => Promise<void>) {
    this.enqueue(task, 'front')
  }

  private enqueue(task: () => Promise<void>, position: 'front' | 'end') {
    // Auto-resurrect if previously cancelled
    if (this.isCancelled) {
      this.version++ // bump generation to invalidate old runner
      this._status = QueueStatus.Idle // set directly to avoid duplicate notify logic
      this.onStatusChange?.(QueueStatus.Idle)
    }

    if (position === 'front') {
      this.queue.unshift(task)
    } else {
      this.queue.push(task)
    }
    if (this._status === QueueStatus.Idle) this.startRunner()
  }

  /**
   * Pauses processing after the current task completes.
   */
  public pauseQueue() {
    if (this.isProcessing) this.setStatus(QueueStatus.Paused)
  }

  /**
   * Resumes processing, clearing any stored error when leaving a paused state.
   */
  public resumeQueue() {
    if (this.isPaused) {
      this.lastError = null // clear error on resume
      this.setStatus(QueueStatus.Processing)
      this.resumeResolve?.()
      this.resumeResolve = null
    }
    if (this._status === QueueStatus.Idle && this.queue.length > 0) this.startRunner()
  }

  /**
   * Cancels all pending work, clears the queue, and prevents further status flips from stale runners.
   */
  public cancelQueue() {
    if (this.isCancelled) return
    this.setStatus(QueueStatus.Cancelled)
    this.queue = []
    this.version++ // invalidate any in-flight runner’s ability to change status later
    this.resumeResolve?.() // unblock pause
    this.resumeResolve = null
  }

  /**
   * Removes all pending tasks without altering status when processing or paused.
   */
  public clearQueue() {
    this.queue = []
    if (!this.isProcessing && !this.isPaused && !this.isCancelled) {
      this.setStatus(QueueStatus.Idle)
    }
  }

  private startRunner() {
    if (this.runner) return
    if (this.isCancelled || this.queue.length === 0) {
      this.setStatus(this.isCancelled ? QueueStatus.Cancelled : QueueStatus.Idle)
      return
    }
    this.setStatus(QueueStatus.Processing)
    const currentVersion = this.version
    this.runner = this.processLoop(currentVersion).finally(() => {
      this.runner = null
    })
  }

  private async processLoop(currentVersion: number) {
    while (!this.isCancelled && this.version === currentVersion) {
      if (this.isPaused) {
        await new Promise<void>((resolve) => (this.resumeResolve = resolve))
        continue
      }

      const task = this.queue.shift()
      if (!task) break

      if (this.isCancelled || this.version !== currentVersion) break

      try {
        await task()
      } catch (err) {
        if (this.pauseOnError) {
          this.lastError = err instanceof Error ? err : new Error(String(err))
          this.setStatus(QueueStatus.Paused)
          await new Promise<void>((resolve) => (this.resumeResolve = resolve))
          continue
        }
      }
    }

    // Only the active generation may set final status
    if (this.version !== currentVersion) return

    if (this.isCancelled) {
      // remain Cancelled (status already set in cancelQueue)
      return
    }

    // queue drained
    this.setStatus(QueueStatus.Idle)
  }
}
