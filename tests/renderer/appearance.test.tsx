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
  })
})
