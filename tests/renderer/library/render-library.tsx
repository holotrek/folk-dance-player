import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import type { RendererApi } from '@shared/contract'
import { LibraryProvider } from '@renderer/library/LibraryProvider'
import { ProgramProvider } from '@renderer/program/ProgramProvider'
import { testTheme } from '../test-theme'

// Renders `ui` the way the app does: Mantine + the library and program stores backed by `api`.
export function renderWithLibrary(ui: React.ReactElement, api: RendererApi): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <LibraryProvider api={api}>
        <ProgramProvider api={api}>{ui}</ProgramProvider>
      </LibraryProvider>
    </MantineProvider>
  )
}
