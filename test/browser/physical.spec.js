import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'
import { handTarget,responseTarget } from './targets.js'

test('physical hand submission, anonymous vote and refresh recovery', async ({ browser }, info) => {
  const host = await openPlayer(browser, 'Maya', undefined, { viewport: { width: 1200, height: 760 } })
  const a = host.page
  await expect(a.locator('body.has-scene')).toHaveCount(1)
  await a.getByRole('button', { name: 'Create Room' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const invitation = await a.getByLabel('Invitation link').inputValue()
  const guest = await openPlayer(browser, 'Jules', invitation)
  const third = await openPlayer(browser, 'Sam', invitation)
  await a.getByRole('button', { name: 'Start Game' }).click()
  await expect(a.getByRole('heading', { name: 'Choose a response' })).toBeVisible()
  const canvas = a.locator('#scene canvas')
  const size = await canvas.boundingBox()
  const middleHand = handTarget(size)
  await a.mouse.move(middleHand.x,middleHand.y)
  await expect(canvas).toHaveCSS('cursor','pointer')
  await a.screenshot({ path: info.outputPath('card-inspection.png') })
  await a.mouse.click(middleHand.x,middleHand.y)
  await expect(a.getByText('Response locked in.')).toBeVisible()
  for (const { page } of [guest,third]) {
    await page.locator('.table-controls summary').click()
    await page.locator('.hand button').first().click()
  }
  await expect(a.getByRole('heading', { name: 'Cast your vote' })).toBeVisible()
  const own = await a.locator('.responses article').evaluateAll(cards =>
    cards.findIndex(card => card.textContent.includes('Your Card')))
  expect(own).toBeGreaterThanOrEqual(0)
  const position = index => responseTarget(size,0,index)
  const mine = position(own)
  await a.mouse.move(mine.x,mine.y)
  await a.mouse.click(mine.x,mine.y)
  await expect(a.getByText('Choose another player’s response.')).toBeVisible()
  await a.screenshot({ path: info.outputPath('voting.png') })
  const other = position((own + 1) % 3)
  await a.mouse.move(other.x,other.y)
  await expect(canvas).toHaveCSS('cursor','pointer')
  await a.mouse.click(other.x,other.y)
  await expect(a.getByText('Vote locked in.')).toBeVisible()

  await third.page.close()
  await expect(a.getByText('Match paused.', { exact: false })).toBeVisible()
  const reconnected = await third.context.newPage()
  await reconnected.goto(invitation)
  await expect(reconnected.getByRole('heading', { name: 'Cast your vote' })).toBeVisible()
  await expect(a.getByText('Match paused.', { exact: false })).toHaveCount(0)
  await expect(a.getByText('Vote locked in.')).toBeVisible()
  await Promise.all([host,guest,third].map(client => client.context.close()))
})
