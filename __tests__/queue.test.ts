import { jest } from '@jest/globals'
import { Queue, QueueStatus } from '../src/index.js'

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now()
  // Poll until predicate passes or timeout
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out')
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const deferred = <T = void>() => {
  let resolve: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { promise, resolve: resolve! }
}

describe('Queue', () => {
  test('runs tasks sequentially and returns to idle', async () => {
    const statuses: QueueStatus[] = []
    const outputs: number[] = []
    const queue = new Queue({ onStatusChange: (status) => statuses.push(status) })

    queue.addTask(async () => outputs.push(1))
    queue.addTask(async () => outputs.push(2))

    await waitFor(() => queue.isIdle && outputs.length === 2)

    expect(outputs).toEqual([1, 2])
    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Idle])
    expect(queue.size).toBe(0)
  })

  test('pauses and resumes processing, clearing errors when resuming', async () => {
    const statuses: QueueStatus[] = []
    const processed: number[] = []
    const queue = new Queue({
      onStatusChange: (status) => statuses.push(status),
      pauseOnError: true
    })

    queue.pauseQueue()
    expect(queue.status).toBe(QueueStatus.Idle)

    queue.addTask(async () => {
      queue.pauseQueue()
      throw new Error('boom')
    })
    queue.addTask(async () => {
      processed.push(2)
    })

    await waitFor(() => queue.isPaused && queue.lastTaskError?.message === 'boom')

    expect(queue.lastTaskError?.message).toBe('boom')
    expect(statuses).toContain(QueueStatus.Paused)

    queue.resumeQueue()

    await waitFor(() => queue.isIdle && processed.length === 1)

    expect(queue.lastTaskError).toBeNull()
    expect(queue.status).toBe(QueueStatus.Idle)
    queue.clearLastError() // explicit API coverage
    expect(queue.lastTaskError).toBeNull()
  })

  test('swallows errors when pauseOnError is disabled and continues processing', async () => {
    const processed: number[] = []
    const queue = new Queue({ pauseOnError: false })

    queue.addTask(async () => {
      throw new Error('should not pause')
    })
    queue.addTask(async () => {
      processed.push(1)
    })

    await waitFor(() => queue.isIdle && processed.length === 1)

    expect(queue.lastTaskError).toBeNull()
    expect(queue.status).toBe(QueueStatus.Idle)
  })

  test('accepts an options object constructor (default pauseOnError false)', async () => {
    const processed: number[] = []
    const statuses: QueueStatus[] = []
    const queue = new Queue({
      onStatusChange: (status) => statuses.push(status)
    })

    queue.addTask(async () => {
      throw new Error('should be swallowed')
    })
    queue.addTask(async () => {
      processed.push(1)
    })

    await waitFor(() => queue.isIdle && processed.length === 1)

    expect(processed).toEqual([1])
    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Idle])
    expect(queue.lastTaskError).toBeNull()
  })

  test('honors pauseOnError flag via options object', async () => {
    const statuses: QueueStatus[] = []
    const queue = new Queue({
      onStatusChange: (status) => statuses.push(status),
      pauseOnError: true
    })

    queue.addTask(async () => {
      throw new Error('oops')
    })

    await waitFor(() => queue.isPaused && queue.lastTaskError?.message === 'oops')

    expect(queue.lastTaskError?.message).toBe('oops')
    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Paused])

    queue.resumeQueue()

    await waitFor(() => queue.isIdle)

    expect(statuses).toEqual([
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Paused,
      QueueStatus.Processing,
      QueueStatus.Idle
    ])
  })

  test('cancel stops processing, prevents stale idle transitions, and resurrects cleanly', async () => {
    const statuses: QueueStatus[] = []
    const queue = new Queue({ onStatusChange: (status) => statuses.push(status) })
    let secondRan = false

    queue.addTask(async () => {
      queue.cancelQueue()
    })
    await waitFor(() => (queue as any).runner !== null)
    await (queue as any).runner

    expect(queue.isCancelled).toBe(true)
    expect(queue.size).toBe(0)
    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Cancelled])

    queue.addTask(async () => {
      secondRan = true
    })

    await waitFor(() => (queue as any).runner !== null)
    await (queue as any).runner

    expect(queue.isIdle).toBe(true)

    expect(statuses).toEqual([
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Cancelled,
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Idle
    ])
  })

  test('queues work added during idle notification and restarts runner', async () => {
    const statuses: QueueStatus[] = []
    const runs: string[] = []
    const queue = new Queue({
      onStatusChange: (status) => {
        statuses.push(status)
        if (status === QueueStatus.Idle && runs.length === 1) {
          queue.addTask(async () => runs.push('followup'))
        }
      }
    })

    queue.addTask(async () => runs.push('first'))

    await waitFor(() => queue.isIdle && runs.length === 1)

    // Runner is still finalizing when addTask is invoked from Idle notification
    expect(queue.size).toBe(1)

    await new Promise((resolve) => setTimeout(resolve, 0))

    queue.resumeQueue()

    await waitFor(() => queue.isIdle && runs.length === 2)

    expect(runs).toEqual(['first', 'followup'])
    expect(statuses).toEqual([
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Idle
    ])
  })

  test('clearQueue respects current status and reasserts idle when safe', async () => {
    const statuses: QueueStatus[] = []
    const queue = new Queue({ onStatusChange: (status) => statuses.push(status) })
    const stopEarly = deferred<void>()

    queue.addTask(async () => {
      queue.clearQueue() // should not flip status while processing
      stopEarly.resolve()
    })
    queue.addTask(async () => {
      throw new Error('should be cleared')
    })

    await stopEarly.promise
    await waitFor(() => queue.isIdle)

    queue.clearQueue() // setter invoked with same status

    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Idle])
    expect(queue.size).toBe(0)
  })

  test('process loop bails when cancellation occurs between pulls', async () => {
    const queue = new Queue()
    const spy = jest.fn()
    const tasks = (queue as any).queue as Array<() => Promise<void>>
    const originalShift = tasks.shift.bind(tasks)
    tasks.shift = () => {
      queue.cancelQueue()
      return originalShift()
    }

    queue.addTask(async () => {
      spy()
    })

    await waitFor(() => queue.isCancelled)
    await waitFor(() => (queue as any).runner === null)

    expect(spy).not.toHaveBeenCalled()
    expect(queue.status).toBe(QueueStatus.Cancelled)
  })

  test('manually pausing without errors waits for resume', async () => {
    const order: string[] = []
    const queue = new Queue()

    queue.addTask(async () => {
      order.push('first')
      queue.pauseQueue()
    })
    queue.addTask(async () => {
      order.push('second')
    })

    await waitFor(() => queue.isPaused)

    queue.resumeQueue()

    await waitFor(() => queue.isIdle && order.length === 2)

    expect(order).toEqual(['first', 'second'])
  })

  test('addNextTask reorders pending work without preempting the current task', async () => {
    const order: string[] = []
    const queue = new Queue()

    queue.addTask(async () => {
      order.push('first')
      queue.addTask(async () => order.push('later'))
      queue.addNextTask(async () => order.push('next'))
    })

    await waitFor(() => queue.isIdle)

    expect(order).toEqual(['first', 'next', 'later'])
  })

  test('addNextTask starts processing when idle and fires expected status transitions', async () => {
    const statuses: QueueStatus[] = []
    const queue = new Queue({ onStatusChange: (status) => statuses.push(status) })
    let ran = false

    queue.addNextTask(async () => {
      ran = true
    })

    await waitFor(() => queue.isIdle && ran)

    expect(statuses).toEqual([QueueStatus.Idle, QueueStatus.Processing, QueueStatus.Idle])
  })

  test('addNextTask resurrects after cancellation', async () => {
    const statuses: QueueStatus[] = []
    const queue = new Queue({ onStatusChange: (status) => statuses.push(status) })

    queue.cancelQueue()
    queue.addNextTask(async () => {})

    await waitFor(() => queue.isIdle)

    expect(statuses).toEqual([
      QueueStatus.Idle,
      QueueStatus.Cancelled,
      QueueStatus.Idle,
      QueueStatus.Processing,
      QueueStatus.Idle
    ])
  })

  test('addNextTask respects paused queues and runs first after resume', async () => {
    const order: string[] = []
    const queue = new Queue()

    queue.addTask(async () => {
      order.push('first')
      queue.pauseQueue()
    })
    queue.addTask(async () => order.push('later'))
    queue.addNextTask(async () => order.push('next'))

    await waitFor(() => queue.isPaused)

    queue.resumeQueue()

    await waitFor(() => queue.isIdle && order.length === 3)

    expect(order).toEqual(['first', 'next', 'later'])
  })

  test('internal helpers short-circuit when cancelled or empty', async () => {
    const queue = new Queue()
    queue.cancelQueue()

    ;(queue as any).startRunner()
    expect(queue.status).toBe(QueueStatus.Cancelled)

    ;(queue as any)._status = QueueStatus.Idle
    ;(queue as any).queue = []
    ;(queue as any).startRunner()
    expect(queue.status).toBe(QueueStatus.Idle)

    const version = (queue as any).version
    ;(queue as any)._status = QueueStatus.Cancelled
    await (queue as any).processLoop(version)
  })

  test('captures non-error rejections when pausing on errors', async () => {
    const queue = new Queue({ pauseOnError: true })

    queue.addTask(async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'string-error'
    })

    await waitFor(() => queue.isPaused && queue.lastTaskError?.message === 'string-error')

    expect(queue.lastTaskError).toBeInstanceOf(Error)

    queue.resumeQueue()
    await waitFor(() => queue.isIdle)
  })

  test('cancelQueue is idempotent', () => {
    const queue = new Queue()

    queue.cancelQueue()
    queue.cancelQueue()

    expect(queue.status).toBe(QueueStatus.Cancelled)
  })
})
