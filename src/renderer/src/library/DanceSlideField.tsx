import { useState } from 'react'
import { Button, Group, Image, Progress, SegmentedControl, Stack, Text } from '@mantine/core'
import type { DanceSlide } from '@shared/canva'
import type { SongDance } from '@shared/library'
import { errorMessage } from '../ipc-error'
import { useOnline } from '../use-online'
import { useLibraryApi } from './LibraryProvider'
import SlideLinkDialog from './SlideLinkDialog'

// "Deck · slide 3: Title", or without the title when the slide isn't named in Canva.
const describe = (slide: DanceSlide): string =>
  `${slide.deckTitle ?? 'Canva deck'} · slide ${slide.position}` +
  (slide.title ? `: ${slide.title}` : '')

// Spec §6.3, §8.3: a dance's Canva slide, shown on the projector while the dance plays.
export default function DanceSlideField(props: {
  danceId: number
  danceName: string
  slide: DanceSlide | null
  image?: SongDance['slideImage'] // 0.3.0 spec §3.7: its own image, instead of or as well as Canva
  shows?: SongDance['slideShows'] // which one the projector shows, when it has both
}): React.JSX.Element {
  const api = useLibraryApi()
  const online = useOnline()
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { slide, image = null, shows = null } = props
  // Runs an image channel; main announces the change, which reloads the editor.
  const imageAction = (channel: 'library:attachSlideImage' | 'library:removeSlideImage'): void =>
    void api
      .invoke(channel, props.danceId)
      .then(() => setError(null))
      .catch((err) => setError(errorMessage(err)))
  const remove = () =>
    void api
      .invoke('canva:clearSlide', props.danceId)
      .then(() => setError(null))
      .catch((err) => setError(errorMessage(err)))

  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Text size="sm">Slide</Text>
        {slide ? (
          <>
            <Button size="compact-xs" variant="subtle" onClick={() => setLinking(true)}>
              Change…
            </Button>
            <Button size="compact-xs" variant="subtle" aria-label="Remove slide" onClick={remove}>
              Remove
            </Button>
          </>
        ) : (
          <Button size="compact-xs" variant="light" onClick={() => setLinking(true)}>
            Link a slide…
          </Button>
        )}
      </Group>
      {slide && (
        <>
          {slide.imageUrl && (
            <Image
              src={slide.imageUrl}
              alt={`Slide for ${props.danceName}`}
              w={240}
              h={135}
              fit="contain"
              radius="sm"
              bg="black"
            />
          )}
          {slide.status === 'missing' ? (
            <Text size="sm" c="red">
              This slide is no longer in the deck “{slide.deckTitle}”. Link it again.
            </Text>
          ) : (
            <Text size="sm">{describe(slide)}</Text>
          )}
          {slide.captureError ? (
            <Text size="sm" c="orange">
              Couldn't save the slide image: {slide.captureError}
            </Text>
          ) : (
            !slide.imageUrl &&
            slide.status === 'ok' &&
            (online ? (
              // Saving the image takes a few seconds, with no progress to report.
              <Stack gap={4} w={240}>
                <Text size="sm" c="dimmed">
                  Generating preview…
                </Text>
                <Progress.Root size="sm">
                  <Progress.Section value={100} animated striped aria-label="Generating preview" />
                </Progress.Root>
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                The slide preview will be generated when you're back online.
              </Text>
            ))
          )}
        </>
      )}
      <Group gap="xs">
        <Text size="sm">Image</Text>
        {image && !image.missing && (
          <Text size="sm" truncate title={image.name}>
            {image.name}
          </Text>
        )}
        {image?.missing && (
          <Text size="sm" c="red">
            The image is missing ({image.name}).
          </Text>
        )}
        {(!image || image.missing) && (
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => imageAction('library:attachSlideImage')}
          >
            Upload image…
          </Button>
        )}
        {image && !image.missing && (
          <Button
            size="compact-xs"
            variant="subtle"
            aria-label="Replace image"
            onClick={() => imageAction('library:attachSlideImage')}
          >
            Replace…
          </Button>
        )}
        {image && (
          <Button
            size="compact-xs"
            variant="subtle"
            aria-label="Remove image"
            onClick={() => imageAction('library:removeSlideImage')}
          >
            Remove
          </Button>
        )}
      </Group>
      {image && !image.missing && (
        <Image
          src={image.url}
          alt={`Image for ${props.danceName}`}
          w={240}
          h={135}
          fit="contain"
          radius="sm"
          bg="black"
        />
      )}
      {shows && (
        <SegmentedControl
          size="xs"
          aria-label="Show on the projector"
          value={shows}
          data={[
            { value: 'canva', label: 'Canva slide' },
            { value: 'image', label: 'Image' }
          ]}
          onChange={(source) =>
            void api
              .invoke('library:setSlideSource', props.danceId, source as 'canva' | 'image')
              .then(() => setError(null))
              .catch((err) => setError(errorMessage(err)))
          }
        />
      )}
      {error && (
        <Text size="sm" c="red" role="alert">
          {error}
        </Text>
      )}
      <SlideLinkDialog
        opened={linking}
        danceId={props.danceId}
        danceName={props.danceName}
        initialDeckId={slide?.deckId ?? null}
        initialPageId={slide?.pageId ?? null}
        onClose={() => setLinking(false)}
      />
    </Stack>
  )
}
