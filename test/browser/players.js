export async function confirmAge(page) {
  await page.getByRole('button', { name: 'I am 18 or older' }).click()
}

export async function openPlayer(browser, name, url = 'http://127.0.0.1:3097', options = {}, setup) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options })
  await setup?.(context)
  const page = await context.newPage()
  await page.goto(url)
  await confirmAge(page)
  await page.getByLabel('Nickname').fill(name)
  await page.getByRole('button', { name: 'Skip Tutorial' }).click()
  return { context, page }
}
