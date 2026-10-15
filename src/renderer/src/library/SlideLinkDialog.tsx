import { useEffect, useState } from 'react'
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
// first time), or paste a link to the slide from Canva's share menu.
export default function SlideLinkDialog(props: {
  opened: boolean
  danceId: number
  danceName: string
  initialDeckId: number | null
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

  useEffect(() => {
    if (!props.opened) return
    setMode(FROM_DECK)
    setError(null)
    setDeckLink('')
    setPageLink('')
    setPosition(1)
    void api.invoke('canva:decks').then((list) => {
      setDecks(list)
      setAdding(list.length === 0)
      const initial = list.find((d) => d.id === props.initialDeckId) ?? list[0]
      setDeckId(initial?.id ?? null)
    })
  }, [api, props.opened, props.initialDeckId])

  useEffect(() => {
    if (deckId === null) setPages([])
    else void api.invoke('canva:deckPages', deckId).then(setPages)
  }, [api, deckId])

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
            {adding && (
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Deck link"
                  description="In Canva: Share → Public view link"
                  placeholder="https://www.canva.com/design/…/view"
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
                  onChange={setPosition}
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
