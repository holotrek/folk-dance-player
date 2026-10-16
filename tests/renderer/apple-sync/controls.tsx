import type { RendererApi } from '@shared/contract'
import AppleSyncStatusBar from '@renderer/apple-sync/AppleSyncStatusBar'
import AppleSyncSwitch from '@renderer/apple-sync/AppleSyncSwitch'
import { useAppleSync } from '@renderer/apple-sync/useAppleSync'

// The Music page's Apple Music controls, as it places them: the switch beside the import buttons,
// and the status bar below while sync is on.
export default function AppleSyncControls({ api }: { api: RendererApi }): React.JSX.Element {
  const status = useAppleSync(api)
  return (
    <>
      <AppleSyncSwitch api={api} status={status} />
      <AppleSyncStatusBar api={api} status={status} />
    </>
  )
}
