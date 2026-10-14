import { Alert, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import AppleOptionsStep from './AppleOptionsStep'
import ImportMappingFields from './ImportMappingFields'
import ImportProgressStep from './ImportProgressStep'
import ImportSummaryStep from './ImportSummaryStep'
import PlaylistConflictsStep from './PlaylistConflictsStep'
import { APPLE_TITLE, MUSIC_TITLE, type ImportFlow } from './useImportFlow'

function title(flow: ImportFlow): string {
  const { state } = flow
  switch (state.step) {
    case 'mapping':
      return MUSIC_TITLE
    case 'apple':
    case 'conflicts':
      return APPLE_TITLE
    case 'loading':
    case 'running':
    case 'error':
      return state.title
    case 'summary':
      return state.summary.cancelled ? 'Import stopped' : 'Import finished'
    default:
      return ''
  }
}

export default function ImportDialog({ flow }: { flow: ImportFlow }): React.JSX.Element {
  const { state, mapping } = flow
  const running = state.step === 'running'

  return (
    <Modal
      opened={state.step !== 'closed'}
      onClose={flow.close}
      title={title(flow)}
      size="lg"
      closeOnClickOutside={!running}
      closeOnEscape={!running}
      withCloseButton={!running}
    >
      {state.step === 'loading' && (
        <Group>
          <Loader size="sm" />
          <Text>{state.message}</Text>
        </Group>
      )}
      {state.step === 'mapping' && mapping && (
        <Stack>
          <Text>
            {state.paths.length === 1
              ? '1 file or folder'
              : `${state.paths.length} files or folders`}{' '}
            selected. Choose how their tags are used:
          </Text>
          <ImportMappingFields value={mapping} onChange={flow.setMapping} />
          <Group justify="flex-end">
            <Button variant="default" onClick={flow.close}>
              Cancel
            </Button>
            <Button onClick={() => flow.startPaths(state.paths)}>Import</Button>
          </Group>
        </Stack>
      )}
      {state.step === 'apple' && mapping && (
        <AppleOptionsStep
          preview={state.preview}
          mapping={mapping}
          onMappingChange={flow.setMapping}
          onContinue={(selection) => flow.continueApple(state.xmlPath, state.preview, selection)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'conflicts' && (
        <PlaylistConflictsStep
          conflicts={state.conflicts}
          onImport={(decisions) => flow.startApple(state.xmlPath, state.selection, decisions)}
          onCancel={flow.close}
        />
      )}
      {state.step === 'running' && (
        <ImportProgressStep
          progress={state.progress}
          cancelling={state.cancelling}
          onCancel={flow.cancel}
        />
      )}
      {state.step === 'summary' && (
        <ImportSummaryStep summary={state.summary} onDone={flow.close} />
      )}
      {state.step === 'error' && (
        <Stack>
          <Alert color="red" role="alert">
            {state.message}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={flow.close}>Close</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
