import { INTRO } from './text'
import type { StepContext, TourStep } from './steps'

// The Advanced tour (tour spec §3, steps 16b–25). Its first step is the intro card, shown inside
// the tour after "Learn more"; entered directly, the tour starts after it. The projector, deleting
// and synced playlists are explained, not done: there is no second screen in a practice library, and
// deleting would take the saved program away.

// How many programs and playlists there were when a step began (see `begin`), kept for the tour.
const programCount = (ctx: StepContext): number => ctx.program.getState().programs.length
const mine = (ctx: StepContext) => ctx.library.getState().playlists.filter((p) => !p.mirror)

const step = (s: Omit<TourStep, 'part'>): TourStep => ({ part: 'advanced', ...s })

export const ADVANCED_STEPS: TourStep[] = [
  step({
    id: 'advanced.intro',
    page: null,
    kind: 'intro',
    title: INTRO.advanced.title,
    body: INTRO.advanced.paragraphs.join('\n\n')
  }),
  step({
    id: 'advanced.projector',
    page: 'program',
    kind: 'explain',
    target: 'player.projector',
    title: 'Showing dancers what is playing',
    body: 'Turn on Projector and a large, easy-to-read display opens on a second screen, a TV or a projector: what played, what is playing now, and what comes next, with each dance’s slide.\n\nThere is no second screen in a practice library, so the switch does nothing here.'
  }),
  step({
    id: 'advanced.one-screen',
    page: 'program',
    kind: 'explain',
    target: 'player.autoshow',
    title: 'With only one screen',
    body: 'With no second screen, the same display covers your laptop after a little while without any activity while music plays, and goes away when you move the mouse or press Esc. Uncheck to disable showing the overlay.'
  }),
  step({
    id: 'advanced.auto-programs',
    page: 'program',
    kind: 'explain',
    target: 'program.panel',
    title: 'Programs make themselves',
    body: 'You never have to create a program first. Drop a song on an empty Program and one is made for you, named for today, like the one you started a moment ago. It is saved automatically, so you can come back to it.'
  }),
  step({
    id: 'advanced.add-program',
    page: 'program',
    kind: 'do',
    target: 'sidebar.programs.add',
    placement: 'right',
    title: 'Start another program',
    body: 'Programs are listed in the sidebar, newest first. Press + to start a new one, give it a name, and press Create.',
    begin: (ctx) => void (ctx.memo.programs = programCount(ctx)),
    done: (ctx) => programCount(ctx) > (ctx.memo.programs as number)
  }),
  step({
    id: 'advanced.delete',
    page: 'program',
    kind: 'explain',
    target: 'sidebar.programs',
    placement: 'right',
    title: 'Renaming and deleting',
    body: 'Each program has a ⋯ menu (or right-click it): Rename, Duplicate, and Delete. Delete asks first, and removes the program together with its record of what was played. We will not delete one here.'
  }),
  step({
    id: 'advanced.load',
    page: 'program',
    kind: 'do',
    target: 'sidebar.program:Friday warm-up',
    placement: 'right',
    title: 'Load another program',
    body: 'Click Friday warm-up to load it. If a song is still loaded, the app asks you to confirm first, because the next song will come from the program you load: press Load.',
    done: (ctx) => {
      const { programs, player } = ctx.program.getState()
      const friday = programs.find((p) => p.name === 'Friday warm-up')
      return friday !== undefined && player.programId === friday.id
    }
  }),
  step({
    id: 'advanced.playlists',
    page: 'program',
    kind: 'do',
    target: 'sidebar.playlist:Easy circle dances',
    placement: 'right',
    title: 'Playlists',
    body: 'Playlists group your songs however you like, for example easy circle dances. Ones you make are yours to change.\n\nPlaylists from Apple Music are marked with a note icon. They mirror the Music app, so you cannot change them here, and anything you add in Music appears here by itself.\n\nClick Easy circle dances to see what is in it.',
    done: (ctx) => {
      const { filter, playlists } = ctx.library.getState()
      const mine = playlists.find((p) => p.name === 'Easy circle dances')
      return filter.kind === 'playlist' && mine !== undefined && filter.playlistId === mine.id
    }
  }),
  step({
    id: 'advanced.open-folder',
    page: 'music',
    kind: 'do',
    target: 'sidebar.folder:Festival 2026',
    placement: 'right',
    title: 'Folders from Music',
    body: 'Folders from Apple Music keep their playlists inside. Click Festival 2026 to open it.',
    done: async (ctx) =>
      ((await ctx.api.invoke('settings:getAll'))['playlistFolders.open'] ?? []).length > 0
  }),
  step({
    id: 'advanced.mirror',
    page: 'music',
    kind: 'do',
    target: 'sidebar.playlist-options:Balkan night',
    placement: 'top',
    title: 'Changing a synced playlist',
    body: 'Balkan night comes from Apple Music, so it cannot be edited. Open its ⋯ menu and choose Duplicate as my playlist: you get a copy of your own that you can change freely.',
    begin: (ctx) => void (ctx.memo.playlists = mine(ctx).length),
    done: (ctx) => mine(ctx).length > (ctx.memo.playlists as number)
  }),
  step({
    id: 'advanced.settings-appearance',
    page: 'settings',
    kind: 'explain',
    target: 'settings.appearance',
    placement: 'right',
    title: 'Settings: Appearance',
    body: 'Settings holds the choices you rarely change. Appearance picks light or dark, or follows your Mac.'
  }),
  step({
    id: 'advanced.settings-import',
    page: 'settings',
    kind: 'explain',
    target: 'settings.import',
    placement: 'right',
    title: 'Settings: Import',
    body: 'These are the defaults for the “Populate … from” choices you saw when importing. You can still change them for any one import.'
  }),
  step({
    id: 'advanced.settings-remote',
    page: 'settings',
    kind: 'explain',
    target: 'settings.remote',
    placement: 'right',
    title: 'Settings: Remote control',
    body: 'If you use a presentation remote or keyboard media keys, they play, pause and skip songs even when the app is in the background. macOS asks you to allow it here.'
  }),
  step({
    id: 'advanced.settings-about',
    page: 'settings',
    kind: 'explain',
    target: 'settings.about',
    placement: 'right',
    title: 'Settings: About',
    body: 'The version and where your library is stored. Most people never need to change anything here.'
  }),
  step({
    id: 'advanced.end',
    page: null,
    kind: 'choice',
    title: 'That is everything',
    body: 'You have seen all the features. Your real library is next: start with Add Music…',
    choices: [{ id: 'done', label: 'Done' }]
  })
]
