import { test, expect } from '@playwright/test'
import { openPlayer } from './players.js'

test('scenario inspection opens by 3D click or keyboard and dismisses without submitting', async ({ browser }, info) => {
  const host = await openPlayer(browser,'Maya')
  const page = host.page
  await expect(page.locator('body.has-scene')).toHaveCount(1)
  await page.getByRole('button',{ name:'Create Room' }).click()
  await page.getByRole('dialog').getByRole('button',{ name:'Create Room' }).click()
  const link = await page.getByLabel('Invitation link').inputValue()
  const guest = await openPlayer(browser,'Jules',link)
  const third = await openPlayer(browser,'Sam',link)
  try {
    await page.getByRole('button',{ name:'Start Game' }).click()
    await expect(page.getByRole('heading',{ name:'Choose a response' })).toBeVisible()
    const canvas = page.locator('#scene canvas')
    const { width,height } = await canvas.boundingBox()
    await page.mouse.move(width*.5,height*.44)
    await expect(canvas).toHaveCSS('cursor','zoom-in')
    await page.screenshot({ path:info.outputPath('seated.png') })
    await page.mouse.click(width*.5,height*.44)
    const close = page.getByRole('button',{ name:'Close inspection Esc' })
    await expect(close).toBeVisible()
    await page.screenshot({ path:info.outputPath('inspect.png') })
    await page.keyboard.press('Escape')
    await expect(close).toBeHidden()
    await page.locator('.table-controls summary').click()
    await page.getByRole('button',{ name:'Inspect Scenario' }).focus()
    await page.keyboard.press('Enter')
    await expect(close).toBeFocused()
    await close.click()
    await expect(page.getByRole('button',{ name:'Inspect Scenario' })).toBeFocused()
    await expect(page.locator('.hand button')).toHaveCount(7)
    await guest.page.screenshot({ path:info.outputPath('diagonal-seat.png') })
  } finally {
    await Promise.all([host,guest,third].map(player => player.context.close()))
  }
})
