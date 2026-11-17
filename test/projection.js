import { PerspectiveCamera, Vector3 } from 'three'
import { eyeFrame, CARD_WIDTH, CARD_HEIGHT } from '../client/scene/card-layout.js'

export function projector(seat,phase,width,height) {
  const { position,aim,fov } = eyeFrame(seat,phase,width/height)
  const camera = new PerspectiveCamera(fov,width/height,.08,45)
  camera.position.copy(position)
  camera.lookAt(aim)
  camera.updateMatrixWorld()
  const project = (point,hand = false) => {
    if (hand) point.applyMatrix4(camera.matrixWorld)
    point.project(camera)
    return { x: (point.x+1)*width/2, y: (1-point.y)*height/2 }
  }
  return {
    center: (pose,hand) => project(pose.position.clone(),hand),
    rect(pose, hand, text = false) {
      const left = text ? -CARD_WIDTH*.40 : -CARD_WIDTH/2
      const right = text ? CARD_WIDTH*.40 : CARD_WIDTH/2
      const bottom = text ? -CARD_HEIGHT*.28 : -CARD_HEIGHT/2
      const top = text ? CARD_HEIGHT*.33 : CARD_HEIGHT/2
      const corners = [[left,bottom],[right,bottom],[left,top],[right,top]].map(([x,y]) =>
        project(new Vector3(x,y,.012).multiplyScalar(pose.scale)
          .applyQuaternion(pose.rotation).add(pose.position),hand))
      return {
        left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y))
      }
    }
  }
}
