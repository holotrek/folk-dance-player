import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput
} from '@mantine/core'
import type { CanvaDeck, CanvaPage } from '@shared/canva'
import { errorMessage } from '../ipc-error'
import { useLibraryApi } from './LibraryProvider'

const FROM_DECK = 'From a deck'
const PASTE = 'Paste a slide link'

// Spec §6.3: pick a dance's slide by its number in a deck (adding the deck by its view link the
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
  const [position, setPosition] = useState<number | string>(1)
  const [adding, setAdding] = useState(false)
  const [deckLink, setDeckLink] = useState('')
  const [pageLink, setPageLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false) // re-reading the decks from Canva
  const [unreached, setUnreached] = useState(false) // Canva couldn't be reached: the list is saved
  const [reread, setReread] = useState(0) // counts re-reads, so the slide list is fetched again
  const typed = useRef(false) // the number was typed: the dance's slide no longer sets it

  useEffect(() => {
    if (!props.opened) return
    setMode(FROM_DECK)
    setError(null)
    setDeckLink('')
    setPageLink('')
    setPosition(1)
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

  // Changing a dance's slide starts on the number it has in its deck now (not slide 1), and follows
  // it when the deck is re-read, until a number is typed. A slide gone from its deck leaves the 1.
  useEffect(() => {
    if (typed.current || props.initialPageId === null || deckId !== props.initialDeckId) return
    const index = pages.findIndex((p) => p.id === props.initialPageId)
    if (index >= 0) setPosition(index + 1)
  }, [pages, deckId, props.initialDeckId, props.initialPageId])

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

  const number = typeof position === 'number' ? position : NaN
  const page = Number.isInteger(number) ? pages[number - 1] : undefined
  const canLink = mode === PASTE ? pageLink.trim() !== '' : deckId !== null && page !== undefined

  const link = () =>
    act(
      () =>
        mode === PASTE
          ? api.invoke('canva:linkPageLink', props.danceId, pageLink.trim())
          : api.invoke('canva:linkSlide', props.danceId, deckId!, number),
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
                  onChange={(v) => setDeckId(v === null ? null : Number(v))}
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
              <Group align="flex-end" wrap="nowrap">
                <NumberInput
                  label="Slide number"
                  description={`1 to ${pages.length}`}
                  min={1}
                  max={pages.length || undefined}
                  allowDecimal={false}
                  value={position}
                  onChange={(value) => {
                    typed.current = true
                    setPosition(value)
                  }}
                  w={140}
                />
                {page ? (
                  <Text pb={6}>{page.title ?? 'Untitled slide'}</Text>
                ) : (
                  <Text pb={6} c="dimmed">
                    No such slide
                  </Text>
                )}
              </Group>
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
