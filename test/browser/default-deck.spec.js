import { test, expect } from '@playwright/test'
import { startServer } from '../../server/index.js'
import { openPlayer } from './players.js'

test('a room with the release library starts with one scenario in play and 19 in the pile', async ({ browser }) => {
  const server = await startServer({ port: 0, dev: process.env.OFFDECK_BROWSER_PROD !== '1' })
  const clients = []
  try {
    const host = await openPlayer(browser, 'Maya', server.url)
    clients.push(host)
    const page = host.page
    await page.getByRole('button', { name: 'Create Room' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    const invite = await page.getByLabel('Invitation link').inputValue()
    for (const name of ['Jules', 'Sam']) {
      const guest = await openPlayer(browser, name, invite)
      clients.push(guest)
      await guest.page.getByRole('button', { name: 'Ready', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Start Game' }).click()
    for (const { page } of clients) {
      await expect(page.getByText('19 in deck')).toBeVisible()
      await expect(page.locator('.hand button')).toHaveCount(5)
    }
  } finally {
    await Promise.all(clients.map(client => client.context.close()))
    await server.close()
  }
})
