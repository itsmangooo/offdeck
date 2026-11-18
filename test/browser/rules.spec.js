import { expect, test } from '@playwright/test'
import { openPlayer } from './players.js'

test('rules open from the menu, lobby, and live match without stopping the clock', async ({ browser }, info) => {
  const host = await openPlayer(browser, 'Maya')
  const guests = []
  const page = host.page
  const rules = page.getByRole('dialog', { name: 'Game Rules' })
  const trigger = page.getByRole('button', { name: 'Game Rules' })
  try {
    await trigger.click()
    await expect(rules.getByRole('listitem')).toHaveCount(10)
    await expect(rules.getByText(/20 randomly selected scenarios/)).toBeVisible()
    await page.screenshot({ path: info.outputPath('game-rules.png') })
    const extra = rules.locator('summary')
    await extra.focus()
    await page.keyboard.press('Enter')
    await expect(rules.getByText(/seat is held for two minutes/)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(rules.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()

    await page.getByRole('button', { name: 'Create Room' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    const invite = await page.getByLabel('Invitation link').inputValue()
    await trigger.click()
    await expect(rules).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()

    guests.push(await openPlayer(browser, 'Jules', invite), await openPlayer(browser, 'Sam', invite))
    await page.getByRole('button', { name: 'Start Game' }).click()
    await expect(page.locator('#countdown')).toHaveText(/\d+s/)
    const initialTime = await page.locator('#countdown').textContent()
    await trigger.click()
    await expect(rules).toBeVisible()
    await expect(page.locator('#countdown')).not.toHaveText(initialTime)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  } finally {
    await Promise.all([host, ...guests].map(({ context }) => context.close()))
  }
})
