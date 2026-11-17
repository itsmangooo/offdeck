import { test,expect } from '@playwright/test'
import { openPlayer } from './players.js'

test('remote hands stay private across submission, disconnect and resume',async ({browser},info) => {
  const context = await browser.newContext({
    reducedMotion:process.env.OFFDECK_CHROME_D3D11 === '1' ? 'no-preference' : 'reduce'
  })
  const page = await context.newPage()
  const packets = []
  page.on('websocket',socket => socket.on('framereceived',frame => {
    const data = String(frame.payload)
    if (data.startsWith('42["room:state",')) packets.push(JSON.parse(data.slice(2))[1])
  }))
  const guests = []
  try {
    await page.goto('http://127.0.0.1:3097')
    await page.getByLabel('Nickname').fill('Maya')
    await page.getByRole('button',{name:'Continue'}).click()
    await page.getByRole('button',{name:'Create Room'}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Create Room'}).click()
    const invite = await page.getByLabel('Invitation link').inputValue()
    for (const name of ['Jules','Sam']) guests.push(await openPlayer(browser,name,invite))
    await page.getByRole('button',{name:'Start Game'}).click()
    await expect(page.getByRole('heading',{name:'Choose a response'})).toBeVisible()
    const jules = guests[0].page
    const hands = await jules.locator('.hand button').allTextContents()
    expect(hands).toHaveLength(5)
    const julesId = packets.at(-1).players.find(player => player.name === 'Jules').id
    const member = () => packets.at(-1).match.seats.find(seat => seat.id === julesId)
    expect(member()).toMatchObject({handCount:5,submitted:false,voted:false})
    expect(packets.at(-1).match.hand.every(card => !hands.includes(card.text))).toBe(true)
    // Let the initial deal settle before comparing the remote fan across states.
    await page.waitForTimeout(950)
    await page.screenshot({path:info.outputPath('floating-backs.png')})
    await jules.locator('.table-controls summary').click()
    await jules.locator('.hand button').first().click()
    await expect.poll(() => member()?.handCount).toBe(4)
    expect(member().submitted).toBe(true)
    expect(packets.at(-1).match.responses).toEqual([])
    await page.screenshot({path:info.outputPath('submitted.png')})
    await jules.close()
    await expect.poll(() => packets.at(-1).players.find(player => player.id === julesId).connected).toBe(false)
    await page.screenshot({path:info.outputPath('reconnecting.png')})
    const resumed = await guests[0].context.newPage()
    await resumed.goto(invite)
    await expect(resumed.getByRole('heading',{name:'Choose a response'})).toBeVisible()
    await expect.poll(() => packets.at(-1).players.find(player => player.id === julesId).connected).toBe(true)
    expect(member()).toMatchObject({handCount:4,submitted:true})
  } finally {
    await Promise.all([context,...guests.map(guest=>guest.context)].map(client=>client.close()))
  }
})
