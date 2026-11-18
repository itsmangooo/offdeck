import { expect, test } from '@playwright/test'
import { confirmAge, openPlayer } from './players.js'

test('an invited first-time player can practice before taking their seat', async ({ browser }) => {
  const host = await openPlayer(browser, 'Maya')
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  try {
    await host.page.getByRole('button', { name: 'Create Room' }).click()
    await host.page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
    const invite = await host.page.getByLabel('Invitation link').inputValue()
    const guest = await context.newPage()
    await guest.goto(invite)
    await confirmAge(guest)
    await guest.getByLabel('Nickname').fill('Jules')
    await guest.getByRole('button', { name: 'Start Tutorial' }).click()
    const tutorial = guest.getByRole('dialog', { name: 'How to Play' })
    await expect(tutorial).toBeVisible()
    await tutorial.getByRole('button', { name: 'Next' }).click()
    await expect(host.page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(1)
    await tutorial.getByRole('button', { name: /Skip/ }).click()
    await expect(guest.getByRole('heading', { name: 'Room lobby' })).toBeVisible()
    await expect(host.page.getByRole('list', { name: 'Players' }).getByText('Jules')).toBeVisible()
    await guest.getByRole('button', { name: 'Settings' }).click()
    await expect(guest.getByRole('button', { name: 'Replay Tutorial' })).toBeDisabled()
  } finally {
    await context.close()
    await host.context.close()
  }
})

test('skipping onboarding persists and practice can be replayed from Settings', async ({ browser }) => {
  const { page, context } = await openPlayer(browser, 'Maya')
  try {
    expect(await page.evaluate(() => localStorage.getItem('offdeck.tutorial.v1'))).toBe('dismissed')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Replay Tutorial' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Welcome to OFFDECK' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Replay Tutorial' }).click()
    const tutorial = page.getByRole('dialog', { name: 'How to Play' })
    await expect(tutorial).toBeVisible()
    await tutorial.getByRole('button', { name: /Skip/ }).click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  } finally {
    await context.close()
  }
})
