import { Menu, mergeThemeOverrides, Popover } from '@mantine/core'
import { theme } from '@renderer/theme'

// The app theme, adjusted for jsdom: with no real layout, Mantine thinks every popover's anchor
// is detached and hides the dropdown (display: none). The app itself keeps Mantine's default.
export const testTheme = mergeThemeOverrides(theme, {
  components: {
    Menu: Menu.extend({ defaultProps: { hideDetached: false } }),
    Popover: Popover.extend({ defaultProps: { hideDetached: false } })
  }
})
