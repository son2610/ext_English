import { chromium } from 'playwright';
import { build } from 'esbuild';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { openCapture, closeCapture } from './library-test-helpers.mjs';

const compiled = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { source, analysis } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
await mkdir('test-results', { recursive: true });
const profilePath = resolve(`test-results/ai-fallback-profile-${Date.now()}`);
const context = await chromium.launchPersistentContext(profilePath, { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`] });
const checks = [], pageErrors = [];
async function rows(page, name) { return page.evaluate(async name => { const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction(name); const rows = await new Promise(resolve => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); }); d.close(); return rows; }, name); }
async function waitUntil(fn) { for (let n = 0; n < 100; n++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Timed out waiting for AI'); }
try {
  // Headless Chrome cannot click the browser's native extension-permission bubble.
  // Simulate only that approval boundary; API requests are fixtures, never live traffic.
  await context.addInitScript(() => {
    if (location.protocol !== 'chrome-extension:' || !chrome.permissions) return;
    globalThis.permissionTrace = [];
    const contains = chrome.permissions.contains.bind(chrome.permissions);
    chrome.permissions.contains = async options => options.origins?.every(o => ['https://api.deepseek.com/*', 'https://generativelanguage.googleapis.com/*'].includes(o)) ? true : contains(options);
    chrome.permissions.request = async options => { globalThis.permissionTrace.push(options); if (options.origins.some(o => !['https://api.deepseek.com/*', 'https://generativelanguage.googleapis.com/*'].includes(o))) throw new Error('Unexpected permission scope'); return true; };
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async analysis => {
    const contains = chrome.permissions.contains.bind(chrome.permissions);
    chrome.permissions.contains = async options => options.origins?.every(o => o === 'https://api.deepseek.com/*') ? true : contains(options);
    await chrome.storage.local.set({ geminiKey: 'fixture-gemini-browser' });
    globalThis.aiCalls = []; globalThis.aiMode = 'valid';
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (!/generativelanguage.googleapis.com|api.deepseek.com/.test(url)) return original(input, options);
      const gemini = url.includes('googleapis'); const body = JSON.parse(options.body);
      const headers = new Headers(options.headers);
      globalThis.aiCalls.push({ provider: gemini ? 'gemini' : 'deepseek', model: gemini ? url.split('/models/')[1].split(':')[0] : body.model,
        correctKey: gemini ? headers.get('x-goog-api-key') === 'fixture-gemini-browser' : headers.get('authorization') === 'Bearer fixture-deepseek-browser', bodyContainsKey: /fixture-.*-browser/.test(options.body) });
      if (gemini) return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Temporary high demand' } }), { status: 503, headers: { 'Retry-After': '120' } });
      const { data } = JSON.parse(body.messages[1].content);
      const value = globalThis.aiMode === 'invalid' ? {} : 'raw' in data ? { textEn: data.raw, uncertain: false, warningVi: '', changes: [] } : analysis;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { total_tokens: 81 } }));
    };
  }, analysis);
  const app = await context.newPage(); app.on('pageerror', error => pageErrors.push(error.message));
  const url = `chrome-extension://${new URL(worker.url()).host}/app.html`;
  await app.goto(`${url}#settings`); await app.getByRole('heading', { name: 'Nhà cung cấp AI & dự phòng' }).waitFor();
  const first = app.locator('.ai-connection').first(); assert.ok((await first.textContent()).includes('Có khóa'));
  assert.equal(await first.getByLabel('Model phân tích', { exact: true }).inputValue(), 'gemini-3.5-flash');
  await app.getByRole('button', { name: '+ Thêm kết nối', exact: true }).click();
  await app.getByLabel('API key của DeepSeek', { exact: true }).pressSequentially('fixture-deepseek-browser');
  assert.equal(await app.getByLabel('API key của DeepSeek', { exact: true }).isVisible(), true);
  await app.getByRole('button', { name: 'Lưu cấu hình AI', exact: true }).click();
  await app.getByRole('status').filter({ hasText: 'Đã lưu cấu hình AI' }).waitFor(); checks.push('settings-add-deepseek-keeps-gemini-key-and-model');
  assert.deepEqual(await app.evaluate(() => globalThis.permissionTrace[0].origins.sort()), ['https://api.deepseek.com/*', 'https://generativelanguage.googleapis.com/*']);
  await app.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click();
  await app.reload(); assert.equal(await app.locator('.ai-connection').count(), 2); checks.push('general-settings-save-preserves-ai-config-and-order');
  assert.ok(await app.evaluate(async () => { const s = await chrome.storage.local.get(['aiKeys', 'geminiKey']); return !s.geminiKey && Object.values(s.aiKeys).length === 2; }));
  const deepseek = app.locator('.ai-connection').nth(1); await deepseek.locator('summary').click();
  await app.route('https://api.deepseek.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ connected: true, messageVi: 'Kết nối thử thành công.' }) } }], usage: { total_tokens: 15 } }) }));
  await deepseek.getByRole('button', { name: 'Kiểm tra JSON', exact: true }).click();
  await app.getByRole('status').filter({ hasText: 'kết nối và JSON hợp lệ' }).waitFor(); checks.push('saved-provider-json-test-without-fallback');
  await app.screenshot({ path: 'test-results/ai-settings-desktop.png', fullPage: true });
  await app.setViewportSize({ width: 390, height: 844 });
  assert.equal(await app.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await app.screenshot({ path: 'test-results/ai-settings-mobile.png', fullPage: true }); await app.setViewportSize({ width: 1440, height: 1000 }); checks.push('vietnamese-responsive-provider-settings');
  async function seed(note, video = false) {
    return app.evaluate(async ({ source, note, video }) => {
      const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); });
      const tx = d.transaction(['captures', 'meta'], 'readwrite'); const id = crypto.randomUUID(); const now = Date.now();
      const setting = await new Promise(resolve => { const r = tx.objectStore('meta').get('settings'); r.onsuccess = () => resolve(r.result); });
      tx.objectStore('meta').put({ ...setting, value: { ...setting.value, autoBackup: false, targetedAutomatic: false } });
      tx.objectStore('captures').put({ id, source: { ...source, ...(video ? { video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start: 5, end: 9, language: 'en', automatic: true, timing: 'track', captionSource: 'text-track' } } : {}) }, note, status: 'saved', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, unitsCreated: false });
      await new Promise(resolve => tx.oncomplete = resolve); d.close(); return id;
    }, { source, note, video });
  }
  const id = await seed('Lần một', true); await app.goto(`${url}#library`); await openCapture(app, source.exact);
  await app.getByRole('button', { name: 'Nhờ AI phân tích', exact: true }).click();
  await waitUntil(async () => (await rows(app, 'captures')).find(c => c.id === id)?.status === 'ready');
  const calls = await worker.evaluate(() => globalThis.aiCalls);
  assert.deepEqual(calls.map(c => c.provider), ['gemini', 'deepseek', 'deepseek']); assert.ok(calls.every(c => c.correctKey && !c.bodyContainsKey));
  assert.equal((await rows(app, 'units')).length, 0); checks.push('youtube-worker-fallback-and-cooldown-with-separate-keys', 'validated-output-awaits-lesson-approval');
  await app.reload(); await openCapture(app, source.exact); await app.getByRole('button', { name: 'Duyệt & đưa vào lịch ôn' }).click();
  await waitUntil(async () => (await rows(app, 'units')).length === 2); checks.push('fallback-analysis-creates-independent-lessons');
  await closeCapture(app);
  const invalidId = await seed('Lần hai — dữ liệu sai'); await worker.evaluate(() => { globalThis.aiMode = 'invalid'; }); await app.reload();
  // The most recently saved capture is first in the compact library.
  await app.locator('.capture-tile .tile-open').first().click(); await app.getByRole('button', { name: 'Nhờ AI phân tích', exact: true }).click();
  await waitUntil(async () => !!(await rows(app, 'captures')).find(c => c.id === invalidId)?.error);
  const invalid = (await rows(app, 'captures')).find(c => c.id === invalidId); assert.equal(invalid.analysis, undefined); assert.equal((await rows(app, 'units')).length, 2);
  checks.push('invalid-json-never-overwrites-approved-library');
  await app.goto(`${url}#insights`); await app.getByText('Các lần gọi gần đây', { exact: true }).click();
  await app.getByText(/deepseek \/ deepseek-flash · Dự phòng/).first().waitFor(); checks.push('usage-shows-actual-provider-and-fallback');
  await app.goto(`${url}#settings`); await app.locator('.ai-connection').nth(1).locator('summary').click();
  await app.getByRole('button', { name: 'Đưa DeepSeek lên trên', exact: true }).click();
  await app.getByLabel('Tự chuyển sang AI dự phòng khi gặp lỗi', { exact: true }).uncheck();
  await app.getByRole('button', { name: 'Lưu cấu hình AI', exact: true }).click(); await app.getByRole('status').filter({ hasText: 'Đã lưu cấu hình AI' }).waitFor();
  await app.reload(); assert.ok((await app.locator('.ai-connection').first().locator('summary').textContent()).includes('DeepSeek'));
  assert.equal(await app.getByLabel('Tự chuyển sang AI dự phòng khi gặp lỗi', { exact: true }).isChecked(), false); checks.push('reorder-and-fallback-toggle-persist');
  const downloadPromise = app.waitForEvent('download'); await app.getByRole('button', { name: 'Xuất toàn bộ JSON', exact: true }).click();
  const download = await downloadPromise; const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const backup = Buffer.concat(chunks).toString('utf8'); assert.ok(!backup.includes('fixture-gemini-browser') && !backup.includes('fixture-deepseek-browser'));
  assert.equal(JSON.parse(backup).settings.ai.connections[0].provider, 'deepseek'); checks.push('portable-config-without-api-keys');
  assert.deepEqual(pageErrors, []);
  await writeFile('test-results/ai-fallback-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), browser: context.browser()?.version(), profilePath, checks, pageErrors, note: 'Real extension UI, worker and IndexedDB; native permission approval and API responses are fixtures. Permission origins are asserted. No live AI keys.' }, null, 2));
  console.log(`AI FALLBACK E2E PASS (${checks.length} checks)`);
} catch (error) { for (const [i, page] of context.pages().entries()) { console.log('UI diagnostic', await page.evaluate(() => ({ status: Array.from(document.querySelectorAll('[role=status]')).map(x => x.textContent), permissions: globalThis.permissionTrace })).catch(() => ({}))); await page.screenshot({ path: `test-results/ai-fallback-failure-${i}.png` }).catch(() => undefined); } throw error; }
finally { await context.close(); }
