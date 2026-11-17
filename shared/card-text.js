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
