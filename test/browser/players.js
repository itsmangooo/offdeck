export async function openPlayer(browser, name, url = 'http://127.0.0.1:3097', options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options })
  const page = await context.newPage()
  await page.goto(url)
  await page.getByLabel('Nickname').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  return { context, page }
}
