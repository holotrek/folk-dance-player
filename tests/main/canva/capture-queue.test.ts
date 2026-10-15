import { describe, expect, test } from 'vitest'
import type { CaptureStatus } from '@shared/canva'
import { CaptureQueue } from '../../../src/main/canva/capture-queue'
import {
  getDanceSlide,
  saveDeck,
  setDanceSlide,
  type CaptureTarget
} from '../../../src/main/canva/decks'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

function setup(fail: string[] = []) {
  const db = createTestDb()
  const deckId = saveDeck(
    db,
    { viewUrl: 'https://www.canva.com/design/D/T/view', designId: 'D' },
    {
      title: 'Deck',
      pages: [
        { id: 'P1', title: null },
        { id: 'P2', title: null }
      ]
    }
  )
  const files = new Map<string, Buffer>()
  const statuses: CaptureStatus[] = []
  const captured: string[] = []
  let closed = 0
  const queue = new CaptureQueue({
    db,
    capturer: {
      capture: async (t) => {
        captured.push(t.pageId)
        if (fail.includes(t.pageId)) throw new Error('Timed out')
        return Buffer.from(`png ${t.pageId}`)
      },
      close: () => void closed++
    },
    slidesDir: '/data/slides',
    writeFile: async (path, data) => void files.set(path, data),
    onStatus: (s) => statuses.push(s),
    onCaptured: () => undefined
  })
  const target = (pageId: string, position: number): CaptureTarget => ({
    deckId,
    pageId,
    viewUrl: 'https://www.canva.com/design/D/T/view',
    position
  })
  return { db, deckId, queue, files, statuses, captured, target, closed: () => closed }
}

describe('capturing slide images', () => {
  test('captures one at a time, saves each image by deck and page, and frees the capturer after', async () => {
    const { db, deckId, queue, files, captured, target, closed } = setup()
    const hora = addDance(db, { name: 'Hora' })
    setDanceSlide(db, hora, deckId, 2)
    queue.enqueue([target('P1', 1), target('P2', 2)])
    queue.enqueue([target('P2', 2)]) // already queued
    await queue.idle()
    expect(captured).toEqual(['P1', 'P2'])
    expect([...files.keys()]).toEqual([
      `/data/slides/${deckId}-P1.png`,
      `/data/slides/${deckId}-P2.png`
    ])
    expect(getDanceSlide(db, hora)).toMatchObject({
      imageUrl: expect.stringMatching(/^fdp-media:\/\/slide\//),
      captureError: null
    })
    expect(closed()).toBe(1)
  })

  test('a failure is recorded on the slide and the queue goes on', async () => {
    const { db, deckId, queue, captured, statuses, target } = setup(['P1'])
    const hora = addDance(db, { name: 'Hora' })
    setDanceSlide(db, hora, deckId, 1)
    queue.enqueue([target('P1', 1), target('P2', 2)])
    await queue.idle()
    expect(captured).toEqual(['P1', 'P2'])
    expect(getDanceSlide(db, hora)).toMatchObject({ imageUrl: null, captureError: 'Timed out' })
    expect(statuses.find((s) => s.done === 2)).toMatchObject({ total: 2, failed: 1 })
    // The finished batch keeps its counts, so the control window can say what failed.
    expect(queue.current()).toEqual({ running: false, done: 2, total: 2, failed: 1 })
    queue.enqueue([target('P3', 3)])
    expect(queue.current()).toEqual({ running: true, done: 0, total: 1, failed: 0 })
    await queue.idle()
  })
})
