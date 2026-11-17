import { expect, test } from '@playwright/test'
import { startCardEditor } from '../../scripts/card-editor.js'

test('every approved card fits the actual canvas renderer in hand and results', async ({ page }) => {
  const editor = await startCardEditor({ port: 0 })
  try {
    await page.goto(editor.url)
    const result = await page.evaluate(async () => {
      const { paintCardFace, CARD_FACE_WIDTH, CARD_FACE_HEIGHT } = await import('/card-face.js')
      const { library } = await fetch('/api/library').then(response => response.json())
      const canvas = document.createElement('canvas')
      canvas.width = CARD_FACE_WIDTH
      canvas.height = CARD_FACE_HEIGHT
      const ctx = canvas.getContext('2d')
      const fillText = ctx.fillText
      const failures = []
      let drawings = 0
      let minimumFont = Infinity

      function inspect(card, author) {
        const body = []
        const layout = author ? 'results' : 'table'
        ctx.fillText = function (text, x, y, maxWidth) {
          if (this.textBaseline === 'top') {
            const ink = this.measureText(text)
            body.push(text)
            const font = Number(/(\d+)px/.exec(this.font)?.[1])
            minimumFont = Math.min(minimumFont, font)
            if (x - ink.actualBoundingBoxLeft < 32 || x + ink.actualBoundingBoxRight > 480 ||
                y - ink.actualBoundingBoxAscent < 105 || y + ink.actualBoundingBoxDescent > (author ? 606 : 625)) {
              failures.push({ id: card.id, layout, text, font, issue: 'Ink outside the body area' })
            }
          }
          if (maxWidth === undefined) fillText.call(this,text,x,y)
          else fillText.call(this,text,x,y,maxWidth)
        }
        paintCardFace(ctx, canvas.width, canvas.height, { text: card.text, kind: card.type, author, points: 3 })
        if (body.join('').replace(/\s/g,'') !== card.text.replace(/\s/g,'')) {
          failures.push({ id: card.id, layout, issue: 'Text was omitted or changed' })
        }
        drawings++
      }

      for (const card of [...library.scenario,...library.response]) {
        if (card.status !== 'approved') continue
        inspect(card)
        if (card.type === 'response') inspect(card, 'Maya')
      }
      return { failures, drawings, minimumFont }
    })
    expect(result.drawings).toBe(1750)
    expect(result.failures).toEqual([])
    expect(result.minimumFont).toBeGreaterThanOrEqual(40)
  } finally {
    await editor.close()
  }
})
