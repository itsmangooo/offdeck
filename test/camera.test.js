import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector2, Vector3 } from 'three'
import { SeatCamera } from '../client/scene/camera.js'
import { SEATS,TABLE_Y } from '../client/scene/environment.js'

test('all eight eye positions clear the room furniture and keep the table in view', () => {
  for (const aspect of [1280/720,1440/900,1920/1080]) {
    for (const seat of SEATS) {
      const camera = new PerspectiveCamera(49,aspect,.08,45)
      const rig = new SeatCamera(camera)
      for (const phase of ['select','reveal','vote','results']) {
        rig.update({ seat,phase,pointer:new Vector2(1,1),sensitivity:1,still:true,seconds:1,dt:.016 })
        camera.updateMatrixWorld()
        assert.ok(camera.position.y-camera.near > 2.51)
        assert.ok(Math.abs(camera.position.x) < 4.5 && Math.abs(camera.position.z) < 3.2)
        assert.ok(Math.hypot(camera.position.x-seat.x,camera.position.z-seat.z) < .42)
        const frame = new Vector3(0,TABLE_Y+.3,0).project(camera)
        assert.ok(Math.abs(frame.x) < .02 && Math.abs(frame.y) < .25)
      }
    }
  }
})

test('looking damps across frames, keeps the eye fixed and freezes while inspecting', () => {
  const view = new PerspectiveCamera(49,16/9,.08,45)
  const rig = new SeatCamera(view)
  const options = { seat:SEATS[0],phase:'select',pointer:new Vector2(),sensitivity:1,seconds:1,dt:1/60 }
  rig.update({ ...options,still:true })
  const eye = view.position.clone()
  const rest = rig.target.clone()
  rig.update({ ...options,pointer:new Vector2(9,9) })
  const first = rig.target.clone()
  assert.ok(first.distanceTo(rest) > 0 && first.distanceTo(rest) < .10)
  for (let frame = 0; frame < 110; frame++) rig.update({ ...options,pointer:new Vector2(9,9) })
  assert.ok(rig.target.distanceTo(rest) < .65)
  assert.ok(view.position.distanceTo(eye) < 1e-10)
  const held = rig.target.clone()
  rig.update({ ...options,locked:true,pointer:new Vector2(-1,-1) })
  assert.deepEqual(rig.target,held)
  rig.update({ ...options,pointer:new Vector2(1,1),still:true })
  assert.deepEqual(rig.target,rest)
})
