import { test,expect } from '@playwright/test'
import { openPlayer } from './players.js'
import { responseTarget } from './targets.js'

test('the deal and reveal progress, and a resumed voting seat is immediately interactive',async ({browser},info) => {
  const normal = process.env.OFFDECK_CHROME_D3D11 === '1' ? 'no-preference' : 'reduce'
  const host = await openPlayer(browser,'Maya',undefined,{reducedMotion:normal})
  const a = host.page
  await a.getByRole('button',{name:'Create Room'}).click()
  await a.getByRole('dialog').getByRole('button',{name:'Create Room'}).click()
  const invite = await a.getByLabel('Invitation link').inputValue()
  const guest = await openPlayer(browser,'Jules',invite,{reducedMotion:normal})
  const third = await openPlayer(browser,'Sam',invite)
  try {
    await a.getByRole('button',{name:'Start Game'}).click()
    await expect(a.getByRole('heading',{name:'Choose a response'})).toBeVisible()
    await a.screenshot({path:info.outputPath('deal.png')})
    await a.waitForTimeout(950)
    await a.screenshot({path:info.outputPath('settled.png')})
    for (const {page} of [host,guest,third]) {
      await page.locator('.table-controls summary').click()
      await page.locator('.hand button').first().click()
    }
    await expect(a.getByRole('heading',{name:'Responses revealed'})).toBeVisible()
    await a.locator('.table-controls summary').click()
    await a.screenshot({path:info.outputPath('revealing.png')})
    await expect(a.getByRole('heading',{name:'Cast your vote'})).toBeVisible()
    await a.screenshot({path:info.outputPath('face-up.png')})
    await guest.page.close()
    await expect(a.getByText('Match paused.',{exact:false})).toBeVisible()
    const resume = await guest.context.newPage()
    await resume.goto(invite)
    await expect(resume.locator('body.has-scene')).toHaveCount(1)
    await expect(resume.getByRole('heading',{name:'Cast your vote'})).toBeVisible()
    const own = await resume.locator('.responses article').evaluateAll(nodes => nodes.findIndex(node =>
      node.textContent.includes('Your Card')))
    expect(own).toBeGreaterThanOrEqual(0)
    const canvas = resume.locator('#scene canvas')
    const target = responseTarget(await canvas.boundingBox(),1,(own+1)%3)
    await resume.mouse.move(target.x,target.y)
    expect(await canvas.evaluate(node => node.style.cursor)).toBe('pointer')
    await resume.mouse.click(target.x,target.y)
    await expect(resume.getByText('Vote locked in.')).toBeVisible()
  } finally {
    await Promise.all([host,guest,third].map(client=>client.context.close()))
  }
})
