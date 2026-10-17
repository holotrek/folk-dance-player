import { Alert, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import type { AppleSyncStatus } from '@shared/apple-sync'
import type { RendererApi } from '@shared/contract'
import ImportMappingFields from '../import/ImportMappingFields'
import ImportProgressStep from '../import/ImportProgressStep'
import TagPreviewTable from '../import/TagPreviewTable'
import MirrorDecisionsStep from './MirrorDecisionsStep'
import SyncSummaryView from './SyncSummaryView'
import type { AppleSyncFlow } from './useAppleSyncFlow'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export const NOT_ALLOWED = "Folk Dance Player isn't allowed to read your Music library"

// The turn-on dialog (sync spec §5.8).
export default function AppleSyncDialog(props: {
  flow: AppleSyncFlow
  waiting?: AppleSyncStatus['waiting'] // the first sync is waiting for a sync or an import
  api: RendererApi
}): React.JSX.Element {
  const { flow, api } = props
  const { state } = flow
  const busy = state.step === 'reading' || state.step === 'running'
  return (
    <Modal
      opened={state.step !== 'closed'}
      onClose={flow.close}
      title="Sync with Apple Music"
      size="lg"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
    >
      {state.step === 'explain' && (
        <Stack>
          <Text size="sm">
            Folk Dance Player will read your Music library and keep its songs and playlists in step
            with it: when it starts, when you switch back to it, and when you choose Sync now.
          </Text>
          <Text size="sm">
            Music stays the place to edit tags and build playlists; Music&apos;s playlists appear
            here read-only. Your dances, programs, notes, slides, favorites and your own playlists
            stay yours.
          </Text>
          <Text size="sm">
            macOS will ask whether Folk Dance Player may access Media &amp; Apple Music.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => void flow.read()}>Continue</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'reading' && (
        <Group>
          <Loader size="sm" />
          <Text>Reading your Music library…</Text>
        </Group>
      )}
      {state.step === 'denied' && (
        <Stack>
          <Alert color="yellow">
            {NOT_ALLOWED}. Allow it in System Settings → Privacy &amp; Security → Media &amp; Apple
            Music, then turn sync on again.
          </Alert>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => void api.invoke('appleSync:openPrivacySettings')}
            >
              Open Privacy Settings
            </Button>
            <Button onClick={flow.close}>Close</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'error' && (
        <Stack>
          <Alert color="red">{state.message}</Alert>
          <Group justify="flex-end">
            <Button onClick={flow.close}>Close</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'mapping' && flow.mapping && (
        <Stack>
          <Text size="sm">
            {`${plural(state.preview.trackCount, 'song', 'songs')} and ${plural(state.preview.playlists.length, 'playlist', 'playlists')} will be synced. Choose where Music's tags go:`}
          </Text>
          <ImportMappingFields value={flow.mapping} onChange={flow.setMapping} />
          <TagPreviewTable rows={state.preview.tagSample.map((t, i) => ({ ...t, key: i }))} />
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => void flow.confirmMapping(state.conflicts)}>Start sync</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'decisions' && (
        <MirrorDecisionsStep
          conflicts={state.conflicts}
          onStart={(decisions) => void flow.start(decisions)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'running' &&
        (props.waiting ? (
          <Group>
            <Loader size="sm" />
            <Text>
              {props.waiting === 'sync'
                ? 'Waiting for the last sync to finish…'
                : 'Waiting for the import to finish…'}
            </Text>
          </Group>
        ) : (
          <ImportProgressStep progress={state.progress} cancelling={false} />
        ))}
      {state.step === 'otherLibrary' && (
        <Stack>
          <Text fw={500}>Music has a different library open</Text>
          <Text size="sm">
            It isn&apos;t the library that was synced before. Keep waiting until Music has that
            library open again, or switch: songs from the old library go to Removed from Apple Music
            for you to keep or remove.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => void flow.keepWaiting()}>
              Keep waiting
            </Button>
            <Button onClick={flow.switchLibrary}>Switch to this library</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'summary' && (
        <Stack>
          <SyncSummaryView summary={state.summary} />
          <Group justify="flex-end">
            <Button onClick={flow.close}>Done</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'paused' && (
        <Stack>
          <Text fw={500}>Music has a different library open</Text>
          <Text size="sm">
            It isn&apos;t the library that was synced before. Keep waiting until Music has that
            library open again, or switch: songs from the old library go to Removed from Apple Music
            for you to keep or remove.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Keep waiting
            </Button>
            <Button
              onClick={() => {
                void api.invoke('appleSync:switchLibrary')
                flow.close()
              }}
            >
              Switch to this library
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
