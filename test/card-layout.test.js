import test from 'node:test'
import assert from 'node:assert/strict'
import { SEATS } from '../client/scene/environment.js'
import { handPose,responsePose,scenarioPose,wrapCardText } from '../client/scene/card-layout.js'
import { projector } from './projection.js'
import { HAND_SIZE } from '../shared/protocol.js'

const displays = [[1280,720],[1440,900],[1920,1080]]
const within = (box,width,height) => box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height
const overlap = (a,b) => Math.min(a.right,b.right) > Math.max(a.left,b.left) &&
  Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top)

test('the five-card fan fits every seat and desktop size, with clear text areas', () => {
  for (const seat of SEATS) for (const [width,height] of displays) for (const phase of ['select','vote']) {
    const view = projector(seat,phase,width,height)
    const poses = Array.from({length:HAND_SIZE},(_,i) => handPose(seat,phase,width/height,HAND_SIZE,i))
    const bounds = poses.map(pose => view.rect(pose,true))
    const text = poses.map(pose => view.rect(pose,true,true))
    assert.ok(bounds.every(box => within(box,width,height)))
    for (let i = 1; i < poses.length; i++) {
      assert.ok(!overlap(text[i-1],bounds[i]) && !overlap(text[i],bounds[i-1]))
    }
  }
})

test('three-, five- and eight-card voting rows fit with separate hit areas', () => {
  for (const [width,height] of displays) for (const [seatIndex,seat] of SEATS.entries()) for (const count of [2,3,4,5,6,7,8]) {
    const view = projector(seat,'vote',width,height)
    const rects = Array.from({length:count},(_,index) => view.rect(responsePose(seat,count,index)))
    const prompt = view.rect(scenarioPose(seat,count))
    assert.ok(within(prompt,width,height),JSON.stringify({count,seatIndex,width,height,prompt}))
    assert.ok(!rects.some(rect => overlap(rect,prompt)),JSON.stringify({count,seatIndex,width,height,prompt}))
    for (const [index,box] of rects.entries()) {
      const label = JSON.stringify({ count,seatIndex,width,height,index,box })
      assert.ok(within(box,width,height), label)
      assert.ok(box.right-box.left >= 75 && box.bottom-box.top >= 91,label)
      assert.ok(!rects.slice(0,index).some(rect => overlap(rect,box)),label)
    }
  }
})

test('long card text wraps within the paper width, including single long tokens', () => {
  const ctx = { measureText: text => ({width:[...text].length*10}) }
  const text = 'A hard-to-read token: ' + 'X'.repeat(70) + ' and the rest.'
  const lines = wrapCardText(ctx,text,150)
  assert.ok(lines.every(line => ctx.measureText(line).width <= 150))
  assert.equal(lines.join('').replaceAll(' ',''),text.replaceAll(' ',''))
})
