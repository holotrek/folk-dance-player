import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  type ComboboxItem,
  type OptionsFilter
} from '@mantine/core'
import type { CanvaDeck, CanvaPage } from '@shared/canva'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from './LibraryProvider'

const FROM_DECK = 'From a deck'
const PASTE = 'Paste a slide link'

// The picker's options read "12 · Title"; typing narrows them by any part of that text, and a typed
// number lists that slide first ("12" before "112").
export const slideFilter: OptionsFilter = ({ options, search }) => {
  const words = search.trim().toLowerCase()
  const items = (options as ComboboxItem[]).filter((o) => o.label.toLowerCase().includes(words))
  if (!/^\d+$/.test(words)) return items
  const exact = (o: ComboboxItem): number => (o.label.startsWith(`${Number(words)} · `) ? 0 : 1)
  return [...items].sort((a, b) => exact(a) - exact(b)) // stable: the rest keep deck order
}

// Spec §6.3: pick a dance's slide from a searchable list of a deck's slides (adding the deck by its view link the
// first time), or paste a link to the slide from Canva's share menu. Opening the dialog re-reads the
// decks from Canva (the saved slide lists go stale when a deck is edited there); until that
// finishes, or when Canva can't be reached, it shows the last saved list.
export default function SlideLinkDialog(props: {
  opened: boolean
  danceId: number
  danceName: string
  initialDeckId: number | null
  initialPageId: string | null // the dance's slide, if it has one: the number starts on it
  onClose: () => void
}): React.JSX.Element {
  const api = useLibraryApi()
  const [mode, setMode] = useState(FROM_DECK)
  const [decks, setDecks] = useState<CanvaDeck[] | null>(null)
  const [deckId, setDeckId] = useState<number | null>(null)
  const [pages, setPages] = useState<CanvaPage[]>([])
  const [pageId, setPageId] = useState<string | null>(null) // the picked slide, by page ID
  const [adding, setAdding] = useState(false)
  const [deckLink, setDeckLink] = useState('')
  const [pageLink, setPageLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false) // re-reading the decks from Canva
  const [unreached, setUnreached] = useState(false) // Canva couldn't be reached: the list is saved
  const [reread, setReread] = useState(0) // counts re-reads, so the slide list is fetched again
  const typed = useRef(false) // a slide was picked: the dance's slide no longer sets it

  useEffect(() => {
    if (!props.opened) return
    setMode(FROM_DECK)
    setError(null)
    setDeckLink('')
    setPageLink('')
    setPageId(null)
    typed.current = false
    void api.invoke('canva:decks').then((list) => {
      setDecks(list)
      setAdding(list.length === 0)
      const initial = list.find((d) => d.id === props.initialDeckId) ?? list[0]
      setDeckId(initial?.id ?? null)
    })
  }, [api, props.opened, props.initialDeckId])

  // Best effort: if the check fails, the saved list stays and the dialog still works.
  useEffect(() => {
    if (!props.opened) return
    let live = true
    setChecking(true)
    setUnreached(false)
    void api
      .invoke('canva:refreshDecks')
      .then(async (summary) => {
        const list = await api.invoke('canva:decks')
        if (!live) return
        setDecks(list)
        setUnreached(summary.unreachable > 0)
        setReread((n) => n + 1)
      })
      .catch(() => undefined)
      .finally(() => live && setChecking(false))
    return () => {
      live = false
    }
  }, [api, props.opened])

  useEffect(() => {
    if (!props.opened) return
    let live = true
    if (deckId === null) setPages([])
    else void api.invoke('canva:deckPages', deckId).then((list) => live && setPages(list))
    return () => {
      live = false
    }
  }, [api, props.opened, deckId, reread])

  // Changing a dance's slide starts on it (by page ID, so it follows the slide when the deck is
  // re-read and renumbered), until another is picked. Otherwise, or when that slide has left its
  // deck, the first slide; a pick that has left the deck is cleared.
  useEffect(() => {
    if (pages.length === 0) return setPageId(null)
    setPageId((current) => {
      if (current !== null && pages.some((p) => p.id === current)) return current
      if (!typed.current && deckId === props.initialDeckId && props.initialPageId !== null) {
        if (pages.some((p) => p.id === props.initialPageId)) return props.initialPageId
      }
      return typed.current && current !== null ? null : pages[0].id
    })
  }, [pages, deckId, props.initialDeckId, props.initialPageId])

  const options = useMemo(
    () =>
      pages.map((p, i) => ({ value: p.id, label: `${i + 1} · ${p.title ?? 'Untitled slide'}` })),
    [pages]
  )

  const act = async (action: () => Promise<unknown>, close: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      if (close) props.onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addDeck = () =>
    act(async () => {
      const deck = await api.invoke('canva:addDeck', deckLink.trim())
      setDecks((list) => [...(list ?? []).filter((d) => d.id !== deck.id), deck])
      setDeckId(deck.id)
      setAdding(false)
      setDeckLink('')
    }, false)

  const index = pages.findIndex((p) => p.id === pageId)
  const canLink = mode === PASTE ? pageLink.trim() !== '' : deckId !== null && index >= 0

  const link = () =>
    act(
      () =>
        mode === PASTE
          ? api.invoke('canva:linkPageLink', props.danceId, pageLink.trim())
          : api.invoke('canva:linkSlide', props.danceId, deckId!, index + 1),
      true
    )

  return (
    <Modal opened={props.opened} onClose={props.onClose} title={`Slide for ${props.danceName}`}>
      <Stack>
        <SegmentedControl data={[FROM_DECK, PASTE]} value={mode} onChange={setMode} />
        {mode === FROM_DECK ? (
          <>
            {decks && decks.length > 0 && (
              <Group align="flex-end" wrap="nowrap">
                <Select
                  label="Deck"
                  style={{ flex: 1 }}
                  data={decks.map((d) => ({ value: String(d.id), label: d.title ?? d.designId }))}
                  value={deckId === null ? null : String(deckId)}
                  onChange={(v) => {
                    typed.current = false // another deck starts on its first slide
                    setPageId(null)
                    setDeckId(v === null ? null : Number(v))
                  }}
                  allowDeselect={false}
                />
                {!adding && (
                  <Button variant="default" onClick={() => setAdding(true)}>
                    + Add a deck…
                  </Button>
                )}
              </Group>
            )}
            {decks && decks.length > 0 && (checking || unreached) && (
              <Text size="xs" c="dimmed">
                {checking
                  ? 'Checking Canva for changes…'
                  : "Couldn't reach Canva; showing the last saved slide list."}
              </Text>
            )}
            {adding && (
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Deck link"
                  description="In Canva: Share → Embed → Smart embed link"
                  placeholder="https://www.canva.com/design/…/view?embed"
                  style={{ flex: 1 }}
                  value={deckLink}
                  onChange={(e) => setDeckLink(e.currentTarget.value)}
                />
                <Button onClick={addDeck} disabled={!deckLink.trim() || busy}>
                  Add deck
                </Button>
              </Group>
            )}
            {deckId !== null && (
              <Select
                label="Slide"
                searchable
                data={options}
                filter={slideFilter}
                nothingFoundMessage="No slides match"
                placeholder={pages.length === 0 ? 'This deck has no slides' : undefined}
                disabled={pages.length === 0}
                allowDeselect={false}
                value={pageId}
                onChange={(value) => {
                  typed.current = true
                  setPageId(value)
                }}
              />
            )}
          </>
        ) : (
          <TextInput
            label="Slide link"
            description="In Canva, select the slide, then Share → Copy link"
            value={pageLink}
            onChange={(e) => setPageLink(e.currentTarget.value)}
          />
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={link} disabled={!canLink || busy}>
            Link
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
