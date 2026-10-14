import { useEffect, useRef, useState } from 'react'
import type { RendererApi } from '@shared/contract'
import { mediaUrl } from '@shared/media'
import type { PlayerState } from '@shared/program'

const MEDIA_ERRORS: Record<number, string> = {
  2: "the file couldn't be loaded",
  3: 'the file is damaged',
  4: "the file can't be read or isn't a supported format"
}

export interface AudioControls {
  ref: React.RefObject<HTMLAudioElement | null>
  positionMs: number
  durationMs: number | null
  seek(ms: number): void
}

// The control window plays the audio (spec §9): this follows main's player state — which song,
// playing, paused or stopped, speed and volume — and reports back when a song ends or can't be played.
export function useAudio(api: RendererApi, player: PlayerState): AudioControls {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [positionMs, setPosition] = useState(0)
  const [durationMs, setDuration] = useState<number | null>(null)
  const playId = player.current?.playId ?? null
  const fileId = player.current?.track.fileId ?? null
  const playing = player.status === 'playing'
  const stopped = player.status === 'stopped'

  // A new play: load its file from the start.
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    setPosition(0)
    if (fileId === null) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      setDuration(null)
      return
    }
    audio.src = mediaUrl(fileId)
    audio.currentTime = 0
  }, [playId, fileId])

  // Playing or paused; ⏹ ('stopped') pauses and rewinds to the start, keeping the song loaded.
  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null) return
    if (playing) {
      void audio.play().catch(() => undefined) // a failure arrives as an 'error' event
      return
    }
    audio.pause()
    if (stopped) {
      audio.currentTime = 0
      setPosition(0)
    }
  }, [playing, stopped, playId])

  // Speed changes keep the pitch (spec §7.2). A new source resets playbackRate to the default.
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    audio.preservesPitch = true
    audio.defaultPlaybackRate = player.speed
    audio.playbackRate = player.speed
  }, [player.speed, playId])

  useEffect(() => {
    if (ref.current) ref.current.volume = player.volume
  }, [player.volume])

  useEffect(() => {
    const audio = ref.current
    if (!audio || playId === null) return
    const onEnded = () => void api.invoke('player:ended', playId)
    const onError = () =>
      void api.invoke(
        'player:failed',
        playId,
        MEDIA_ERRORS[audio.error?.code ?? 0] ?? 'unknown error'
      )
    const onTime = () => setPosition(audio.currentTime * 1000)
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration * 1000 : null)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [api, playId])

  return {
    ref,
    positionMs,
    durationMs: durationMs ?? player.current?.track.durationMs ?? null,
    seek: (ms) => {
      if (!ref.current) return
      ref.current.currentTime = ms / 1000
      setPosition(ms)
    }
  }
}
