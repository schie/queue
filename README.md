# @schie/queue

A tiny, promise-based task queue that runs jobs sequentially with explicit pause/resume and cancellation controls. Designed to keep a single consumer in-order, surface errors deterministically, and make queue status observable for UI or orchestration hooks.

## Features

- ✅ Single runner, in-order task execution (no accidental parallelism)
- ⏸️ Explicit pause/resume with backpressure-friendly blocking
- 🛑 Cancellation that flushes pending work and blocks stale generations from changing state
- 🚨 Optional `pauseOnError` flow that captures the last task error and waits for a resume signal
- 🕹️ Status callbacks for wiring into logs, metrics, or UI (`Idle` → `Processing` → `Paused/Cancelled`)
- 📦 Zero dependencies, ESM + CJS builds, typed with TypeScript

## Installation

```bash
npm install @schie/queue
```

Requires Node.js 20+.

## Quick Start

```typescript
import { Queue, QueueStatus } from '@schie/queue'

const queue = new Queue({
  onStatusChange: (status) => console.log('status:', QueueStatus[status])
})

queue.addTask(async () => {
  await doWork('first')
})

queue.addTask(async () => {
  await doWork('second')
})

// Pause new work mid-flight
queue.pauseQueue()

setTimeout(() => {
  // Clear any previous error and resume processing
  queue.resumeQueue()
}, 500)
```

### Handling errors with `pauseOnError`

```typescript
const queue = new Queue({
  onStatusChange: (status) => console.log('status:', QueueStatus[status]),
  pauseOnError: true
})

queue.addTask(async () => {
  throw new Error('oops')
})

queue.addTask(async () => doWork('after error')) // waits until resume

// When a task fails:
// - status flips to Paused
// - lastTaskError is set
// - processing waits until resumeQueue() is called

if (queue.lastTaskError) {
  console.error('last error:', queue.lastTaskError.message)
  queue.clearLastError()
  queue.resumeQueue()
}
```

### Cancellation and auto-resurrection

```typescript
queue.addTask(async () => doWork('maybe cancel me'))
queue.cancelQueue() // clears pending tasks and sets status Cancelled

// Later, adding a task resurrects the queue into a fresh generation
queue.addTask(async () => doWork('fresh start')) // status returns to Idle → Processing
```

## API

### `Queue` constructor

```typescript
type QueueOptions = {
  onStatusChange?: (status: QueueStatus) => void;
  pauseOnError?: boolean;
};

new Queue(options?: QueueOptions);
```

- `onStatusChange` fires only on real status transitions.
- `pauseOnError` toggles whether task errors pause the queue and are surfaced via `lastTaskError` (defaults to `false`).

### Methods

- `addTask(task: () => Promise<void>, dedupeKey?: string)` — enqueue a task; if `dedupeKey` matches the last pending task key, skip enqueueing; auto-starts if idle and auto-resurrects after cancellation.
- `pauseQueue()` — transition to `Paused` if currently processing.
- `resumeQueue()` — clears `lastTaskError`, transitions back to `Processing`, and unblocks paused processing. Also restarts if idle with pending work.
- `cancelQueue()` — set status to `Cancelled`, flush pending tasks, and invalidate any in-flight runner.
- `clearQueue()` — remove pending tasks; leaves status `Idle` when not processing/paused/cancelled.
- `clearLastError()` — reset `lastTaskError` without changing status.
- `addNextTask(task: () => Promise<void>)` — enqueue a task to run before other pending tasks (after the current in-flight task); auto-starts if idle and auto-resurrects after cancellation.

### Properties

- `status: QueueStatus` — current lifecycle state (`Idle`, `Processing`, `Paused`, `Cancelled`).
- `isProcessing | isPaused | isCancelled | isIdle` — boolean helpers.
- `size: number` — pending task count.
- `lastTaskError: Error | null` — most recent error when `pauseOnError` is enabled.

### Invariants and behavior

- Single runner: tasks execute sequentially; the queue never introduces parallelism.
- Generation guard: cancellation increments an internal version so stale runners cannot revert status later.
- Draining: when the queue empties (and not cancelled), status returns to `Idle`.
- Pausing: while paused, processing blocks until `resumeQueue` is called.

## Scripts and Testing

- `npm test -- --watchman=false` — run the Jest suite with coverage (keep it at 100%).
- `npm run build` — emit ESM/CJS builds and types.
- `npm run lint` — lint the repo (plus lockfile validation).

## Contributing

PRs are welcome. Please:

- Keep behavior changes aligned with the TypeScript source and this README.
- Preserve the single-consumer, in-order contract and status integrity.
- Add or update tests to maintain 100% coverage.
- Use the provided `npm` scripts instead of bespoke commands.
