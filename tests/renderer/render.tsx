import { MantineProvider } from '@mantine/core'
import { render, type RenderResult } from '@testing-library/react'
import { testTheme } from './test-theme'

export function renderWithMantine(ui: React.ReactElement): RenderResult {
  return render(<MantineProvider theme={testTheme}>{ui}</MantineProvider>)
}
