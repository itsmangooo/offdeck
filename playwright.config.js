import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:3097', viewport: { width: 1440, height: 900 } },
  workers: 1,
  webServer: { command: 'node test/browser-server.js', url: 'http://127.0.0.1:3097/healthz' }
})
