import type { TourPart } from '@shared/tour'

// The two intro screens (tour spec §2.1.1): shown before a part begins, in the real window (the
// launch offer, Help) and, for Advanced, inside the tour after "Learn more". Plain words.
export const INTRO: Record<TourPart, { title: string; paragraphs: string[] }> = {
  basic: {
    title: 'Welcome to Folk Dance Player',
    paragraphs: [
      'Folk Dance Player helps you run a folk dance session. Build the running order for the evening from your music, play it with a short wait between songs and teaching stops where you need them, and show dancers a large display of what is playing and what comes next.',
      'This tour takes about ten minutes. You will do each thing yourself, on a practice library with a few sample songs, so nothing of yours is touched. You can leave at any time.'
    ]
  },
  advanced: {
    title: 'Ready for the advanced features?',
    paragraphs: [
      'The basic tour covered your music, building a program, and playing it. The advanced tour adds showing the projector, managing programs and playlists, and the settings.',
      'It takes about five minutes on the same practice library, and you can stop at any point.'
    ]
  }
}
