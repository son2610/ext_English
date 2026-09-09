export async function openCapture(app, text) {
  const tiles = text ? app.locator('.capture-tile').filter({ hasText: text }) : app.locator('.capture-tile');
  await tiles.first().locator('.tile-open').click();
  await app.locator('dialog[open] .source-quote').waitFor();
}
export async function closeCapture(app) {
  if (await app.locator('dialog[open]').count()) await app.getByRole('button', { name: 'Đóng chi tiết' }).click();
}
