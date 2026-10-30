import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useFollowBottom } from '@renderer/program/useFollowBottom'

// jsdom has no layout: the box is 200 px tall, its content is 100 px an entry, and scrollTop is a
// plain number. The fake layout is set in the ref callback, which runs before the hook's effect.
const tops = new WeakMap<HTMLElement, number>()
function Harness(props: { count: number; resetKey: number }): React.JSX.Element {
  const ref = useFollowBottom(props.count, props.resetKey)
  return (
    <div
      data-testid="box"
      ref={(el) => {
        ref.current = el
        if (!el) return
        Object.defineProperty(el, 'scrollTop', {
          configurable: true,
          get: () => tops.get(el) ?? 0,
          set: (v: number) => tops.set(el, v)
        })
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(el, 'scrollHeight', { configurable: true, value: props.count * 100 })
      }}
    />
  )
}

const top = () => document.querySelector<HTMLElement>('[data-testid=box]')!.scrollTop
const scrollTo = (value: number) => {
  const box = document.querySelector<HTMLElement>('[data-testid=box]')!
  box.scrollTop = value
  fireEvent.scroll(box)
}

describe('useFollowBottom', () => {
  test('scrolls to the end when it mounts and when the program changes', () => {
    const { rerender } = render(<Harness count={5} resetKey={1} />)
    expect(top()).toBe(500)
    scrollTo(0)
    rerender(<Harness count={5} resetKey={2} />)
    expect(top()).toBe(500)
  })

  test('follows a new entry while at the bottom', () => {
    const { rerender } = render(<Harness count={5} resetKey={1} />)
    scrollTo(300) // 500 - 200: exactly the bottom
    rerender(<Harness count={6} resetKey={1} />)
    expect(top()).toBe(600)
  })

  test('stays put when the organizer has scrolled up, and follows again after scrolling back down', () => {
    const { rerender } = render(<Harness count={5} resetKey={1} />)
    scrollTo(100)
    rerender(<Harness count={6} resetKey={1} />)
    expect(top()).toBe(100)
    scrollTo(350) // the bottom is at 400 (600 - 200); 50 px away is within two rows
    rerender(<Harness count={7} resetKey={1} />)
    expect(top()).toBe(700)
  })
})
