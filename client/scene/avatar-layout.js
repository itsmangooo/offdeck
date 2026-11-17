import { Euler, Quaternion, Vector3 } from 'three'

export const HEAD_HEIGHT = 2.01

export function remoteHandPose(seat, count, index, connected = true) {
  const {x,z,yaw} = seat
  const offset = index-(count-1)/2
  const side = offset*.073
  const inward = .22 + index*.006
  return {
    position: new Vector3(x-Math.sin(yaw)*inward + Math.cos(yaw)*side,
      1.57 - offset*offset*.003 - (connected ? 0 : .045),
      z-Math.cos(yaw)*inward - Math.sin(yaw)*side),
    rotation: new Quaternion().setFromEuler(new Euler(-.12,yaw+Math.PI,offset*.095,'YXZ')),
    scale:.33
  }
}
