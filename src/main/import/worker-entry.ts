// Entry point of the import utility process (spec §9). Started by utility-worker.ts.
import { runWorkerJob } from './worker-core'
import type { ParentMessage } from './worker-protocol'

let cancelled = false

process.parentPort.on('message', (event) => {
  const message = event.data as ParentMessage
  if (message.type === 'cancel') {
    cancelled = true
  } else {
    void runWorkerJob(
      message.job,
      (m) => process.parentPort.postMessage(m),
      () => cancelled
    )
  }
})
