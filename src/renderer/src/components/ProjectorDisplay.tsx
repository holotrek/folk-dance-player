import { useEffect, useState } from 'react'
import { Select, Stack, Title } from '@mantine/core'
import type { RendererApi } from '@shared/contract'
import type { DisplayChoice } from '@shared/projector'

const AUTO = 'auto'

// Spec §6.4: which display the projector uses. Automatic is the first external display; a chosen
// display that isn't connected now falls back to automatic until it's back.
export default function ProjectorDisplay(props: {
  api: RendererApi
  value: number | null
  onSaved: () => void
}): React.JSX.Element {
  const { api, value } = props
  const [displays, setDisplays] = useState<DisplayChoice[]>([])
  useEffect(() => {
    void api.invoke('projector:displays').then(setDisplays)
  }, [api])
  const data = [
    { value: AUTO, label: 'Automatic (the first external display)' },
    ...displays.map((d) => ({
      value: String(d.id),
      label: d.internal ? `${d.label} (this screen)` : d.label
    }))
  ]
  if (value !== null && !displays.some((d) => d.id === value)) {
    data.push({ value: String(value), label: "A display that isn't connected now" })
  }
  return (
    <Stack gap="xs">
      <Title order={4}>Projector</Title>
      <Select
        label="Projector display"
        data={data}
        value={value === null ? AUTO : String(value)}
        allowDeselect={false}
        w={360}
        onChange={(v) => {
          if (v)
            void api
              .invoke('projector:setDisplay', v === AUTO ? null : Number(v))
              .then(props.onSaved)
        }}
      />
    </Stack>
  )
}
