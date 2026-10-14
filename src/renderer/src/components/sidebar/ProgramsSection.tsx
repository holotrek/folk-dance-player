import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Group, Menu, NavLink, ScrollArea, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import type { ProgramSummary } from '@shared/program'
import { useLibraryApi } from '../../library/LibraryProvider'
import { defaultProgramName } from '../../program/program-name'
import { useProgram } from '../../program/ProgramProvider'
import ConfirmDialog from '../ConfirmDialog'
import NamePrompt from '../NamePrompt'
import classes from '../Sidebar.module.css'
import SectionHeading from './SectionHeading'

const songs = (n: number): string => `${n} ${n === 1 ? 'song' : 'songs'} to play`

// A program in the sidebar: click loads it; options on "⋯" or right-click.
function ProgramEntry(props: {
  program: ProgramSummary
  current: boolean
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const load = useProgram((s) => s.load)
  const options = useRef<HTMLButtonElement>(null)
  const p = props.program
  return (
    <div
      className={classes.entry}
      onContextMenu={(e) => {
        e.preventDefault()
        options.current?.click()
      }}
    >
      <NavLink
        label={p.name}
        description={songs(p.unplayedCount)}
        active={props.current}
        aria-current={props.current ? 'page' : undefined}
        onClick={() => void load(p.id)}
      />
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <ActionIcon
            ref={options}
            variant="subtle"
            size="sm"
            className={classes.options}
            aria-label={`Options for ${p.name}`}
          >
            ⋯
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={props.onRename}>Rename…</Menu.Item>
          <Menu.Item onClick={() => void api.invoke('programs:duplicate', p.id)}>
            Duplicate
          </Menu.Item>
          <Menu.Item color="red" onClick={props.onDelete}>
            Delete…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

// Spec §6.1 PROGRAMS: loaded only from here, newest edit first, searchable, in its own scroll
// container that fills the rest of the sidebar.
export default function ProgramsSection(): React.JSX.Element {
  const api = useLibraryApi()
  const programs = useProgram((s) => s.programs)
  const currentId = useProgram((s) => s.player.programId)
  const setSearch = useProgram((s) => s.setSearch)
  const load = useProgram((s) => s.load)
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, 150)
  const [prompt, setPrompt] = useState<
    { mode: 'create' } | { mode: 'rename'; program: ProgramSummary } | null
  >(null)
  const [deleting, setDeleting] = useState<ProgramSummary | null>(null)
  useEffect(() => {
    void setSearch(debounced)
  }, [debounced, setSearch])

  return (
    <>
      <Group justify="space-between" mt="md">
        <SectionHeading>Programs</SectionHeading>
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="New program"
          onClick={() => setPrompt({ mode: 'create' })}
        >
          +
        </ActionIcon>
      </Group>
      <TextInput
        size="xs"
        type="search"
        placeholder="Search programs…"
        aria-label="Search programs"
        my="xs"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <ScrollArea className={classes.programs}>
        <div role="group" aria-label="Programs">
          {programs.length === 0 && (
            <Text size="sm" c="dimmed">
              {text ? 'No matching programs' : 'No programs yet'}
            </Text>
          )}
          {programs.map((p) => (
            <ProgramEntry
              key={p.id}
              program={p}
              current={p.id === currentId}
              onRename={() => setPrompt({ mode: 'rename', program: p })}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      </ScrollArea>
      <NamePrompt
        opened={prompt !== null}
        title={prompt?.mode === 'rename' ? 'Rename program' : 'New program'}
        initialValue={prompt?.mode === 'rename' ? prompt.program.name : defaultProgramName()}
        submitLabel={prompt?.mode === 'rename' ? 'Save' : 'Create'}
        onSubmit={async (name) => {
          if (prompt?.mode === 'rename')
            return api.invoke('programs:rename', prompt.program.id, name)
          await load(await api.invoke('programs:create', name))
        }}
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        opened={deleting !== null}
        title="Delete program?"
        message={`"${deleting?.name}" will be deleted, with its record of what was played.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleting) void api.invoke('programs:delete', deleting.id)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
