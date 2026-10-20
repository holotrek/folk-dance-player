import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CAPTURES_IDLE } from '@shared/canva'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { CanvaService } from '../../../src/main/canva/canva-service'
import type { CaptureTarget } from '../../../src/main/canva/decks'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addDance } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

const fixture = readFileSync(join(__dirname, '../../fixtures/canva-view.html'), 'utf8')
const VIEW = 'https://www.canva.com/design/DAHXoz6s10M/T9RGM0V3Sdllshv8NtdBrw/view'

function setup(withCanva = true) {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  const queued: CaptureTarget[][] = []
  let libraryChanges = 0
  const service = new CanvaService({
    db,
    fetcher: async () => ({ status: 200, text: async () => fixture, headers: { get: () => null } }),
    queue: { enqueue: (t) => void queued.push(t) },
    online: () => true,
    onChange: () => void libraryChanges++
  })
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 3 }),
    importer: {
      run: async () => emptySummary(),
      cancel: () => undefined,
      previewApple: async () => ({ trackCount: 0, playlists: [], tagSample: [] }),
      checkPlaylistConflicts: () => []
    },
    dialogs: {
      pickMusic: async () => [],
      pickAppleLibrary: async () => null,
      pickPdf: async () => null,
      pickImage: async () => null
    },
    player: testPlayer(db, settings),
    onLibraryChanged: () => void libraryChanges++,
    onProgramsChanged: () => undefined,
    canva: withCanva
      ? { service, captureStatus: () => ({ running: true, done: 1, total: 3, failed: 0 }) }
      : undefined
  }
  return { h: createHandlers(deps) as InvokeHandlers, db, queued, changes: () => libraryChanges }
}

describe('Canva handlers', () => {
  test('add a deck, then list it and its slides', async () => {
    const { h } = setup()
    const deck = await h['canva:addDeck'](VIEW)
    expect(deck).toMatchObject({ viewUrl: VIEW, title: "Dance n' Jam Tunes", pageCount: 4 })
    expect(h['canva:decks']()).toEqual([deck])
    expect((h['canva:deckPages'](deck.id) as { id: string }[]).map((p) => p.id)).toHaveLength(4)
  })

  test("link a dance's slide by number, then clear it", async () => {
    const { h, db, queued, changes } = setup()
    const deck = await h['canva:addDeck'](VIEW)
    const hora = addDance(db, { name: 'Ali Paşa' })
    expect(await h['canva:linkSlide'](hora, deck.id, 3)).toMatchObject({
      deckId: deck.id,
      position: 3,
      title: 'Ali Paşa'
    })
    expect(queued).toHaveLength(1)
    const before = changes()
    await h['canva:clearSlide'](hora)
    expect(changes()).toBe(before + 1)
  })

  test('refresh slides, and report the capture progress', async () => {
    const { h } = setup()
    await h['canva:addDeck'](VIEW)
    expect(await h['canva:refreshSlides']()).toEqual({ decks: 1, formatChanged: 0, unreachable: 0 })
    expect(h['canva:captureStatus']()).toEqual({ running: true, done: 1, total: 3, failed: 0 })
  })

  test('refresh decks re-reads them and saves no images', async () => {
    const { h, queued, changes } = setup()
    await h['canva:addDeck'](VIEW)
    const before = changes()
    expect(await h['canva:refreshDecks']()).toEqual({ decks: 1, formatChanged: 0, unreachable: 0 })
    expect(changes()).toBeGreaterThan(before)
    expect(queued).toEqual([])
  })

  test('without Canva (tests, or before startup) nothing is captured', async () => {
    const { h } = setup(false)
    expect(h['canva:captureStatus']()).toEqual(CAPTURES_IDLE)
    await expect(h['canva:addDeck'](VIEW)).rejects.toThrow("Canva slides aren't available")
    await expect(h['canva:refreshDecks']()).rejects.toThrow("Canva slides aren't available")
  })
})
