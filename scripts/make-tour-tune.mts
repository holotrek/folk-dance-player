// Makes the guided tour's practice tunes: short, plain synthesized renditions of two traditional
// melodies, "Hava Nagila" and "Korobushka" (tour spec §5.1). Run it with `npm run tour:tune`; it
// writes resources/tour/*.wav. The output is deterministic, so a test can check the committed files
// are what this script makes.
//
// Each is the traditional melody only: no lyrics, no modern arrangement, and a performance made
// here, so there are no recording rights. (Hava Nagila was first published in 1922 in Idelsohn's
// Sefer Hashirim. Korobushka's words are Nekrasov's 1861 poem "Korobeiniki"; the folk melody is the
// plain tune, not the later game arrangement.) See resources/tour/README.md.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SAMPLE_RATE = 16_000

// MIDI note numbers (D4 is the D above middle C).
const N = {
  C4: 60,
  D4: 62,
  Eb4: 63,
  E4: 64,
  F4: 65,
  Fs4: 66,
  G4: 67,
  A4: 69,
  Bb4: 70,
  C5: 72,
  D5: 74
}
type Note = [pitch: number | null, eighths: number] // null: a rest

const { C4, D4, Eb4, E4, F4, Fs4, G4, A4, Bb4, C5, D5 } = N
const bars = (...notes: Note[]): Note[] => notes

// --- Hava Nagila (the Phrygian-dominant scale: D, E♭, F♯, G, A, B♭, C…) -----------------------
// Part A: three bars, then one of two endings.
const HN_A: Note[] = bars(
  [D4, 2],
  [D4, 3],
  [Fs4, 1],
  [Eb4, 1],
  [D4, 1],
  [Fs4, 2],
  [Fs4, 3],
  [A4, 1],
  [G4, 1],
  [Fs4, 1],
  [G4, 2],
  [G4, 3],
  [Bb4, 1],
  [A4, 1],
  [G4, 1]
)
const HN_ENDING_1: Note[] = bars([Fs4, 2], [Eb4, 0.5], [D4, 0.5], [Eb4, 1], [Fs4, 4])
const HN_ENDING_2: Note[] = bars([Fs4, 2], [Eb4, 0.5], [D4, 0.5], [Eb4, 1], [D4, 4])
// Part B.
const HN_B: Note[] = bars(
  [Fs4, 1],
  [Fs4, 2],
  [Eb4, 1],
  [D4, 1],
  [D4, 1],
  [D4, 2],
  [Eb4, 1],
  [Eb4, 2],
  [D4, 1],
  [C4, 1],
  [C4, 1],
  [C4, 2],
  [C4, 2],
  [Eb4, 3],
  [D4, 1],
  [C4, 1],
  [C4, 1],
  [G4, 2]
)
// A, A with its second ending, then B with its first: about 22 seconds, then a held last note.
const HAVA_NAGILA: Note[] = [
  ...HN_A,
  ...HN_ENDING_1,
  ...HN_A,
  ...HN_ENDING_2,
  ...HN_B,
  ...HN_ENDING_1,
  [D4, 6]
]

// --- Korobushka (D minor, 2/4) ---------------------------------------------------------------
const K_A: Note[] = bars(
  [A4, 2],
  [E4, 1],
  [F4, 1],
  [G4, 2],
  [F4, 1],
  [E4, 1],
  [D4, 2],
  [D4, 1],
  [F4, 1],
  [A4, 2],
  [G4, 1],
  [F4, 1],
  [E4, 3],
  [F4, 1],
  [G4, 2],
  [A4, 2],
  [F4, 2],
  [D4, 2],
  [D4, 2],
  [null, 2]
)
const K_B: Note[] = bars(
  [G4, 3],
  [Bb4, 1],
  [D5, 2],
  [C5, 1],
  [Bb4, 1],
  [A4, 3],
  [F4, 1],
  [A4, 2],
  [G4, 1],
  [F4, 1],
  [E4, 2],
  [E4, 1],
  [F4, 1],
  [G4, 2],
  [A4, 2],
  [F4, 2],
  [D4, 2],
  [D4, 2],
  [null, 2]
)
// A, B, A again: about 20 seconds, and a held last note.
const KOROBUSHKA: Note[] = [...K_A, ...K_B, ...K_A.slice(0, -2), [D4, 4]]

const TUNES = {
  'hava-nagila': { notes: HAVA_NAGILA, eighthSeconds: 0.22 }, // about 136 beats a minute
  korobushka: { notes: KOROBUSHKA, eighthSeconds: 0.21 } // a lively couple-dance tempo
} as const
export type TuneName = keyof typeof TUNES
export const TUNE_NAMES = ['hava-nagila', 'korobushka'] as const satisfies readonly TuneName[]

const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

// A soft, flute-like tone: a few harmonics, a short attack and a gentle release, so the pitch is
// clear (a speed change is audible, and the pitch staying put is too).
function tone(samples: Float32Array, start: number, seconds: number, midi: number, gain: number) {
  const f = frequency(midi)
  const from = Math.floor(start * SAMPLE_RATE)
  const length = Math.floor(seconds * SAMPLE_RATE)
  const attack = Math.floor(0.015 * SAMPLE_RATE)
  const release = Math.floor(0.06 * SAMPLE_RATE)
  for (let i = 0; i < length && from + i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    const envelope =
      Math.min(1, i / attack) *
      Math.min(1, (length - i) / release) *
      (0.85 + 0.15 * Math.exp(-3 * t))
    const wave =
      Math.sin(2 * Math.PI * f * t) +
      0.35 * Math.sin(2 * Math.PI * 2 * f * t) +
      0.12 * Math.sin(2 * Math.PI * 3 * f * t)
    samples[from + i] += gain * envelope * wave
  }
}

// A quiet low pulse on every quarter note, so the beat (and a change of speed) is easy to hear.
function pulse(samples: Float32Array, start: number, midi: number, gain: number) {
  const f = frequency(midi)
  const from = Math.floor(start * SAMPLE_RATE)
  const length = Math.floor(0.14 * SAMPLE_RATE)
  for (let i = 0; i < length && from + i < samples.length; i++) {
    const t = i / SAMPLE_RATE
    samples[from + i] += gain * Math.exp(-22 * t) * Math.sin(2 * Math.PI * f * t)
  }
}

// A tune as a mono, 16-bit WAV file.
export function renderTune(name: TuneName): Buffer {
  const { notes, eighthSeconds } = TUNES[name]
  const eighths = notes.reduce((total, [, length]) => total + length, 0)
  const seconds = eighths * eighthSeconds + 0.4
  const samples = new Float32Array(Math.ceil(seconds * SAMPLE_RATE))
  let at = 0
  for (const [pitch, length] of notes) {
    if (pitch !== null)
      tone(samples, at * eighthSeconds, length * eighthSeconds * 0.96, pitch, 0.42)
    at += length
  }
  for (let beat = 0; beat * 2 < eighths; beat++) {
    pulse(samples, beat * 2 * eighthSeconds, beat % 2 === 0 ? 38 : 45, 0.3)
  }
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2)
  )
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // bytes per second
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

export const tunePath = (name: TuneName): string =>
  fileURLToPath(new URL(`../resources/tour/${name}.wav`, import.meta.url))

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const name of TUNE_NAMES) {
    writeFileSync(tunePath(name), renderTune(name))
    console.log(`Wrote ${tunePath(name)}`)
  }
}
