import { runWorkerJob } from './worker-core'
import type { WorkerHandle, WorkerMessage } from './worker-protocol'

// Runs worker jobs on the main process's event loop. Used by tests; the app uses the
// utility-process worker so large imports never block the UI.
export function startInProcessWorker(): WorkerHandle {
  const listeners: ((message: WorkerMessage) => void)[] = []
  const exitListeners: (() => void)[] = []
  let cancelled = false
  return {
    start(job) {
      // Deliver messages asynchronously, as a real process would.
      void runWorkerJob(
        job,
        (m) => queueMicrotask(() => listeners.forEach((l) => l(m))),
        () => cancelled
      )
    },
    cancel: () => {
      cancelled = true
    },
    onMessage: (listener) => void listeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
    dispose: () => exitListeners.splice(0)
  }
}
