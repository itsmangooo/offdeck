import { SEATS } from '../../client/scene/environment.js'
import { handPose,responsePose,scenarioPose } from '../../client/scene/card-layout.js'
import { projector } from '../projection.js'

export function handTarget({width,height},seatIndex = 0,index = 3,count = 7) {
  const seat = SEATS[seatIndex]
  return projector(seat,'select',width,height).center(handPose(seat,'select',width/height,count,index),true)
}

export function responseTarget({width,height},seatIndex,index,count = 3) {
  const seat = SEATS[seatIndex]
  return projector(seat,'vote',width,height).center(responsePose(seat,count,index),false)
}

export function scenarioTarget({width,height},seatIndex = 0) {
  const seat = SEATS[seatIndex]
  return projector(seat,'select',width,height).center(scenarioPose(seat,0),false)
}
