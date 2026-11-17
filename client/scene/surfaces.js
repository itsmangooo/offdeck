import * as T from 'three'

export function weave(texture, rgb, amount, kind) {
  const map = texture(256,256,(ctx,w,h) => {
    const image = ctx.createImageData(w,h)
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      const offset = (x+y*w)*4
      const noise = (Math.random()-.5)*amount
      let fiber
      if (kind === 'wood') {
        const bend = Math.sin(x*.022)*1.8 + Math.sin(x*.057)*.38
        fiber = Math.sin(y*.28+bend)*6 + Math.sin(y*.71+bend*2)*2.4
      } else if (kind === 'felt') {
        fiber = (Math.cos(x*1.2)*Math.cos(y*1.6) + Math.sin((x+y)*.27)*.38)*4
      } else {
        fiber = Math.sin(y*.55+Math.sin(x*.51))*1.8
      }
      for (let c=0;c<3;c++) image.data[offset+c] = rgb[c]+noise+fiber
      image.data[offset+3] = 255
    }
    ctx.putImageData(image,0,0)
  })
  map.wrapS = map.wrapT = T.RepeatWrapping
  return map
}

export function roomReflections(texture) {
  const map = texture(384,192,(ctx,w,h) => {
    ctx.fillStyle = '#2c3437'
    ctx.fillRect(0,0,w,h)
    const ceiling = ctx.createLinearGradient(0,0,0,h)
    ceiling.addColorStop(0,'#8e8980')
    ceiling.addColorStop(.54,'#303833')
    ceiling.addColorStop(1,'#231b16')
    ctx.fillStyle = ceiling
    ctx.fillRect(0,0,w,h)
    for (const x of [.11,.37,.64,.87]) {
      const lamp = ctx.createRadialGradient(w*x,h*.29,0,w*x,h*.29,32)
      lamp.addColorStop(0,'#ffe6b1')
      lamp.addColorStop(.28,'#b99064')
      lamp.addColorStop(1,'#ab845500')
      ctx.fillStyle = lamp
      ctx.fillRect(w*x-32,h*.29-32,64,64)
    }
  })
  map.mapping = T.EquirectangularReflectionMapping
  return map
}
