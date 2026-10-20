import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { InvokeHandlers } from '@shared/contract'
import { emptySummary } from '@shared/import'
import { AttachmentStore } from '../../../src/main/attachments/attachment-store'
import { createHandlers, type HandlerDeps } from '../../../src/main/ipc/handlers'
import { SettingsStore } from '../../../src/main/settings/settings-store'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'
import { testPlayer } from '../helpers/test-player'

function setup(over: (db: ReturnType<typeof createTestDb>) => Partial<HandlerDeps> = () => ({})) {
  const db = createTestDb()
  const settings = new SettingsStore(db)
  let changes = 0
  const deps: HandlerDeps = {
    db,
    settings,
    appInfo: () => ({ version: '0', dbPath: '', schemaVersion: 2 }),
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
    onLibraryChanged: () => void changes++,
    onProgramsChanged: () => undefined,
    ...over(db)
  }
  return {
    db,
    h: createHandlers(deps) as InvokeHandlers,
    changes: () => changes,
    settings: deps.settings
  }
}

const query = {
  search: '',
  filter: { kind: 'all' as const },
  sort: { column: 'title' as const, direction: 'asc' as const }
}

describe('library handlers', () => {
  test('list and detail read the library', async () => {
    const { db, h } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora Mare' } })
    expect((await h['library:list'](query)).map((r) => r.label)).toEqual(['Hora Mare ♪ Hora'])
    expect((await h['library:song'](s.songId))?.dances[0].name).toBe('Hora Mare')
  })

  test('every edit announces that the library changed', async () => {
    const { db, h, changes } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:updateSong'](s.songId, { artist: 'Taraf' })
    await h['library:updateDance'](s.danceId!, { country: 'Romania' })
    const created = await h['library:createDance'](s.songId, 'Sârba')
    await h['library:setDefaultDance'](s.songId, created)
    await h['library:unlinkDance'](s.songId, created)
    await h['library:setFavorite']([s.fileId], true)
    const p = await h['playlists:create']('Mine')
    await h['playlists:add'](p, [s.fileId])
    expect(changes()).toBe(8)
    expect((await h['playlists:list']()).map((x) => [x.name, x.itemCount])).toEqual([['Mine', 1]])
  })

  test('re-apply mapping uses the mapping chosen for it, and tags are readable', async () => {
    const { db, h } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    db.prepare("UPDATE files SET tag_artist = 'Yves Moreau' WHERE id = ?").run(s.fileId)
    expect((await h['library:songTags']([s.songId]))[0].artist).toBe('Yves Moreau')
    const mapping = {
      artistFrom: 'ignore' as const,
      teacherFrom: 'ignore' as const,
      choreographerFrom: 'artistTag' as const,
      genreIsCountry: false
    }
    expect(await h['library:reapplyMapping']([s.songId], mapping)).toEqual({
      songs: 1,
      skippedSharedDances: 0
    })
    expect((await h['library:song'](s.songId))?.dances[0].choreographer).toBe('Yves Moreau')
  })

  test('suggestions include the dance types from settings', async () => {
    const { h, settings } = setup()
    settings.set('danceTypeSuggestions', ['Line'])
    expect(await h['library:suggestions']()).toEqual({
      people: [],
      countries: [],
      danceTypes: ['Line']
    })
  })
})

