import { createContext, useContext, useEffect, useState } from 'react'
import { capabilitiesFor, type Capabilities } from '@shared/platform'
import type { RendererApi } from '@shared/contract'

// Components get the platform's differences (wording, what exists) from here. Without a provider,
// which is how most tests render, they get the Mac's.
const PlatformContext = createContext<Capabilities>(capabilitiesFor('mac'))

export const usePlatform = (): Capabilities => useContext(PlatformContext)

// Asks main which system this is, and renders nothing until it answers (a few milliseconds), so
// nothing is ever drawn with the wrong system's wording.
export function PlatformProvider(props: {
  api: RendererApi
  children: React.ReactNode
}): React.JSX.Element | null {
  const { api, children } = props
  const [caps, setCaps] = useState<Capabilities | null>(null)
  useEffect(() => {
    let live = true
    api
      .invoke('app:getInfo')
      .then((info) => live && setCaps(capabilitiesFor(info.platform, info.store === true)))
      .catch(() => live && setCaps(capabilitiesFor('mac')))
    return () => {
      live = false
    }
  }, [api])
  return caps ? <PlatformContext.Provider value={caps}>{children}</PlatformContext.Provider> : null
}
