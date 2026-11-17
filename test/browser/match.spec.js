import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'

test('three independent browsers play every scenario and can replay in the same room', async ({ browser }) => {
  const host = await openPlayer(browser, 'Alex')
  const a = host.page
  await a.getByRole('button', { name: 'Create Room' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const invite = await a.getByLabel('Invitation link').inputValue()
  const guest = await openPlayer(browser, 'Bea', invite)
  const third = await openPlayer(browser, 'Cai', invite)
  const clients = [host, guest, third]
  const pages = clients.map(client => client.page)
  await a.getByRole('button', { name: 'Start Game' }).click()

  const scenarios = new Set()
  for (let round = 0; round < 3; round++) {
    await Promise.all(pages.map(page => expect(page.getByRole('heading', { name: 'Choose a response' })).toBeVisible()))
    const scenario = await a.locator('.scenario').textContent()
    expect(scenarios.has(scenario)).toBe(false)
    scenarios.add(scenario)
    const hands = await Promise.all(pages.map(async page => {
      const list = page.locator('.table-controls')
      if (await list.getAttribute('open') === null) await list.locator('summary').click()
      await expect(page.locator('.scenario')).toHaveText(scenario)
      const buttons = page.locator('.hand button')
      await expect(buttons).toHaveCount(7)
      return buttons.allTextContents()
    }))
    expect(new Set(hands.flat()).size).toBe(21)
    await pages[0].locator('.hand button').first().click()
    await expect(pages[1].locator('.responses')).toHaveCount(0)
    await expect(pages[0].getByText('Response locked in.')).toBeVisible()
    await Promise.all(pages.slice(1).map(page => page.locator('.hand button').first().click()))
    await Promise.all(pages.map(async (page, index) => {
      await expect(page.getByRole('heading', { name: 'Cast your vote' })).toBeVisible()
      const own = page.locator('.responses article').filter({ hasText: 'Your Card' })
      await expect(own.getByRole('button')).toBeDisabled()
      await expect(own.getByRole('button')).toHaveText(hands[index][0])
      const voteFor = hands[(index + 1) % 3][0]
      await page.locator('.responses').getByRole('button', { name: voteFor, exact: true }).click()
    }))
    await Promise.all(pages.map(async page => {
      await expect(page.getByRole('heading', { name: 'Round results' })).toBeVisible()
      await expect(page.locator('.responses article.winner')).toHaveCount(3)
      await expect(page.locator('.scores strong')).toHaveText(Array(3).fill(String(round + 1)))
    }))
  }

  await Promise.all(pages.map(async page => {
    await expect(page.getByRole('heading', { name: 'Final leaderboard' })).toBeVisible()
    await expect(page.getByText('3 scenarios played · 9 votes received')).toBeVisible()
    await expect(page.locator('.scores .winner')).toHaveCount(3)
  }))
  await a.getByRole('button', { name: 'Play Again' }).click()
  await expect(guest.page.getByRole('heading', { name: 'Choose a response' })).toBeVisible()
  await expect(guest.page.locator('.scores strong')).toHaveText(['0', '0', '0'])
  await Promise.all(clients.map(client => client.context.close()))
})
