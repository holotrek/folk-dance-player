// In-place updates (updates spec §3.1): what the updater is doing, as main broadcasts it.
export type UpdateState =
  | { kind: 'idle' } // nothing known, or up to date
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string } // downloaded and verified: waiting for a restart
  | { kind: 'error'; message: string }

// What a manual check answers: a state, or that this copy cannot update itself (a development run).
export type UpdateCheckResult = UpdateState | { kind: 'unsupported' }

export const UPDATE_IDLE: UpdateState = { kind: 'idle' }

// A session may run all evening, so the app asks again now and then; the first time shortly after
// it starts, so startup is not slowed.
export const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000
export const UPDATE_FIRST_CHECK_MS = 20_000
