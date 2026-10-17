// fdp-music-library: prints the Music library as one JSON snapshot on stdout (Apple Music sync spec
// §3.1). It only reads. Exit codes: 0 success, 2 access denied, 3 the library couldn't be opened.
// Built by `npm run build:helper` (scripts/build-helper.sh) as a Universal binary.
import Foundation
import iTunesLibrary

// Persistent IDs as Library.xml writes them: 16 uppercase hex digits.
func hex(_ id: NSNumber) -> String { String(format: "%016llX", id.uint64Value) }

// "music" for music; a readable name otherwise (the app counts skipped tracks by it).
func mediaKindName(_ kind: ITLibMediaItemMediaKind) -> String {
  switch kind {
  case .kindSong: return "music"
  case .kindMusicVideo: return "music video"
  case .kindMovie, .kindHomeVideo: return "video"
  case .kindTVShow: return "TV show"
  case .kindPodcast: return "podcast"
  case .kindAudiobook, .kindBook: return "audiobook"
  case .kindPDFBooklet, .kindPDFBook, .kindDigitalBooklet, .kindInteractiveBooklet:
    return "PDF or booklet"
  case .kindVoiceMemo: return "voice memo"
  case .kindRingtone, .kindAlertTone: return "ringtone"
  default: return "other"
  }
}

func locationTypeName(_ type: ITLibMediaItemLocationType) -> String {
  switch type {
  case .file: return "file"
  case .URL: return "url"
  case .remote: return "remote"
  default: return "unknown"
  }
}

// Every value is written, as null when absent (JSONEncoder would leave optional keys out).
struct Track: Encodable {
  let item: ITLibMediaItem
  enum Key: String, CodingKey {
    case persistentId, location, locationType, mediaKind, kind, title, artist, albumArtist, genre,
      durationMs
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(item.persistentID), forKey: .persistentId)
    try c.encode(item.location?.absoluteString, forKey: .location)
    try c.encode(locationTypeName(item.locationType), forKey: .locationType)
    try c.encode(mediaKindName(item.mediaKind), forKey: .mediaKind)
    try c.encode(item.kind, forKey: .kind)
    try c.encode(item.title, forKey: .title)
    try c.encode(item.artist?.name, forKey: .artist)
    try c.encode(item.album.albumArtist, forKey: .albumArtist)
    try c.encode(item.genre.isEmpty ? nil : item.genre, forKey: .genre)
    try c.encode(item.totalTime > 0 ? item.totalTime : nil, forKey: .durationMs)
  }
}

struct Folder: Encodable {
  let playlist: ITLibPlaylist
  enum Key: String, CodingKey { case persistentId, name, parentId }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(playlist.persistentID), forKey: .persistentId)
    try c.encode(playlist.name, forKey: .name)
    try c.encode(playlist.parentID.map(hex), forKey: .parentId)
  }
}

struct Playlist: Encodable {
  let playlist: ITLibPlaylist
  enum Key: String, CodingKey { case persistentId, name, parentId, itemIds }
  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    try c.encode(hex(playlist.persistentID), forKey: .persistentId)
    try c.encode(playlist.name, forKey: .name)
    try c.encode(playlist.parentID.map(hex), forKey: .parentId)
    try c.encode(playlist.items.map { hex($0.persistentID) }, forKey: .itemIds)
  }
}

struct Snapshot: Encodable {
  let version = 1
  let libraryId: String
  let tracks: [Track]
  let folders: [Folder]
  let playlists: [Playlist]
}

func fail(_ code: Int32, _ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(code)
}

let library: ITLibrary
do {
  library = try ITLibrary(apiVersion: "1.1")
} catch {
  // A refused Media & Apple Music permission can say "TCC not granted" (the spike), but on
  // hardware it came back as a dropped connection to com.apple.amp.library.framework (Cocoa error
  // 4097) with exit 3; the app maps that to access denied (library-source.ts).
  let text = String(describing: error)
  fail(text.contains("TCC") || text.lowercased().contains("not authorized") ? 2 : 3, text)
}

let all = library.allPlaylists
guard let primary = all.first(where: { $0.isPrimary }) else {
  fail(3, "The Music library has no main playlist")
}
// The user's own playlists (sync spec §3.1): not the library itself, built-in playlists, folders or
// hidden playlists. Smart playlists are included with their current items.
let folders = all.filter { $0.kind == .folder }
let playlists = all.filter {
  !$0.isPrimary && $0.distinguishedKind == .kindNone && $0.kind != .folder && $0.isVisible
}
let snapshot = Snapshot(
  libraryId: hex(primary.persistentID),
  tracks: library.allMediaItems.map(Track.init),
  folders: folders.map(Folder.init),
  playlists: playlists.map(Playlist.init)
)
do {
  FileHandle.standardOutput.write(try JSONEncoder().encode(snapshot))
} catch {
  fail(1, "Couldn't write the snapshot: \(error)")
}
