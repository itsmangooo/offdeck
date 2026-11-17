import { expect, test } from '@playwright/test'
import { copyFile, mkdtemp, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startCardEditor } from '../../scripts/card-editor.js'
import { approvedDecks, CARD_DIRECTORY, CARD_FILES, readCardLibrary } from '../../server/card-library.js'

test('the local editor searches, previews and persists create, edit, disable and confirmed delete', async ({ page }, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'offdeck-editor-browser-'))
  let editor
  try {
    for (const file of Object.values(CARD_FILES)) await copyFile(join(CARD_DIRECTORY, file), join(directory, file))
    editor = await startCardEditor({ directory, port: 0 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(editor.url)
    await expect(page.getByRole('heading', { name: 'OFFDECK Card Editor' })).toBeVisible()
    await expect(page.getByText('1000 of 1000 cards')).toBeVisible()
    await page.getByText('Category distribution', { exact: true }).click()
    await expect(page.locator('#categories')).toContainText('Sex & Hookups')
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('scenario-005')
    await page.getByRole('combobox', { name: 'Filter by type' }).selectOption('scenario')
    await page.getByRole('combobox', { name: 'Filter by category' }).selectOption('hookups')
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('approved')
    await page.getByRole('searchbox', { name: 'Filter by tag' }).fill('confession')
    await expect(page.getByText('1 of 1000 cards')).toBeVisible()
    await page.getByRole('list', { name: 'Matching cards' }).getByRole('button').click()
    await expect(page.getByRole('textbox', { name: 'Card text' })).toHaveValue(/explain what you saw/)
    const scenarioPaper = await page.locator('canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(1,1,1,1).data))
    expect(scenarioPaper).toEqual([22,29,26,255])

    await page.getByRole('button', { name: 'New card' }).click()
    const text = page.getByRole('textbox', { name: 'Card text' })
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('response')
    await text.fill('A safe word neither of us could spell correctly.')
    await expect(page.getByText(/Review similar cards response-001/)).toBeVisible()
    await text.fill('A safe word neither of us could spell.')
    await expect(page.getByText('Duplicate text matches response-001.')).toBeVisible()
    await page.getByRole('button', { name: 'Save card' }).click()
    await expect(page.getByRole('status')).toHaveText(/duplicates response-001/)
    await text.fill('Confusing the sound check with my cue to confess.')
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('social')
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('approved')
    await page.getByRole('textbox', { name: 'Tags' }).fill('confession, rehearsal')
    await page.getByRole('combobox', { name: 'Response form' }).selectOption('action')
    await page.getByRole('button', { name: 'Save card' }).click()
    await expect(page.getByRole('status')).toHaveText('Card saved to source.')
    const id = await page.locator('#card-id').textContent()
    expect(id).toMatch(/^response-[0-9a-f]{12}$/)
    expect(readCardLibrary(directory).response.find(card => card.id === id)).toMatchObject({
      status: 'approved', tags: ['confession','rehearsal'], compatibility: { form: 'action' }
    })
    await text.fill('Confessing into the sound check.')
    await page.getByRole('button', { name: 'Save card' }).click()
    await expect(page.getByRole('status')).toHaveText('Card saved to source.')
    await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Disable card' }).click()
    await expect(page.getByRole('status')).toHaveText('Card disabled.')
    const revised = readCardLibrary(directory)
    expect(revised.response.find(card => card.id === id)).toMatchObject({
      text: 'Confessing into the sound check.', status: 'disabled'
    })
    expect(approvedDecks(revised).responses.some(card => card.id === id)).toBe(false)
    await page.reload()
    await expect(page.getByText('1001 of 1001 cards')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(id)
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('disabled')
    await page.getByRole('list', { name: 'Matching cards' }).getByRole('button').click()
    await expect(text).toHaveValue('Confessing into the sound check.')
    await page.screenshot({ path: info.outputPath('local-card-editor.png') })
    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Delete card' }).click()
    expect(readCardLibrary(directory).response.some(card => card.id === id)).toBe(true)
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete card' }).click()
    await expect(page.getByRole('status')).toHaveText('Card deleted from source.')
    expect(readCardLibrary(directory).response).toHaveLength(750)
    expect(errors).toEqual([])
  } finally {
    await editor?.close()
    for (const file of Object.values(CARD_FILES)) await rm(join(directory, file), { force: true })
    await rmdir(directory)
  }
})
