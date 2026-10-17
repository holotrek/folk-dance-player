import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { render, type RenderResult } from '@testing-library/react'
import type { RendererApi } from '@shared/contract'
import { LibraryProvider } from '@renderer/library/LibraryProvider'
import { EditSongProvider } from '@renderer/navigation'
import { ProgramProvider } from '@renderer/program/ProgramProvider'
import { testTheme } from '../test-theme'

// Renders `ui` the way the app does: Mantine + the library and program stores backed by `api`,
// and "Edit details" (`onShowMusic` stands in for App switching to the Music page).
export function renderWithLibrary(
  ui: React.ReactElement,
  api: RendererApi,
  onShowMusic: () => void = () => undefined
): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <Notifications />
      <LibraryProvider api={api}>
        <ProgramProvider api={api}>
          <EditSongProvider onShowMusic={onShowMusic}>{ui}</EditSongProvider>
        </ProgramProvider>
      </LibraryProvider>
    </MantineProvider>
  )
}
