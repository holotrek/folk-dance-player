import { tourAudio } from './audio-hold'
import type { StepContext, TourStep } from './steps'

// The Basic tour (tour spec §3, steps 1–16), . The welcome screen is not a step: it is
// shown before the tour is entered. Song names are the practice library's (demo-library.ts).
// Each "do" step ends on the real result, read from the stores or the API.

const titles = (ctx: StepContext): string[] =>
  ctx.library
    .getState()
    .selectedRows()
    .map((r) => r.title)
const selected = (ctx: StepContext, title: string): boolean => titles(ctx).includes(title)
const inProgram = (ctx: StepContext, title: string): boolean =>
  (ctx.program.getState().program?.items ?? []).some((i) => i.kind === 'track' && i.title === title)
const shown = (target: string): boolean =>
  document.querySelector(`[data-tour="${target}"]`) !== null
const dialogOpen = (): boolean =>
  document.querySelector('[data-tour="program.dance-dialog"]') !== null
const inHolding = async (ctx: StepContext, title: string): Promise<boolean> =>
  (await ctx.api.invoke('library:holding')).some((h) => h.title === title)
// The dances of the song that is selected, from the real library.
const selectedDances = async (ctx: StepContext) => {
  const row = ctx.library.getState().selectedRows()[0]
  return row ? ((await ctx.api.invoke('library:song', row.songId))?.dances ?? []) : []
}

const step = (s: Omit<TourStep, 'part'>): TourStep => ({ part: 'basic', ...s })

