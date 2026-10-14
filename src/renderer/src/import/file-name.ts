// The last part of a file path ("/Music/Balkan/Kolo.mp3" → "Kolo.mp3").
export const fileName = (path: string): string => path.split('/').pop() || path
