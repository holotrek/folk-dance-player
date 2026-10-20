import { useState } from 'react'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import type { ImportMapping } from '@shared/import'
import ImportMappingFields from '@renderer/import/ImportMappingFields'
import { renderWithMantine } from './render'

function Harness(): React.JSX.Element {
  const [value, setValue] = useState<ImportMapping>({
    artistFrom: 'artistTag',
    teacherFrom: 'ignore',
    choreographerFrom: 'ignore',
    genreIsCountry: true
  })
  return <ImportMappingFields value={value} onChange={setValue} />
}

describe('ImportMappingFields', () => {
  test('each destination has exactly three sources', () => {
    renderWithMantine(<Harness />)
    for (const destination of ['Artist', 'Teacher', 'Choreographer']) {
      const group = screen.getByRole('radiogroup', { name: `Populate ${destination} from` })
      expect(
        within(group)
          .getAllByRole('radio')
          .map((r) => r.getAttribute('aria-label'))
      ).toEqual([
        `${destination} from Artist tag`,
        `${destination} from Album Artist tag`,
        `${destination} from Ignore`
      ])
    }
  })

  test('one tag can feed two destinations', async () => {
    renderWithMantine(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Choreographer from Artist tag' }))
    expect(screen.getByRole('radio', { name: 'Choreographer from Artist tag' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Artist from Artist tag' })).toBeChecked()
  })
})
