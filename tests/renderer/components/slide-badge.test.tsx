import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import SlideBadge from '@renderer/components/SlideBadge'
import { renderWithMantine } from '../render'

describe('SlideBadge', () => {
  test.each([
    ['canva', 'Canva slide', 'This dance has a Canva slide'],
    ['image', 'Image', 'This dance has an image'],
    ['both', 'Canva slide and image', 'This dance has a Canva slide and an image']
  ] as const)('%s has the accessible name and tooltip', async (slide, name, tip) => {
    renderWithMantine(<SlideBadge slide={slide} />)
    const icon = screen.getByRole('img', { name })
    await userEvent.hover(icon)
    expect(await screen.findByText(tip)).toBeInTheDocument()
  })

  test('shows nothing without a slide, or only a hidden spacer when asked to reserve room', () => {
    const { container, rerender } = renderWithMantine(<SlideBadge slide={null} />)
    expect(container.querySelector('[data-slide-spacer]')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    rerender(<SlideBadge slide={null} reserve />)
    expect(container.querySelector('[data-slide-spacer]')).not.toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
