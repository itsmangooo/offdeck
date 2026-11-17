import { test, expect } from '@playwright/test'
import { confirmAge, openPlayer } from './players.js'

test('first-time visitors can decline and only enter an invitation after confirming 18+', async ({ browser }, info) => {
  const host = await openPlayer(browser, 'Maya')
  const visitor = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    await host.page.getByRole('button', { name: 'Create Room' }).click()
    await host.page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    const invite = await host.page.getByLabel('Invitation link').inputValue()
    const page = await visitor.newPage()
    const connections = []
    page.on('websocket', socket => connections.push(socket.url()))
    await page.goto(invite)
    const warning = page.getByRole('dialog', { name: 'OFFDECK — 18+' })
    await expect(warning).toContainText('This game contains explicit language, sexual humor, dark comedy, and mature themes.')
    await expect(page.getByLabel('Nickname')).toHaveCount(0)
    await expect(page.locator('#scene canvas')).toHaveCount(0)
    await expect(warning.getByRole('button', { name: 'I am 18 or older' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(warning).toBeVisible()
    await page.screenshot({ path: info.outputPath('age-confirmation.png') })
    await warning.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'You left OFFDECK.' })).toBeVisible()
    await expect(host.page.getByText('1/8 connected')).toBeVisible()
    expect(connections.filter(url => url.includes('/socket.io/'))).toEqual([])
    await page.reload()
    await expect(warning).toBeVisible()
    await confirmAge(page)
    await page.getByLabel('Nickname').fill('Guest')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Room lobby' })).toBeVisible()
    await expect(host.page.getByText('2/8 connected')).toBeVisible()
    await page.reload()
    await expect(warning).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Room lobby' })).toBeVisible()
    await expect(page.getByText('Guest (you)')).toBeVisible()
  } finally {
    await Promise.all([host.context.close(), visitor.close()])
  }
})
