import { test, expect } from '@playwright/test'
import { startServer } from '../../server/index.js'
import { starterDecks } from '../../server/decks.js'
import { openPlayer } from './players.js'
import { handTarget, responseTarget, scenarioTarget } from './targets.js'

const displays = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
]

test('short, medium and long library cards fit the 3D table in every desktop size', async ({ browser }, info) => {
  const ordered = starterDecks.responses.toSorted((a,b) => a.text.length - b.text.length)
  const groups = [ordered.slice(0,5), ordered.slice(375,380), ordered.slice(-5)]
  const scenarios = starterDecks.scenarios.toSorted((a,b) => b.text.length - a.text.length).slice(0,1)
  const server = await startServer({
    port: 0,
    dev: process.env.OFFDECK_BROWSER_PROD !== '1',
    decks: { scenarios, responses: groups.flat() },
    timing: { reveal: 700, results: 7000 }
  })
  const clients = []
  try {
    let invite = server.url
    for (const [index,size] of displays.entries()) {
      const player = await openPlayer(browser, 'Reader ' + (index + 1), invite, { viewport: size }, async context => {
        await context.addInitScript(() => {
          window.cardInk = []
          const original = CanvasRenderingContext2D.prototype.fillText
          CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
            if (this.canvas.width === 512 && this.canvas.height === 720 && this.textBaseline === 'top') {
              const bounds = this.measureText(text)
              window.cardInk.push({
                text, left: x - bounds.actualBoundingBoxLeft, right: x + bounds.actualBoundingBoxRight,
                top: y - bounds.actualBoundingBoxAscent, bottom: y + bounds.actualBoundingBoxDescent
              })
            }
            return original.call(this, text, x, y, ...rest)
          }
        })
      })
      clients.push(player)
      if (index === 0) {
        await player.page.getByRole('button', { name: 'Create Room' }).click()
        await player.page.getByRole('dialog').getByRole('button', { name: 'Create Room' }).click()
        invite = await player.page.getByLabel('Invitation link').inputValue()
      }
    }
    const pages = clients.map(client => client.page)
    const host = pages[0]
    await host.getByRole('button', { name: 'Start Game' }).click()
    const snapshot = phase => Promise.all(pages.map((page,index) =>
      page.screenshot({ path: info.outputPath(phase + '-' + displays[index].width + '.png') })))
    const useCards = pages.map(async (page,index) => {
      await expect(page.locator('body.has-scene')).toHaveCount(1)
      await expect(page.locator('.hand button')).toHaveCount(5)
      await expect(page.locator('.scenario')).toHaveText(scenarios[0].text)
      const { x,y } = scenarioTarget(displays[index], index)
      await page.mouse.click(x,y)
      await expect(page.getByRole('button', { name: 'Close inspection Esc' })).toBeVisible()
      return page.locator('.hand button').allTextContents()
    })
    const hands = await Promise.all(useCards)
    await snapshot('scenario-inspection')
    await Promise.all(pages.map(page => page.keyboard.press('Escape')))

    const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
    const assignment = permutations.find(order => order.every((group,seat) =>
      hands[seat].some(text => groups[group].some(card => card.text === text))))
    expect(assignment).toBeDefined()
    const selected = assignment.map((group,seat) => hands[seat].find(text =>
      groups[group].some(card => card.text === text)))
    const targets = selected.map((text,index) => handTarget(displays[index], index, hands[index].indexOf(text)))
    await Promise.all(pages.map(async (page,index) => {
      await page.mouse.move(targets[index].x, targets[index].y)
      await expect(page.locator('#scene canvas')).toHaveCSS('cursor', 'pointer')
    }))
    await snapshot('hand-inspection')
    await Promise.all(pages.map((page,index) => page.mouse.click(targets[index].x, targets[index].y)))
    await Promise.all(pages.map(page => expect(page.getByRole('heading', { name: 'Cast your vote' })).toBeVisible()))
    const long = selected[assignment.indexOf(2)]
    for (const [index,page] of pages.entries()) {
      const responses = await page.locator('.responses button').allTextContents()
      expect(new Set(responses)).toEqual(new Set(selected))
      const choice = selected[index === assignment.indexOf(2) ? (index + 1) % 3 : assignment.indexOf(2)]
      const target = responseTarget(displays[index], index, responses.indexOf(choice))
      await page.mouse.move(target.x,target.y)
      targets[index] = target
    }
    await snapshot('voting')
    await Promise.all(pages.map((page,index) => page.mouse.click(targets[index].x, targets[index].y)))
    await Promise.all(pages.map(page => expect(page.getByRole('heading', { name: 'Round results' })).toBeVisible()))
    await snapshot('results')
    for (const page of pages) {
      await expect(page.locator('.responses article.winner button')).toHaveText(long)
      const ink = await page.evaluate(() => window.cardInk)
      expect(ink.length).toBeGreaterThan(20)
      // Safe ink inset is measured from the paper edges, including glyph overhang.
      expect(ink.filter(box => box.left < 32 || box.right > 480 || box.top < 105 || box.bottom > 625)).toEqual([])
    }
  } finally {
    await Promise.all(clients.map(client => client.context.close()))
    await server.close()
  }
})
