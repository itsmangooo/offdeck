import { once } from 'node:events'
import { chromium } from '@playwright/test'
import { io } from 'socket.io-client'
import { startServer } from '../server/index.js'

const server = await startServer({ port: 0 })
const guests = []
let browser
try {
  const hardware = process.argv.includes('--chrome')
  browser = await chromium.launch(hardware ? {
    channel: 'chrome', args: ['--enable-gpu', '--use-gl=angle', '--use-angle=d3d11']
  } : { args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    window.renderCounts = { draws: 0, textures: 0 }
    const calls = { drawElements: 'draws', drawArrays: 'draws', drawElementsInstanced: 'draws', drawArraysInstanced: 'draws',
      createTexture: 'textures', deleteTexture: 'textures' }
    for (const [method, type] of Object.entries(calls)) {
      const original = WebGL2RenderingContext.prototype[method]
      WebGL2RenderingContext.prototype[method] = function (...args) {
        window.renderCounts[type] += method === 'deleteTexture' ? -1 : 1
        return original.apply(this, args)
      }
    }
  })
  await page.goto(server.url)
  await page.getByLabel('Nickname').fill('Maya')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('body.has-scene').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Create Room' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const id = new URL(await page.getByLabel('Invitation link').inputValue()).pathname.split('/')[2]
  for (const name of ['Jules', 'Sam']) {
    const socket = io(server.url, { transports: ['websocket'], reconnection: false })
    guests.push(socket)
    await once(socket, 'connect')
    const joined = await socket.timeout(3000).emitWithAck('room:join', { id, name })
    if (!joined.ok) throw new Error(joined.code)
  }
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.getByRole('heading', { name: 'Choose a response' }).waitFor()
  await page.waitForTimeout(1700)
  const result = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const driver = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable'
    const before = window.renderCounts.draws
    const start = performance.now()
    let prior
    const intervals = []
    await new Promise(resolve => {
      function frame(time) {
        if (prior !== undefined) intervals.push(time - prior)
        prior = time
        if (time - start >= 5000) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    const span = intervals.reduce((sum, interval) => sum + interval, 0)
    intervals.sort((a,b) => a-b)
    return {
      driver, frames: intervals.length, fps: +(1000 * intervals.length / span).toFixed(1),
      p95Ms: +intervals[Math.ceil(intervals.length * .95) - 1].toFixed(2),
      drawCallsPerFrame: Math.round((window.renderCounts.draws - before) / (intervals.length + 1)),
      liveTextures: window.renderCounts.textures
    }
  })
  console.log(JSON.stringify(result))
  if (process.env.OFFDECK_MEASURE_SCREENSHOT) await page.screenshot({ path: process.env.OFFDECK_MEASURE_SCREENSHOT })
} finally {
  for (const guest of guests) guest.close()
  await browser?.close()
  await server.close()
}
