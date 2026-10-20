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
