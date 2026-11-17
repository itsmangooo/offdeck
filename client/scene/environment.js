import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const TABLE_Y = 1.17
export const SEATS = [
  [0, 2.38], [-1.88, -2.02], [1.88, -2.02], [0, -2.38],
  [-1.88, 2.02], [1.88, 2.02], [-3.96, 0], [3.96, 0]
].map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) }))

const color = (value, options = {}) => new T.MeshStandardMaterial({ color: value, ...options })
const box = new T.BoxGeometry(1, 1, 1)
const sphere = new T.SphereGeometry(1, 24, 16)

export function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new T.Mesh(geometry, material)
  object.position.set(x, y, z)
  parent.add(object)
  return object
}

export function batchStatic(root) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const batches = new Map()
  root.traverse(object => {
    if (!object.isMesh || Array.isArray(object.material) || object.material.transparent) return
    const key = [object.material.uuid, object.castShadow, object.receiveShadow].join(':')
    if (!batches.has(key)) batches.set(key, [])
    batches.get(key).push(object)
  })
  for (const objects of batches.values()) {
    if (objects.length < 2) continue
    const geometries = objects.map(object => {
      const matrix = inverse.clone().multiply(object.matrixWorld)
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
      return geometry.applyMatrix4(matrix)
    })
    const geometry = mergeGeometries(geometries)
    for (const source of geometries) source.dispose()
    if (!geometry) continue
    const [sample] = objects
    const batch = mesh(root, geometry, sample.material)
    batch.castShadow = sample.castShadow
    batch.receiveShadow = sample.receiveShadow
    for (const source of objects) source.removeFromParent()
  }
}

function block(parent, mat, width, height, depth, x, y, z) {
  const object = mesh(parent, box, mat, x, y, z)
  object.scale.set(width, height, depth)
  return object
}

function globe(parent, mat, r, x, y, z) {
  const object = mesh(parent, sphere, mat, x, y, z)
  object.scale.setScalar(r)
  return object
}

export function texture(width, height, paint) {
  const canvas = document.createElement('canvas')
  Object.assign(canvas, { width, height })
  paint(canvas.getContext('2d'), width, height)
  const map = new T.CanvasTexture(canvas)
  map.colorSpace = T.SRGBColorSpace
  map.anisotropy = 4
  return map
}

export function roundedRectangle(width, height, radius) {
  const x = -width / 2
  const y = -height / 2
  const s = new T.Shape()
  s.moveTo(x + radius, y)
  s.lineTo(x + width - radius, y)
  s.quadraticCurveTo(x + width, y, x + width, y + radius)
  s.lineTo(x + width, y + height - radius)
  s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  s.lineTo(x + radius, y + height)
  s.quadraticCurveTo(x, y + height, x, y + height - radius)
  s.lineTo(x, y + radius)
  s.quadraticCurveTo(x, y, x + radius, y)
  return s
}

function oval(straight, radius) {
  const shape = new T.Shape()
  shape.moveTo(-straight, -radius)
  shape.lineTo(straight, -radius)
  shape.absarc(straight, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-straight, radius)
  shape.absarc(-straight, 0, radius, Math.PI / 2, 3 * Math.PI / 2, false)
  shape.closePath()
  return shape
}

function rim(parent, material, straight, radius, y, depth, bevel = .012, inner = 0) {
  const shape = oval(straight, radius)
  if (inner) shape.holes.push(new T.Path(oval(straight, inner).getPoints(40).reverse()))
  const geometry = new T.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 32, bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3
  })
  const object = mesh(parent, geometry, material, 0, y)
  object.rotation.x = -Math.PI / 2
  object.receiveShadow = true
  return object
}

