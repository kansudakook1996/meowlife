import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // tests that copy real database files can pass 5 s on a busy CI runner while running in parallel
    testTimeout: 20_000
  }
})
