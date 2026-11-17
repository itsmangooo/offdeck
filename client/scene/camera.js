import { MathUtils, Vector3 } from 'three'

const MENU = { x: 6.2, y: 4.72, z: 5.86 }
const MENU_AIM = { x: -1.21, y: .89, z: .7 }
const PHASE_AIM = {
  select: { height: 1.61, depth: -.06 },
  reveal: { height: 1.50, depth: .02 },
  vote: { height: 1.48, depth: .10 },
  results: { height: 1.52, depth: -.07 }
}

export function seatedPose(seat, phase, aspect, position, aim) {
  const { x, z, yaw } = seat
  const outwardX = Math.sin(yaw)
  const outwardZ = Math.cos(yaw)
  const end = Math.abs(z) < .1
  const corner = !end && Math.abs(x) > .1
  position.set(x + outwardX * .41, 2.66, z + outwardZ * .41)
  const frame = PHASE_AIM[phase] ?? PHASE_AIM.select
  aim.set(outwardX * frame.depth, frame.height, outwardZ * frame.depth)
  const crowded = ['reveal','vote','results'].includes(phase)
  return (end ? 45 : corner ? 53 : 51) + (crowded ? 1 : 0) + Math.max(0, 1.6 - aspect) * 12
}

export class SeatCamera {
  constructor(camera) {
    this.camera = camera
    this.position = new Vector3()
    this.aim = new Vector3()
    this.target = new Vector3(MENU_AIM.x,MENU_AIM.y,MENU_AIM.z)
    camera.position.set(MENU.x,MENU.y,MENU.z)
    camera.lookAt(this.target)
  }

  update({ seat, phase, pointer, sensitivity, locked, still, seconds, dt }) {
    const { camera, position, aim, target } = this
    let fov = 49
    if (seat) {
      fov = seatedPose(seat,phase,camera.aspect,position,aim)
      if (!still && !locked) {
        const horizontal = MathUtils.clamp(pointer.x,-1,1)
        const vertical = MathUtils.clamp(pointer.y,-1,1)
        const length = Math.hypot(seat.x,seat.z)
        const drift = horizontal * Math.abs(horizontal) * length * .24 * sensitivity
        aim.x += Math.cos(seat.yaw) * drift
        aim.z -= Math.sin(seat.yaw) * drift
        aim.y += vertical * .27 * sensitivity
      }
    } else {
      const shift = still ? 0 : Math.sin(seconds*.17)*.31
      position.set(MENU.x + shift,MENU.y,MENU.z - shift * 1.2)
      aim.set(MENU_AIM.x,MENU_AIM.y,MENU_AIM.z)
    }

    const settle = still ? 1 : 1 - Math.exp(-dt * 6)
    // Only the look target moves after the eye has reached its seat.
    if (still) {
      camera.position.copy(position)
      target.copy(aim)
    } else {
      camera.position.lerp(position,settle)
      if (!locked || !seat) target.lerp(aim,settle)
    }
    camera.lookAt(target)
    const nextFov = MathUtils.lerp(camera.fov,fov,settle)
    if (Math.abs(camera.fov - nextFov) > .001) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }
  }
}
