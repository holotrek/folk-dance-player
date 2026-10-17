import { waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useAppearance } from '@renderer/appearance'
import { createFakeApi } from './fake-api'
import { renderWithMantine } from './render'

function Probe({ api }: { api: Parameters<typeof useAppearance>[0] }): null {
  useAppearance(api)
  return null
}

describe('appearance at startup', () => {
  test('the saved appearance is applied when the app opens', async () => {
    const fake = createFakeApi()
    fake.settings = { ...fake.settings, appearance: 'dark' }
    renderWithMantine(<Probe api={fake.api} />)
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
    )
    // Mantine removes its temporary "no transitions" style 10 ms after a color scheme change. Wait
    // for that, or the timer can fire after the test environment is gone ("document is not defined").
    await waitFor(() =>
      expect(document.querySelector('[data-mantine-disable-transition]')).not.toBeInTheDocument()
    )
  })
})
