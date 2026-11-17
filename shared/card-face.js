import { fitCardText } from './card-text.js'

export const CARD_FACE_WIDTH = 512
export const CARD_FACE_HEIGHT = 720

export function paintCardFace(ctx, w, h, { text:content,kind:type,own,author,points,winner,recorded }) {
  const scenario = type === 'scenario'
  ctx.fillStyle = scenario ? '#161d1a' : '#fbf6e8'
  ctx.fillRect(0,0,w,h)
  ctx.strokeStyle = scenario ? '#728e69' : '#cfc1a9'
  ctx.lineWidth = 3
  ctx.strokeRect(15,15,w - 30,h - 30)
  ctx.textAlign = 'left'
  ctx.fillStyle = scenario ? '#a9be9a' : '#3e624b'
  ctx.font = '800 26px system-ui'
  ctx.letterSpacing = '4px'
  ctx.fillText(scenario ? 'SCENARIO' : 'RESPONSE', 39, 76)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = scenario ? '#fff6e4' : '#17251e'
  const top = 111
  const bottom = author === undefined ? 625 : 591
  ctx.textBaseline = 'top'
  const { lines,lineHeight } = fitCardText(ctx, content, w - 86, bottom - top, scenario)
  for (const [index,line] of lines.entries()) ctx.fillText(line, 43, top + index * lineHeight)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = scenario ? '#a9be9a' : '#3e624b'
  ctx.font = '800 19px system-ui'
  ctx.letterSpacing = '4px'
  if (author !== undefined) {
    ctx.fillStyle = winner ? '#553a16' : '#3e624b'
    ctx.letterSpacing = '0px'
    ctx.font = '700 32px system-ui'
    ctx.fillText(author,39,h - 88,w - 78)
    ctx.font = '650 26px system-ui'
    ctx.fillText(points + (points === 1 ? ' vote' : ' votes'),39,h - 47)
  } else {
    if (recorded) {
      ctx.fillStyle = '#dceadf'
      ctx.fillRect(26,h-84,w-52,54)
      ctx.fillStyle = '#2e5645'
      ctx.font = '800 24px system-ui'
      ctx.fillText('VOTE CAST',39,h-49)
    } else {
      ctx.fillText(own ? 'YOUR CARD' : 'OFFDECK',39,h-45)
    }
  }
  ctx.textAlign = 'right'
  ctx.fillText('♦', w - 37, h - 45)
}
