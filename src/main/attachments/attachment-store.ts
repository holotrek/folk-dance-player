import { randomBytes } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  statSync
} from 'node:fs'
import { basename, join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { inTransaction } from '../db/transaction'
import { LibraryEditError } from '../library/edit'

// The organizer's own files for a dance, copied into the app data folder so moving or deleting the
// original never breaks the dance (0.3.0 spec §3.6, §3.7). Only this class names these paths: the
// renderer sends dance IDs, and the database holds a stored file's name inside its folder.
export const PDF_DIR = 'dance-notes'
export const MAX_PDF_BYTES = 50 * 1024 * 1024

export interface AttachmentStoreOptions {
  db: DatabaseSync
  dir: string // the app data folder
  maxPdfBytes?: number
  copyFile?: (from: string, to: string) => void
}

const megabytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`

// The first `length` bytes of a file, as text.
function head(path: string, length: number): string {
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const read = readSync(fd, buffer, 0, length, 0)
    return buffer.subarray(0, read).toString('latin1')
  } finally {
    closeSync(fd)
  }
}

export class AttachmentStore {
  private readonly maxPdfBytes: number
  private readonly copyFile: (from: string, to: string) => void

  constructor(private readonly options: AttachmentStoreOptions) {
    this.maxPdfBytes = options.maxPdfBytes ?? MAX_PDF_BYTES
    this.copyFile = options.copyFile ?? copyFileSync
  }

  private get db(): DatabaseSync {
    return this.options.db
  }

  private folder(name: string): string {
    return join(this.options.dir, name)
  }

  // Checks that `source` is a regular file within `limit` bytes; returns nothing, or refuses.
  private checkSource(source: string, limit: number, what: string): void {
    let size: number
    try {
      const info = statSync(source)
      if (!info.isFile()) throw new LibraryEditError(`Choose a ${what} file.`)
      size = info.size
    } catch (err) {
      if (err instanceof LibraryEditError) throw err
      throw new LibraryEditError("That file can't be found.")
    }
    if (size > limit) {
      throw new LibraryEditError(`That ${what} is larger than ${megabytes(limit)}.`)
    }
  }

  // Copies `source` into `folder` under a generated name, records it with `record`, and only then
  // deletes the file it replaces. A failure before the record changes leaves nothing behind.
  private store(
    folder: string,
    danceId: number,
    source: string,
    extension: string,
    record: (storedName: string) => string | null // returns the stored name it replaced
  ): void {
    mkdirSync(this.folder(folder), { recursive: true })
    const storedName = `${danceId}-${randomBytes(4).toString('hex')}${extension}`
    const destination = join(this.folder(folder), storedName)
    try {
      this.copyFile(source, destination)
    } catch (err) {
      rmSync(destination, { force: true })
      throw new LibraryEditError(
        `Couldn't copy the file: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    let replaced: string | null
    try {
      replaced = inTransaction(this.db, () => record(storedName))
    } catch (err) {
      rmSync(destination, { force: true })
      throw err
    }
    if (replaced) rmSync(join(this.folder(folder), replaced), { force: true })
  }

  attachPdf(danceId: number, source: string): void {
    this.checkSource(source, this.maxPdfBytes, 'PDF')
    if (head(source, 5) !== '%PDF-') throw new LibraryEditError('That file is not a PDF.')
    this.store(PDF_DIR, danceId, source, '.pdf', (storedName) => {
      const previous = this.db
        .prepare('SELECT notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?')
        .get(danceId) as { path: string | null } | undefined
      this.db
        .prepare(
          `INSERT INTO dance_prefs (dance_id, notes_pdf_name, notes_pdf_path) VALUES (?, ?, ?)
           ON CONFLICT (dance_id) DO UPDATE SET notes_pdf_name = excluded.notes_pdf_name,
             notes_pdf_path = excluded.notes_pdf_path`
        )
        .run(danceId, basename(source), storedName)
      return previous?.path ?? null
    })
  }

  removePdf(danceId: number): void {
    const row = this.db
      .prepare('SELECT notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?')
      .get(danceId) as { path: string | null } | undefined
    this.db
      .prepare(
        'UPDATE dance_prefs SET notes_pdf_name = NULL, notes_pdf_path = NULL WHERE dance_id = ?'
      )
      .run(danceId)
    if (row?.path) rmSync(join(this.folder(PDF_DIR), row.path), { force: true })
  }

  // The stored file's absolute path, or null when there is none or it has gone missing.
  pdfPath(danceId: number): string | null {
    const row = this.db
      .prepare('SELECT notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?')
      .get(danceId) as { path: string | null } | undefined
    if (!row?.path) return null
    const path = join(this.folder(PDF_DIR), row.path)
    return existsSync(path) ? path : null
  }

  // Deletes stored files (paths like 'dance-notes/<name>') that no dance refers to any more, after a
  // merge. Anything outside the attachment folders, or still referenced, is left alone.
  deleteUnreferenced(relativePaths: string[]): void {
    for (const relative of relativePaths) {
      const match = /^dance-notes\/([^/\\]+)$/.exec(relative)
      if (!match || match[1] === '..' || match[1] === '.') continue
      const stillUsed = this.db
        .prepare('SELECT 1 FROM dance_prefs WHERE notes_pdf_path = ?')
        .get(match[1])
      if (!stillUsed) rmSync(join(this.folder(PDF_DIR), match[1]), { force: true })
    }
  }

  pdfInfo(danceId: number): { name: string; missing: boolean } | null {
    const row = this.db
      .prepare(
        'SELECT notes_pdf_name AS name, notes_pdf_path AS path FROM dance_prefs WHERE dance_id = ?'
      )
      .get(danceId) as { name: string | null; path: string | null } | undefined
    if (!row?.name || !row.path) return null
    return { name: row.name, missing: !existsSync(join(this.folder(PDF_DIR), row.path)) }
  }
}