function noisySurface(rgb, variation, grain = false) {
  const map = texture(256, 256, (ctx, w, h) => {
    const image = ctx.createImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = (x + y * w) * 4
        const wave = grain ? Math.sin(y * .41 + Math.sin(x * .035) * 2.4) * 8 : 0
        const tone = (Math.random() - .5) * variation + wave
        for (let channel = 0; channel < 3; channel++) image.data[index + channel] = rgb[channel] + tone
        image.data[index + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  })
  map.wrapS = map.wrapT = T.RepeatWrapping
  return map
}

function table(scene, mats) {
  const table = new T.Group()
  scene.add(table)
  const { walnut, brass, leather, baize, seam, dark } = mats
  rim(table, dark, 1.49, 1.68, .91, .12, .045).castShadow = true
  rim(table, walnut, 1.54, 1.72, .99, .13, .048).castShadow = true
  rim(table, brass, 1.54, 1.745, 1.101, .016, .005, 1.70)
  rim(table, leather, 1.48, 1.705, 1.127, .051, .049, 1.48).castShadow = true
  rim(table, baize, 1.48, 1.52, 1.148, .019, .004)
  rim(table, seam, 1.43, 1.37, TABLE_Y, .002, 0, 1.36)
  rim(table, seam, 1.41, 1.32, TABLE_Y, .002, 0, 1.315)

  const badge = texture(768, 224, (ctx,w,h) => {
    ctx.fillStyle = '#afbc82'
    ctx.textAlign = 'center'
    ctx.font = '800 110px system-ui'
    ctx.fillText('OFFDECK', w / 2, 125)
    ctx.font = '600 29px system-ui'
    ctx.letterSpacing = '9px'
    ctx.fillText('THE CARD ROOM', w / 2, 180)
  })
  const mark = mesh(table, new T.PlaneGeometry(1.28, .37), new T.MeshStandardMaterial({
    map: badge, color: '#8a9473', transparent: true, opacity: .66, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2
  }), 0, TABLE_Y + .004, .06)
  mark.rotation.x = -Math.PI / 2

  const pedestal = new T.CylinderGeometry(.46, .59, .80, 32)
  const foot = new T.CylinderGeometry(.65, .73, .12, 32)
  const rib = new T.CylinderGeometry(.033, .048, .73, 10)
  const holder = new T.TorusGeometry(.102, .013, 8, 24)
  const liner = new T.CircleGeometry(.093, 24)
  for (const x of [-1.26, 1.26]) {
    mesh(table, foot, dark, x, .075).castShadow = true
    mesh(table, pedestal, walnut, x, .53).castShadow = true
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2
      const object = mesh(table, rib, walnut, x + Math.cos(angle) * .52, .50, Math.sin(angle) * .52)
      object.rotation.z = Math.cos(angle) * .14
      object.rotation.x = -Math.sin(angle) * .14
    }
    mesh(table, foot, brass, x, .157).scale.y = .11
  }

  for (const { yaw, x, z } of SEATS) {
    const scale = Math.abs(z) > .1 ? 1.585 / Math.abs(z) : 3.1 / Math.abs(x)
    const hx = Math.abs(z) > .1 ? x : x * scale
    const hz = z * scale
    mesh(table, holder, brass, hx, 1.239, hz).rotation.x = -Math.PI / 2
    mesh(table, liner, dark, hx, 1.235, hz).rotation.x = -Math.PI / 2
    const marker = mesh(table, new T.CircleGeometry(.029, 4), brass, hx, TABLE_Y + .005, hz - Math.cos(yaw) * .25)
    marker.rotation.set(-Math.PI / 2, 0, yaw)
  }
}

function seating(scene, mats) {
  const { walnut, brass, leather, dark } = mats
  const cushion = roundedRectangle(.92, .83, .18)
  const back = roundedRectangle(.91, .52, .13)
  const cushionGeo = new T.ExtrudeGeometry(cushion, { depth: .10, bevelSize: .055, bevelThickness: .048, bevelSegments: 3 })
  const backGeo = new T.ExtrudeGeometry(back, { depth: .07, bevelSize: .040, bevelThickness: .040, bevelSegments: 3 })
  for (const { x, z, yaw } of SEATS) {
    const chair = new T.Group()
    chair.position.set(x, 0, z)
    chair.rotation.y = yaw
    scene.add(chair)
    const seat = mesh(chair, cushionGeo, leather, 0, .54, .06)
    seat.rotation.x = -Math.PI / 2
    seat.castShadow = true
    seat.receiveShadow = true
    const chairBack = mesh(chair, backGeo, leather, 0, 1.10, .495)
    chairBack.rotation.x = .10
    chairBack.castShadow = true
    for (const offset of [-.32, .32]) {
      const support = block(chair, walnut, .071, .76, .075, offset, .9, .53)
      support.rotation.x = .10
      for (const depth of [-.27, .35]) {
        block(chair, walnut, .072, .54, .076, offset, .28, depth).castShadow = true
        block(chair, brass, .073, .038, .077, offset, .032, depth)
      }
    }
    block(chair, dark, .63, .045, .045, 0, .26, .4)
    for (const x of [-.26, 0, .26]) globe(chair, dark, .035, x, 1.13, .45).scale.z = .011
  }
}

