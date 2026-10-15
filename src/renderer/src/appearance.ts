import { useEffect } from 'react'
import { useMantineColorScheme, type MantineColorScheme } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import type { Appearance } from '@shared/settings'

// Settings → Appearance as Mantine's color scheme ("system" follows the Mac).
export const colorSchemeFor = (appearance: Appearance): MantineColorScheme =>
  appearance === 'system' ? 'auto' : appearance

// Applies the saved appearance when the control window opens. (Mantine also remembers the last
// one, so the window doesn't flash the wrong colors first.)
export function useAppearance(api: RendererApi): void {
  const { setColorScheme } = useMantineColorScheme()
  useEffect(() => {
    void api
      .invoke('settings:getAll')
      .then((settings) => setColorScheme(colorSchemeFor(settings.appearance)))
  }, [api, setColorScheme])
}
