# The guided tour's practice tune

`hava-nagila.wav` is a short (about 23 seconds) synthesized rendition of the traditional melody of
"Hava Nagila". The guided tour copies it into a throwaway practice library, so **Play** really plays
and the speed and volume steps can be heard.

Regenerate it with `npm run tour:tune` (`scripts/make-tour-tune.mts`). The output is deterministic,
and a test checks that the committed file is what the script makes.

## Why it is safe to ship (checked 2026-10-30; not legal advice)

- The melody was first published in 1922 in A. Z. Idelsohn's songbook _Sefer Hashirim_, so it has been
  in the US public domain since 2018. Idelsohn died in 1938. He described it as a Hasidic _nigun_ he
  transcribed in 1915.
- A competing claim says his student Moshe Nathanson wrote it. That could matter outside the US, so
  the tune uses **the traditional melody only**: no lyrics, and no modern arrangement (for example
  Harry Belafonte's).
- The performance is synthesized by `scripts/make-tour-tune.mts`, so there is no recording to clear.
- The pitches and rhythm were checked against a published transcription of the traditional melody
  (John Chambers' ABC collection). The notes in the script are our own table.

Credit shown in Settings → About: "The tour's practice tune is a synthesized rendition of the
traditional melody Hava Nagila."
