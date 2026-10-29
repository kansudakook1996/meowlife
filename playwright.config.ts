import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  // On CI the "github" reporter turns failures into annotations that are readable without logging in.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  outputDir: './test-results'
})
