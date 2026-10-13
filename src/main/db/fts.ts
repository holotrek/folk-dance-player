// Letters the FTS5 unicode61 tokenizer does not fold, because they are separate characters rather
// than a base letter plus a combining accent. Accents such as ş, ç, ğ, ü, é are left to the
// tokenizer (remove_diacritics 2). Migration 001 applies the same map inside its triggers; a test
// keeps the two in step.
export const FOLD_MAP: readonly (readonly [string, string])[] = [
  ['ı', 'i'],
  ['ł', 'l'],
  ['Ł', 'L'],
  ['ø', 'o'],
  ['Ø', 'O'],
  ['æ', 'ae'],
  ['Æ', 'AE'],
  ['œ', 'oe'],
  ['Œ', 'OE'],
  ['ß', 'ss'],
  ['ẞ', 'SS'],
  ['đ', 'd'],
  ['Đ', 'D'],
  ['ð', 'd'],
  ['Ð', 'D'],
  ['þ', 'th'],
  ['Þ', 'TH']
]

export function foldSearchText(text: string | null): string | null {
  if (text === null) return null
  let folded = text
  for (const [from, to] of FOLD_MAP) folded = folded.replaceAll(from, to)
  return folded
}

// Turns search-box text into a safe FTS5 query: every word becomes a quoted prefix term, so
// punctuation ("4-Wall", "d'Ivoire") and FTS syntax (quotes, OR, *, parentheses) can't break MATCH.
// Returns null when the input has no searchable words.
export function toFtsQuery(input: string): string | null {
  const words = (foldSearchText(input) ?? '').match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
  if (words.length === 0) return null
  return words.map((w) => `"${w}"*`).join(' ')
}
