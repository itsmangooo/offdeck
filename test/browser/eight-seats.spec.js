import { test, expect } from '@playwright/test'
import { io } from 'socket.io-client'
import { once } from 'node:events'
import { openPlayer } from './players.js'

const home = 'http://127.0.0.1:3097'

test('an eight-seat room deals unique cards and lays out every response', async ({ browser }, info) => {
  const host = await openPlayer(browser, 'Maya')
  const a = host.page
  await a.getByRole('button', { name: 'Create Room' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
  const invite = new URL(await a.getByLabel('Invitation link').inputValue())
  const id = invite.pathname.split('/')[2]
  const clients = []
  try {
    for (let index = 0; index < 8; index++) {
      const socket = io(home, { transports: ['websocket'], reconnection: false })
      const client = { socket, state: null }
      clients.push(client)
      socket.on('room:state', state => { client.state = state })
      await once(socket, 'connect')
      const joined = await socket.timeout(3000).emitWithAck('room:join', { id, name: 'Seat ' + (index + 2) })
      if (index === 7) expect(joined).toEqual({ ok: false, code: 'FULL' })
      else expect(joined.ok).toBe(true)
    }
    await expect(a.getByText('8/8 connected')).toBeVisible()
    await a.getByRole('button', { name: 'Start Game' }).click()
    await expect(a.getByRole('heading', { name: 'Choose a response' })).toBeVisible()
    const guests = clients.slice(0,7)
    await expect.poll(() => guests.every(({ state }) => state?.match?.phase === 'select')).toBe(true)
    const seen = guests.flatMap(({ state }) => state.match.hand.map(card => card.text))
    seen.push(...await a.locator('.hand button').allTextContents())
    expect(seen).toHaveLength(56)
    expect(new Set(seen).size).toBe(56)
    for (const client of guests) {
      const { roundId, hand } = client.state.match
      expect(await client.socket.timeout(3000).emitWithAck('match:submit', { roundId, cardId: hand[0].id })).toEqual({ ok: true })
    }
    const canvas = a.locator('#scene canvas')
    const { width,height } = await canvas.boundingBox()
    await a.mouse.click(width * .5, height * .84)
    await expect(a.getByRole('heading', { name: 'Cast your vote' })).toBeVisible()
    await expect(a.locator('.responses article')).toHaveCount(8)
    await a.screenshot({ path: info.outputPath('eight-responses.png') })
    await a.mouse.move(width * .5 + height * .107, height * .41)
    const topRow = await canvas.evaluate(element => element.style.cursor)
    await a.mouse.move(width * .5 + height * .142, height * .72)
    const lowerRow = await canvas.evaluate(element => element.style.cursor)
    // The host's single own-card restriction can affect at most one row.
    expect([topRow, lowerRow]).toContain('pointer')
  } finally {
    for (const { socket } of clients) socket.close()
    await host.context.close()
  }
})
