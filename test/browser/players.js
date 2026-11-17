export async function openPlayer(browser, name, url = 'http://127.0.0.1:3097') {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url)
  await page.getByLabel('Nickname').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  return { context, page }
}
