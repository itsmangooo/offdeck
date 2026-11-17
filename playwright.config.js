import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: 'http://127.0.0.1:3097',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] }
  },
  workers: 1,
  webServer: { command: 'node test/browser-server.js', url: 'http://127.0.0.1:3097/healthz' }
})
