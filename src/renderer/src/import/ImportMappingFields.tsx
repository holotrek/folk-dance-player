import { Group, Radio, Stack, Switch } from '@mantine/core'
import type { ImportMapping } from '@shared/import'
import type { TagTarget } from '@shared/settings'

const TARGETS: { value: TagTarget; label: string }[] = [
  { value: 'artist', label: 'Artist' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'choreographer', label: 'Choreographer' },
  { value: 'ignore', label: 'Ignore' }
]

function TargetChoice(props: {
  tag: string
  value: TagTarget
  onChange: (value: TagTarget) => void
}): React.JSX.Element {
  return (
    <Radio.Group
      label={`${props.tag} tag goes to`}
      value={props.value}
      onChange={(v) => props.onChange(v as TagTarget)}
    >
      <Group mt={4}>
        {TARGETS.map((t) => (
          <Radio
            key={t.value}
            value={t.value}
            label={t.label}
            aria-label={`${props.tag} → ${t.label}`}
          />
        ))}
      </Group>
    </Radio.Group>
  )
}

// Spec §5.2: shown before every import; the choices are remembered for next time.
export default function ImportMappingFields({
  value,
  onChange
}: {
  value: ImportMapping
  onChange: (value: ImportMapping) => void
}): React.JSX.Element {
  return (
    <Stack gap="sm">
      <TargetChoice
        tag="Artist"
        value={value.artistTagTarget}
        onChange={(artistTagTarget) => onChange({ ...value, artistTagTarget })}
      />
      <TargetChoice
        tag="Album Artist"
        value={value.albumArtistTagTarget}
        onChange={(albumArtistTagTarget) => onChange({ ...value, albumArtistTagTarget })}
      />
      <Switch
        label="Genre is Country"
        checked={value.genreIsCountry}
        onChange={(e) => onChange({ ...value, genreIsCountry: e.currentTarget.checked })}
      />
    </Stack>
  )
}
