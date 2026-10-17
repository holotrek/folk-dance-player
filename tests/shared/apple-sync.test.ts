import { describe, expect, test } from 'vitest'
import {
  emptySyncSummary,
  isSyncSummary,
  syncChanged,
  syncMessage,
  syncParts
} from '@shared/apple-sync'

const at = '2026-10-16T11:42:00.000Z'
const item = (path: string) => ({ path })

describe('sync summaries', () => {
  test('an empty sync changed nothing', () => {
    const s = emptySyncSummary(at)
    expect(syncChanged(s)).toBe(false)
    expect(syncParts(s)).toEqual([])
    expect(syncMessage(s, 0)).toBe('Synced with Apple Music')
  })

  test('skipped, missing and unreadable tracks are not changes', () => {
    const s = emptySyncSummary(at)
    s.skipped = [{ reason: 'In the cloud or streamed', count: 17 }]
    s.missing = [item('/m/a.mp3')]
    s.unreadable = [item('/m/b.mp3')]
    s.unsupported = [item('/m/c.aiff')]
    expect(syncChanged(s)).toBe(false)
  })

  test('the message counts added, updated (any kind) and playlists, then the review list', () => {
    const s = emptySyncSummary(at)
    s.added = [item('/m/1.mp3'), item('/m/2.mp3'), item('/m/3.mp3')]
    s.updated = [item('/m/4.mp3')]
    s.relinked = [item('/m/5.mp3')]
    s.playlists.updated = ['Week 3']
    expect(syncChanged(s)).toBe(true)
    expect(syncParts(s)).toEqual(['3 added', '2 updated', '1 playlist changed'])
    expect(syncMessage(s, 2)).toBe(
      'Synced with Apple Music: 3 added, 2 updated, 1 playlist changed · 2 to review'
    )
  })

  test('a sync that only sent songs to review still changed something', () => {
    const s = emptySyncSummary(at)
    s.gone = [item('/m/a.mp3')]
    expect(syncChanged(s)).toBe(true)
    expect(syncMessage(s, 1)).toBe('Synced with Apple Music · 1 to review')
  })

  test('isSyncSummary accepts a summary and rejects other shapes', () => {
    expect(isSyncSummary(emptySyncSummary(at))).toBe(true)
    expect(isSyncSummary(null)).toBe(false)
    expect(isSyncSummary({ finishedAt: at })).toBe(false)
    expect(isSyncSummary({ ...emptySyncSummary(at), added: 'x' })).toBe(false)
  })
})
