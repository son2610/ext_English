import { chromium } from 'playwright';
import { build } from 'esbuild';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const compiled = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { source, analysis } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
await mkdir('test-results', { recursive: true });
const profilePath = resolve(`test-results/gemini-profile-${Date.now()}`);
const context = await chromium.launchPersistentContext(profilePath, { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`] });
const checks = [], pageErrors = [], warnings = [];
async function waitUntil(fn) { for (let n = 0; n < 80; n++) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('Timed out waiting for worker'); }
async function rows(page, name) { return page.evaluate(async name => { const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction(name); const rows = await new Promise(resolve => { const r = tx.objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); }); d.close(); return rows; }, name); }
try {
  await context.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Player fixture</title><p>Player fixture</p>' }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const app = await context.newPage(); app.on('pageerror', error => pageErrors.push(error.message));
  const cdp = await context.newCDPSession(app); await cdp.send('Log.enable'); cdp.on('Log.entryAdded', ({ entry }) => { if (/allowfullscreen/i.test(entry.text)) warnings.push(entry.text); });
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#library`);
  await app.getByRole('heading', { name: 'Những điều bạn muốn hiểu.' }).waitFor();
  await worker.evaluate(async ({ analysis, source }) => {
    await chrome.storage.local.set({ geminiKey: 'fake-gemini-e2e-key' });
    globalThis.aiMode = 'schema'; globalThis.aiCalls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      if (!String(input).startsWith('https://generativelanguage.googleapis.com/')) return original(input, options);
      const body = JSON.parse(options.body); const { data } = JSON.parse(body.contents[0].parts[0].text);
      const stage = 'raw' in data ? 'transcript' : 'analysis'; const structured = !!body.generationConfig.responseJsonSchema;
      globalThis.aiCalls.push({ stage, structured, url: String(input) });
      if (globalThis.aiMode === 'auth') return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid: fake-gemini-e2e-key', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 });
      if (globalThis.aiMode === 'schema' && structured) return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The input schema produces a constraint with too many states for serving.' } }), { status: 400 });
      const result = stage === 'transcript' ? { textEn: data.raw, uncertain: false, warningVi: '', changes: [] } : analysis;
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }], usageMetadata: { totalTokenCount: 120 } }), { status: 200 });
    };
  }, { analysis, source });
  async function seed(exact, start) {
    return app.evaluate(async ({ source, exact, start }) => {
      const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction(['captures', 'meta'], 'readwrite');
      const id = crypto.randomUUID(), now = Date.now();
      tx.objectStore('meta').put({ key: 'settings', value: { model: 'gemini-3.5-flash', autoBackup: false, targetedAutomatic: false } });
      tx.objectStore('captures').put({ id, source: { ...source, exact, video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start, end: start + 4.5, language: 'en', automatic: true, timing: 'track', captionSource: 'text-track' } }, note: '', status: 'saved', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, unitsCreated: false });
      await new Promise(resolve => tx.oncomplete = resolve); d.close(); return id;
    }, { source, exact, start });
  }
  const first = await seed(source.exact, 5.25); await app.reload();
  await app.getByRole('button', { name: 'Nhờ AI phân tích', exact: true }).click();
  await waitUntil(async () => (await rows(app, 'captures')).find(c => c.id === first)?.status === 'ready');
  const calls = await worker.evaluate(() => globalThis.aiCalls);
  assert.deepEqual(calls.map(c => [c.stage, c.structured]), [['transcript', true], ['transcript', false], ['analysis', true], ['analysis', false]]);
  assert.ok(calls.every(c => c.url.includes('/gemini-3.5-flash:'))); assert.equal((await rows(app, 'units')).length, 0);
  await app.reload(); await app.getByRole('button', { name: 'Duyệt & đưa vào lịch ôn' }).click();
  await waitUntil(async () => (await rows(app, 'units')).length === 2); checks.push('video-worker-both-stages-schema-fallback', 'same-model-local-validation-explicit-approval');
  await app.getByRole('button', { name: /^▶ Nghe đoạn gốc/ }).click();
  const frame = app.locator('iframe[title="Đoạn video gốc để luyện nghe"]'); await frame.waitFor();
  assert.equal(await frame.evaluate(e => e.hasAttribute('allowfullscreen')), false); assert.equal(await frame.evaluate(e => e.featurePolicy.allowsFeature('fullscreen')), true);
  await app.getByRole('button', { name: 'Đóng trình phát' }).click(); checks.push('fullscreen-permission-without-duplicate-warning');
  const second = await seed('Another sentence.', 20); await worker.evaluate(() => { globalThis.aiMode = 'auth'; }); await app.reload();
  const card = app.locator('.capture-card').filter({ has: app.locator('.source-quote', { hasText: /^Another sentence\.$/ }) });
  await card.getByRole('button', { name: 'Nhờ AI phân tích', exact: true }).click();
  await waitUntil(async () => (await rows(app, 'captures')).find(c => c.id === second)?.status === 'error');
  const failed = (await rows(app, 'captures')).find(c => c.id === second);
  assert.ok(failed.error.includes('Phục hồi phụ đề · gemini-3.5-flash · HTTP 400 INVALID_ARGUMENT')); assert.ok(!failed.error.includes('fake-gemini-e2e-key'));
  assert.equal((await worker.evaluate(() => globalThis.aiCalls)).length, 5); await app.reload(); await card.locator('.error-text').waitFor();
  await app.screenshot({ path: 'test-results/gemini-error-details.png', fullPage: true }); checks.push('http-400-details-redacted-visible-no-auth-retry');
  await worker.evaluate(() => { globalThis.aiMode = 'success'; });
  await card.getByRole('button', { name: 'Nhờ AI phân tích', exact: true }).click();
  await waitUntil(async () => (await rows(app, 'captures')).find(c => c.id === second)?.status === 'ready');
  assert.equal((await rows(app, 'usage')).length, 7); checks.push('retry-existing-capture-after-error-counts-all-requests');
  assert.ok((await app.locator('footer').textContent()).includes('0.2.3')); assert.deepEqual(warnings, []); assert.deepEqual(pageErrors, []);
  await worker.evaluate(() => chrome.storage.local.remove('geminiKey'));
  await writeFile('test-results/gemini-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), browser: context.browser()?.version(), profilePath, checks, pageErrors, warnings, note: 'Real extension UI, service worker, IndexedDB; Gemini responses and embedded player are fixtures. No live Gemini request.' }, null, 2));
  console.log(`GEMINI E2E PASS (${checks.length} checks)`);
} catch (error) { for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `test-results/gemini-failure-${i}.png` }).catch(() => undefined); throw error; }
finally { await context.close(); }
