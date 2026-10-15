import type { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { CAPTURES_IDLE, type CaptureStatus } from '@shared/canva'
import { recordCapture, recordCaptureError, type CaptureTarget } from './decks'

// Takes the picture of one slide (main/index.ts: an off-screen Canva view, nudged so Canva's
// controls fade, then captured). close() frees it once the queue is empty.
export interface SlideCapturer {
  capture(target: CaptureTarget): Promise<Buffer>
  close(): void
}

export interface CaptureDeps {
  db: DatabaseSync
  capturer: SlideCapturer
  slidesDir: string
  writeFile(path: string, data: Buffer): Promise<void>
  onStatus(status: CaptureStatus): void
  onCaptured(): void // a slide image was saved or failed: the library and projector refresh
}

const key = (t: CaptureTarget) => `${t.deckId}/${t.pageId}`

// Captures slides one at a time in the background (spec §8.3). Each image is saved under the app
// data folder, keyed by deck and page ID, so a moved slide keeps its image. A failure keeps the
// previous image and records why.
export class CaptureQueue {
  private pending: CaptureTarget[] = []
  private status: CaptureStatus = CAPTURES_IDLE
  private running: Promise<void> | null = null

  constructor(private readonly deps: CaptureDeps) {}

  current(): CaptureStatus {
    return this.status
  }

  enqueue(targets: CaptureTarget[]): void {
    const queued = new Set(this.pending.map(key))
    const fresh = targets.filter((t) => !queued.has(key(t)) && queued.add(key(t)))
    if (fresh.length === 0) return
    this.pending.push(...fresh)
    // A new batch starts counting from zero; one still running grows.
    const base = this.status.running ? this.status : CAPTURES_IDLE
    this.update({ ...base, running: true, total: base.total + fresh.length })
    this.running ??= this.run().finally(() => (this.running = null))
  }

  // Resolves when every queued capture has finished.
  async idle(): Promise<void> {
    while (this.running) await this.running
  }

  private async run(): Promise<void> {
    for (let target = this.pending.shift(); target; target = this.pending.shift()) {
      try {
        const image = await this.deps.capturer.capture(target)
        const path = join(this.deps.slidesDir, `${target.deckId}-${target.pageId}.png`)
        await this.deps.writeFile(path, image)
        recordCapture(this.deps.db, target.deckId, target.pageId, path)
        this.update({ done: this.status.done + 1 })
      } catch (err) {
        recordCaptureError(
          this.deps.db,
          target.deckId,
          target.pageId,
          err instanceof Error ? err.message : String(err)
        )
        this.update({ done: this.status.done + 1, failed: this.status.failed + 1 })
      }
      this.deps.onCaptured()
    }
    this.deps.capturer.close()
    this.update({ running: false })
  }

  private update(change: Partial<CaptureStatus>): void {
    this.status = { ...this.status, ...change }
    this.deps.onStatus(this.status)
  }
}
