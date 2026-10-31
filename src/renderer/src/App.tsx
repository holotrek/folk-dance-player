import { useCallback, useEffect, useState } from 'react'
import { AppShell, Group, Tabs } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import AppleSyncNotices from './apple-sync/AppleSyncNotices'
import { useAppearance } from './appearance'
import { HighlightProvider, useHighlight } from './highlight'
import Logo from './components/Logo'
import Sidebar from './components/Sidebar'
import { LibraryProvider } from './library/LibraryProvider'
import { EditSongProvider } from './navigation'
import { ProgramProvider } from './program/ProgramProvider'
import PlayerBar from './program/PlayerBar'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'
import { TourProvider, useTour } from './tour/TourProvider'
import TourBanner from './tour/TourBanner'
import classes from './App.module.css'

type Page = 'program' | 'music' | 'settings'

// Before the header has been measured (and in tests, where nothing has a size).
const HEADER_FALLBACK = 170

// Spec §6: the player bar is above the tabs on every page, mounted once, so the audio keeps
// playing — and stays controllable — whichever page is open.
export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  const header = useElementSize()
  useAppearance(window.api)

  const showMusic = useCallback(() => setPage('music'), [])
  return (
    <LibraryProvider api={window.api}>
      <ProgramProvider api={window.api}>
        <EditSongProvider onShowMusic={showMusic}>
          <TourProvider page={page} setPage={setPage}>
            <HighlightProvider>
              <PageRequests onPage={setPage} />
              <AppleSyncNotices api={window.api} />
              <AppShell
                header={{ height: Math.ceil(header.height) || HEADER_FALLBACK }}
                navbar={{ width: 220, breakpoint: 0, collapsed: { desktop: page === 'settings' } }}
                padding="sm"
              >
                <AppShell.Header px="sm">
                  <div ref={header.ref} className={classes.header}>
                    <TourBannerSlot />
                    <PlayerBar />
                    <Group gap="sm" wrap="nowrap">
                      <Logo
                        size={40}
                        label="Folk Dance Player"
                        color="var(--mantine-primary-color-filled)"
                      />
                      <Tabs value={page} onChange={(v) => v && setPage(v as Page)} variant="pills">
                        <Tabs.List>
                          <Tabs.Tab value="program">Program</Tabs.Tab>
                          <Tabs.Tab value="music">Music</Tabs.Tab>
                          <Tabs.Tab value="settings">Settings</Tabs.Tab>
                        </Tabs.List>
                      </Tabs>
                    </Group>
                  </div>
                </AppShell.Header>
                <AppShell.Navbar p="sm">
                  <Sidebar />
                </AppShell.Navbar>
                <AppShell.Main className={classes.main}>
                  {page === 'program' && <ProgramPage />}
                  {page === 'music' && <MusicPage />}
                  {page === 'settings' && <SettingsPage api={window.api} />}
                </AppShell.Main>
              </AppShell>
            </HighlightProvider>
          </TourProvider>
        </EditSongProvider>
      </ProgramProvider>
    </LibraryProvider>
  )
}

// The reminder that this is the practice library, while a tour runs.
function TourBannerSlot(): React.JSX.Element | null {
  return useTour().touring ? <TourBanner /> : null
}

// The app menu asks for a page (`app:showPage`), and sometimes for a control on it to be
// highlighted: File → Sync with Apple Music, while sync is off, points at the Music page's switch.
function PageRequests({ onPage }: { onPage: (page: Page) => void }): null {
  const highlight = useHighlight()
  useEffect(
    () =>
      window.api.on('app:showPage', ({ page, highlight: id }) => {
        onPage(page)
        if (id) highlight(id)
      }),
    [onPage, highlight]
  )
  return null
}
