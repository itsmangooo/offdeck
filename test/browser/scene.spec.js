import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'

test('renders the clubhouse and physical cards from independent seats', async ({ browser }, info) => {
  test.setTimeout(60_000)
  const host = await openPlayer(browser, 'Maya')
  const a = host.page
  await expect(a.locator('body.has-scene')).toHaveCount(1)
  await a.screenshot({ path: info.outputPath('menu.png') })
  await a.getByRole('button', { name: 'Create Room' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const invitation = await a.getByLabel('Invitation link').inputValue()
  const guest = await openPlayer(browser, 'Jules', invitation)
  const third = await openPlayer(browser, 'Sam', invitation)
  await expect(a.getByText('3/8 connected')).toBeVisible()
  await expect(a.locator('#scene canvas')).toBeVisible()
  await a.screenshot({ path: info.outputPath('lobby.png') })
  await a.getByRole('button', { name: 'Start Game' }).click()
  await expect(a.getByRole('heading', { name: 'Choose a response' })).toBeVisible()
  await a.screenshot({ path: info.outputPath('seat-0.png') })
  await guest.page.setViewportSize({ width: 1280, height: 720 })
  await expect(guest.page.locator('body.has-scene')).toHaveCount(1)
  await guest.page.screenshot({ path: info.outputPath('seat-1.png') })
  await Promise.all([host,guest,third].map(client => client.context.close()))
})
