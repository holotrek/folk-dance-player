import { Group, Radio, Stack, Switch } from '@mantine/core'
import type { ImportMapping } from '@shared/import'
import type { TagSource } from '@shared/settings'

const SOURCES: { value: TagSource; label: string }[] = [
  { value: 'artistTag', label: 'Artist tag' },
  { value: 'albumArtistTag', label: 'Album Artist tag' },
  { value: 'ignore', label: 'Ignore' }
]

function SourceChoice(props: {
  destination: string
  value: TagSource
  onChange: (value: TagSource) => void
}): React.JSX.Element {
  return (
    <Radio.Group
      label={`Populate ${props.destination} from`}
      value={props.value}
      onChange={(v) => props.onChange(v as TagSource)}
    >
      <Group mt={4}>
        {SOURCES.map((s) => (
          <Radio
            key={s.value}
            value={s.value}
            label={s.label}
            aria-label={`${props.destination} from ${s.label}`}
          />
        ))}
      </Group>
    </Radio.Group>
  )
}

// Spec §5.2: shown before every import; the choices are remembered for next time. Each field has
// one source, so two tags can't feed one field; one tag may feed several.
export default function ImportMappingFields({
  value,
  onChange
}: {
  value: ImportMapping
  onChange: (value: ImportMapping) => void
}): React.JSX.Element {
  return (
    <Stack gap="sm">
      <SourceChoice
        destination="Artist"
        value={value.artistFrom}
        onChange={(artistFrom) => onChange({ ...value, artistFrom })}
      />
      <SourceChoice
        destination="Teacher"
        value={value.teacherFrom}
        onChange={(teacherFrom) => onChange({ ...value, teacherFrom })}
      />
      <SourceChoice
        destination="Choreographer"
        value={value.choreographerFrom}
        onChange={(choreographerFrom) => onChange({ ...value, choreographerFrom })}
      />
      <Switch
        label="Genre is Country"
        checked={value.genreIsCountry}
        onChange={(e) => onChange({ ...value, genreIsCountry: e.currentTarget.checked })}
      />
    </Stack>
  )
}