export const BASIC_STEPS: TourStep[] = [
  step({
    id: 'basic.import',
    page: 'music',
    kind: 'explain',
    target: 'music.add',
    title: 'Getting your music in',
    body: 'This is where your music comes in. Add Music… takes a folder of songs; the app reads each song’s title, artist and country from the file. On a Mac you can also turn on Sync with Apple Music, beside it, to keep your Music library and playlists in step automatically.\n\nThe practice library already has songs, but let’s walk through an import.'
  }),
  step({
    id: 'basic.import-open',
    page: 'music',
    kind: 'do',
    target: 'music.add',
    placement: 'bottom',
    title: 'Try an import',
    body: 'Press Add Music…. A file picker would open here; in the practice library we pretend you chose a folder.',
    done: () => shown('import.mapping')
  }),
  step({
    id: 'basic.import-tags',
    page: 'music',
    kind: 'explain',
    target: 'import.mapping',
    placement: 'bottom',
    title: 'Which tag goes where',
    body: 'Every song file carries tags, and different collections fill them differently. “Populate Artist from” says which tag becomes the artist; the same goes for the teacher and the choreographer. Many folk dance collections keep the teacher in the Album Artist tag, so check yours. “Genre is Country” turns the Genre tag into the dance’s country.\n\nYour choices are remembered for next time, and you can re-apply them to songs you already have.'
  }),
  step({
    id: 'basic.import-run',
    page: 'music',
    kind: 'do',
    target: 'import.start',
    placement: 'top',
    title: 'Import',
    body: 'Press Import. The practice library has nothing new to add, so it will say the songs are already there.',
    done: () => shown('import.summary')
  }),
  step({
    id: 'basic.import-done',
    page: 'music',
    kind: 'do',
    target: 'import.done',
    placement: 'bottom',
    title: 'What happened',
    body: 'Every import ends with a summary of what was added, updated, or could not be read. Press Done.',
    done: () => !shown('import.summary') && !shown('import.mapping')
  }),
  step({
    id: 'basic.select',
    page: 'music',
    kind: 'do',
    target: 'song:Hava Nagila',
    title: 'Open a song’s details',
    body: 'Click Hava Nagila. Its details open on the right, where you can change anything about it.',
    done: (ctx) => titles(ctx).length > 0
  }),
  step({
    id: 'basic.two-dances-pick',
    page: 'music',
    kind: 'do',
    target: 'song:Legnala Dana',
    title: 'More than one dance for a song',
    body: 'Now click Legnala Dana.',
    done: (ctx) => selected(ctx, 'Legnala Dana')
  }),
  step({
    id: 'basic.two-dances',
    page: 'music',
    kind: 'explain',
    target: 'editor.dances',
    title: 'Two dances, one song',
    body: 'You can assign more than one dance to a song, when it makes sense to. This tune has two: Legnala Dana, and Lesnoto, which fits the same music. Each has its own card.\n\nYou can link more dances to a song, or make a new one, whenever you need to.'
  }),
  step({
    id: 'basic.shared-pick',
    page: 'music',
    kind: 'do',
    target: 'song:Makedonsko Devojče',
    title: 'One dance, more than one tune',
    body: 'It works the other way too. Click Makedonsko Devojče.',
    done: (ctx) => selected(ctx, 'Makedonsko Devojče')
  }),
  step({
    id: 'basic.shared-edit',
    page: 'music',
    kind: 'do',
    target: 'editor.dance-type',
    placement: 'left', // the suggestions open above or below the field
    title: 'Edit a dance once',
    body: 'This dance, Lesnoto, is done to another tune as well. Set its Dance type: pick Open Circle from the list.',
    done: async (ctx) =>
      (await selectedDances(ctx)).some((d) => d.name === 'Lesnoto' && !!d.danceType)
  }),
  step({
    id: 'basic.shared-other',
    page: 'music',
    kind: 'do',
    target: 'song:Legnala Dana',
    title: 'Now the other tune',
    body: 'Click Legnala Dana again. Its Lesnoto card has the same dance type: it is one dance, so you only edit it once.',
    done: (ctx) => selected(ctx, 'Legnala Dana')
  }),
  step({
    id: 'basic.who-owns-artist',
    page: 'music',
    kind: 'explain',
    target: 'editor.artist',
    title: 'The artist belongs to the song',
    body: 'The artist is who made the recording, so it stays with the song, whichever dances it has.'
  }),
  step({
    id: 'basic.who-owns-teacher',
    page: 'music',
    kind: 'explain',
    target: 'editor.teacher',
    title: 'The teacher belongs to the dance and tune together',
    body: 'The teacher is whoever taught this dance to this tune. That is why Lesnoto has one teacher here and another with Makedonsko Devojče, though it is the same dance.'
  }),
  step({
    id: 'basic.attachments',
    page: 'music',
    kind: 'explain',
    target: 'editor.pdf',
    title: 'Notes for a dance',
    body: 'Attach a PDF of a dance’s written notes here, and open it with one click, from this card or from a song’s ⋯ menu. The PDF belongs to the dance, so every tune for that dance shares it.\n\nPicking a file can’t happen in the practice library, so just have a look.'
  }),
  step({
    id: 'basic.canva',
    page: 'music',
    kind: 'explain',
    target: 'editor.slide',
    title: 'Slides for the projector',
    body: 'Link a Canva slide to a dance, or give it a slide image of your own, and the projector shows it while the dance plays. Slides are saved, so they work offline.\n\nThis needs your own Canva decks, so we’ll skip it here.'
  }),
  step({
    id: 'basic.search',
    page: 'program',
    kind: 'do',
    target: 'library.search',
    title: 'Find songs',
    body: 'This is the Program page. On the right is your library. Type hora in the search box: it searches titles, dance names, teachers, choreographers and countries.',
    done: (ctx) => ctx.library.getState().search.toLowerCase().includes('hora')
  }),
  step({
    id: 'basic.search-clear',
    page: 'program',
    kind: 'do',
    target: 'library.search',
    title: 'Clear the search',
    body: 'Clear it with the ✕ in the box to see all your songs again.',
    done: (ctx) => ctx.library.getState().search.trim() === ''
  }),
  step({
    id: 'basic.add',
    page: 'program',
    kind: 'do',
    target: ['song:Hava Nagila', 'program.panel'],
    title: 'Build your program',
    body: 'Your program is the running order for the evening. Drag Hava Nagila from the library into the Program on the left.',
    done: (ctx) => inProgram(ctx, 'Hava Nagila')
  }),
  step({
    id: 'basic.pick-dance',
    page: 'program',
    kind: 'do',
    target: ['song:Legnala Dana', 'program.panel'],
    title: 'When a song has two dances',
    body: 'Now drag Legnala Dana in. It has two dances, so the app asks which one you want.',
    done: (ctx) => inProgram(ctx, 'Legnala Dana') && dialogOpen()
  }),
  step({
    id: 'basic.pick-dance-answer',
    page: 'program',
    kind: 'do',
    target: 'program.dance-dialog',
    title: 'Which dance?',
    body: 'Choose one of the dances and press Done. You can change it later from the item’s ⋯ menu.',
    done: () => !dialogOpen()
  }),
  step({
    id: 'basic.remove',
    page: 'program',
    kind: 'do',
    target: 'program.remove:Legnala Dana',
    title: 'Take something out',
    body: 'Changed your mind? Click the ✕ on Legnala Dana to remove it from the program.',
    done: (ctx) => !inProgram(ctx, 'Legnala Dana')
  }),
  step({
    id: 'basic.hold',
    page: 'program',
    kind: 'do',
    target: ['song:Korobushka', 'holding.panel'],
    title: 'Holding',
    body: 'Holding is a shelf for songs you might use tonight. Drag Korobushka into Holding.',
    done: (ctx) => inHolding(ctx, 'Korobushka')
  }),
  step({
    id: 'basic.hold-back',
    page: 'program',
    kind: 'do',
    target: ['holding.row:Korobushka', 'program.panel'],
    title: 'From the shelf to the program',
    body: 'When you decide, drag it from Holding into your program. It moves, so it leaves the shelf.',
    done: async (ctx) => inProgram(ctx, 'Korobushka') && !(await inHolding(ctx, 'Korobushka'))
  }),
  step({
    id: 'basic.favorite',
    page: 'program',
    kind: 'do',
    target: 'star:Zemer Atik',
    title: 'Favorites',
    body: 'Click the star beside Zemer Atik to make it a favorite. Favorites have their own list in the sidebar.',
    done: (ctx) => ctx.library.getState().rows.some((r) => r.title === 'Zemer Atik' && r.isFavorite)
  }),
  step({
    id: 'basic.play',
    page: 'program',
    kind: 'do',
    target: 'player.play',
    title: 'Play it',
    body: 'Press Play. The first song starts after a short countdown. It will repeat for as long as you want to look around.',
    begin: () => tourAudio.setLoop(true),
    done: (ctx) => ['countdown', 'playing'].includes(ctx.program.getState().player.status)
  }),
  step({
    id: 'basic.speed',
    page: 'program',
    kind: 'do',
    target: 'player.speed',
    title: 'Slower or faster',
    body: 'Drag the speed slider. The music gets slower or faster, but the pitch stays the same, so you can teach a step at a gentler pace.',
    done: (ctx) => ctx.program.getState().player.speed !== 1
  }),
  step({
    id: 'basic.volume',
    page: 'program',
    kind: 'do',
    target: 'player.volume',
    title: 'Volume',
    body: 'And this is the volume.',
    done: (ctx) => ctx.program.getState().player.volume !== 1
  }),
  step({
    id: 'basic.wait',
    page: 'program',
    kind: 'explain',
    target: 'player.wait',
    placement: 'top',
    title: 'The wait between songs',
    body: 'When a song ends, the next one starts after a few seconds, so dancers can change partners. We have jumped to the end of this song: watch the next one begin, then press Next when you have read this. Set the wait here, or untick Auto-continue to start each song yourself. A STOP marker in the program also pauses everything while you teach.',
    begin: () => {
      tourAudio.setLoop(false)
      tourAudio.jumpNearEnd()
    }
  }),
  step({
    id: 'basic.end',
    page: null,
    kind: 'choice',
    title: 'That is the basics',
    body: 'Would you like to learn about some more app features or start building your music library now?',
    choices: [
      { id: 'learn-more', label: 'Learn more' },
      { id: 'start-now', label: 'Start now!' }
    ]
  })
]
