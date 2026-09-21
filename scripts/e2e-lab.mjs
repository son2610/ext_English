import { chromium } from 'playwright';
import { build } from 'esbuild';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const compiled = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { source, analysis } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) {
  if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
}
await mkdir('test-results', { recursive: true });
const profilePath = resolve(`test-results/lab-profile-${Date.now()}`);
const context = await chromium.launchPersistentContext(profilePath, {
  executablePath, headless: true, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
});
const checks = [], errors = [], network = [];
const summaryTitle = 'Một lượt luyện, thêm một chút quen.';
const demoCards = [
  ['Keep in mind', 'Hãy ghi nhớ'],
  ['Little by little', 'Từng chút một'],
  ['As long as', 'Miễn là'],
  ['Figure it out', 'Tìm ra cách giải quyết'],
  ['It is worth trying.', 'Điều đó đáng để thử.'],
  ['Get used to', 'Dần làm quen với'],
  ['Make a difference', 'Tạo nên sự khác biệt'],
  ['Take your time.', 'Cứ từ từ, không cần vội.'],
  ['Look forward to', 'Mong đợi điều gì đó'],
];
async function waitUntil(fn, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 60)); }
  throw new Error(`Timed out: ${label}`);
}
async function rows(page, store) {
  return page.evaluate(async store => {
    const d = await new Promise((resolve, reject) => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const result = await new Promise((resolve, reject) => { const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    d.close(); return result;
  }, store);
}
async function snapshot(page) {
  return Object.fromEntries(await Promise.all(['captures', 'units', 'reviews', 'assessments', 'usage'].map(async name => [name, await rows(page, name)])));
}
const completed = async page => Number(await page.getByTestId('lab-progress').getAttribute('data-completed'));
const cycle = async page => Number(await page.getByTestId('lab-progress').getAttribute('data-cycle'));
const noOverflow = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const select = (page, name) => page.getByLabel(name).filter({ has: page.locator('option') });
async function setup(page) {
  if (await button(page, 'Kết thúc').isVisible()) await button(page, 'Kết thúc').click();
  else if (await button(page, 'Dừng').isVisible()) await button(page, 'Dừng').click();
  if (await button(page, 'Đổi thiết lập').isVisible()) await button(page, 'Đổi thiết lập').click();
  await button(page, 'Bắt đầu lượt luyện').waitFor();
}
async function pause(page) {
  await button(page, 'Tạm dừng').or(button(page, 'Tiếp tục')).waitFor();
  if (await button(page, 'Tạm dừng').isVisible()) await button(page, 'Tạm dừng').click();
  await button(page, 'Tiếp tục').waitFor();
}

try {
  context.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  // The Lab must be entirely local. Reject accidental page requests rather than contacting an API.
  await context.route(/^https?:\/\//, route => route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.labExternalCalls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      if (/^https?:/.test(String(input))) { globalThis.labExternalCalls.push(String(input)); throw new Error('Lab E2E forbids external requests'); }
      return original(input, options);
    };
  });
  const app = await context.newPage(); app.on('pageerror', error => errors.push(error.message));
  const appUrl = `chrome-extension://${new URL(worker.url()).host}/app.html`;
  await app.goto(`${appUrl}#lab`);
  await app.getByRole('heading', { name: 'Phòng Lab.', exact: true }).waitFor();
  assert.equal(await button(app, 'Bắt đầu lượt luyện').isEnabled(), false);
  checks.push('empty-library-cannot-start-empty-session');

  const seeded = await app.evaluate(async ({ source, analysis, demoCards }) => {
    const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); });
    const tx = d.transaction(['captures', 'units', 'meta', 'organizers'], 'readwrite');
    const now = Date.now(), groupId = crypto.randomUUID(), labelId = crypto.randomUUID(), emptyGroupId = crypto.randomUUID(), captureIds = [];
    tx.objectStore('meta').put({ key: 'settings', value: { autoBackup: false, targetedAutomatic: false, weeklyAutomatic: false, optimizationEnabled: false } });
    for (const o of [
      { id: groupId, kind: 'group', name: 'Phản xạ giao tiếp', color: 'blue' },
      { id: labelId, kind: 'label', name: 'Cụm từ cần nhớ', color: 'purple' },
      { id: emptyGroupId, kind: 'group', name: 'Chưa có nghĩa', color: 'amber' },
    ]) tx.objectStore('organizers').put({ ...o, updatedAt: now });
    for (let i = 0; i < 2000; i++) {
      const id = crypto.randomUUID(); captureIds.push(id);
      const exact = i === 0 ? source.exact : i === 1 ? 'Your advice would have helped us.' : demoCards[i - 2]?.[0] ?? `A little practice makes a difference every day. Context ${i}.`;
      const meaningVi = i === 0 ? analysis.meaningVi : i === 1 ? 'Lời khuyên của bạn lẽ ra đã giúp chúng tôi.' : demoCards[i - 2]?.[1] ?? `Luyện tập từng chút tạo nên khác biệt mỗi ngày. Ngữ cảnh ${i}.`;
      tx.objectStore('captures').put({
        id, source: { ...source, exact, context: exact, capturedAt: now - i * 1000 }, note: '', status: 'ready',
        analysis: { ...analysis, meaningVi }, unitsCreated: i < 2, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now,
        ...(i < 2 ? { organization: { groupId, labelIds: [labelId] } } : {}),
      });
    }
    tx.objectStore('captures').put({ id: crypto.randomUUID(), source: { ...source, exact: 'This capture has no translation.', capturedAt: now + 1000 }, note: '', status: 'saved', unitsCreated: false, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, organization: { groupId: emptyGroupId, labelIds: [] } });
    for (let i = 0; i < 2; i++) tx.objectStore('units').put({
      id: crypto.randomUUID(), canonical: analysis.knowledge[i].key,
      knowledge: { ...analysis.knowledge[i], ...(i === 1 ? { cloze: { ...analysis.knowledge[i].cloze, sentence: 'Your advice [[blank]] us.' } } : {}) }, captureIds: [captureIds[i]],
      schedule: { due: now - 1000, stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 2, lapses: i ? 4 : 0, state: 2, learning_steps: 0, last_review: now - 86400000 },
      failures: i ? 4 : 0, suspended: false, leech: !!i, encounters: 0, createdAt: now - i * 1000, updatedAt: now,
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); d.close();
    return { groupId, labelId, emptyGroupId };
  }, { source, analysis, demoCards });
  await app.reload(); await app.getByRole('heading', { name: 'Phòng Lab.', exact: true }).waitFor();
  const before = await snapshot(app);
  assert.ok(await app.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: /Phòng Lab/ }).isVisible());
  assert.ok(await app.locator('body *').count() < 1000, 'Setup must not render 2,000 hidden cards.');
  await select(app, 'Nguồn nội dung').selectOption('captures');
  await select(app, 'Nhóm').selectOption(seeded.emptyGroupId);
  assert.equal(await button(app, 'Bắt đầu lượt luyện').isEnabled(), false);
  await select(app, 'Nhóm').selectOption(seeded.groupId);
  await select(app, 'Nhãn').selectOption(seeded.labelId);
  assert.equal(await button(app, 'Bắt đầu lượt luyện').isEnabled(), true);
  checks.push('two-thousand-items-bounded-setup-dom', 'group-label-filter-and-untranslated-empty-state');

  // A short sequential session: front and translation, stable pause, keyboard resume, completion.
  await button(app, 'Lướt nhanh').click();
  assert.equal(await app.getByLabel('Lặp lại liên tục', { exact: true }).isChecked(), false);
  await select(app, 'Nhóm').selectOption('');
  await select(app, 'Nhãn').selectOption('');
  await select(app, 'Thứ tự').selectOption('newest');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('3');
  await app.getByLabel('Giây mỗi mục', { exact: true }).fill('0.6');
  await app.screenshot({ path: 'test-results/lab-setup-desktop.png', fullPage: true });
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-session').waitFor(); await pause(app);
  assert.equal((await app.locator('.lab-stream-front').textContent()).trim(), source.exact);
  assert.ok((await app.locator('.lab-stream-meaning').textContent()).includes(analysis.meaningVi));
  const pausedProgress = await completed(app), pausedText = await app.locator('.lab-stream-front').textContent();
  await app.waitForTimeout(850); assert.equal(await completed(app), pausedProgress); assert.equal(await app.locator('.lab-stream-front').textContent(), pausedText);
  await button(app, 'Toàn màn hình').click();
  await waitUntil(() => app.evaluate(() => document.fullscreenElement?.classList.contains('lab-session') === true), 'native fullscreen entry');
  await button(app, 'Thu nhỏ').click();
  await waitUntil(() => app.evaluate(() => document.fullscreenElement === null), 'native fullscreen exit');
  assert.equal(await completed(app), pausedProgress);
  checks.push('native-fullscreen-enter-exit-keeps-paused-progress');
  await app.screenshot({ path: 'test-results/lab-stream-desktop.png', fullPage: true });
  await app.locator('.lab-session').evaluate(e => { e.tabIndex = -1; e.focus(); }); await app.keyboard.press('Space');
  await button(app, 'Tạm dừng').waitFor();
  await app.getByRole('heading', { name: summaryTitle, exact: true }).waitFor({ timeout: 10000 });
  checks.push('stream-english-translation-pause-space-resume-and-auto-completion');
  await button(app, 'Luyện lại lượt này').click(); await pause(app);
  assert.equal((await app.locator('.lab-stream-front').textContent()).trim(), source.exact);
  await setup(app);

  // Preferences survive reload; they are metadata only, never a review or a correct-answer signal.
  await app.reload(); await app.getByLabel('Số mục mỗi lượt', { exact: true }).waitFor();
  assert.equal(await app.getByLabel('Số mục mỗi lượt', { exact: true }).inputValue(), '3');
  assert.equal(await app.getByLabel('Giây mỗi mục', { exact: true }).inputValue(), '0.6');
  assert.equal(await select(app, 'Nguồn nội dung').inputValue(), 'captures');
  checks.push('replay-retains-deck-and-preferences-survive-reload');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('0');
  await app.getByLabel('Ẩn nghĩa để tự đoán', { exact: true }).check();
  await button(app, 'Bắt đầu lượt luyện').click(); await pause(app);
  assert.ok(await app.locator('.lab-stream-front').count() <= 1);
  assert.ok(await app.locator('body *').count() < 1000, 'Even an all-items session must render a bounded number of cards.');
  assert.equal(await app.locator('.lab-stream-meaning').isVisible(), false);
  await button(app, 'Tiếp tục').click();
  // Headless does not reliably background extension tabs. Mock only the visibility signal.
  await app.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await button(app, 'Tiếp tục').waitFor(); const hiddenProgress = await completed(app);
  await app.waitForTimeout(850); assert.equal(await completed(app), hiddenProgress);
  await app.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await button(app, 'Tiếp tục').waitFor();
  checks.push('all-items-bounded-session-dom-hidden-translation', 'hidden-document-pauses-without-automatic-resume');
  await setup(app);

  // Random cells turn from English to Vietnamese, retire, and are reused without thousands of nodes.
  await button(app, 'Bong bóng').click();
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('4');
  await app.getByLabel('Giây mỗi mặt', { exact: true }).fill('0.6');
  await select(app, 'Cỡ bảng').selectOption('2');
  await button(app, 'Bắt đầu lượt luyện').click();
  await app.locator('.lab-bubble[data-side="front"]').first().waitFor();
  assert.ok(await app.locator('.lab-bubble').count() <= 4);
  const firstIndex = await app.locator('.lab-bubble[data-side="front"]').first().getAttribute('data-index');
  await app.locator(`.lab-bubble[data-index="${firstIndex}"][data-side="back"]`).waitFor({ timeout: 5000 });
  await app.locator(`.lab-bubble[data-index="${firstIndex}"]`).click();
  await app.locator('.lab-focus-card').waitFor(); await button(app, 'Tiếp tục').waitFor();
  assert.ok((await app.locator('.lab-focus-card').textContent()).trim().length > 20);
  const bubbleProgress = await completed(app); await app.waitForTimeout(800); assert.equal(await completed(app), bubbleProgress);
  await app.screenshot({ path: 'test-results/lab-bubbles-detail.png', fullPage: true });
  await button(app, 'Tiếp tục').click();
  await app.getByRole('heading', { name: summaryTitle, exact: true }).waitFor({ timeout: 12000 });
  checks.push('bubble-front-back-detail-pause-retirement-and-completion');
  await setup(app);

  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('18');
  await app.getByLabel('Giây mỗi mặt', { exact: true }).fill('2');
  await select(app, 'Cỡ bảng').selectOption('3');
  await button(app, 'Bắt đầu lượt luyện').click();
  await waitUntil(async () => await app.locator('.lab-bubble').count() === 9, 'nine occupied desktop cells');
  await pause(app); await app.screenshot({ path: 'test-results/lab-bubbles-desktop.png', fullPage: true });
  await setup(app);

  // Phone layout and reduced-motion preference are checked in the real stylesheet/browser.
  await app.setViewportSize({ width: 390, height: 844 }); await app.emulateMedia({ reducedMotion: 'reduce' });
  await noOverflow(app); await app.screenshot({ path: 'test-results/lab-setup-mobile.png', fullPage: true });
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('0');
  await select(app, 'Cỡ bảng').selectOption('4');
  await button(app, 'Bắt đầu lượt luyện').click(); await pause(app);
  assert.ok(await app.locator('.lab-bubble').count() <= 16); await noOverflow(app);
  const transitions = await app.locator('.lab-bubble').first().evaluate(e => [e, ...e.querySelectorAll('*')].map(node => ({ transition: getComputedStyle(node).transitionDuration, animation: getComputedStyle(node).animationDuration })));
  assert.ok(transitions.every(t => [...t.transition.split(','), ...t.animation.split(',')].every(s => parseFloat(s) <= 0.01)), JSON.stringify(transitions));
  await app.screenshot({ path: 'test-results/lab-bubbles-mobile.png', fullPage: true });
  checks.push('mobile-no-horizontal-overflow-16-cell-bound-and-reduced-motion');
  await setup(app); await app.setViewportSize({ width: 1440, height: 1000 }); await app.emulateMedia({ reducedMotion: 'no-preference' });

  // Opt-in infinite playback crosses complete cycles while keeping one bounded, reusable deck.
  await button(app, 'Lướt nhanh').click();
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('1');
  await app.getByLabel('Giây mỗi mục', { exact: true }).fill('0.6');
  await app.getByLabel('Lặp lại liên tục', { exact: true }).check();
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-session').waitFor();
  await waitUntil(async () => await cycle(app) >= 2, 'stream crosses two full repeat cycles');
  assert.equal(await app.getByTestId('lab-summary').count(), 0);
  assert.equal(await app.locator('.lab-stream-front').count(), 1);
  await pause(app);
  const pausedLoop = { cycle: await cycle(app), completed: await completed(app) };
  await app.waitForTimeout(850);
  assert.deepEqual({ cycle: await cycle(app), completed: await completed(app) }, pausedLoop);
  await app.screenshot({ path: 'test-results/lab-stream-repeat.png', fullPage: true });
  await button(app, 'Dừng').click(); await app.getByTestId('lab-summary').waitFor();
  checks.push('continuous-stream-crosses-cycles-pause-freezes-explicit-stop-finishes');
  await setup(app); await app.reload(); await button(app, 'Bắt đầu lượt luyện').waitFor();
  assert.equal(await app.getByLabel('Lặp lại liên tục', { exact: true }).isChecked(), true);
  assert.equal(await app.getByLabel('Số mục mỗi lượt', { exact: true }).inputValue(), '1');
  assert.equal(await app.locator('.lab-session').count(), 0);
  checks.push('continuous-playback-preference-survives-reload-without-auto-start');

  await button(app, 'Bong bóng').click();
  await app.getByLabel('Giây mỗi mặt', { exact: true }).fill('0.6');
  await select(app, 'Cỡ bảng').selectOption('2');
  await button(app, 'Bắt đầu lượt luyện').click();
  await app.locator('.lab-bubble[data-side="front"]').first().waitFor();
  await app.locator('.lab-bubble[data-side="back"]').first().waitFor();
  await waitUntil(async () => await cycle(app) >= 1, 'bubble completes front/back then starts another cycle');
  assert.equal(await app.getByTestId('lab-summary').count(), 0);
  assert.ok(await app.locator('.lab-bubble').count() <= 4);
  await app.locator('.lab-bubble[data-side="front"]').first().waitFor();
  await app.locator('.lab-bubble[data-side="back"]').first().waitFor();
  assert.ok(await cycle(app) >= 1);
  await button(app, 'Dừng').click(); await app.getByTestId('lab-summary').waitFor();
  checks.push('continuous-bubbles-repeat-both-faces-with-bounded-dom-until-stop');
  await setup(app); await app.getByLabel('Lặp lại liên tục', { exact: true }).uncheck();

  // Cloze requires actual typing. Spaces in the answer never activate session playback shortcuts.
  await button(app, 'Điền khuyết').click();
  await select(app, 'Nguồn nội dung').selectOption('grammar');
  await select(app, 'Tiến độ').selectOption('due');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('1');
  await button(app, 'Bắt đầu lượt luyện').click();
  const answer = app.getByLabel('Phần còn thiếu', { exact: true }); await answer.waitFor();
  await answer.pressSequentially('had known'); assert.equal(await answer.inputValue(), 'had known');
  await button(app, 'Kiểm tra').click();
  await app.locator('.lab-cloze-feedback').filter({ hasText: 'Chính xác' }).waitFor();
  await app.screenshot({ path: 'test-results/lab-cloze-desktop.png', fullPage: true });
  await button(app, 'Xem kết quả').click(); await app.getByRole('heading', { name: summaryTitle, exact: true }).waitFor();
  checks.push('due-grammar-cloze-typed-answer-and-input-space-is-not-shortcut');
  await setup(app);
  await select(app, 'Nguồn nội dung').selectOption('phrases');
  await select(app, 'Tiến độ').selectOption('difficult');
  await button(app, 'Bắt đầu lượt luyện').click(); await answer.fill('a wrong answer'); await button(app, 'Kiểm tra').click();
  await app.locator('.lab-cloze-feedback').filter({ hasText: 'Đáp án trong bài đã lưu' }).waitFor();
  assert.ok((await app.locator('.lab-session').textContent()).includes('would have helped'));
  await button(app, 'Xem kết quả').click(); await app.getByRole('heading', { name: summaryTitle, exact: true }).waitFor();
  await app.screenshot({ path: 'test-results/lab-summary.png', fullPage: true });
  checks.push('difficult-phrase-cloze-reveals-correction');

  // Matching board: one deliberate mistake, pause disables the board, every pair resolves, confused pairs are marked.
  await setup(app); await button(app, 'Ghép cặp').click();
  await select(app, 'Nguồn nội dung').selectOption('captures'); await select(app, 'Tiến độ').selectOption('all');
  await select(app, 'Nhóm').selectOption(''); await select(app, 'Nhãn').selectOption('');
  await select(app, 'Thứ tự').selectOption('newest'); await select(app, 'Số cặp mỗi bảng').selectOption('2');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('1');
  assert.equal(await button(app, 'Bắt đầu lượt luyện').isEnabled(), false, 'A pairing board needs at least two items.');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('4');
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-match-board').waitFor();
  assert.equal(await app.locator('.lab-match-tile').count(), 8);
  const pairs = await app.locator('.lab-match-tile[data-side="en"]').evaluateAll(tiles => tiles.map(t => t.dataset.cardId));
  const tile = (id, side) => app.locator(`.lab-match-tile[data-card-id="${id}"][data-side="${side}"]`);
  await tile(pairs[0], 'en').click(); await tile(pairs[1], 'vi').click();
  assert.equal(await app.locator('.lab-match-tile.wrong').count(), 2); assert.equal(await completed(app), 0);
  await app.screenshot({ path: 'test-results/lab-match-desktop.png', fullPage: true });
  await pause(app); assert.equal(await tile(pairs[2], 'en').isDisabled(), true); await button(app, 'Tiếp tục').click();
  await app.setViewportSize({ width: 390, height: 844 }); await noOverflow(app); await app.setViewportSize({ width: 1440, height: 1000 });
  for (const id of pairs) { await tile(id, 'en').click(); await tile(id, 'vi').click(); }
  await app.getByTestId('lab-summary').waitFor();
  const matchSummary = await app.getByTestId('lab-summary').textContent();
  assert.ok(matchSummary.includes('4 / 4') && matchSummary.includes('2 cặp ghép đúng ngay · 1 lần ghép nhầm'), matchSummary);
  assert.ok(await button(app, 'Luyện 2 mục đã đánh dấu').isVisible());
  checks.push('match-board-mistake-pause-complete-and-marks-confused-pairs');

  // Multiple choice: distractors from the library, keyboard answers, feedback, marking and direction.
  await setup(app); await button(app, 'Trắc nghiệm').click();
  await select(app, 'Chiều hỏi').selectOption('en-vi'); await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('3');
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-choice-stage').waitFor();
  const options = () => app.locator('.lab-choice-option').evaluateAll(els => els.map(e => e.querySelector('span').textContent));
  const prompt = () => app.locator('.lab-choice-prompt').textContent();
  assert.equal(await prompt(), source.exact);
  let texts = await options(); assert.equal(texts.length, 4); assert.equal(new Set(texts).size, 4);
  await app.keyboard.press(String(texts.indexOf(analysis.meaningVi) + 1));
  await app.locator('.lab-cloze-feedback').filter({ hasText: 'Chính xác.' }).waitFor();
  await app.screenshot({ path: 'test-results/lab-choice-desktop.png', fullPage: true });
  await button(app, 'Câu tiếp theo').click();
  assert.equal(await prompt(), 'Your advice would have helped us.');
  texts = await options(); await app.locator('.lab-choice-option').nth(texts.findIndex(t => t !== 'Lời khuyên của bạn lẽ ra đã giúp chúng tôi.')).click();
  await app.locator('.lab-cloze-feedback').filter({ hasText: 'Chưa đúng' }).waitFor();
  assert.ok(await button(app, '★ Đã đánh dấu').isVisible());
  await button(app, 'Câu tiếp theo').click();
  texts = await options(); await app.keyboard.press(String(texts.indexOf(demoCards[0][1]) + 1));
  await button(app, 'Xem kết quả').click(); await app.getByTestId('lab-summary').waitFor();
  assert.ok((await app.getByTestId('lab-summary').textContent()).includes('2 câu chọn đúng · 1 mục để xem lại'));
  await setup(app); await select(app, 'Chiều hỏi').selectOption('vi-en'); await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('1');
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-choice-stage').waitFor();
  assert.equal(await prompt(), analysis.meaningVi); assert.ok((await options()).includes(source.exact));
  assert.equal(await button(app, 'Nghe tiếng Anh').count(), 0, 'Hearing the English first would reveal the answer.');
  await app.keyboard.press('1'); await button(app, 'Nghe tiếng Anh').waitFor();
  await app.setViewportSize({ width: 390, height: 844 }); await noOverflow(app);
  await app.screenshot({ path: 'test-results/lab-choice-mobile.png', fullPage: true }); await app.setViewportSize({ width: 1440, height: 1000 });
  await button(app, 'Xem kết quả').click(); await app.getByTestId('lab-summary').waitFor();
  checks.push('choice-library-distractors-keyboard-feedback-marking-and-reverse-direction');

  // Instrument browser timer registration, preserving native behavior, to verify unmount cleanup.
  await setup(app); await button(app, 'Lướt nhanh').click();
  await select(app, 'Nguồn nội dung').selectOption('captures'); await select(app, 'Tiến độ').selectOption('all');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('0');
  await app.evaluate(() => {
    globalThis.labOriginalTimers = { set: window.setInterval, clear: window.clearInterval };
    globalThis.labActiveIntervals = new Set();
    window.setInterval = (handler, delay, ...args) => {
      const id = globalThis.labOriginalTimers.set.call(window, handler, delay, ...args);
      globalThis.labActiveIntervals.add(id); return id;
    };
    window.clearInterval = id => { globalThis.labActiveIntervals.delete(id); return globalThis.labOriginalTimers.clear.call(window, id); };
  });
  await button(app, 'Bắt đầu lượt luyện').click(); await app.locator('.lab-session').waitFor();
  const sessionIntervals = await app.evaluate(() => [...globalThis.labActiveIntervals]);
  assert.ok(sessionIntervals.length > 0, 'Session clock must be observed by the cleanup check.');
  await app.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: /^Thư viện ngữ cảnh/ }).click();
  await app.getByRole('heading', { name: 'Thư viện ngữ cảnh.', exact: true }).waitFor();
  await waitUntil(() => app.evaluate(ids => ids.every(id => !globalThis.labActiveIntervals.has(id)), sessionIntervals), 'Lab interval cleanup on navigation');
  assert.equal(await app.locator('.lab-session').count(), 0);
  await app.evaluate(() => { window.setInterval = globalThis.labOriginalTimers.set; window.clearInterval = globalThis.labOriginalTimers.clear; delete globalThis.labOriginalTimers; delete globalThis.labActiveIntervals; });
  await app.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: /^Phòng Lab/ }).click();
  await button(app, 'Bắt đầu lượt luyện').waitFor(); assert.equal(await app.locator('.lab-session').count(), 0);
  checks.push('navigation-cleans-up-session-clock-and-returns-to-setup');

  assert.deepEqual(await snapshot(app), before);
  assert.deepEqual(network, []); assert.deepEqual(await worker.evaluate(() => globalThis.labExternalCalls), []); assert.deepEqual(errors, []);
  checks.push('all-modes-preserve-captures-schedules-reviews-assessments', 'zero-ai-or-external-network-requests-no-page-errors');
  await writeFile('test-results/lab-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), checks, errors, network, profilePath, browser: context.browser()?.version(), fixture: { captures: 2001, units: 2 }, note: 'Real Chromium extension, IndexedDB, UI, timers, responsive styles and reduced-motion media. Visibility pause uses a mocked document.hidden event. Synthetic local learning data; no API calls.' }, null, 2));
  console.log(`LAB E2E PASS (${checks.length} checks)`);
} catch (error) {
  for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `test-results/lab-failure-${i}.png`, fullPage: true }).catch(() => undefined);
  await writeFile('test-results/lab-e2e-report.json', JSON.stringify({ status: 'failed', at: new Date().toISOString(), checks, errors, network, profilePath, error: String(error) }, null, 2));
  throw error;
} finally { await context.close(); }
