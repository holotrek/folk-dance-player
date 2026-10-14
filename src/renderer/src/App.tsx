import { useState } from 'react'
import { AppShell, Tabs } from '@mantine/core'
import Sidebar from './components/Sidebar'
import { LibraryProvider } from './library/LibraryProvider'
import { ProgramProvider } from './program/ProgramProvider'
import MusicPage from './pages/MusicPage'
import ProgramPage from './pages/ProgramPage'
import SettingsPage from './pages/SettingsPage'
import classes from './App.module.css'

type Page = 'program' | 'music' | 'settings'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('program')
  return (
    <LibraryProvider api={window.api}>
      <ProgramProvider api={window.api}>
        <AppShell
          header={{ height: 48 }}
          navbar={{ width: 220, breakpoint: 0, collapsed: { desktop: page === 'settings' } }}
          padding="sm"
        >
          <AppShell.Header px="sm">
            <Tabs value={page} onChange={(v) => v && setPage(v as Page)} variant="pills" pt={8}>
              <Tabs.List>
                <Tabs.Tab value="program">Program</Tabs.Tab>
                <Tabs.Tab value="music">Music</Tabs.Tab>
                <Tabs.Tab value="settings">Settings</Tabs.Tab>
              </Tabs.List>
            </Tabs>
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
      </ProgramProvider>
    </LibraryProvider>
  )
}