describe('PDF handlers', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

  // Handlers with a real AttachmentStore on a temp folder; `picked` is what the dialog returns
  // ('FILE' is a small PDF made here).
  function build(
    picked: string | null,
    openPath: (path: string) => Promise<string> = async () => ''
  ) {
    const root = mkdtempSync(join(tmpdir(), 'fdp-pdf-'))
    dirs.push(root)
    const file = join(root, 'Hora notes.pdf')
    writeFileSync(file, '%PDF-1.4\n%%EOF\n')
    const image = join(root, 'Slide.png')
    writeFileSync(
      image,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(8)
      ])
    )
    const opened: string[] = []
    let attachments!: AttachmentStore
    const ctx = setup((db) => {
      attachments = new AttachmentStore({ db, dir: join(root, 'data') })
      return {
        dialogs: {
          pickMusic: async () => [],
          pickAppleLibrary: async () => null,
          pickPdf: async () => (picked === 'FILE' ? file : picked === 'IMAGE' ? null : picked),
          pickImage: async () => (picked === 'IMAGE' ? image : picked === 'FILE' ? null : picked)
        },
        attachments,
        openPath: async (path: string) => {
          opened.push(path)
          return openPath(path)
        }
      }
    })
    return { ...ctx, attachments, opened }
  }

  test('attaching a PDF through the dialog records it and announces the change', async () => {
    const { db, h, changes } = build('FILE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(await h['library:attachNotesPdf'](s.danceId!)).toBe(true)
    expect((await h['library:song'](s.songId))?.dances[0].notesPdf).toEqual({
      name: 'Hora notes.pdf',
      missing: false
    })
    expect(changes()).toBe(1)
  })

  test('a canceled dialog returns false and changes nothing', async () => {
    const { db, h, changes } = build(null)
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(await h['library:attachNotesPdf'](s.danceId!)).toBe(false)
    expect((await h['library:song'](s.songId))?.dances[0].notesPdf).toBeNull()
    expect(changes()).toBe(0)
  })

  test('Open passes the stored path to openPath, never a path from the caller', async () => {
    const { db, h, attachments, opened } = build('FILE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:attachNotesPdf'](s.danceId!)
    await h['library:openNotesPdf'](s.danceId!)
    expect(opened).toEqual([attachments.pdfPath(s.danceId!)])
  })

  test('Open on a missing PDF is refused', async () => {
    const { db, h, opened } = build('FILE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await expect(h['library:openNotesPdf'](s.danceId!)).rejects.toThrow('The PDF is missing.')
    expect(opened).toEqual([])
  })

  test('an error string from the system becomes an error', async () => {
    const { db, h } = build('FILE', async () => 'no application')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:attachNotesPdf'](s.danceId!)
    await expect(h['library:openNotesPdf'](s.danceId!)).rejects.toThrow(/no application/)
  })

  test('Remove deletes the PDF and announces the change', async () => {
    const { db, h, attachments, changes } = build('FILE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:attachNotesPdf'](s.danceId!)
    await h['library:removeNotesPdf'](s.danceId!)
    expect(attachments.pdfPath(s.danceId!)).toBeNull()
    expect(changes()).toBe(2)
  })

  test('after a merge the unreferenced PDF is deleted from disk, and the adopted one is kept', async () => {
    const { db, h, attachments } = build('FILE')
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, { title: 'B', dance: { name: 'Lesnoto' } })
    await h['library:attachNotesPdf'](a.danceId!)
    const aPath = attachments.pdfPath(a.danceId!)!
    await h['library:attachNotesPdf'](b.danceId!)
    const bPath = attachments.pdfPath(b.danceId!)!
    await h['library:mergeDances'](a.danceId!, b.danceId!)
    expect(existsSync(aPath)).toBe(true)
    expect(existsSync(bPath)).toBe(false)
    expect(attachments.pdfPath(a.danceId!)).toBe(aPath)
  })

  test('a failed merge deletes nothing', async () => {
    const { db, h, attachments } = build('FILE')
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'Lesnoto' } })
    await h['library:attachNotesPdf'](a.danceId!)
    const path = attachments.pdfPath(a.danceId!)!
    expect(() => h['library:mergeDances'](a.danceId!, a.danceId!)).toThrow()
    expect(existsSync(path)).toBe(true)
  })

  test('attaching a slide image through the dialog records it, with a version URL', async () => {
    const { db, h, changes } = build('IMAGE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(await h['library:attachSlideImage'](s.danceId!)).toBe(true)
    const image = (await h['library:song'](s.songId))?.dances[0].slideImage
    expect(image).toMatchObject({ name: 'Slide.png', missing: false })
    expect(image?.url).toMatch(new RegExp(`^fdp-media://dance-image/${s.danceId}\\?v=`))
    expect(changes()).toBe(1)
  })

  test('a canceled image dialog returns false and changes nothing', async () => {
    const { db, h, changes } = build(null)
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    expect(await h['library:attachSlideImage'](s.danceId!)).toBe(false)
    expect(changes()).toBe(0)
  })

  test('removing the slide image announces the change', async () => {
    const { db, h, attachments, changes } = build('IMAGE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:attachSlideImage'](s.danceId!)
    await h['library:removeSlideImage'](s.danceId!)
    expect(attachments.imagePath(s.danceId!)).toBeNull()
    expect(changes()).toBe(2)
  })

  test('the slide choice is refused without both sources, and accepted with both', async () => {
    const { db, h, attachments } = build('IMAGE')
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await h['library:attachSlideImage'](s.danceId!)
    expect(() => h['library:setSlideSource'](s.danceId!, 'image')).toThrow()
    const deck = Number(
      db
        .prepare(
          "INSERT INTO canva_decks (view_url, design_id, pages) VALUES ('https://x/v', 'D', '[]')"
        )
        .run().lastInsertRowid
    )
    db.prepare(
      'UPDATE dance_prefs SET canva_deck_id = ?, canva_page_id = ?, canva_page_index = 1 WHERE dance_id = ?'
    ).run(deck, 'P1', s.danceId)
    await h['library:setSlideSource'](s.danceId!, 'image')
    expect(attachments.slideShows(s.danceId!)).toBe('image')
    expect((await h['library:song'](s.songId))?.dances[0].slideShows).toBe('image')
  })

  test('after a merge the unreferenced slide image is deleted, and the adopted one is kept', async () => {
    const { db, h, attachments } = build('IMAGE')
    const a = addLibrarySong(db, { title: 'A', dance: { name: 'Lesnoto' } })
    const b = addLibrarySong(db, { title: 'B', dance: { name: 'Lesnoto' } })
    await h['library:attachSlideImage'](a.danceId!)
    const aPath = attachments.imagePath(a.danceId!)!
    await h['library:attachSlideImage'](b.danceId!)
    const bPath = attachments.imagePath(b.danceId!)!
    await h['library:mergeDances'](a.danceId!, b.danceId!)
    expect(existsSync(aPath)).toBe(true)
    expect(existsSync(bPath)).toBe(false)
  })

  test('without attachments the PDF channels refuse', async () => {
    const { db, h } = setup()
    const s = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    await expect(h['library:attachNotesPdf'](s.danceId!)).rejects.toThrow(/aren't available/)
  })
})
