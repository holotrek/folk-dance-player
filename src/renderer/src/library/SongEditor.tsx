import { useCallback, useEffect, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  Rating,
  Stack,
  Text,
  Title
} from '@mantine/core'
import type { DanceSearchResult, SongDance, SongDetail, Suggestions } from '@shared/library'
import ConfirmDialog from '../components/ConfirmDialog'
import NamePrompt from '../components/NamePrompt'
import { errorMessage } from '../ipc-error'
import DancePicker from './DancePicker'
import { NotesField, SuggestField, TextField } from './fields'
import { useLibraryApi } from './LibraryProvider'

const NO_SUGGESTIONS: Suggestions = { people: [], countries: [], danceTypes: [] }

// Spec §6.3: edit one song and every dance linked to it.
export default function SongEditor({ songId }: { songId: number }): React.JSX.Element | null {
  const api = useLibraryApi()
  const [song, setSong] = useState<SongDetail | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestions>(NO_SUGGESTIONS)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<
    { mode: 'link' } | { mode: 'merge'; dance: SongDance } | null
  >(null)
  const [merging, setMerging] = useState<{ from: SongDance; into: DanceSearchResult } | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [detail, lists] = await Promise.all([
      api.invoke('library:song', songId),
      api.invoke('library:suggestions')
    ])
    setSong(detail)
    setSuggestions(lists)
  }, [api, songId])

  useEffect(() => {
    setError(null)
    void load()
    return api.on('library:changed', () => void load())
  }, [api, load])

  // Runs an edit; main announces the change, which reloads this editor.
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null)
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!song) return null
  const linked = song.dances.map((d) => d.danceId)

  return (
    <Stack gap="sm">
      {error && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Title order={4}>Song</Title>
      {song.isMissing && <Alert color="yellow">The file for this song can't be found.</Alert>}
      <TextField
        label="Title"
        value={song.title}
        onSave={(title) => run(() => api.invoke('library:updateSong', songId, { title }))}
      />
      <TextField
        label="Artist"
        value={song.artist}
        onSave={(artist) => run(() => api.invoke('library:updateSong', songId, { artist }))}
      />
      <Text size="xs" c="dimmed" truncate title={song.path}>
        {song.path}
      </Text>

      <Group justify="space-between" mt="sm">
        <Title order={4}>Dances</Title>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => setPicker({ mode: 'link' })}>
            Link a dance…
          </Button>
          <Button size="xs" variant="default" onClick={() => setCreating(true)}>
            New dance…
          </Button>
        </Group>
      </Group>
      {song.dances.length === 0 && <Text c="dimmed">No dances linked to this song.</Text>}

      {song.suggestions.map((s) => {
        const dance = song.dances.find((d) => d.danceId === s.forDanceId)
        return (
          <Alert key={`${s.forDanceId}-${s.candidate.danceId}`} color="blue">
            <Text size="sm">
              Another dance called “{s.candidate.name}” exists
              {s.candidate.songTitles.length > 0 && ` (${s.candidate.songTitles.join(', ')})`}. Same
              dance as “{dance?.name}”?
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                size="xs"
                onClick={() =>
                  run(() =>
                    api.invoke('library:sameDance', songId, s.forDanceId, s.candidate.danceId)
                  )
                }
              >
                Same dance
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() =>
                  run(() => api.invoke('library:markDifferent', s.forDanceId, s.candidate.danceId))
                }
              >
                Different dance
              </Button>
            </Group>
          </Alert>
        )
      })}

      {song.dances.map((d) => (
        <Paper key={d.danceId} withBorder p="sm" role="group" aria-label={d.label}>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm" truncate>
                {d.label}
              </Text>
              <Group gap={4} wrap="nowrap">
                {d.isDefault ? (
                  <Badge size="sm" variant="light">
                    ★ Default
                  </Badge>
                ) : (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() =>
                      run(() => api.invoke('library:setDefaultDance', songId, d.danceId))
                    }
                  >
                    Make default
                  </Button>
                )}
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="sm" aria-label="Dance options">
                      ⋯
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setPicker({ mode: 'merge', dance: d })}>
                      Merge into another dance…
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      onClick={() =>
                        run(() => api.invoke('library:unlinkDance', songId, d.danceId))
                      }
                    >
                      Unlink from this song
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
            {d.songCount > 1 && (
              <Text size="xs" c="dimmed">
                Also used by {d.songCount - 1} other {d.songCount === 2 ? 'song' : 'songs'}: changes
                apply to all of them.
              </Text>
            )}
            <TextField
              label="Dance name"
              value={d.name}
              onSave={(name) => run(() => api.invoke('library:updateDance', d.danceId, { name }))}
            />
            <SuggestField
              label="Country"
              value={d.country}
              suggestions={suggestions.countries}
              onSave={(country) =>
                run(() => api.invoke('library:updateDance', d.danceId, { country }))
              }
            />
            <SuggestField
              label="Choreographer"
              value={d.choreographer}
              suggestions={suggestions.people}
              onSave={(choreographer) =>
                run(() => api.invoke('library:updateDance', d.danceId, { choreographer }))
              }
            />
            <SuggestField
              label="Teacher"
              value={d.teacher}
              suggestions={suggestions.people}
              onSave={(teacher) =>
                run(() => api.invoke('library:setTeacher', d.pairingId, teacher))
              }
            />
            <SuggestField
              label="Dance type"
              value={d.danceType}
              suggestions={suggestions.danceTypes}
              onSave={(danceType) =>
                run(() => api.invoke('library:updateDance', d.danceId, { danceType }))
              }
            />
            <Group gap="xs">
              <Text size="sm">Difficulty</Text>
              <Rating
                value={d.difficulty ?? 0}
                onChange={(difficulty) =>
                  run(() => api.invoke('library:updateDance', d.danceId, { difficulty }))
                }
              />
              {d.difficulty !== null && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    run(() => api.invoke('library:updateDance', d.danceId, { difficulty: null }))
                  }
                >
                  Clear
                </Button>
              )}
            </Group>
            <NotesField
              label="Notes"
              value={d.notes}
              onSave={(notes) => run(() => api.invoke('library:updateDance', d.danceId, { notes }))}
            />
          </Stack>
        </Paper>
      ))}

      <DancePicker
        opened={picker !== null}
        title={picker?.mode === 'merge' ? `Merge “${picker.dance.name}” into…` : 'Link a dance'}
        actionLabel={picker?.mode === 'merge' ? 'Merge into' : 'Link'}
        exclude={picker?.mode === 'merge' ? [picker.dance.danceId] : linked}
        onPick={(dance) => {
          const current = picker
          setPicker(null)
          if (current?.mode === 'merge') setMerging({ from: current.dance, into: dance })
          else void run(() => api.invoke('library:linkDance', songId, dance.danceId))
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmDialog
        opened={merging !== null}
        title="Merge dances?"
        message={`“${merging?.from.name}” will be merged into “${merging?.into.name}”: its songs, teachers and history move there, and “${merging?.from.name}” is deleted.`}
        confirmLabel="Merge"
        onConfirm={() =>
          merging &&
          run(() => api.invoke('library:mergeDances', merging.into.danceId, merging.from.danceId))
        }
        onClose={() => setMerging(null)}
      />
      <NamePrompt
        opened={creating}
        title="New dance"
        submitLabel="Create"
        onSubmit={(name) => api.invoke('library:createDance', songId, name)}
        onClose={() => setCreating(false)}
      />
    </Stack>
  )
}
