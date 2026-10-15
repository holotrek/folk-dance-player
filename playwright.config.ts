import { defineConfig } from '@playwright/test'

// End-to-end tests (spec §10.2): the built app (`npm run build`), driven by Playwright, each test
// on its own throwaway library. One at a time: each opens the app's windows.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list'
})
