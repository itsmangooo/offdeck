import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { SEATS,TABLE_Y } from '../client/scene/environment.js'
import { HEAD_HEIGHT,remoteHandPose } from '../client/scene/avatar-layout.js'
import { CARD_HEIGHT,CARD_WIDTH } from '../client/scene/card-layout.js'

test('all eight fans stay between the rail and their own avatar', () => {
  for (const seat of SEATS) for (const connected of [true,false]) {
    const world = Array.from({length:7},(_,index) => remoteHandPose(seat,7,index,connected))
    for (const pose of world) {
      const corners = [-1,1].flatMap(x => [-1,1].map(y =>
        new Vector3(x*CARD_WIDTH/2,y*CARD_HEIGHT/2,0).multiplyScalar(pose.scale)
          .applyQuaternion(pose.rotation).add(pose.position)))
      assert.ok(corners.every(point => point.y > TABLE_Y+.10 && point.y < HEAD_HEIGHT-.27))
      assert.ok(corners.every(point => Math.hypot(point.x-seat.x,point.z-seat.z) < .70))
    }
  }
})
