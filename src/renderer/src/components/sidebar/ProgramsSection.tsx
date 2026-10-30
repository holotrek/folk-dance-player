import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Group, Menu, NavLink, ScrollArea, Text } from '@mantine/core'
import SearchInput from '../SearchInput'
import { useDebouncedValue } from '@mantine/hooks'
import type { ProgramSummary } from '@shared/program'
import { formatTotal, totalMs, type AutoContinue } from '@shared/program-time'
import { useLibraryApi } from '../../library/LibraryProvider'
import NewProgramPrompt from '../../program/NewProgramPrompt'
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
  autoContinue: AutoContinue // its gaps are part of the total play time
  onLoad: () => void
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
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
        description={
          <>
            <Text span inherit display="block">
              {songs(p.unplayedCount)}
            </Text>
            {p.unplayedCount > 0 && (
              <Text span inherit display="block">
                Total play time:{' '}
                {formatTotal(
                  totalMs(
                    { durationMs: p.unplayedDurationMs, gaps: p.unplayedGaps },
                    props.autoContinue
                  )
                )}
              </Text>
            )}
          </>
        }
        active={props.current}
        aria-current={props.current ? 'page' : undefined}
        onClick={props.onLoad}
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
  const autoContinue = useProgram((s) => s.player.autoContinue)
  const setSearch = useProgram((s) => s.setSearch)
  const load = useProgram((s) => s.load)
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, 150)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ProgramSummary | null>(null)
  const [deleting, setDeleting] = useState<ProgramSummary | null>(null)
  const [switching, setSwitching] = useState<ProgramSummary | null>(null)
  const busy = useProgram((s) => s.player.status !== 'idle')
  // Auto-continue follows the loaded program, so switching while a song plays asks first.
  const choose = (p: ProgramSummary): void => {
    if (busy && p.id !== currentId) setSwitching(p)
    else void load(p.id)
  }
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
          onClick={() => setCreating(true)}
        >
          +
        </ActionIcon>
      </Group>
      <SearchInput
        size="xs"
        placeholder="Search programs…"
        aria-label="Search programs"
        my="xs"
        value={text}
        onValueChange={setText}
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
              autoContinue={autoContinue}
              onLoad={() => choose(p)}
              onRename={() => setRenaming(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      </ScrollArea>
      <NewProgramPrompt opened={creating} onClose={() => setCreating(false)} />
      <NamePrompt
        opened={renaming !== null}
        title="Rename program"
        initialValue={renaming?.name ?? ''}
        submitLabel="Save"
        onSubmit={(name) => api.invoke('programs:rename', renaming!.id, name)}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        opened={switching !== null}
        title="Load another program?"
        message={`A song is playing. When it ends, the next song will come from “${switching?.name}”.`}
        confirmLabel="Load"
        onConfirm={() => {
          if (switching) void load(switching.id)
        }}
        onClose={() => setSwitching(null)}
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
