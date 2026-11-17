import { test, expect } from '@playwright/test'
import { io } from 'socket.io-client'
import { once } from 'node:events'
import { openPlayer } from './players.js'
import { handTarget,responseTarget } from './targets.js'

const home = 'http://127.0.0.1:3097'
for (const { count,viewport } of [
  { count:3, viewport:{width:1280,height:720} },
  { count:5, viewport:{width:1440,height:900} },
  { count:8, viewport:{width:1920,height:1080} }
]) {
  test(count + ' seats deal unique cards and keep all responses selectable at ' + viewport.width + '×' + viewport.height, async ({ browser }, info) => {
    const host = await openPlayer(browser,'Maya',home,{viewport})
    const a = host.page
    const clients = []
    try {
      await a.getByRole('button',{name:'Create Room'}).click()
      await a.getByRole('dialog').getByLabel('Seats').fill(String(count))
      await a.getByRole('dialog').getByRole('button',{name:'Create Room'}).click()
      const invite = new URL(await a.getByLabel('Invitation link').inputValue())
      const id = invite.pathname.split('/')[2]
      for (let index = 0; index < count; index++) {
        const socket = io(home,{transports:['websocket'],reconnection:false})
        const client = {socket,state:null}
        clients.push(client)
        socket.on('room:state',state => {client.state = state})
        await once(socket,'connect')
        const joined = await socket.timeout(3000).emitWithAck('room:join',{id,name:'Seat '+(index+2)})
        if (index === count-1) expect(joined).toEqual({ok:false,code:'FULL'})
        else expect(joined.ok).toBe(true)
      }
      await expect(a.getByText(count+'/'+count+' connected')).toBeVisible()
      await a.getByRole('button',{name:'Start Game'}).click()
      await expect(a.getByRole('heading',{name:'Choose a response'})).toBeVisible()
      const guests = clients.slice(0,count-1)
      await expect.poll(() => guests.every(({state}) => state?.match?.phase === 'select')).toBe(true)
      const seen = guests.flatMap(({state}) => state.match.hand.map(card => card.text))
      seen.push(...await a.locator('.hand button').allTextContents())
      expect(seen).toHaveLength(count*5)
      expect(new Set(seen).size).toBe(count*5)
      await a.screenshot({path:info.outputPath('hand.png')})
      for (const {socket,state} of guests) {
        const {roundId,hand} = state.match
        expect(await socket.timeout(3000).emitWithAck('match:submit',{roundId,cardId:hand[0].id})).toEqual({ok:true})
      }
      const canvas = a.locator('#scene canvas')
      const size = await canvas.boundingBox()
      const hand = handTarget(size)
      await a.mouse.click(hand.x,hand.y)
      await expect(a.getByRole('heading',{name:'Cast your vote'})).toBeVisible()
      await expect(a.locator('.responses article')).toHaveCount(count)
      const own = await a.locator('.responses article').evaluateAll(cards =>
        cards.findIndex(card => card.textContent.includes('Your Card')))
      expect(own).toBeGreaterThanOrEqual(0)
      await a.screenshot({path:info.outputPath('responses.png')})
      for (let index = 0; index < count; index++) {
        const point = responseTarget(size,0,index,count)
        await a.mouse.move(point.x,point.y)
        await expect(canvas).toHaveCSS('cursor',index === own ? 'default' : 'pointer')
      }
    } finally {
      for (const {socket} of clients) socket.close()
      await host.context.close()
    }
  })
}
