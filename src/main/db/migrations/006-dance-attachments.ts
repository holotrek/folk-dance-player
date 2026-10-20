import type { Migration } from '../migrate'

// A PDF (its written notes) and a static slide image on a dance (0.3.0 spec §3.6, §3.7). They are
// the organizer's own files, copied into the app data folder, so they are personal data on
// `dance_prefs`: the shown file name, and the stored file's name inside its folder
// (`dance-notes/`, `slide-images/`). `slide_source` is the projector's choice when a dance has both
// a Canva slide and an image, and NULL otherwise.
export const danceAttachments: Migration = {
  version: 6,
  name: 'dance-attachments',
  sql: `
    ALTER TABLE dance_prefs ADD COLUMN notes_pdf_name TEXT;
    ALTER TABLE dance_prefs ADD COLUMN notes_pdf_path TEXT;
    ALTER TABLE dance_prefs ADD COLUMN slide_image_name TEXT;
    ALTER TABLE dance_prefs ADD COLUMN slide_image_path TEXT;
    ALTER TABLE dance_prefs ADD COLUMN slide_source TEXT
      CHECK (slide_source IS NULL OR slide_source IN ('canva', 'image'));
  `
}
