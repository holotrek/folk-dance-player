import { createContext, useCallback, useContext } from 'react'
import { useLibraryStore } from './library/LibraryProvider'

const EditSong = createContext<(songId: number) => void>(() => undefined)

// "Edit details" from any song menu: opens the Music page with the song selected and scrolled
// into view, so its editor shows. App switches the page; the library store selects the song.
export function EditSongProvider(props: {
  onShowMusic: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const store = useLibraryStore()
  const { onShowMusic } = props
  const editSong = useCallback(
    (songId: number) => {
      onShowMusic()
      void store.getState().reveal(songId)
    },
    [store, onShowMusic]
  )
  return <EditSong.Provider value={editSong}>{props.children}</EditSong.Provider>
}

export const useEditSong = (): ((songId: number) => void) => useContext(EditSong)
