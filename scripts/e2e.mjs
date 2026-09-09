import { openCapture, closeCapture } from './library-test-helpers.mjs';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, access, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';

await mkdir('test-results', { recursive: true });
const fixtureBuild = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { analysis } = await import(`data:text/javascript;base64,${Buffer.from(fixtureBuild.outputFiles[0].text).toString('base64')}`);
const sample = '<p id="target">If I <strong>had known</strong>, I would have <em>helped.</em></p>';
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/csp') res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-src http://localhost:*");
  if (req.url === '/frame') res.end(`<!doctype html><html><head><title>Trong iframe</title></head><body style="font:20px Georgia">${sample}</body></html>`);
  else res.end(`<!doctype html><html><head><title>Ngữ cảnh kiểm thử</title><style>body{margin:40px;font:20px Georgia}button{color:red!important;display:none!important}dialog{display:none!important}#hostile{position:fixed;right:0;top:0;width:60px;height:60px;z-index:2147483647;background:coral}p{max-width:600px}iframe{width:450px;height:100px;margin-top:100px}#bottom{margin-top:600px}</style></head><body><h1>Đọc trong ngữ cảnh</h1><p>Yesterday.</p>${sample}<p>Things are different now.</p><div id="hostile"></div><iframe src="http://localhost:${server.address().port}/frame"></iframe><p id="bottom">A phrase at the very bottom of the viewport.</p></body></html>`);
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
let executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) {
  const candidates = [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1200/chrome-win64/chrome.exe'];
  for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
}
let context;
const errors = [];
async function getShadowNode(page, predicate) {
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  function walk(node) {
    const attrs = Object.fromEntries(Array.from({ length: (node.attributes?.length ?? 0) / 2 }, (_, i) => [node.attributes[i * 2], node.attributes[i * 2 + 1]]));
    if (predicate(node, attrs)) return node;
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) { const found = walk(child); if (found) return found; }
  }
  return { cdp, node: walk(root) };
}
async function clickClosed(page, cssClass) {
  const { cdp, node } = await getShadowNode(page, (_, attrs) => attrs.class?.split(' ').includes(cssClass));
  assert.ok(node, `Không tìm thấy ${cssClass}`);
  const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: node.backendNodeId });
  const x = (model.content[0] + model.content[4]) / 2; const y = (model.content[1] + model.content[5]) / 2;
  assert.ok(x >= 0 && x < 1440 && y >= 0 && y < 1000, `${cssClass} nằm ngoài viewport`);
  await page.mouse.click(x, y); await cdp.detach();
}
async function select(frame, selector) {
  await frame.locator(selector).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); });
  await new Promise(resolve => setTimeout(resolve, 350));
}
async function assertDialogVisible(page) {
  await new Promise(resolve => setTimeout(resolve, 350));
  const { cdp, node } = await getShadowNode(page, (node, attrs) => node.nodeName === 'DIALOG' && 'open' in attrs);
  assert.ok(node, 'Hộp thoại phải tồn tại');
  const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: node.backendNodeId });
  assert.ok(model.width > 100 && model.height > 100, 'Hộp thoại phải hiển thị');
  await cdp.detach();
}
try {
  const profilePath = resolve(`test-results/profile-${Date.now()}`);
  await mkdir(`${profilePath}/Default`, { recursive: true });
  await mkdir('test-results/downloads', { recursive: true });
  await writeFile(`${profilePath}/Default/Preferences`, JSON.stringify({ download: { default_directory: resolve('test-results/downloads'), prompt_for_download: false } }));
  context = await chromium.launchPersistentContext(profilePath, { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true, downloadsPath: resolve('test-results/downloads'), args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`] });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const app = await context.newPage();
  await app.goto(`chrome-extension://${extensionId}/app.html`);
  await app.getByRole('heading', { name: /Một chút tiếng Anh/ }).waitFor();
  await app.screenshot({ path: 'test-results/dashboard-empty.png', fullPage: true });
  const web = await context.newPage();
  await web.goto(`http://127.0.0.1:${server.address().port}`);
  await select(web, '#target');
  await clickClosed(web, 'icon');
  await assertDialogVisible(web);
  await web.keyboard.type('Neu toi biet truoc, toi da giup.');
  await web.screenshot({ path: 'test-results/capture-dialog.png', fullPage: true });
  await clickClosed(web, 'save');
  await app.goto(`chrome-extension://${extensionId}/app.html#library`);
  await openCapture(app);
  await app.getByText('Đã lưu · Chưa phân tích', { exact: true }).waitFor();
  await app.getByRole('button', { name: 'Tạo bài từ ghi chú', exact: true }).click();
  await app.getByText('Đã đưa vào lịch ôn', { exact: true }).waitFor();
  await closeCapture(app); await app.getByRole('link', { name: /Ôn tập/ }).first().click();
  await app.getByLabel('Câu trả lời của bạn').fill('If I had known, I would have helped.');
  await app.getByRole('button', { name: 'Tự đối chiếu', exact: true }).click();
  await app.screenshot({ path: 'test-results/review.png', fullPage: true });
  await app.getByRole('button', { name: /^Nhớ / }).click();
  await app.getByRole('heading', { name: /Bạn đã dành thời gian/ }).waitFor();
  // Frame capture must be relayed to the top-level document, not clipped by 100px iframe.
  await web.bringToFront();
  const frame = web.frames().find(f => f.url().includes('/frame'));
  await select(frame, '#target');
  const frameHost = await frame.locator('[data-mach-doc="capture"]').boundingBox();
  assert.ok(frameHost);
  await web.mouse.click(frameHost.x + 18, frameHost.y + 18);
  await assertDialogVisible(web);
  await web.keyboard.press('Escape');
  // Native top-layer positioning at the bottom edge and hide-on-scroll.
  await web.locator('#bottom').scrollIntoViewIfNeeded(); await select(web, '#bottom');
  await clickClosed(web, 'icon'); await assertDialogVisible(web); await web.keyboard.press('Escape');
  // Seed a second, AI-ready capture with deterministic fixture data, never a live API call.
  await worker.evaluate(async analysis => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('mach-doc'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = database.transaction('captures', 'readwrite');
    const request = tx.objectStore('captures').getAll();
    request.onsuccess = () => { const first = request.result[0]; tx.objectStore('captures').put({ ...first, id: crypto.randomUUID(), unitsCreated: false, status: 'ready', analysis, source: { ...first.source, url: 'https://example.com/ai', frameUrl: 'https://example.com/ai' } }); };
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); database.close();
  }, analysis);
  await app.goto(`chrome-extension://${extensionId}/app.html#library`);
  await openCapture(app, 'Chờ duyệt bài học');
  await app.getByRole('button', { name: 'Duyệt & đưa vào lịch ôn' }).click();
  await closeCapture(app); await app.getByRole('link', { name: 'Góc học hôm nay', exact: true }).click();
  await app.screenshot({ path: 'test-results/dashboard-populated.png', fullPage: true });
  await app.evaluate(() => chrome.storage.local.set({ geminiKey: 'e2e-fake-key-never-sent' }));
  await app.route('https://generativelanguage.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ correct: false, score: 45, feedbackVi: 'Cần dùng quá khứ hoàn thành trong mệnh đề điều kiện.', correctedEn: 'If I had read the documentation, I would have understood this function.', errors: [{ original: 'have read', correction: 'had read', reasonVi: 'Giả định trái với quá khứ dùng had + V3.' }] }) }] } }] }) }));
  await closeCapture(app); await app.getByRole('link', { name: /^Ôn tập/ }).click();
  await app.getByLabel('Câu trả lời của bạn').fill('If I have read the documentation, I would have understood this function.');
  await app.getByRole('button', { name: 'Nhờ AI chấm', exact: true }).click();
  await app.getByText('Cần dùng quá khứ hoàn thành trong mệnh đề điều kiện.', { exact: true }).waitFor();
  await app.screenshot({ path: 'test-results/ai-feedback.png', fullPage: true });
  await app.getByRole('button', { name: /^Chưa nhớ / }).click();
  await closeCapture(app); await app.getByRole('link', { name: 'Cài đặt & dữ liệu', exact: true }).click();
  await app.getByLabel('Đánh dấu cụm từ đã lưu khi đọc').check();
  await app.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await web.bringToFront(); await web.reload();
  await web.waitForFunction(() => CSS.highlights.has('mach-doc-known'));
  const mutations = await web.evaluate(async () => { const p = document.createElement('p'); p.textContent = 'It would have helped.'; document.body.prepend(p); p.scrollIntoView(); await new Promise(r => setTimeout(r, 1800)); return { ranges: CSS.highlights.get('mach-doc-known').size, untouched: p.childNodes.length === 1, hidden: document.hidden, top: p.getBoundingClientRect().top }; });
  assert.ok(mutations.ranges > 0 && mutations.untouched, `Highlight không được bọc/thay node văn bản: ${JSON.stringify(mutations)}`);
  await app.bringToFront();
  const downloadEvent = app.waitForEvent('download');
  await app.getByRole('button', { name: 'Xuất toàn bộ JSON' }).click();
  const download = await downloadEvent; await download.saveAs('test-results/export.json');
  const priorDownloads = await app.evaluate(async () => (await chrome.downloads.search({})).map(d => d.id));
  await app.getByRole('button', { name: 'Sao lưu ngay', exact: true }).click();
  let backupItem;
  for (let attempt = 0; attempt < 100 && !backupItem; attempt++) {
    backupItem = await app.evaluate(async ids => (await chrome.downloads.search({})).find(d => !ids.includes(d.id) && d.state === 'complete'), priorDownloads);
    if (!backupItem) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(backupItem && backupItem.fileSize > 100, `Chrome phải xác nhận backup đã tải hoàn tất: ${JSON.stringify(backupItem)}`);
  await writeFile('test-results/backup-download-check.json', JSON.stringify({ state: backupItem.state, fileSize: backupItem.fileSize, filename: backupItem.filename }, null, 2));
  const backupText = await readFile(backupItem.filename, 'utf8');
  const backupData = JSON.parse(backupText);
  assert.equal(backupData.units.length, 3); assert.equal(backupData.reviews.length, 2); assert.ok(backupData.encounters.length > 0);
  assert.ok(!backupText.includes('e2e-fake-key-never-sent'), 'Backup không chứa API key');
  await app.locator('input[type="file"]').setInputFiles('test-results/export.json');
  await app.getByRole('button', { name: 'Xác nhận nhập dữ liệu', exact: true }).click();
  await app.getByText('Đã nhập dữ liệu thành công.', { exact: true }).waitFor();
  await app.setViewportSize({ width: 760, height: 900 });
  await app.screenshot({ path: 'test-results/settings-narrow.png', fullPage: true });
  await app.setViewportSize({ width: 1440, height: 1000 });
  // Verify a real extension worker restart, including data and due badge recovery.
  const cdp = await context.newCDPSession(app);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await app.reload();
  await app.getByRole('button', { name: 'Sao lưu ngay', exact: true }).waitFor();
  await app.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await app.getByText('Đã lưu cài đặt.', { exact: true }).waitFor();
  const cspPage = await context.newPage(); await cspPage.goto(`http://127.0.0.1:${server.address().port}/csp`);
  await select(cspPage, '#target'); await clickClosed(cspPage, 'icon'); await assertDialogVisible(cspPage);
  await cspPage.keyboard.press('Escape');
  // Capture late in a long article must collect the nearby text, not the article introduction.
  await cspPage.evaluate(() => { const article = document.createElement('article'); const filler = document.createElement('p'); filler.textContent = 'Introduction. '.repeat(2000); const before = document.createElement('p'); before.textContent = 'The deployment had already failed.'; const selected = document.createElement('p'); selected.id = 'late-selection'; selected.textContent = 'We should have tested it earlier.'; const after = document.createElement('p'); after.textContent = 'The team learned a valuable lesson.'; article.append(filler, before, selected, after); document.body.append(article); selected.scrollIntoView(); });
  await select(cspPage, '#late-selection'); await clickClosed(cspPage, 'icon'); await assertDialogVisible(cspPage);
  const { cdp: contextCdp, node: contextNode } = await getShadowNode(cspPage, (_, attrs) => attrs.class === 'context muted');
  const { object } = await contextCdp.send('DOM.resolveNode', { backendNodeId: contextNode.backendNodeId });
  const contextValue = await contextCdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){return this.textContent}', returnByValue: true });
  assert.ok(contextValue.result.value.includes('The deployment had already failed.'));
  assert.ok(contextValue.result.value.includes('The team learned a valuable lesson.'));
  await contextCdp.detach(); await cspPage.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await writeFile('test-results/e2e-report.json', JSON.stringify({ status: 'passed', browser: context.browser()?.version(), at: new Date().toISOString(), pageErrors: errors, checks: ['capture-multi-node', 'hostile-css', 'strict-csp', 'iframe-relay', 'viewport-edge', 'manual-production', 'structured-units', 'ai-grading-mock', 'incremental-highlights', 'export-import', 'offscreen-backup-download', 'responsive-layout', 'service-worker-restart', 'long-article-context'] }, null, 2));
  console.log('E2E PASS: capture multi-node + CSS/CSP + long article, iframe relay, viewport edge, review + AI mock, DOM highlights, export/import + downloaded backup, responsive layout, worker restart.');
} catch (error) {
  for (const [i, page] of (context?.pages() ?? []).entries()) { try { await page.screenshot({ path: `test-results/failure-${i}.png` }); } catch {} }
  console.error('Page errors:', errors);
  throw error;
} finally { await context?.close(); server.close(); }
