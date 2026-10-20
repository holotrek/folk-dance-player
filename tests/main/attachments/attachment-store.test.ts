import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { AttachmentStore } from '../../../src/main/attachments/attachment-store'
import { LibraryEditError } from '../../../src/main/library/edit'
import { addLibrarySong } from '../helpers/library-fixtures'
import { createTestDb } from '../helpers/test-db'

let root: string
let dataDir: string
let db: ReturnType<typeof createTestDb>

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

// A file in a "downloads" folder outside the app's data folder.
function source(name: string, contents: Buffer | string = PDF): string {
  const path = join(root, 'downloads', name)
  mkdirSync(join(root, 'downloads'), { recursive: true })
  writeFileSync(path, contents)
  return path
}
const stored = (): string[] => {
  try {
    return readdirSync(join(dataDir, 'dance-notes'))
  } catch {
    return []
  }
}
const store = (options: Partial<ConstructorParameters<typeof AttachmentStore>[0]> = {}) =>
  new AttachmentStore({ db, dir: dataDir, ...options })
const dance = () => addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } }).danceId!

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fdp-attach-'))
  dataDir = join(root, 'data')
  db = createTestDb()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('AttachmentStore: PDFs', () => {
  test('attaching copies the file into dance-notes and records its name', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('Hora notes.pdf'))
    expect(s.pdfInfo(id)).toEqual({ name: 'Hora notes.pdf', missing: false })
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).not.toBe('Hora notes.pdf')
    expect(readFileSync(s.pdfPath(id)!)).toEqual(PDF)
  })

  test('the original can be deleted afterwards', () => {
    const id = dance()
    const s = store()
    const original = source('a.pdf')
    s.attachPdf(id, original)
    rmSync(original)
    expect(readFileSync(s.pdfPath(id)!)).toEqual(PDF)
  })

  test('a file that is not a PDF is refused, even when it is named .pdf', () => {
    const id = dance()
    const s = store()
    expect(() => s.attachPdf(id, source('fake.pdf', 'hello world'))).toThrow(LibraryEditError)
    expect(s.pdfInfo(id)).toBeNull()
    expect(stored()).toEqual([])
  })

  test('a missing source, a folder and a file over the limit are refused', () => {
    const id = dance()
    const s = store({ maxPdfBytes: 20 })
    expect(() => s.attachPdf(id, join(root, 'nope.pdf'))).toThrow(LibraryEditError)
    expect(() => s.attachPdf(id, join(root, 'downloads'))).toThrow(LibraryEditError)
    expect(() => s.attachPdf(id, source('big.pdf'))).toThrow(/larger/)
    expect(s.pdfInfo(id)).toBeNull()
    expect(stored()).toEqual([])
  })

  test('attaching again replaces the file and deletes the old copy', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('one.pdf'))
    const first = stored()[0]
    s.attachPdf(id, source('two.pdf', Buffer.concat([PDF, Buffer.from('more')])))
    expect(s.pdfInfo(id)?.name).toBe('two.pdf')
    expect(stored()).toHaveLength(1)
    expect(stored()[0]).not.toBe(first)
  })

  test('a failed copy leaves the old attachment intact and no stray file', () => {
    const id = dance()
    store().attachPdf(id, source('one.pdf'))
    const before = stored()
    const failing = store({
      copyFile: () => {
        throw new Error('disk full')
      }
    })
    expect(() => failing.attachPdf(id, source('two.pdf'))).toThrow(LibraryEditError)
    expect(store().pdfInfo(id)).toEqual({ name: 'one.pdf', missing: false })
    expect(stored()).toEqual(before)
  })

  test('a dance that does not exist leaves no stray file', () => {
    expect(() => store().attachPdf(999, source('a.pdf'))).toThrow()
    expect(stored()).toEqual([])
  })

  test('two dances with the same file name get separate stored files', () => {
    const a = dance()
    const b = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } }).danceId!
    const s = store()
    s.attachPdf(a, source('notes.pdf'))
    s.attachPdf(b, source('notes.pdf'))
    expect(stored()).toHaveLength(2)
    expect(s.pdfPath(a)).not.toBe(s.pdfPath(b))
  })

  test('shows only the base name, and stores under a generated name', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('évé 1.pdf'))
    expect(s.pdfInfo(id)?.name).toBe('évé 1.pdf')
    expect(stored()[0]).toMatch(/^\d+-[0-9a-f]{8}\.pdf$/)
  })

  test('removing clears the record and deletes the file; removing twice is fine', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('a.pdf'))
    s.removePdf(id)
    expect(s.pdfInfo(id)).toBeNull()
    expect(s.pdfPath(id)).toBeNull()
    expect(stored()).toEqual([])
    expect(() => s.removePdf(id)).not.toThrow()
  })

  test('a stored file deleted outside the app is reported missing', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('a.pdf'))
    rmSync(s.pdfPath(id)!)
    expect(s.pdfInfo(id)).toEqual({ name: 'a.pdf', missing: true })
    expect(s.pdfPath(id)).toBeNull()
  })

  test('a dance with no attachment has no info', () => {
    expect(store().pdfInfo(dance())).toBeNull()
  })
})

