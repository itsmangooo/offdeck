import { test,expect } from '@playwright/test'
import { openPlayer } from './players.js'
import { handTarget,responseTarget } from './targets.js'

const profiles = [{width:1280,height:720},{width:1440,height:900},{width:1920,height:1080}]

for (const count of [5,8]) {
  test(count+' independent browsers submit, reveal, vote and agree on scores',async ({browser},info) => {
    test.setTimeout(180_000)
    const clients = []
    try {
      const intro = profiles[count === 5 ? 1 : 2]
      const host = await openPlayer(browser,'Maya',undefined,{viewport:intro})
      clients.push(host)
      const a = host.page
      const consoleErrors = []
      a.on('pageerror',error=>consoleErrors.push(error.message))
      await a.getByRole('button',{name:'Create Room'}).click()
      const dialog = a.getByRole('dialog')
      await dialog.getByLabel('Seats').fill(String(count))
      await dialog.getByLabel('Response time in seconds').fill('100')
      await dialog.getByLabel('Voting time in seconds').fill('75')
      await dialog.getByRole('button',{name:'Create Room'}).click()
      const invite = await a.getByLabel('Invitation link').inputValue()
      for (let index=1;index<count;index++) {
        clients.push(await openPlayer(browser,'Player '+(index+1),invite,{viewport:profiles[index%profiles.length]}))
      }
      const pages = clients.map(client=>client.page)
      await expect(a.getByText(count+'/'+count+' connected')).toBeVisible()
      const sizes = await Promise.all(pages.map(async page=>{
        await expect(page.locator('body.has-scene')).toHaveCount(1)
        return page.locator('#scene canvas').boundingBox()
      }))
      await a.getByRole('button',{name:'Start Game'}).click()
      await Promise.all(pages.map(page=>expect(page.locator('[data-phase="select"] .phase-panel')).toBeVisible()))
      const scenario = await a.locator('.scenario').textContent()
      const hands = await Promise.all(pages.map(async page=>{
        await expect(page.locator('.scenario')).toHaveText(scenario)
        await expect(page.locator('.hand button')).toHaveCount(7)
        return page.locator('.hand button').allTextContents()
      }))
      expect(new Set(hands.flat()).size).toBe(count*7)
      await a.screenshot({path:info.outputPath('dealt.png')})
      if (count === 8) await pages[6].screenshot({path:info.outputPath('end-seat.png')})
      for (const [index,page] of pages.entries()) {
        const target = handTarget(sizes[index],index)
        await page.mouse.click(target.x,target.y)
        if (index !== count-1) await expect(page.getByText('Response locked in.')).toBeVisible()
      }

      await Promise.all(pages.map(page=>expect(page.locator('[data-phase="vote"] .phase-panel')).toBeVisible()))
      await a.screenshot({path:info.outputPath('voting.png')})
      if (count === 8) await pages[6].screenshot({path:info.outputPath('end-seat-voting.png')})
      for (const [index,page] of pages.entries()) {
        const visible = page.locator('.responses article')
        await expect(visible).toHaveCount(count)
        const own = visible.filter({hasText:'Your Card'}).locator('button')
        await expect(own).toBeDisabled()
        await expect(own).toHaveText(hands[index][3])
        expect((await visible.locator('small').allTextContents()).filter(text=>text.includes('vote') && text !== 'Vote cast')).toEqual([])
        const selected = (await visible.locator('button').allTextContents()).indexOf(hands[(index+1)%count][3])
        expect(selected).toBeGreaterThanOrEqual(0)
        const target = responseTarget(sizes[index],index,selected,count)
        await page.mouse.click(target.x,target.y)
        if (index !== count-1) await expect(page.getByText('Vote locked in.')).toBeVisible()
      }
      await Promise.all(pages.map(async page=>{
        await expect(page.locator('[data-phase="results"] .phase-panel')).toBeVisible()
        await expect(page.locator('.scores strong')).toHaveText(Array(count).fill('1'))
        await expect(page.locator('.responses .winner')).toHaveCount(count)
      }))
      await a.screenshot({path:info.outputPath('results.png')})
      await Promise.all(pages.map(page=>expect(page.locator('[data-phase="select"] .phase-panel')).toBeVisible()))
      expect(await a.locator('.scenario').textContent()).not.toBe(scenario)
      expect(consoleErrors).toEqual([])
    } finally {
      await Promise.all(clients.map(client=>client.context.close()))
    }
  })
}
