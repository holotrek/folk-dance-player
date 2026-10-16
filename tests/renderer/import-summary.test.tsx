import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { emptySummary } from '@shared/import'
import ImportSummaryStep from '@renderer/import/ImportSummaryStep'
import { renderWithMantine } from './render'

describe('the import summary (sync spec §5.7, §7.3)', () => {
  test('lists songs already synced from Apple Music, and restored songs', () => {
    renderWithMantine(
      <ImportSummaryStep
        summary={{
          ...emptySummary(),
          appleSynced: [{ path: '/m/Kolo.mp3' }],
          restored: [{ path: '/m/Hora.mp3' }]
        }}
        onDone={() => undefined}
      />
    )
    expect(screen.getByText('Already in library (Apple Music) (1)')).toBeInTheDocument()
    expect(screen.getByText('Restored (1)')).toBeInTheDocument()
  })
})