function floor(scene, mats) {
  const floorMap = texture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#231c18'
    ctx.fillRect(0, 0, w, h)
    const shades = ['#302620', '#332821', '#362a22', '#392d25', '#2d241e']
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 256 + (row % 2) * 128
        const y = row * 64
        ctx.fillStyle = shades[(row * 3 + col + 6) % shades.length]
        ctx.fillRect(x + 1, y + 1, 254, 62)
        for (let i = 0; i < 13; i++) {
          ctx.fillStyle = i % 2 ? '#8f6b4b18' : '#09080630'
          ctx.fillRect(x + (i * 31 % 85), y + 3 + i * 4, 159 - i, .8)
        }
      }
    }
  })
  floorMap.wrapS = floorMap.wrapT = T.RepeatWrapping
  floorMap.repeat.set(6, 6)
  const ground = mesh(scene, new T.PlaneGeometry(28, 28), color('#ffffff', { map: floorMap, roughness: .77 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  const rug = noisySurface([33, 47, 39], 12)
  rim(scene, color('#fff', { map: rug, roughness: 1 }), 1.75, 2.97, .007, .014, .003)
  rim(scene, mats.seam, 1.70, 2.78, .023, .001, 0, 2.76)
  rim(scene, mats.seam, 1.70, 2.69, .023, .001, 0, 2.683)
}

function framedArt(scene, mats) {
  const print = texture(384, 512, (ctx, w, h) => {
    ctx.fillStyle = '#15251f'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d7b77e'
    ctx.lineWidth = 4
    ctx.strokeRect(24, 24, w - 48, h - 48)
    ctx.save()
    ctx.translate(w / 2, h * .45)
    for (let i = 0; i < 9; i++) {
      ctx.rotate(Math.PI / 9)
      ctx.strokeRect(-57, -57, 114, 114)
    }
    ctx.restore()
    ctx.fillStyle = '#eee4cd'
    ctx.textAlign = 'center'
    ctx.font = '800 50px system-ui'
    ctx.fillText('OFFDECK', w / 2, h - 103)
    ctx.font = '600 15px system-ui'
    ctx.letterSpacing = '5px'
    ctx.fillText('THE CARD ROOM', w / 2, h - 71)
  })
  const painted = color('#ffffff', { map: print, roughness: .85, emissive: '#232923', emissiveMap: print, emissiveIntensity: .25 })
  for (const [x, z, yaw] of [[0,-6.74,0], [0,6.74,Math.PI], [-8.84,0,Math.PI/2], [8.84,0,-Math.PI/2]]) {
    const frame = new T.Group()
    frame.position.set(x, 2.65, z)
    frame.rotation.y = yaw
    scene.add(frame)
    block(frame, mats.walnut, 1.62, 2.08, .1, 0, 0, 0)
    block(frame, mats.brass, 1.52, 1.99, .035, 0, 0, .057)
    mesh(frame, new T.PlaneGeometry(1.44, 1.91), painted, 0, 0, .079)
  }
}

function walls(scene, mats) {
  const wall = color('#25342c', { roughness: .86 })
  const inset = color('#192820', { roughness: .92 })
  const trim = color('#443329', { roughness: .67 })
  const wallGroup = new T.Group()
  const sconce = new T.MeshStandardMaterial({ color: '#fae0ba', emissive: '#ffb761', emissiveIntensity: 1.9 })
  const glowMap = texture(128,128,(ctx,w,h) => {
    const gradient = ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2)
    gradient.addColorStop(0,'#ffbe6888')
    gradient.addColorStop(.35,'#eead4b38')
    gradient.addColorStop(1,'#d4953300')
    ctx.fillStyle = gradient
    ctx.fillRect(0,0,w,h)
  })
  const glow = new T.MeshBasicMaterial({
    map: glowMap, transparent: true, depthWrite: false, blending: T.AdditiveBlending
  })
  const glowPlane = new T.PlaneGeometry(2.25,2.25)
  scene.add(wallGroup)
  for (const [x,z,yaw,width] of [[0,-7,0,18], [0,7,Math.PI,18], [-9,0,Math.PI/2,14], [9,0,-Math.PI/2,14]]) {
    const wallSide = new T.Group()
    wallSide.position.set(x,0,z)
    wallSide.rotation.y = yaw
    wallGroup.add(wallSide)
    block(wallSide, wall, width, 5.6, .24, 0, 2.8, 0)
    block(wallSide, trim, width, .19, .30, 0, .11, .05)
    block(wallSide, trim, width, .10, .22, 0, 1.18, .10)
    block(wallSide, trim, width, .17, .24, 0, 4.53, .10)
    for (let position = -Math.floor(width / 3) * 1.3; position <= width / 2 - 1; position += 2.62) {
      block(wallSide, inset, 2.4, 2.85, .047, position, 2.83, .137)
      block(wallSide, trim, .032, 2.85, .066, position - 1.2, 2.83, .135)
      block(wallSide, trim, 2.4, .031, .069, position, 1.407, .136)
    }
    for (const x of [-width / 4, width / 4]) {
      block(wallSide, mats.brass, .19, .53, .10, x, 2.85, .18)
      globe(wallSide, sconce, .17, x, 3.01, .38)
      mesh(wallSide,glowPlane,glow,x,3.01,.173)
    }
  }
  framedArt(scene,mats)
}

function lighting(scene, mats) {
  scene.add(new T.HemisphereLight('#e5eedc', '#887164', 1.37))
  const fill = new T.DirectionalLight('#c7dfdc', 1.35)
  fill.position.set(1, 5, -5)
  scene.add(fill)
  const key = new T.SpotLight('#ffdfb1', 96, 21, .94, .55, 2)
  key.position.set(.1, 6.1, 1.65)
  key.target.position.set(0, .4, 0)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 2
  key.shadow.camera.far = 12
  key.shadow.normalBias = .025
  key.shadow.bias = -.00015
  key.shadow.autoUpdate = false
  key.shadow.needsUpdate = true
  scene.add(key,key.target)

  const diffuser = new T.MeshStandardMaterial({
    color: '#ffe6c5', emissive: '#ffc879', emissiveIntensity: 1.65, roughness: .6
  })
  for (const x of [-1.65, 0, 1.65]) {
    const pendant = mesh(scene, new T.CylinderGeometry(.15, .40, .28, 32, 1, true), mats.dark, x, 4.65, 0)
    pendant.material.side = T.DoubleSide
    mesh(scene, new T.CylinderGeometry(.401, .405, .04, 32), mats.brass, x, 4.52, 0)
    mesh(scene, new T.CylinderGeometry(.34, .34, .025, 32), diffuser, x, 4.495, 0)
    mesh(scene, new T.CylinderGeometry(.016,.016,.8,12), mats.dark, x, 5.17, 0)
  }
  return key
}

export function buildRoom(scene) {
  const mats = {
    walnut: color('#ffffff', { map: noisySurface([103, 60, 37], 13, true), roughness: .55 }),
    brass: color('#c29a63', { metalness: .48, roughness: .37 }),
    leather: color('#ffffff', { map: noisySurface([37, 45, 40], 14), roughness: .86 }),
    baize: color('#ffffff', { map: noisySurface([27, 80, 59], 23), roughness: 1 }),
    seam: color('#5c7f5b', { roughness: 1 }),
    dark: color('#131c19', { roughness: .73 })
  }
  scene.background = new T.Color('#17231c')
  scene.fog = new T.FogExp2('#17231c', .052)
  const key = lighting(scene, mats)
  floor(scene, mats)
  walls(scene, mats)
  table(scene, mats)
  seating(scene, mats)
  batchStatic(scene)
  return key
}
