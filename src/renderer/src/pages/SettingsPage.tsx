import { useEffect, useState } from 'react'
import {
  Alert,
  Code,
  Loader,
  NumberInput,
  Stack,
  Switch,
  TagsInput,
  Text,
  Title
} from '@mantine/core'
import type { AppInfo, RendererApi } from '@shared/contract'
import type { ImportMapping } from '@shared/import'
import type { SettingKey, Settings } from '@shared/settings'
import RemoteSection from '../components/RemoteSection'
import ImportMappingFields from '../import/ImportMappingFields'
import { errorMessage } from '../ipc-error'

type NumberKey = 'autoContinue.seconds' | 'countdown.seconds' | 'autoFullscreen.seconds'
type BooleanKey = 'autoContinue.enabled' | 'autoFullscreen.enabled'

export default function SettingsPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a rejected save so number inputs re-mount showing the saved value.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    api.invoke('settings:getAll').then(setSettings)
    api.invoke('app:getInfo').then(setInfo)
  }, [api])

  async function save(key: SettingKey, value: unknown): Promise<void> {
    try {
      setSettings(await api.invoke('settings:set', key, value))
      setError(null)
    } catch (e) {
      setError(`Couldn't save setting: ${errorMessage(e)}`)
      setRevision((r) => r + 1)
    }
  }

  if (!settings) return <Loader m="md" />

  const mapping: ImportMapping = {
    artistTagTarget: settings['import.artistTagTarget'],
    albumArtistTagTarget: settings['import.albumArtistTagTarget'],
    genreIsCountry: settings['import.genreIsCountry']
  }
  // Saves whichever mapping setting changed.
  const saveMapping = (next: ImportMapping): void => {
    if (next.artistTagTarget !== mapping.artistTagTarget)
      void save('import.artistTagTarget', next.artistTagTarget)
    if (next.albumArtistTagTarget !== mapping.albumArtistTagTarget)
      void save('import.albumArtistTagTarget', next.albumArtistTagTarget)
    if (next.genreIsCountry !== mapping.genreIsCountry)
      void save('import.genreIsCountry', next.genreIsCountry)
  }

  const toggle = (key: BooleanKey, label: string): React.JSX.Element => (
    <Switch
      label={label}
      checked={settings[key]}
      onChange={(e) => save(key, e.currentTarget.checked)}
    />
  )

  const number = (key: NumberKey, label: string, min: number, max: number): React.JSX.Element => (
    <NumberInput
      key={`${key}-${revision}`}
      label={label}
      min={min}
      max={max}
      clampBehavior="none"
      allowDecimal={false}
      w={260}
      defaultValue={settings[key]}
      onBlur={(e) => {
        const raw = e.currentTarget.value
        const value = Number(raw)
        if (raw !== '' && value !== settings[key]) save(key, value)
      }}
    />
  )

  return (
    <Stack p="md" gap="lg" maw={640}>
      <Title order={2}>Settings</Title>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Stack gap="xs">
        <Title order={4}>Import</Title>
        <Text size="sm" c="dimmed">
          The defaults for the mapping step shown before every import.
        </Text>
        <ImportMappingFields value={mapping} onChange={saveMapping} />
      </Stack>
      <Stack gap="xs">
        <Title order={4}>Library</Title>
        <TagsInput
          label="Dance type suggestions"
          placeholder="Add a dance type"
          description="Offered when you edit a dance's type. Press Enter after each one."
          value={settings.danceTypeSuggestions}
          onChange={(types) => save('danceTypeSuggestions', types)}
        />
      </Stack>
      <Stack gap="xs">
        <Title order={4}>Playback</Title>
        {toggle('autoContinue.enabled', 'Auto-continue to the next song')}
        {number('autoContinue.seconds', 'Auto-continue after (seconds)', 0, 600)}
        {number('countdown.seconds', 'Countdown before first song (seconds)', 0, 60)}
      </Stack>
      <RemoteSection api={api} />
      <Stack gap="xs">
        <Title order={4}>Fullscreen on this screen</Title>
        {toggle('autoFullscreen.enabled', 'Show fullscreen view when idle')}
        {number('autoFullscreen.seconds', 'Idle time before fullscreen (seconds)', 5, 3600)}
      </Stack>
      {info && (
        <Stack gap={4}>
          <Title order={4}>About</Title>
          <Text size="sm">Version {info.version}</Text>
          <Text size="sm">Library database (schema {info.schemaVersion}):</Text>
          <Code>{info.dbPath}</Code>
        </Stack>
      )}
    </Stack>
  )
}
