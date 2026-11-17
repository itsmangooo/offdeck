import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { TABLE_Y } from './environment.js'
import { seatedPose } from './camera.js'
import { HAND_SIZE } from '../../shared/protocol.js'

export const CARD_WIDTH = .64
export const CARD_HEIGHT = .90
const Y_AXIS = new Vector3(0,1,0)
const X_AXIS = new Vector3(1,0,0)

export function tableCard(x, depth, yaw, tilt = .12) {
  return {
    position: new Vector3(x * Math.cos(yaw) + depth * Math.sin(yaw),TABLE_Y + .075,
      -x * Math.sin(yaw) + depth * Math.cos(yaw)),
    rotation: new Quaternion().setFromAxisAngle(Y_AXIS,yaw)
      .multiply(new Quaternion().setFromAxisAngle(X_AXIS,-Math.PI / 2 + tilt))
  }
}

export function eyeFrame(seat,phase,aspect) {
  const position = new Vector3()
  const aim = new Vector3()
  const fov = seatedPose(seat,phase,aspect,position,aim)
  return { position,aim,fov }
}

export function handPose(seat, phase, aspect, count, index) {
  const { fov } = eyeFrame(seat,phase,aspect)
  const lowered = phase !== 'select'
  const distance = 1.14
  const halfHeight = distance * Math.tan(MathUtils.degToRad(fov / 2))
  const cardHeight = lowered ? .121 : .240
  const scale = Math.min(2 * halfHeight * cardHeight / CARD_HEIGHT,
    (2 * halfHeight * aspect * .81) / ((HAND_SIZE + .36) * CARD_WIDTH))
  const offset = index - (count - 1) / 2
  const fan = offset * offset * (lowered ? .0011 : .0018)
  const base = lowered ? .917 : .830
  return {
    position: new Vector3(offset * CARD_WIDTH * scale * 1.07,
      halfHeight * (1 - 2 * (base + fan)),-distance - Math.abs(offset) * .006),
    rotation: new Quaternion().setFromEuler(new Euler(-.075,offset * -.022,offset * -.036)),
    scale
  }
}

function sizeForSeat(seat) {
  return 1 + Math.max(0,Math.hypot(seat.x,seat.z)-2.38) * .135
}

export function scenarioPose(seat,count) {
  const size = sizeForSeat(seat)
  const end = Math.abs(seat.z) < .1
  let side = count ? (count === 4 ? 1.82 : 1.44) * size : 0
  let depth = count ? 0 : -.64
  let height = 0
  if (count === 5) side = 1.37 * size
  if (count === 6 || count === 7) {
    side = 1.42 * size
    depth = end ? .94 : .86
  }
  if (count === 8) {
    side = end ? 1.65 : 1.56 * size
    depth = end ? .72 : 0
    height = end ? .60 : .24
  }
  const pose = tableCard(-side,depth,seat.yaw,.85)
  const scale = (count > 4 ? .64 : count ? .76 : .94) * size
  pose.position.y += .02 + CARD_HEIGHT * scale * Math.sin(.85) / 2 + height
  return { ...pose,scale }
}

export function responsePose(seat,count,index) {
  const first = Math.ceil(count / 2)
  const multiple = count > 4
  const front = multiple && index >= first
  const rowCount = multiple ? (front ? count-first : first) : count
  const column = front ? index-first : index
  const size = sizeForSeat(seat)
  const pitch = .77
  const spacing = (multiple ? .66 : .68) * size
  const pose = tableCard((column-(rowCount-1)/2)*spacing,
    multiple ? (front ? .99 : -.25) : .23,seat.yaw,pitch)
  const scale = (multiple ? .67 : .80) * size
  pose.position.y += .02 + CARD_HEIGHT * scale * Math.sin(pitch)/2
  if (multiple && !front) pose.position.y += .35 + (size-1) * .74
  return { ...pose,scale }
}

export function wrapCardText(ctx,text,width) {
  const lines = []
  let line = ''
  for (let word of text.trim().split(/\s+/)) {
    const joined = line ? line + ' ' + word : word
    if (ctx.measureText(joined).width <= width) {
      line = joined
      continue
    }
    if (line) lines.push(line)
    line = ''
    if (ctx.measureText(word).width > width) {
      // Break through long tokens, like URLs, at glyph boundaries.
      for (const glyph of word) {
        if (line && ctx.measureText(line+glyph).width > width) {
          lines.push(line)
          line = ''
        }
        line += glyph
      }
      word = line
    }
    line = word
  }
  if (line) lines.push(line)
  return lines
}

function balanceLastLine(ctx, lines, width) {
  const last = lines.length - 1
  if (last < 1 || ctx.measureText(lines[last]).width >= width * .28) return
  const previous = lines[last - 1].split(' ')
  if (previous.length < 3) return
  const tail = previous.pop() + ' ' + lines[last]
  if (ctx.measureText(tail).width <= width) {
    lines[last - 1] = previous.join(' ')
    lines[last] = tail
  }
}

export function fitCardText(ctx, text, width, height, scenario) {
  const words = text.trim().split(/\s+/)
  const weight = scenario ? 720 : 610
  const minimum = 28
  for (let size = 60; size >= minimum; size -= 2) {
    ctx.font = weight + ' ' + size + 'px system-ui'
    if (size > minimum && words.some(word => ctx.measureText(word).width > width)) continue
    const lines = wrapCardText(ctx, text, width)
    if (size > minimum && lines.length > 1 && /^[“"]?(?:a|an|the)$/i.test(lines[0])) continue
    balanceLastLine(ctx, lines, width)
    const lineHeight = size * 1.18
    if (lines.length * lineHeight <= height || size === minimum) return { lines,lineHeight }
  }
}
