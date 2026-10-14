import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import type { RendererApi } from '@shared/contract'
import { LibraryProvider } from '@renderer/library/LibraryProvider'
import { testTheme } from '../test-theme'

// Renders `ui` the way the app does: Mantine + the library store backed by `api`.
export function renderWithLibrary(ui: React.ReactElement, api: RendererApi): RenderResult {
  return render(
    <MantineProvider theme={testTheme}>
      <LibraryProvider api={api}>{ui}</LibraryProvider>
    </MantineProvider>
  )
}
