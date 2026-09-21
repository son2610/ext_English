import { chromium } from 'playwright';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) {
  if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
}
await mkdir('test-results', { recursive: true });
const profilePath = resolve(`test-results/popup-profile-${Date.now()}`);
const context = await chromium.launchPersistentContext(profilePath, {
  executablePath, headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
});
const checks = [], errors = [];
const phrases = [['Keep in mind', 'Hãy ghi nhớ'], ['Little by little', 'Từng chút một'], ['As long as', 'Miễn là'], ['Touch base', 'Trao đổi nhanh, cập nhật tình hình']];
async function rows(page, store) {
  return page.evaluate(async store => {
    const d = await new Promise((resolve, reject) => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const result = await new Promise((resolve, reject) => { const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    d.close(); return result;
  }, store);
}
async function waitUntil(fn, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await new Promise(r => setTimeout(r, 60)); }
  throw new Error(`Timed out: ${label}`);
}

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.action.default_popup, 'popup.html');
  checks.push('toolbar-action-opens-review-popup');

  const app = await context.newPage(); app.on('pageerror', e => errors.push(e.message));
  await app.goto(`chrome-extension://${id}/app.html#home`); await app.locator('.page').waitFor();
  await app.evaluate(async phrases => {
    const d = await new Promise(r => { const q = indexedDB.open('mach-doc'); q.onsuccess = () => r(q.result); });
    const tx = d.transaction(['captures', 'units', 'meta'], 'readwrite'); const now = Date.now();
    tx.objectStore('meta').put({ key: 'settings', value: { autoBackup: false, targetedAutomatic: false, weeklyAutomatic: false, optimizationEnabled: false } });
    phrases.forEach(([en, vi], i) => {
      const cid = crypto.randomUUID(), exact = `We should ${en.toLowerCase()} today.`;
      tx.objectStore('captures').put({ id: cid, source: { url: 'https://example.com/a', frameUrl: 'https://example.com/a', title: 'Notes', exact, prefix: '', suffix: '', context: exact, heading: '', scrollY: 0, capturedAt: now - i * 1000 }, note: '', status: 'ready', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, unitsCreated: true });
      const k = { key: en, kind: 'phrase', group: 'Cụm từ', name: en, form: en, meaningVi: vi, explanationVi: vi, evidence: en.toLowerCase(), examples: [{ en: `I ${en.toLowerCase()}.`, vi }, { en: `They ${en.toLowerCase()}.`, vi }], production: { instructionVi: `Viết bằng tiếng Anh: ${vi}`, answerEn: en }, cloze: { sentence: 'We should [[blank]] today.', answer: en.toLowerCase(), hintVi: vi } };
      // Three due items and one scheduled for tomorrow; reps 6 is a production turn on both surfaces (reps % 4 === 3 would be dictation on the review page only).
      tx.objectStore('units').put({ id: `00000000-0000-4000-8000-00000000000${i}`, canonical: `phrase:${en}`, knowledge: k, captureIds: [cid], schedule: { due: i === 3 ? now + 86400000 : now - 1000 - i, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 6, lapses: 0, state: 2, learning_steps: 0, last_review: now - 86400000 }, failures: 0, suspended: false, leech: false, encounters: 0, createdAt: now - i, updatedAt: now });
    });
    await new Promise(r => { tx.oncomplete = r; }); d.close();
  }, phrases);

  // The popup and the review page must present the same next item.
  await app.goto(`chrome-extension://${id}/app.html#review`); await app.reload();
  const reviewPrompt = (await app.locator('.review-card h2.prompt').textContent()).trim();
  const popup = await context.newPage(); popup.on('pageerror', e => errors.push(e.message));
  await popup.setViewportSize({ width: 380, height: 600 });
  const opened = Date.now(); await popup.goto(`chrome-extension://${id}/popup.html`); await popup.locator('.quick-card').waitFor();
  const openMs = Date.now() - opened;
  assert.equal((await popup.locator('.quick-prompt').textContent()).trim(), reviewPrompt);
  assert.ok((await popup.locator('.quick-top small').textContent()).includes('3 mục đến hạn'));
  assert.equal(await popup.locator('.quick-youtube').count(), 0, 'The YouTube save button only appears on YouTube tabs.');
  const noOverflow = await popup.evaluate(() => document.documentElement.scrollWidth <= 381);
  assert.ok(noOverflow);
  await popup.screenshot({ path: 'test-results/popup-card.png', fullPage: true });
  checks.push('popup-shows-same-next-item-and-due-count-as-review-page');

  // Active recall first: the check button waits for an answer; Ctrl+Enter reveals; Enter alone never rates.
  const check = popup.getByRole('button', { name: 'Đối chiếu', exact: true });
  assert.equal(await check.isDisabled(), true);
  const first = (await rows(popup, 'units')).find(u => u.knowledge.production.instructionVi === reviewPrompt);
  await popup.locator('.quick-answer').fill(first.knowledge.production.answerEn);
  await popup.keyboard.press('Control+Enter'); await popup.locator('.quick-ratings').waitFor();
  await popup.keyboard.press('Enter'); await popup.waitForTimeout(300);
  assert.equal((await rows(popup, 'reviews')).length, 0, 'Enter after revealing must not submit a rating.');
  await popup.screenshot({ path: 'test-results/popup-revealed.png', fullPage: true });
  await popup.keyboard.press('3');
  await waitUntil(async () => (await rows(popup, 'reviews')).length === 1, 'rating saved');
  const [review] = await rows(popup, 'reviews'); const updated = (await rows(popup, 'units')).find(u => u.id === first.id);
  assert.equal(review.unitId, first.id); assert.equal(review.rating, 3); assert.equal(review.assisted, false); assert.equal(review.answer, first.knowledge.production.answerEn);
  assert.equal(updated.schedule.reps, 7); assert.ok(updated.schedule.due > Date.now() + 3600000);
  await waitUntil(async () => (await popup.locator('.quick-top small').textContent()).includes('2 mục đến hạn'), 'queue refresh after rating');
  await waitUntil(async () => (await worker.evaluate(() => chrome.action.getBadgeText({}))) === '2', 'badge follows the popup review');
  checks.push('typed-answer-rating-updates-fsrs-review-log-and-badge', 'enter-after-reveal-does-not-rate');

  // Looking before recalling records "Chưa nhớ"; skipping changes nothing.
  await popup.getByRole('button', { name: 'Chưa nhớ · Xem đáp án', exact: true }).click();
  assert.equal(await popup.locator('.quick-rating:not(:disabled)').count(), 1);
  await popup.keyboard.press('4'); await popup.waitForTimeout(250); assert.equal((await rows(popup, 'reviews')).length, 1);
  await popup.keyboard.press('1');
  await waitUntil(async () => (await rows(popup, 'reviews')).length === 2, 'assisted rating saved');
  const assisted = (await rows(popup, 'reviews')).find(r => r.id !== review.id);
  assert.equal(assisted.rating, 1); assert.equal(assisted.assisted, true);
  checks.push('reveal-without-recall-is-recorded-as-assisted-again');
  const assistedUnit = assisted.unitId;
  await waitUntil(async () => { const prompt = await popup.locator('.quick-prompt').textContent().catch(() => ''); return !!prompt; }, 'next card');
  const skippedPrompt = await popup.locator('.quick-prompt').textContent();
  await popup.getByRole('button', { name: 'Bỏ qua lần này · Không đổi lịch', exact: true }).click();
  const reviewsAfterSkip = await rows(popup, 'reviews'); assert.equal(reviewsAfterSkip.length, 2);
  if (await popup.locator('.quick-prompt').count()) assert.notEqual(await popup.locator('.quick-prompt').textContent(), skippedPrompt);
  checks.push('skip-leaves-schedule-and-history-unchanged');

  // "Chưa nhớ" moves the item a few minutes ahead, so it leaves the current queue.
  const due = (await rows(popup, 'units')).find(u => u.id === assistedUnit);
  assert.ok(due.schedule.due > Date.now(), 'An Again rating moves the item into the near future.');
  while (await popup.locator('.quick-card').count()) {
    await popup.getByRole('button', { name: 'Bỏ qua lần này · Không đổi lịch', exact: true }).click();
  }
  await popup.locator('.quick-empty').waitFor();
  assert.ok((await popup.locator('.quick-empty').textContent()).includes('Đã bỏ qua'));
  await popup.screenshot({ path: 'test-results/popup-empty.png', fullPage: true });
  checks.push('empty-state-after-queue');

  assert.deepEqual(errors, []);
  await writeFile('test-results/popup-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), checks, errors, openMs, profilePath, browser: context.browser()?.version(), note: 'popup.html opened as an extension page; Chrome headless cannot click the toolbar icon itself.' }, null, 2));
  console.log(`POPUP E2E PASS (${checks.length} checks): ${JSON.stringify({ openMs })}`);
} catch (error) {
  for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `test-results/popup-failure-${i}.png`, fullPage: true }).catch(() => undefined);
  await writeFile('test-results/popup-e2e-report.json', JSON.stringify({ status: 'failed', at: new Date().toISOString(), checks, errors, profilePath, error: String(error) }, null, 2));
  throw error;
} finally { await context.close(); }
