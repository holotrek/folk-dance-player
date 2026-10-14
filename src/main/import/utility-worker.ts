import { utilityProcess } from 'electron'
import workerPath from './worker-entry?modulePath'
import type { ParentMessage, WorkerHandle, WorkerMessage } from './worker-protocol'

// One utility process per job, so a crash or a huge import never affects the main process.
export function startUtilityWorker(): WorkerHandle {
  const child = utilityProcess.fork(workerPath, [], { serviceName: 'Folk Dance Player Import' })
  let disposed = false
  const send = (message: ParentMessage): void => child.postMessage(message)
  return {
    start: (job) => send({ type: 'job', job }),
    cancel: () => send({ type: 'cancel' }),
    onMessage: (listener) => void child.on('message', (m: WorkerMessage) => listener(m)),
    onExit: (listener) =>
      void child.on('exit', () => {
        if (!disposed) listener()
      }),
    dispose: () => {
      disposed = true
      child.kill()
    }
  }
}
