import { useEffect, useState } from 'react'
import {
  Alert,
  Code,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  TagsInput,
  Text,
  Title,
  useMantineColorScheme
} from '@mantine/core'
import type { AppInfo, RendererApi } from '@shared/contract'
import { mappingFromSettings, mappingSettings, type ImportMapping } from '@shared/import'
import type { Appearance, SettingKey, Settings } from '@shared/settings'
import { colorSchemeFor } from '../appearance'
import Logo from '../components/Logo'
import ProjectorDisplay from '../components/ProjectorDisplay'
import RemoteSection from '../components/RemoteSection'
import ImportMappingFields from '../import/ImportMappingFields'
import { errorMessage } from '../ipc-error'

type NumberKey = 'autoContinue.seconds' | 'countdown.seconds'
type BooleanKey = 'autoContinue.enabled'

export default function SettingsPage({ api }: { api: RendererApi }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a rejected save so number inputs re-mount showing the saved value.
  const [revision, setRevision] = useState(0)
  const { setColorScheme } = useMantineColorScheme()

  const reload = (): void => void api.invoke('settings:getAll').then(setSettings)
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

  const mapping: ImportMapping = mappingFromSettings(settings)
  // Saves whichever mapping setting changed.
  const saveMapping = (next: ImportMapping): void => {
    const current = mappingSettings(mapping)
    for (const [key, value] of Object.entries(mappingSettings(next))) {
      if (value !== current[key as keyof typeof current]) void save(key as SettingKey, value)
    }
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
        <Title order={4}>Appearance</Title>
        <SegmentedControl
          aria-label="Appearance"
          w="fit-content"
          data={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' }
          ]}
          value={settings.appearance}
          onChange={(value) => {
            setColorScheme(colorSchemeFor(value as Appearance))
            void save('appearance', value)
          }}
        />
      </Stack>
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
      <ProjectorDisplay api={api} value={settings['projector.displayId']} onSaved={reload} />
      {info && (
        <Stack gap={4}>
          <Title order={4}>About</Title>
          <Group gap="sm" wrap="nowrap">
            <Logo size={48} />
            <Text size="sm">Folk Dance Player, version {info.version}</Text>
          </Group>
          <Text size="sm">Library database (schema {info.schemaVersion}):</Text>
          <Code>{info.dbPath}</Code>
        </Stack>
      )}
    </Stack>
  )
}
