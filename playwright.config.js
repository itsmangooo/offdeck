import { defineConfig } from '@playwright/test'

const d3d = process.platform === 'win32' && process.env.OFFDECK_CHROME_D3D11 === '1'

export default defineConfig({
  testDir: './test/browser',
  timeout: 90_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: 'http://127.0.0.1:3097',
    viewport: { width: 1440, height: 900 },
    channel: d3d ? 'chrome' : undefined,
    launchOptions: { args: d3d
      ? ['--enable-gpu','--use-gl=angle','--use-angle=d3d11']
      : ['--enable-unsafe-swiftshader'] }
  },
  workers: 1,
  webServer: { command: 'node test/browser-server.js', url: 'http://127.0.0.1:3097/healthz' }
})