describe('AttachmentStore: deleteUnreferenced', () => {
  test('deletes unreferenced files and keeps referenced ones', () => {
    const id = dance()
    const s = store()
    s.attachPdf(id, source('keep.pdf'))
    mkdirSync(join(dataDir, 'dance-notes'), { recursive: true })
    writeFileSync(join(dataDir, 'dance-notes', 'orphan.pdf'), PDF)
    s.deleteUnreferenced([
      `dance-notes/orphan.pdf`,
      `dance-notes/${stored().find((n) => n !== 'orphan.pdf')}`
    ])
    expect(stored()).toHaveLength(1)
    expect(s.pdfPath(id)).not.toBeNull()
  })

  test('never touches anything outside the attachment folders', () => {
    const outside = join(root, 'precious.txt')
    writeFileSync(outside, 'keep me')
    store().deleteUnreferenced([
      '../precious.txt',
      'dance-notes/../../precious.txt',
      '/etc/hosts',
      'other/x'
    ])
    expect(readFileSync(outside, 'utf8')).toBe('keep me')
  })

  test('a file that is already gone is fine', () => {
    expect(() => store().deleteUnreferenced(['dance-notes/none.pdf'])).not.toThrow()
  })
})

// Smallest files that carry each image format's signature.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20)
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(8)
])
const storedImages = (): string[] => {
  try {
    return readdirSync(join(dataDir, 'slide-images'))
  } catch {
    return []
  }
}
const withCanva = (danceId: number): void => {
  const deck = Number(
    db
      .prepare("INSERT INTO canva_decks (view_url, design_id, pages) VALUES (?, 'D', '[]')")
      .run(`https://x/${Math.random()}/view`).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO dance_prefs (dance_id, canva_deck_id, canva_page_id, canva_page_index)
     VALUES (?, ?, 'P1', 1)
     ON CONFLICT (dance_id) DO UPDATE SET canva_deck_id = excluded.canva_deck_id,
       canva_page_id = excluded.canva_page_id, canva_page_index = excluded.canva_page_index`
  ).run(danceId, deck)
}

describe('AttachmentStore: slide images', () => {
  test.each([
    ['photo.png', PNG, '.png'],
    ['photo.jpg', JPEG, '.jpg'],
    ['photo.jpeg', JPEG, '.jpg'],
    ['photo.gif', GIF, '.gif'],
    ['photo.webp', WEBP, '.webp']
  ])('attaching %s copies it into slide-images and records its name', (name, bytes, ext) => {
    const id = dance()
    const s = store()
    s.attachImage(id, source(name, bytes))
    const info = s.imageInfo(id)
    expect(info).toMatchObject({ name, missing: false })
    expect(storedImages()).toHaveLength(1)
    expect(storedImages()[0]).toMatch(new RegExp(`^${id}-[0-9a-f]{8}\\${ext}$`))
    expect(readFileSync(s.imagePath(id)!)).toEqual(bytes)
  })

  test('a file that is not an image is refused, even when named .png', () => {
    const id = dance()
    expect(() => store().attachImage(id, source('fake.png', 'hello world'))).toThrow(
      LibraryEditError
    )
    expect(store().imageInfo(id)).toBeNull()
    expect(storedImages()).toEqual([])
  })

  test('an unsupported extension is refused, even with image bytes', () => {
    const id = dance()
    expect(() => store().attachImage(id, source('photo.bmp', PNG))).toThrow(LibraryEditError)
    expect(storedImages()).toEqual([])
  })

  test('a file over the limit is refused', () => {
    const id = dance()
    expect(() => store({ maxImageBytes: 10 }).attachImage(id, source('big.png', PNG))).toThrow(
      /larger/
    )
  })

  test('attaching again replaces the file and gives a new version; a failed copy leaves the old image', () => {
    const id = dance()
    const s = store()
    s.attachImage(id, source('one.png', PNG))
    const first = s.imageInfo(id)!.version
    s.attachImage(id, source('two.jpg', JPEG))
    expect(s.imageInfo(id)!.version).not.toBe(first)
    expect(storedImages()).toHaveLength(1)
    const failing = store({
      copyFile: () => {
        throw new Error('disk full')
      }
    })
    expect(() => failing.attachImage(id, source('three.png', PNG))).toThrow(LibraryEditError)
    expect(store().imageInfo(id)?.name).toBe('two.jpg')
    expect(storedImages()).toHaveLength(1)
  })

  test('slideShows is null with only an image, null with only a Canva slide, and canva by default with both', () => {
    const id = dance()
    const s = store()
    expect(s.slideShows(id)).toBeNull()
    s.attachImage(id, source('a.png', PNG))
    expect(s.slideShows(id)).toBeNull()
    const other = addLibrarySong(db, { title: 'Kolo', dance: { name: 'Kolo' } }).danceId!
    withCanva(other)
    expect(s.slideShows(other)).toBeNull()
    withCanva(id)
    expect(s.slideShows(id)).toBe('canva')
  })

  test('setSlideSource changes the choice only with both sources', () => {
    const id = dance()
    const s = store()
    expect(() => s.setSlideSource(id, 'image')).toThrow(LibraryEditError)
    s.attachImage(id, source('a.png', PNG))
    expect(() => s.setSlideSource(id, 'image')).toThrow(LibraryEditError)
    withCanva(id)
    s.setSlideSource(id, 'image')
    expect(s.slideShows(id)).toBe('image')
    s.setSlideSource(id, 'canva')
    expect(s.slideShows(id)).toBe('canva')
  })

  test('removing the image clears the file, the record and the choice', () => {
    const id = dance()
    const s = store()
    s.attachImage(id, source('a.png', PNG))
    withCanva(id)
    s.setSlideSource(id, 'image')
    s.removeImage(id)
    expect(s.imageInfo(id)).toBeNull()
    expect(storedImages()).toEqual([])
    expect(s.slideShows(id)).toBeNull()
    expect(
      db.prepare('SELECT slide_source AS s FROM dance_prefs WHERE dance_id = ?').get(id)
    ).toEqual({ s: null })
    expect(() => s.removeImage(id)).not.toThrow()
  })

  test('imageInfo reports a deleted file as missing, and imagePath is null', () => {
    const id = dance()
    const s = store()
    s.attachImage(id, source('a.png', PNG))
    rmSync(s.imagePath(id)!)
    expect(s.imageInfo(id)).toMatchObject({ name: 'a.png', missing: true })
    expect(s.imagePath(id)).toBeNull()
  })

  test('deleteUnreferenced also handles slide images and keeps referenced ones', () => {
    const id = dance()
    const s = store()
    s.attachImage(id, source('a.png', PNG))
    mkdirSync(join(dataDir, 'slide-images'), { recursive: true })
    writeFileSync(join(dataDir, 'slide-images', 'orphan.png'), PNG)
    s.deleteUnreferenced([
      'slide-images/orphan.png',
      `slide-images/${storedImages().find((n) => n !== 'orphan.png')}`
    ])
    expect(storedImages()).toHaveLength(1)
    expect(s.imagePath(id)).not.toBeNull()
  })
})
