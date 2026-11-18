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
    const start = page.getByRole('button', { name: 'How to Play' })
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
    await page.keyboard.press('Escape')
    await expect(start).toBeFocused()
    expect(frames).toEqual([])
  } finally {
    await context.close()
  }
})
