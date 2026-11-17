import { test, expect } from '@playwright/test'
import { startServer } from '../../server/index.js'
import { openPlayer } from './players.js'

test('restarting an in-memory server clears the stale lobby and reports an expired invitation', async ({ browser }) => {
  const before = await startServer({ port: 0, dev: process.env.OFFDECK_BROWSER_PROD !== '1' })
  let server = before
  let player
  try {
    player = await openPlayer(browser, 'Maya', server.url)
    const a = player.page
    await a.getByRole('button', { name: 'Create Room' }).click()
    await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    await expect(a.getByRole('heading', { name: 'Room lobby' })).toBeVisible()
    await before.close()
    server = await startServer({ port: Number(new URL(before.url).port), dev: process.env.OFFDECK_BROWSER_PROD !== '1' })
    await expect(a.getByText('This room has expired or could not be found.')).toBeVisible()
    await expect(a.getByRole('heading', { name: 'Room lobby' })).toHaveCount(0)
    await expect(a.getByRole('dialog', { name: 'Join Room' })).toBeVisible()
    await a.getByRole('button', { name: 'Close' }).click()
    await expect(a.getByRole('heading', { name: 'OFFDECK.' })).toBeVisible()
  } finally {
    await player?.context.close()
    if (server !== before) await server.close()
    else await before.close().catch(() => {})
  }
})
