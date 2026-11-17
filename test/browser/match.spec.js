import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'

async function playMatch(pages, scenarios, previousResponses) {
  const [host] = pages
  const seenResponses = new Set()
  for (let round = 0; round < 3; round++) {
    await Promise.all(pages.map(page => expect(page.getByRole('heading', { name: 'Choose a response' })).toBeVisible()))
    const scenario = await host.locator('.scenario').textContent()
    expect(scenarios.has(scenario)).toBe(false)
    scenarios.add(scenario)
    const hands = await Promise.all(pages.map(async page => {
      const list = page.locator('.table-controls')
      if (await list.getAttribute('open') === null) await list.locator('summary').click()
      await expect(page.locator('.scenario')).toHaveText(scenario)
      const buttons = page.locator('.hand button')
      await expect(buttons).toHaveCount(5)
      return buttons.allTextContents()
    }))
    expect(new Set(hands.flat()).size).toBe(15)
    for (const text of hands.flat()) {
      expect(previousResponses.has(text)).toBe(false)
      seenResponses.add(text)
    }
    await host.locator('.hand button').first().click()
    await expect(pages[1].locator('.responses')).toHaveCount(0)
    await expect(host.getByText('Response locked in.')).toBeVisible()
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
    await expect(page.locator('.scores .place')).toHaveText(['1','1','1'])
  }))
  return seenResponses
}

test('three browsers finish a match and two fresh rematches in the same room', async ({ browser }) => {
  test.setTimeout(150_000)
  const clients = []
  try {
    const host = await openPlayer(browser, 'Alex')
    clients.push(host)
    const a = host.page
    await a.getByRole('button', { name: 'Create Room' }).click()
    await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    const invite = await a.getByLabel('Invitation link').inputValue()
    for (const name of ['Bea','Cai']) clients.push(await openPlayer(browser, name, invite))
    const pages = clients.map(client => client.page)
    const scenarios = new Set()
    const seenResponses = new Set()
    await a.getByRole('button', { name: 'Start Game' }).click()
    const playFresh = async () => {
      const dealt = await playMatch(pages, scenarios, seenResponses)
      for (const card of dealt) seenResponses.add(card)
    }
    await playFresh()
    await a.getByRole('button', { name: 'Play Again' }).click()
    await expect(pages[1].locator('.scores strong')).toHaveText(['0', '0', '0'])
    await playFresh()
    await a.getByRole('button', { name: 'Return to Lobby' }).click()
    await expect(pages[1].getByRole('heading', { name: 'Room lobby' })).toBeVisible()
    await expect(pages[1].getByRole('button', { name: 'Ready', exact: true })).toBeVisible()
    await a.getByRole('button', { name: 'Start Game' }).click()
    await expect(pages[1].locator('.scores strong')).toHaveText(['0', '0', '0'])
    await playFresh()
    expect(scenarios.size).toBe(9)
  } finally {
    await Promise.all(clients.map(client => client.context.close()))
  }
})
