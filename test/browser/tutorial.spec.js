import { expect, test } from '@playwright/test'
import { openPlayer } from './players.js'
import { handTarget, scenarioTarget } from './targets.js'

test('the practice table teaches the full round without emitting multiplayer actions', async ({ browser }, info) => {
  const frames = []
  const client = await openPlayer(browser, 'Maya', undefined, {}, context => {
    context.on('page', page => page.on('websocket', socket => {
      socket.on('framesent', ({ payload }) => {
        if (typeof payload === 'string' && /"(room|match|player):/.test(payload)) frames.push(payload)
      })
    }))
  })
  const { page, context } = client
  const guide = page.getByRole('dialog', { name: 'How to Play' })
  const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
  try {
    const start = page.getByRole('button', { name: 'Replay Tutorial' })
    await start.click()
    await expect(guide.getByRole('heading', { name: 'Welcome to OFFDECK' })).toBeFocused()
    await expect(guide.getByRole('button', { name: 'Back' })).toBeDisabled()
    await next()
    await guide.getByRole('button', { name: 'Preview a card' }).click()
    await expect(guide.locator('#tutorial-card-preview')).toHaveText('A raccoon with a clipboard')

    await next()
    const scenario = scenarioTarget(page.viewportSize())
    await page.mouse.move(scenario.x, scenario.y)
    await expect(page.locator('#scene canvas')).toHaveCSS('cursor', 'zoom-in')
    await page.mouse.click(scenario.x, scenario.y)
    await expect(page.getByRole('button', { name: 'Close inspection' })).toBeVisible()
    await page.screenshot({ path: info.outputPath('tutorial-scenario.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Close inspection' })).toBeHidden()
    await next()
    await expect(guide.locator('.tutorial-choices button')).toHaveCount(5)
    await page.screenshot({ path: info.outputPath('tutorial-response.png') })
    const hand = handTarget(page.viewportSize())
    await page.mouse.move(hand.x, hand.y)
    await expect(page.locator('#scene canvas')).toHaveCSS('cursor', 'pointer')
    await page.mouse.click(hand.x, hand.y)
    await expect(guide.getByRole('status')).toHaveText(/Response locked in/)

    await next()
    await expect(guide.getByRole('button', { name: /Your card/ })).toBeDisabled()
    await page.screenshot({ path: info.outputPath('tutorial-voting.png') })
    await guide.getByRole('button', { name: 'Three ducks in a trench coat' }).click()
    await expect(guide.getByRole('status')).toHaveText('Vote locked in.')
    await next()
    await expect(guide.locator('[data-tutorial-score]')).toHaveText('1 +1')
    await guide.getByRole('button', { name: 'Back' }).click()
    await expect(guide.getByRole('heading', { name: 'Vote anonymously' })).toBeFocused()
    await next()
    await next()
    await expect(guide.getByText(/After 20 scenarios/)).toBeVisible()
    await guide.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Play' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('offdeck.tutorial.v1'))).toBe('completed')
    await page.keyboard.press('Escape')
    await expect(start).toBeFocused()
    expect(frames).toEqual([])
  } finally {
    await context.close()
  }
})

test('rules and practice controls fit small screens and common desktop sizes', async ({ browser }) => {
  const { page, context } = await openPlayer(browser, 'Maya', undefined, { reducedMotion: 'no-preference' })
  try {
    await expect(page.locator('body.has-scene')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 760 })
    await page.getByRole('button', { name: 'Game Rules' }).click()
    const rules = page.getByRole('dialog', { name: 'Game Rules' })
    await rules.getByText('Timers, disconnects, and rematches').click()
    await expect(rules.getByText('Timers and late submissions', { exact: true })).toBeInViewport()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Replay Tutorial' }).click()
    const guide = page.getByRole('dialog', { name: 'How to Play' })
    const next = guide.getByRole('button', { name: 'Next', exact: true })
    await next.click()
    await next.click()
    await guide.getByRole('button', { name: 'Inspect scenario' }).click()
    await page.getByRole('button', { name: 'Close inspection' }).click()
    await next.click()
    for (const [width, height] of [[390,760], [1280,720], [1440,900], [1920,1080]]) {
      await page.setViewportSize({ width, height })
      await expect(guide.getByRole('heading')).toBeInViewport()
      await expect(next).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    }
    await guide.getByRole('button', { name: 'A raccoon with a clipboard' }).click()
    await next.click()
    await guide.getByRole('button', { name: 'Three ducks in a trench coat' }).click()
    await next.click()
    await expect(guide.locator('[data-tutorial-score]')).toHaveText('1 +1')
  } finally {
    await context.close()
  }
})
