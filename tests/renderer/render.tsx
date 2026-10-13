import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import { theme } from '@renderer/theme'

export function renderWithMantine(ui: React.ReactElement): RenderResult {
  return render(<MantineProvider theme={theme}>{ui}</MantineProvider>)
}
