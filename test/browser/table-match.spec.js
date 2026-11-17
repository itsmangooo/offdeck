import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'

const home = 'http://127.0.0.1:3097'
const capture = process.env.OFFDECK_CAPTURE === '1'

test('three independent browser clients finish a production match using only physical cards', async ({ browser }, info) => {
  test.setTimeout(150_000)
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    const stats = window.offdeckTestGl = { created: 0, released: 0, peak: 0 }
    for (const [method, counter] of [['createTexture', 'created'], ['deleteTexture', 'released']]) {
      const original = WebGL2RenderingContext.prototype[method]
      WebGL2RenderingContext.prototype[method] = function (...args) {
        const value = original.apply(this, args)
        stats[counter]++
        stats.peak = Math.max(stats.peak, stats.created - stats.released)
        return value
      }
    }
  })
  const a = await context.newPage()
  const errors = []
  a.on('pageerror', error => errors.push(error.message))
  a.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await a.goto(home)
  await a.getByLabel('Nickname').fill('Maya')
  await a.getByRole('button', { name: 'Continue' }).click()
  await expect(a.locator('body.has-scene')).toHaveCount(1)
  const snapshot = async name => {
    if (!capture) return
    await a.screenshot({ path: info.outputPath(name + '.png') })
  }
  await snapshot('main-menu')
  await a.getByRole('button', { name: 'Create Room' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const invitation = await a.getByLabel('Invitation link').inputValue()
  const b = await openPlayer(browser, 'Jules', invitation)
  const c = await openPlayer(browser, 'Sam', invitation)
  const pages = [a,b.page,c.page]
  for (const { page } of [b,c]) await page.getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(a.getByRole('listitem').filter({ hasText: 'Sam' })).toContainText('Ready')
  await expect(a.getByText('3/8 connected')).toBeVisible()
  await snapshot('lobby')
  for (const page of pages.slice(1)) {
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  }
  const sizes = await Promise.all(pages.map(async page => {
    await expect(page.locator('body.has-scene')).toHaveCount(1)
    return page.locator('#scene canvas').boundingBox()
  }))
  await a.getByRole('button', { name: 'Start Game' }).click()

  const used = new Set()
  for (let round = 0; round < 3; round++) {
    await Promise.all(pages.map(page => expect(page.locator('[data-phase="select"]')).toBeVisible()))
    const scenario = await a.locator('.scenario').textContent()
    expect(used.has(scenario)).toBe(false)
    used.add(scenario)
    const hands = await Promise.all(pages.map(async page => {
      await expect(page.locator('.scenario')).toHaveText(scenario)
      return page.locator('.hand button').allTextContents()
    }))
    expect(hands.map(hand => hand.length)).toEqual([7,7,7])
    expect(new Set(hands.flat()).size).toBe(21)
    if (round === 0) await snapshot('gameplay')
    // Select the middle physical card on each camera. The accessible list stays closed.
    for (const [index,page] of pages.entries()) {
      const { width, height } = sizes[index]
      await page.mouse.click(width * .5, height * .84)
      if (index < 2) {
        await expect(page.getByText('Response locked in.')).toBeVisible()
        await expect(pages[(index + 1) % 3].locator('.responses')).toHaveCount(0)
      }
    }

    await Promise.all(pages.map(page => expect(page.locator('[data-phase="vote"]')).toBeVisible()))
    if (round === 0) await snapshot('voting')
    for (const [index,page] of pages.entries()) {
      const cards = page.locator('.responses article')
      await expect(cards).toHaveCount(3)
      await expect(cards.filter({ hasText: 'Your Card' }).getByRole('button', { includeHidden: true })).toHaveText(hands[index][3])
      const others = cards.locator('button')
      const expected = hands[index === 0 ? 1 : 0][3]
      const col = (await others.allTextContents()).indexOf(expected)
      expect(col).toBeGreaterThanOrEqual(0)
      const { width, height } = sizes[index]
      await page.mouse.click(width * .5 + (col - 1) * height * (index === 0 ? .219 : .194), height * .55)
      if (index < 2) await expect(page.getByText('Vote locked in.')).toBeVisible()
    }

    await Promise.all(pages.map(async page => {
      await expect(page.locator('[data-phase="results"]')).toBeVisible()
      await expect(page.locator('.scores strong')).toHaveText([String(2 * (round + 1)),String(round + 1),'0'])
      await expect(page.locator('.responses article.winner')).toHaveCount(1)
    }))
    if (round === 0) await snapshot('round-results')
  }

  await Promise.all(pages.map(async page => {
    await expect(page.getByRole('heading', { name: 'Final leaderboard' })).toBeVisible()
    await expect(page.getByText('3 scenarios played · 9 votes received')).toBeVisible()
    await expect(page.locator('.scores .winner')).toContainText('Maya')
  }))
  await snapshot('final-results')
  const gl = await a.evaluate(() => window.offdeckTestGl)
  expect(gl.created).toBeGreaterThan(15)
  expect(gl.released).toBeGreaterThan(15)
  expect(gl.created - gl.released).toBeLessThan(gl.peak)
  await info.attach('webgl-textures', { body: JSON.stringify(gl), contentType: 'application/json' })
  await a.getByRole('button', { name: 'Play Again' }).click()
  await expect(c.page.getByRole('heading', { name: 'Choose a response' })).toBeVisible()
  await expect(c.page.locator('.scores strong')).toHaveText(['0','0','0'])
  expect(errors).toEqual([])
  await Promise.all([context,b.context,c.context].map(client => client.close()))
})
