# The guided tour's practice tunes

`hava-nagila.wav` and `korobushka.wav` are short (about 23 and 21 seconds) synthesized renditions of
two traditional melodies. The guided tour copies them into a throwaway practice library, so **Play**
really plays, the speed and volume steps can be heard, and the second tune is heard starting when
the first one ends.

Regenerate them with `npm run tour:tune` (`scripts/make-tour-tune.mts`). The output is
deterministic, and a test checks that the committed files are what the script makes.

## Why they are safe to ship (checked 2026-10-30 and 2026-10-31; not legal advice)

### Hava Nagila

- The melody was first published in 1922 in A. Z. Idelsohn's songbook _Sefer Hashirim_, so it has been
  in the US public domain since 2018. Idelsohn died in 1938. He described it as a Hasidic _nigun_ he
  transcribed in 1915.
- A competing claim says his student Moshe Nathanson wrote it. That could matter outside the US, so
  the tune uses **the traditional melody only**: no lyrics, and no modern arrangement (for example
  Harry Belafonte's).
- The performance is synthesized by `scripts/make-tour-tune.mts`, so there is no recording to clear.
- The pitches and rhythm were checked against a published transcription of the traditional melody
  (John Chambers' ABC collection). The notes in the script are our own table.

### Korobushka

- "Korobeiniki" ("Korobushka") is a Russian folk song. Its words are Nikolay Nekrasov's 1861 poem,
  and the melody is traditional, so both are far out of copyright everywhere.
- The tune is the **plain folk melody**, not the later game arrangement of it (that arrangement is
  someone's work). The performance is synthesized here, so there is no recording to clear.
- The pitches and rhythm were checked against Jack Campin's transcription in his tunebook; the notes
  in the script are our own table.

Credit shown in Settings → About: "The tour's practice tunes are synthesized renditions of the
traditional melodies “Hava Nagila” and “Korobushka”."
