import { test, expect } from '@playwright/test'

export async function openPlayer(browser, name, url = '/') {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url === '/' ? 'http://127.0.0.1:3097' : url)
  await page.getByLabel('Nickname').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  return { context, page }
}

test('independent players join, refresh, migrate host and see capacity and link errors', async ({ browser }) => {
  const alice = await openPlayer(browser, 'Alice')
  const a = alice.page
  await a.getByRole('button', { name: 'Create Room' }).click()
  const dialog = a.getByRole('dialog')
  await dialog.getByLabel('Seats').fill('3')
  await dialog.getByRole('button', { name: 'Create Room' }).click()
  await expect(a.getByRole('heading', { name: 'Room lobby' })).toBeVisible()
  const invite = await a.getByLabel('Invitation link').inputValue()
  expect(new URL(invite).pathname).toMatch(/^\/sid\/[a-f0-9]{36}\/$/)
  const bob = await openPlayer(browser, 'Bob', invite)
  const cleo = await openPlayer(browser, 'Cleo', invite)
  await expect(a.getByText('3/3 connected')).toBeVisible()
  await bob.page.getByRole('button', { name: 'Ready', exact: true }).click()
  await expect(a.getByRole('listitem').filter({ hasText: 'Bob' })).toContainText('Ready')
  await bob.page.reload()
  await expect(bob.page.getByRole('listitem').filter({ hasText: 'Bob (you)' })).toContainText('Ready')
  const dev = await openPlayer(browser, 'Dev', invite)
  await expect(dev.page.getByText('This room is full.')).toBeVisible()
  await a.getByRole('button', { name: 'Leave Room' }).click()
  await expect(cleo.page.getByRole('listitem').filter({ hasText: 'Bob' })).toContainText('Host')
  await expect(a.getByRole('heading', { name: 'OFFDECK.' })).toBeVisible()
  const invalid = await openPlayer(browser, 'Eli', new URL('/sid/invalid/', invite).href)
  await expect(invalid.page.getByText('That invitation link is invalid.')).toBeVisible()
  await Promise.all([alice, bob, cleo, dev, invalid].map(client => client.context.close()))
})
