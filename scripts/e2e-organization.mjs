import { chromium } from 'playwright';
import { build } from 'esbuild';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { openCapture, closeCapture } from './library-test-helpers.mjs';

const compiled = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { source, analysis } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
await mkdir('test-results', { recursive: true }); await mkdir('artifacts/store', { recursive: true });
const profilePath = resolve(`test-results/organization-profile-${Date.now()}`);
const context = await chromium.launchPersistentContext(profilePath, { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`] });
const errors = [], checks = [];
const quotes = [
  ['If I had known, I would have helped.', 'Nếu biết trước, tôi đã giúp. Một giả định khác về điều đã xảy ra.', 'Engineering notes'],
  ['The more you practice, the more natural it becomes.', 'Càng luyện tập, bạn càng sử dụng một cách tự nhiên.', 'The art of learning'],
  ['It is worth taking a closer look at this example.', 'Ví dụ này đáng để chúng ta xem xét kỹ hơn.', 'A guide to better code'],
  ['I would rather ask a question than make an assumption.', 'Tôi thà hỏi lại còn hơn tự đưa ra giả định.', 'Working together'],
  ['By the time we arrived, the meeting had already started.', 'Khi chúng tôi đến nơi, cuộc họp đã bắt đầu rồi.', 'Everyday conversations'],
  ['She managed to get her point across without raising her voice.', 'Cô ấy truyền đạt được ý mình mà không cần lớn tiếng.', 'The way we communicate'],
  ['Had we tested the change, we would have spotted the issue.', 'Nếu đã kiểm thử thay đổi, chúng tôi đã nhận ra vấn đề.', 'Lessons from a release'],
  ['Keep in mind that progress takes time.', 'Hãy nhớ rằng tiến bộ cần thời gian.', 'Small steps, every day'],
  ['Not only is it easier to read, but it is also faster.', 'Cách này vừa dễ đọc hơn, vừa nhanh hơn.', 'Designing for clarity'],
];
const rows = (page, name) => page.evaluate(async name => {
  const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); });
  const result = await new Promise(resolve => { const r = d.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); }); d.close(); return result;
}, name);
async function waitUntil(fn, label) { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(`Timed out: ${label}`); }

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const app = await context.newPage(); app.on('pageerror', e => errors.push(e.message));
  const url = `chrome-extension://${new URL(worker.url()).host}/app.html`;
  await app.goto(`${url}#library`); await app.getByRole('heading', { name: 'Thư viện ngữ cảnh.' }).waitFor();
  const seeded = await app.evaluate(async ({ source, analysis, quotes }) => {
    const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); });
    const tx = d.transaction(['captures', 'units', 'meta'], 'readwrite');
    tx.objectStore('meta').put({ key: 'settings', value: { autoBackup: false, targetedAutomatic: false, weeklyAutomatic: false, optimizationEnabled: false } });
    const ids = [], now = Date.now();
    for (let i = 0; i < 60; i++) {
      const id = crypto.randomUUID(); ids.push(id); const q = quotes[i % quotes.length];
      tx.objectStore('captures').put({ id, source: { ...source, exact: q[0], context: q[0], title: q[2], capturedAt: now - i * 3600000, ...(i % 3 === 1 ? { video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start: 5.25, end: 9.8, language: 'en', automatic: true, timing: 'track', captionSource: 'text-track' } } : {}) }, note: i === 0 ? 'Điều kiện, luyện viết và ghi nhớ'.normalize('NFD') : q[1], status: i % 3 === 0 ? 'ready' : 'saved', ...(i % 3 === 0 ? { analysis: { ...analysis, meaningVi: q[1] } } : {}), unitsCreated: i % 3 === 0, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now });
      if (i % 3 === 0) tx.objectStore('units').put({ id: crypto.randomUUID(), canonical: `demo:${id}`, knowledge: { ...analysis.knowledge[0], key: `demo:${id}` }, captureIds: [id], schedule: { due: now - 1000, stability: 2, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 2, lapses: 0, state: 2, learning_steps: 0, last_review: now - 86400000 }, failures: 0, suspended: false, leech: false, encounters: 0, createdAt: now, updatedAt: now });
    }
    await new Promise(resolve => tx.oncomplete = resolve); d.close(); return ids;
  }, { source, analysis, quotes });
  await app.reload(); await app.locator('.capture-tile').first().waitFor();
  assert.equal(await app.locator('.capture-tile').count(), 24); assert.equal(await app.locator('.capture-card').count(), 0); assert.equal(await app.locator('iframe').count(), 0);
  await app.getByRole('button', { name: 'Sau →', exact: true }).click(); assert.equal(await app.getByLabel('Đi đến trang').inputValue(), '2');
  await app.getByLabel('Đi đến trang').fill('3'); assert.equal(await app.locator('.capture-tile').count(), 12);
  await app.getByLabel('Đi đến trang').fill('1');
  checks.push('bounded-24-card-pagination-no-hidden-details-or-players');
  await app.getByRole('button', { name: '＋ Nhóm & nhãn' }).click();
  const manager = app.getByRole('dialog', { name: 'Quản lý nhóm & nhãn' });
  for (const [name, color] of [['Công nghệ', 'Xanh dương'], ['Giao tiếp', 'Cam san hô'], ['Đọc mỗi ngày', 'Xanh ngọc']]) {
    await manager.getByLabel('Tên nhóm mới').fill(name); await manager.getByRole('radio', { name: color, exact: true }).check(); await manager.getByRole('button', { name: 'Tạo nhóm', exact: true }).click();
    await waitUntil(async () => (await rows(app, 'organizers')).some(o => o.name === name), name);
  }
  await manager.getByRole('button', { name: 'Nhãn màu', exact: true }).click();
  for (const [name, color] of [['Luyện viết', 'Tím'], ['Cụm từ hay', 'Vàng'], ['Dùng khi họp', 'Hồng']]) {
    await manager.getByLabel('Tên nhãn mới').fill(name); await manager.getByRole('radio', { name: color, exact: true }).check(); await manager.getByRole('button', { name: 'Tạo nhãn', exact: true }).click();
    await waitUntil(async () => (await rows(app, 'organizers')).some(o => o.name === name), name);
  }
  await closeCapture(app);
  const catalog = await rows(app, 'organizers'), group = catalog.find(o => o.name === 'Công nghệ'), label = catalog.find(o => o.name === 'Luyện viết');
  await app.getByLabel('Chọn tất cả trên trang', { exact: true }).check();
  await app.getByLabel('Chuyển nhóm hàng loạt').selectOption(group.id);
  await waitUntil(async () => (await rows(app, 'captures')).filter(c => c.organization?.groupId === group.id).length === 24, 'bulk group');
  await app.getByLabel('Thêm nhãn hàng loạt').selectOption(label.id);
  await waitUntil(async () => (await rows(app, 'captures')).filter(c => c.organization?.labelIds.includes(label.id)).length === 24, 'bulk label');
  await app.getByRole('button', { name: 'Bỏ chọn tất cả' }).click();
  await app.getByLabel('Lọc theo nhãn').selectOption(label.id); assert.equal(await app.getByLabel('Đi đến trang').getAttribute('max'), '1');
  await app.getByLabel('Tìm trong thư viện').fill('DIEU kien luyen viet');
  await waitUntil(async () => await app.locator('.capture-tile').count() === 1, 'accent free search');
  const tile = app.locator('.tile-open'); await tile.focus(); await app.keyboard.press('Enter');
  await app.getByRole('dialog', { name: 'Chi tiết ngữ cảnh' }).waitFor();
  assert.equal(await app.locator('.capture-card').count(), 1); assert.equal(await app.getByLabel('Nhóm của câu').inputValue(), group.id);
  await app.keyboard.press('Tab'); assert.ok(await app.evaluate(() => !!document.activeElement?.closest('dialog')));
  const before = await rows(app, 'units');
  await app.getByLabel('Nhóm của câu').selectOption('inbox'); await app.getByRole('button', { name: 'Gỡ nhãn Luyện viết', exact: true }).click();
  await app.keyboard.press('Escape'); assert.equal(await app.locator('dialog[open]').count(), 0);
  assert.deepEqual(await rows(app, 'units'), before);
  checks.push('create-colored-groups-labels-bulk-assign-filter', 'accent-insensitive-search', 'keyboard-modal-focus-escape', 'organization-keeps-fsrs');
  await app.getByLabel('Tìm trong thư viện').fill(''); await app.getByLabel('Lọc theo nhãn').selectOption('all');
  // Rename and remove taxonomy through the UI; confirm captures survive.
  await app.getByRole('button', { name: '＋ Nhóm & nhãn' }).click();
  await manager.getByRole('button', { name: 'Sửa Công nghệ' }).click(); await manager.getByLabel('Đổi tên').fill('Tiếng Anh công nghệ'); await manager.getByRole('button', { name: 'Lưu danh mục' }).click();
  await manager.getByRole('button', { name: 'Xoá Giao tiếp', exact: true }).click(); await manager.getByRole('button', { name: 'Xác nhận xoá danh mục' }).click();
  await waitUntil(async () => !(await rows(app, 'organizers')).some(o => o.name === 'Giao tiếp'), 'delete taxonomy');
  assert.equal((await rows(app, 'captures')).length, 60); await closeCapture(app);
  // Reload proves organization persistence. Add varied demo colors for screenshots.
  await app.evaluate(async () => {
    const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); });
    const tx = d.transaction(['organizers', 'captures'], 'readwrite'); const query = tx.objectStore('organizers').getAll();
    query.onsuccess = () => { const groups = query.result.filter(o => o.kind === 'group'), labels = query.result.filter(o => o.kind === 'label'); const request = tx.objectStore('captures').getAll(); request.onsuccess = () => request.result.sort((a,b) => b.source.capturedAt-a.source.capturedAt).forEach((c,i) => tx.objectStore('captures').put({ ...c, organization: { groupId: groups[i % groups.length].id, labelIds: [labels[i % labels.length].id, labels[(i+1) % labels.length].id] } })); };
    await new Promise(resolve => tx.oncomplete = resolve); d.close();
  });
  await app.reload(); await app.locator('.capture-tile').first().waitFor(); await app.evaluate(() => document.fonts.ready);
  checks.push('rename-delete-taxonomy-retains-captures-reload-persistence');
  // Verify actual glyph providers, including decomposed Vietnamese; font-family alone cannot prove coverage.
  const probe = 'Ă Â Đ Ê Ô Ơ Ư ă â đ ê ô ơ ư Ắ Ằ Ẳ Ẵ Ặ Ấ Ầ Ẩ Ẫ Ậ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ớ Ờ Ở Ỡ Ợ Ứ Ừ Ử Ữ Ự Ý Ỳ Ỷ Ỹ Ỵ ắ ằ ẳ ẵ ặ ấ ầ ẩ ẫ ậ ế ề ể ễ ệ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ứ ừ ử ữ ự ý ỳ ỷ ỹ ỵ';
  await app.evaluate(text => { const p = document.createElement('p'); p.id = 'vietnamese-probe'; p.textContent = text + '\n' + text.toLowerCase().normalize('NFD'); p.style.cssText = 'position:fixed;bottom:0;left:0;background:white;z-index:200;font-size:18px;max-width:100vw;padding:12px'; document.body.append(p); }, probe);
  const cdp = await context.newCDPSession(app); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument'); const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#vietnamese-probe' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  assert.ok(fonts.length > 0 && fonts.every(font => font.isCustomFont && font.familyName === 'Noto Sans'), JSON.stringify(fonts));
  await app.screenshot({ path: 'test-results/vietnamese-glyphs.png' }); await app.locator('#vietnamese-probe').evaluate(e => e.remove());
  checks.push('bundled-vietnamese-glyphs-nfc-nfd-no-fallback');
  await app.screenshot({ path: 'test-results/library-grid.png' });
  await app.setViewportSize({ width: 1280, height: 800 }); await app.screenshot({ path: 'artifacts/store/01-library-1280x800.png' });
  await openCapture(app); await app.evaluate(() => document.fonts.ready); await app.screenshot({ path: 'artifacts/store/02-context-1280x800.png' }); await closeCapture(app);
  await app.getByRole('button', { name: 'Dạng danh sách gọn' }).click(); await app.screenshot({ path: 'test-results/library-list.png' });
  await app.setViewportSize({ width: 420, height: 900 });
  assert.equal(await app.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await app.getByRole('button', { name: 'Dạng thẻ' }).click(); await openCapture(app); assert.equal(await app.locator('dialog').evaluate(e => e.scrollWidth > e.clientWidth), false);
  await app.screenshot({ path: 'test-results/library-mobile-detail.png' }); await closeCapture(app);
  await app.screenshot({ path: 'test-results/library-mobile.png' });
  checks.push('responsive-grid-list-dialog-no-horizontal-overflow');
  await app.setViewportSize({ width: 1280, height: 800 });
  await app.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: /^Ôn tập/ }).click(); await app.getByLabel('Câu trả lời của bạn').waitFor(); await app.screenshot({ path: 'artifacts/store/03-review-1280x800.png' });
  // Scale test: 5,000 captures, measured after 4x CPU slowdown. No real API requests.
  await app.evaluate(async ({ source, quotes }) => {
    const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction('captures', 'readwrite'); const now = Date.now();
    for (let i = 60; i < 5000; i++) { const q = quotes[i % quotes.length]; tx.objectStore('captures').put({ id: crypto.randomUUID(), source: { ...source, exact: `${q[0]} Context ${i}.`, title: q[2], capturedAt: now-i*3600000 }, note: q[1], status: 'saved', unitsCreated: false, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now }); }
    await new Promise(resolve => tx.oncomplete = resolve); d.close();
  }, { source, quotes });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Fixture insertion bypasses app events. Reload before timing interaction, not merely a hash navigation
  // (which would wait for the periodic refresh and measure that timer instead of searching 5,000 rows).
  const initialStart = performance.now(); await app.goto(`${url}#library`); await app.reload(); await app.locator('.capture-tile').first().waitFor();
  assert.equal(await app.locator('.library-overview strong').first().textContent(), '5000'); const initialMs = performance.now() - initialStart;
  assert.equal(await app.locator('.capture-tile').count(), 24);
  const searchStart = performance.now(); await app.getByLabel('Tìm trong thư viện').fill('Context 4999'); await waitUntil(async () => await app.locator('.capture-tile').count() === 1, '5000 search'); const searchMs = performance.now() - searchStart;
  const openStart = performance.now(); await openCapture(app); const detailMs = performance.now() - openStart;
  assert.equal(await app.locator('.capture-card').count(), 1); assert.equal(await app.locator('iframe').count(), 0);
  assert.ok(searchMs < 2000 && detailMs < 2000, JSON.stringify({ searchMs, detailMs }));
  await closeCapture(app); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  checks.push('5000-captures-bounded-dom-search-and-detail-4x-cpu');
  // Real UI JSON export includes all organizers; parse the actual downloaded file.
  await app.getByRole('link', { name: 'Cài đặt & dữ liệu' }).click();
  const downloadPromise = app.waitForEvent('download'); await app.getByRole('button', { name: 'Xuất toàn bộ JSON' }).click(); const download = await downloadPromise; await download.saveAs('test-results/organization-export.json');
  const exported = JSON.parse(await readFile('test-results/organization-export.json', 'utf8'));
  assert.equal(exported.version, 3); assert.equal(exported.organizers.length, 5); assert.equal(exported.captures.length, 5000); assert.ok(exported.captures.some(c => c.organization?.labelIds.length));
  checks.push('real-export-includes-all-groups-labels'); assert.deepEqual(errors, []);
  await writeFile('test-results/organization-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), checks, errors, profilePath, fonts, performance: { captures: 5000, renderedCards: 24, cpuSlowdown: 4, initialMs, searchMs, detailMs }, browser: context.browser()?.version(), note: 'Synthetic demo data; real Chromium extension, fonts, dialogs, storage and downloads. No live API calls.' }, null, 2));
  console.log(`ORGANIZATION E2E PASS (${checks.length} checks): ${JSON.stringify({ initialMs, searchMs, detailMs })}`);
} catch (error) { for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `test-results/organization-failure-${i}.png` }).catch(() => undefined); throw error; }
finally { await context.close(); }
