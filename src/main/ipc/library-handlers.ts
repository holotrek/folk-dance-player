import type { InvokeHandlers } from '@shared/contract'
import {
  createDance,
  getSongDetail,
  LibraryEditError,
  linkDance,
  markDifferentDances,
  mergeDances,
  sameDance,
  searchDances,
  setDefaultDance,
  setTeacher,
  unlinkDance,
  updateDance,
  updateSong
} from '../library/edit'
import { listLibrary } from '../library/list'
import { getSongTags, getSuggestions, reapplyMapping } from '../library/mapping'
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  listPlaylistFolders,
  listPlaylists,
  removeFromPlaylist,
  renamePlaylist,
  reorderPlaylist,
  setFavorite,
  setHolding
} from '../library/playlists'
import type { HandlerDeps } from './handlers'

const unavailable = (): never => {
  throw new LibraryEditError("Attachments aren't available.")
}

type LibraryChannel = Extract<keyof InvokeHandlers, `library:${string}` | `playlists:${string}`>

// Handlers for the library and playlists (spec §6). Every edit runs, then announces the change.
export function libraryHandlers(
  deps: HandlerDeps
): Omit<Pick<InvokeHandlers, LibraryChannel>, 'library:stats'> {
  const { db } = deps
  const edit =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const result = fn(...args)
      deps.onLibraryChanged()
      return result
    }

  return {
    'library:list': (query) => listLibrary(db, query),
    'library:song': (songId) => getSongDetail(db, songId, deps.attachments),
    'library:searchDances': (text) => searchDances(db, text),
    'library:suggestions': () => getSuggestions(db, deps.settings.get('danceTypeSuggestions')),
    'library:updateSong': edit((songId, patch) => updateSong(db, songId, patch)),
    'library:updateDance': edit((danceId, patch) => updateDance(db, danceId, patch)),
    'library:setTeacher': edit((pairingId, teacher) => setTeacher(db, pairingId, teacher)),
    'library:setDefaultDance': edit((songId, danceId) => setDefaultDance(db, songId, danceId)),
    'library:linkDance': edit((songId, danceId) => linkDance(db, songId, danceId)),
    'library:createDance': edit((songId, name) => createDance(db, songId, name)),
    'library:unlinkDance': edit((songId, danceId) => unlinkDance(db, songId, danceId)),
    'library:mergeDances': edit((keepId, removeId) => mergeDances(db, keepId, removeId)),
    'library:attachNotesPdf': async (danceId) => {
      const attachments = deps.attachments ?? unavailable()
      const path = await deps.dialogs.pickPdf()
      if (!path) return false
      attachments.attachPdf(danceId, path)
      deps.onLibraryChanged()
      return true
    },
    'library:openNotesPdf': async (danceId) => {
      const path = (deps.attachments ?? unavailable()).pdfPath(danceId)
      if (!path) throw new LibraryEditError('The PDF is missing.')
      const error = await (deps.openPath ?? unavailable)(path)
      if (error) throw new LibraryEditError(`Couldn't open the PDF: ${error}`)
    },
    'library:removeNotesPdf': edit((danceId) =>
      (deps.attachments ?? unavailable()).removePdf(danceId)
    ),
    'library:sameDance': edit((songId, ownId, otherId) => sameDance(db, songId, ownId, otherId)),
    'library:markDifferent': edit((a, b) => markDifferentDances(db, a, b)),
    'library:setFavorite': edit((fileIds, favorite) => setFavorite(db, fileIds, favorite)),
    'library:setHolding': edit((fileIds, held, before) =>
      setHolding(db, fileIds, held, before ?? null)
    ),
    'library:songTags': (songIds) => getSongTags(db, songIds),
    'library:reapplyMapping': edit((songIds, mapping) => reapplyMapping(db, songIds, mapping)),
    'playlists:list': () => listPlaylists(db),
    'playlists:folders': () => listPlaylistFolders(db),
    'playlists:create': edit((name) => createPlaylist(db, name)),
    'playlists:rename': edit((id, name) => renamePlaylist(db, id, name)),
    'playlists:duplicate': edit((id) => duplicatePlaylist(db, id)),
    'playlists:delete': edit((id) => deletePlaylist(db, id)),
    'playlists:add': edit((id, fileIds) => addToPlaylist(db, id, fileIds)),
    'playlists:remove': edit((id, itemIds) => removeFromPlaylist(db, id, itemIds)),
    'playlists:reorder': edit((id, itemIds) => reorderPlaylist(db, id, itemIds))
  }
}
