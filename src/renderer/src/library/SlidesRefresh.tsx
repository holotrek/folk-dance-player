import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import {
  CAPTURES_IDLE,
  FORMAT_CHANGED,
  type CanvaDeck,
  type CaptureStatus,
  type RefreshSummary
} from '@shared/canva'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from './LibraryProvider'

const decks = (n: number) => `${n} ${n === 1 ? 'deck' : 'decks'}`

function summaryNotice(summary: RefreshSummary): string | null {
  if (summary.unreachable === 0) return null
  return `Couldn't reach Canva for ${decks(summary.unreachable)}. Their saved slides stay in use.`
}

export interface SlidesRefreshState {
  hasDecks: boolean
  status: CaptureStatus
  formatChanged: boolean // a deck couldn't be read: "Canva links need checking"
  notice: string | null
  dismissNotice(): void
  refreshing: boolean
  refresh(): Promise<void>
}

// Spec §6.3, §8.3: "Refresh slides" re-reads every deck and re-saves every linked slide's image.
// The Music page shows the button (with the captures' progress) in its header, and the notices
// below it.
export function useSlidesRefresh(): SlidesRefreshState {
  const api = useLibraryApi()
  const [deckList, setDeckList] = useState<CanvaDeck[]>([])
  const [status, setStatus] = useState<CaptureStatus>(CAPTURES_IDLE)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadDecks = useCallback(() => void api.invoke('canva:decks').then(setDeckList), [api])
  useEffect(() => {
    loadDecks()
    void api.invoke('canva:captureStatus').then(setStatus)
    const offLibrary = api.on('library:changed', loadDecks)
    const offStatus = api.on('canva:captureStatus', setStatus)
    return () => {
      offLibrary()
      offStatus()
    }
  }, [api, loadDecks])

  return {
    hasDecks: deckList.length > 0,
    status,
    formatChanged: deckList.some((d) => d.lastError === FORMAT_CHANGED),
    notice,
    dismissNotice: () => setNotice(null),
    refreshing,
    refresh: async () => {
      setRefreshing(true)
      setNotice(null)
      try {
        setNotice(summaryNotice(await api.invoke('canva:refreshSlides')))
      } catch (err) {
        setNotice(errorMessage(err))
      } finally {
        setRefreshing(false)
      }
    }
  }
}

// The button, with the captures' progress beside it; hidden until a deck has been added.
export function SlidesRefreshButton({
  state
}: {
  state: SlidesRefreshState
}): React.JSX.Element | null {
  if (!state.hasDecks) return null
  const { status } = state
  return (
    <Group gap="xs">
      {status.running ? (
        <Text size="sm" c="dimmed">
          Saving slide images… {status.done} of {status.total}
        </Text>
      ) : (
        status.failed > 0 && (
          <Text size="sm" c="orange">
            {status.failed === 1
              ? "1 slide image couldn't be saved."
              : `${status.failed} slide images couldn't be saved.`}
          </Text>
        )
      )}
      <Button variant="default" onClick={state.refresh} loading={state.refreshing}>
        Refresh slides
      </Button>
    </Group>
  )
}

export function SlidesNotices({ state }: { state: SlidesRefreshState }): React.JSX.Element {
  return (
    <>
      {state.formatChanged && (
        <Alert color="yellow" title="Canva links need checking">
          Canva's page format changed, so the slide lists couldn't be read. The saved slides are
          still shown.
        </Alert>
      )}
      {state.notice && (
        <Alert color="orange" withCloseButton onClose={state.dismissNotice}>
          {state.notice}
        </Alert>
      )}
    </>
  )
}
