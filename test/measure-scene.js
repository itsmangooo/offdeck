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
    const allocations = new Map()
    window.renderCounts = { draws:0,textures:0,allocations }
    const prototype = WebGL2RenderingContext.prototype
    const storage = prototype.texStorage2D
    prototype.texStorage2D = function (target,levels,format,width,height) {
      const cube = target === this.TEXTURE_CUBE_MAP
      const bound = this.getParameter(cube ? this.TEXTURE_BINDING_CUBE_MAP : this.TEXTURE_BINDING_2D)
      const perPixel = new Map([[this.R8,1],[this.RG8,2],[this.RGB8,3],[this.RGBA16F,8],[this.RGBA32F,16]])
      const bytes = perPixel.get(format) ?? 4
      let pixels = 0
      for (let level=0;level<levels;level++) {
        pixels += Math.max(1,width>>level)*Math.max(1,height>>level)
      }
      if (bound) allocations.set(bound,pixels*bytes*(cube ? 6 : 1))
      return storage.call(this,target,levels,format,width,height)
    }
    const calls = { drawElements:'draws', drawArrays:'draws', drawElementsInstanced:'draws', drawArraysInstanced:'draws',
      createTexture:'textures', deleteTexture:'textures' }
    for (const [method, type] of Object.entries(calls)) {
      const original = WebGL2RenderingContext.prototype[method]
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (method === 'deleteTexture') allocations.delete(args[0])
        window.renderCounts[type] += method === 'deleteTexture' ? -1 : 1
        return original.apply(this,args)
      }
    }
  })
  await page.goto(server.url)
  await page.getByRole('button', { name: 'I am 18 or older' }).click()
  await page.getByLabel('Nickname').fill('Maya')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('body.has-scene').waitFor({ state: 'attached' })
  const quality = process.argv.find(arg => arg.startsWith('--quality='))?.split('=')[1]
  if (quality) {
    await page.getByRole('button',{name:'Settings'}).click()
    await page.getByLabel('Graphics quality').selectOption(quality)
    await page.getByRole('button',{name:'Save Settings'}).click()
  }
  await page.getByRole('button', { name: 'Create Room' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const id = new URL(await page.getByLabel('Invitation link').inputValue()).pathname.split('/')[2]
  const count = Number(process.argv.find(arg => arg.startsWith('--players='))?.split('=')[1] ?? 3)
  if (!Number.isInteger(count) || count < 3 || count > 8) throw Error('Expected 3–8 players')
  for (let index=1;index<count;index++) {
    const name = 'Guest '+index
    const socket = io(server.url, { transports: ['websocket'], reconnection: false, auth: { adult: true } })
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
      liveTextures: window.renderCounts.textures,
      trackedTextureMiB: +([...window.renderCounts.allocations.values()].reduce((total,bytes)=>total+bytes,0)/1048576).toFixed(2),
      buffer: [gl.drawingBufferWidth,gl.drawingBufferHeight]
    }
  })
  console.log(JSON.stringify(result))
  if (process.env.OFFDECK_MEASURE_SCREENSHOT) await page.screenshot({ path: process.env.OFFDECK_MEASURE_SCREENSHOT })
} finally {
  for (const guest of guests) guest.close()
  await browser?.close()
  await server.close()
}
