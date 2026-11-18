import { test,expect } from '@playwright/test'
import { openPlayer } from './players.js'
import { scenarioTarget,responseTarget } from './targets.js'

test('HUD clears the center and keeps keyboard and settings accessible across phases',async ({browser},info) => {
  const host = await openPlayer(browser,'Maya')
  const a = host.page
  await a.getByRole('button',{name:'Create Room'}).click()
  await a.getByRole('dialog').getByRole('button',{name:'Create Room'}).click()
  const invite = await a.getByLabel('Invitation link').inputValue()
  const others = [await openPlayer(browser,'Jules',invite),await openPlayer(browser,'Sam',invite)]
  const pages = [a,...others.map(client => client.page)]
  try {
    await a.getByRole('button',{name:'Start Game'}).click()
    await expect(a.getByRole('heading',{name:'Choose a response'})).toBeVisible()
    const hint = a.locator('.gameplay-hint')
    const guestHint = pages[1].locator('.gameplay-hint')
    await expect(hint).toHaveText('Choose one of your five cards.')
    await pages[1].getByRole('button',{name:'Settings'}).click()
    await pages[1].getByLabel('Gameplay hints').uncheck()
    await pages[1].getByRole('button',{name:'Save Settings'}).click()
    await expect(guestHint).toHaveCount(0)
    expect(await pages[1].evaluate(() => JSON.parse(localStorage.getItem('offdeck.settings')).hints)).toBe(false)
    for (const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
      await a.setViewportSize({width,height})
      const phase = await a.locator('.phase-panel').boundingBox()
      const scores = await a.locator('.score-panel').boundingBox()
      const room = await a.locator('.room-tools').boundingBox()
      expect(phase.x+phase.width).toBeLessThan(width*.29)
      expect(scores.x).toBeGreaterThan(width*.80)
      expect(room.y).toBeGreaterThan(height*.80)
      const scenario = scenarioTarget({width,height})
      await a.mouse.move(scenario.x,scenario.y)
      await expect(a.locator('#scene canvas')).toHaveCSS('cursor','zoom-in')
      await a.screenshot({path:info.outputPath('hud-'+width+'.png')})
    }
    await a.getByRole('button',{name:'Settings'}).click()
    await expect(a.getByRole('dialog',{name:'Settings'})).toBeVisible()
    await a.keyboard.press('Escape')
    await expect(a.getByRole('button',{name:'Settings'})).toBeFocused()
    for (const page of pages) {
      await page.locator('.table-controls summary').click()
      await page.locator('.hand button').first().click()
      if (page === a) await expect(hint).toHaveCount(0)
    }
    await expect(a.getByRole('heading',{name:'Cast your vote'})).toBeVisible()
    await expect(hint).toHaveText('Vote for another player’s funniest response.')
    await expect(guestHint).toHaveCount(0)
    await a.locator('.table-controls summary').click()
    const size = await a.locator('#scene canvas').boundingBox()
    const own = await a.locator('.responses article').evaluateAll(cards =>
      cards.findIndex(card => card.textContent.includes('Your Card')))
    const vote = responseTarget(size,0,(own+1)%3)
    await a.mouse.move(vote.x,vote.y)
    await expect(a.locator('#scene canvas')).toHaveCSS('cursor','pointer')
    await a.screenshot({path:info.outputPath('voting-hud.png')})
    await a.mouse.click(vote.x,vote.y)
    await expect(a.getByText('Vote locked in.')).toBeVisible()
    await expect(hint).toHaveCount(0)
    await expect(a.locator('.responses button[aria-pressed="true"]')).toBeDisabled()
    await expect(pages[1].locator('.responses button[aria-pressed="true"]')).toHaveCount(0)
    await a.screenshot({path:info.outputPath('vote-registered.png')})
    for (const page of pages.slice(1)) await page.locator('.responses button:enabled').first().click()
    await expect(a.getByRole('heading',{name:'Round results'})).toBeVisible()
    await expect(hint).toHaveText('Each vote received earns one point.')
    await expect(guestHint).toHaveCount(0)
    await expect(a.locator('.round-summary')).toBeVisible()
    await expect(a.locator('.score-delta').first()).toBeVisible()
    await a.screenshot({path:info.outputPath('results-hud.png')})
  } finally {
    await Promise.all([host,...others].map(client=>client.context.close()))
  }
})
