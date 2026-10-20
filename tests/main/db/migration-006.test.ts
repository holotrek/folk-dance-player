import { describe, expect, test } from 'vitest'
import { openDatabase } from '../../../src/main/db/connection'
import { getSchemaVersion, migrate } from '../../../src/main/db/migrate'
import { MIGRATIONS } from '../../../src/main/db/migrations'
import { addLibrarySong } from '../helpers/library-fixtures'

describe('migration 006: dance attachments', () => {
  test('applies as version 6, and existing dance prefs keep their values with no attachments', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS.slice(0, 5))
    const { danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    db.prepare("INSERT INTO dance_prefs (dance_id, difficulty, notes) VALUES (?, 3, 'W')").run(
      danceId
    )
    expect(migrate(db, MIGRATIONS)).toEqual({ from: 5, to: 6 })
    expect(getSchemaVersion(db)).toBe(6)
    expect(
      db
        .prepare(
          `SELECT difficulty, notes, notes_pdf_name, notes_pdf_path, slide_image_name,
             slide_image_path, slide_source FROM dance_prefs WHERE dance_id = ?`
        )
        .get(danceId)
    ).toEqual({
      difficulty: 3,
      notes: 'W',
      notes_pdf_name: null,
      notes_pdf_path: null,
      slide_image_name: null,
      slide_image_path: null,
      slide_source: null
    })
  })

  test('the new columns can be written and read, and slide_source only accepts canva or image', () => {
    const db = openDatabase(':memory:')
    migrate(db, MIGRATIONS)
    const { danceId } = addLibrarySong(db, { title: 'Hora', dance: { name: 'Hora' } })
    db.prepare('INSERT INTO dance_prefs (dance_id) VALUES (?)').run(danceId)
    db.prepare(
      `UPDATE dance_prefs SET notes_pdf_name = 'a.pdf', notes_pdf_path = '1-ab.pdf',
         slide_image_name = 'b.png', slide_image_path = '1-cd.png', slide_source = 'image'
       WHERE dance_id = ?`
    ).run(danceId)
    expect(
      db.prepare('SELECT slide_source FROM dance_prefs WHERE dance_id = ?').get(danceId)
    ).toEqual({ slide_source: 'image' })
    expect(() =>
      db.prepare("UPDATE dance_prefs SET slide_source = 'video' WHERE dance_id = ?").run(danceId)
    ).toThrow()
  })
})
