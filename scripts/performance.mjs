import { chromium } from 'playwright';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir, access, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const fixtureBuild = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { source, analysis } = await import(`data:text/javascript;base64,${Buffer.from(fixtureBuild.outputFiles[0].text).toString('base64')}`);
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
const context = await chromium.launchPersistentContext(resolve(`test-results/performance-profile-${Date.now()}`), { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`] });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); const id = new URL(worker.url()).host;
  const app = await context.newPage(); await app.goto(`chrome-extension://${id}/app.html`); await app.getByRole('heading', { name: /Một chút tiếng Anh/ }).waitFor();
  await app.evaluate(async ({ source, knowledge }) => {
    const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction(['units', 'captures', 'meta'], 'readwrite');
    const captureId = crypto.randomUUID(), now = Date.now(); tx.objectStore('captures').put({ id: captureId, source, note: '', status: 'saved', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, unitsCreated: true });
    for (let i = 0; i < 3000; i++) tx.objectStore('units').put({ id: crypto.randomUUID(), canonical: `phrase:item-${i}`, knowledge: { ...knowledge, kind: 'phrase', key: `item-${i}`, form: `work on item ${i}` }, captureIds: [captureId], schedule: { due: now, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, state: 0, learning_steps: 0 }, failures: 0, suspended: false, leech: false, encounters: 0, createdAt: now, updatedAt: now });
    tx.objectStore('meta').put({ key: 'settings', value: { highlighting: false, inflectionMatching: true, autoBackup: false } }); await new Promise(resolve => tx.oncomplete = resolve); d.close();
  }, { source, knowledge: analysis.knowledge[0] });
  await context.route('https://performance.example.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>body{font:16px system-ui;margin:32px}input{position:fixed;right:30px;top:25px;width:350px;padding:15px;z-index:5}p{margin:12px}</style><input aria-label="Gõ khi đang đối chiếu"><main>${Array.from({ length: 10000 }, (_, i) => `<p>We worked on item ${i % 3000}. This is a paragraph in a long, changing document.</p>`).join('')}</main>` }));
  const web = await context.newPage(); const cdp = await context.newCDPSession(web); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await web.goto('https://performance.example.test/read'); await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(await web.evaluate(() => CSS.highlights.has('mach-doc-known')), false);
  await web.evaluate(() => { globalThis.measurements = { tasks: [], keys: [] }; new PerformanceObserver(list => measurements.tasks.push(...list.getEntries().map(e => ({ duration: e.duration, startTime: e.startTime })))).observe({ type: 'longtask', buffered: false }); document.querySelector('input').addEventListener('keydown', () => { const at = performance.now(); requestAnimationFrame(() => measurements.keys.push(performance.now() - at)); }); });
  const started = Date.now();
  await app.evaluate(async () => { const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'settings', value: { highlighting: true, inflectionMatching: true, autoBackup: false } }); await new Promise(resolve => tx.oncomplete = resolve); d.close(); await chrome.runtime.sendMessage({ type: 'settings-changed' }); });
  await web.locator('input').pressSequentially('The browser should remain responsive while reading.', { delay: 12 });
  await web.waitForFunction(() => CSS.highlights.get('mach-doc-known')?.size > 0, { timeout: 20000 });
  const elapsed = Date.now() - started;
  await web.evaluate(() => { const wrapper = document.createElement('section'); wrapper.id = 'new-content'; for (let i = 0; i < 300; i++) { const p = document.createElement('p'); p.textContent = `We wrote nothing yet, but worked on item ${i}.`; wrapper.append(p); } document.querySelector('main').prepend(wrapper); wrapper.scrollIntoView(); });
  await web.waitForFunction(() => Array.from(CSS.highlights.get('mach-doc-known') ?? []).some(range => range.startContainer.parentElement.closest('#new-content')), undefined, { timeout: 15000 });
  const result = await web.evaluate(() => { const keys = measurements.keys.slice().sort((a,b) => a-b); return { ranges: CSS.highlights.get('mach-doc-known')?.size ?? 0, dynamicHighlighted: Array.from(CSS.highlights.get('mach-doc-known') ?? []).some(range => range.startContainer.parentElement.closest('#new-content')), paragraphsIntact: Array.from(document.querySelectorAll('#new-content p')).every(p => p.childNodes.length === 1), longTasks: measurements.tasks, keyToNextFrameP95Ms: keys[Math.floor(keys.length * .95)] ?? null, maximumKeyToFrameMs: Math.max(0,...keys), keySamples: keys.length }; });
  assert.ok(result.ranges > 0 && result.ranges <= 500 && result.dynamicHighlighted && result.paragraphsIntact, JSON.stringify(result)); assert.ok(result.keyToNextFrameP95Ms !== null && result.keyToNextFrameP95Ms < 150);
  const report = { status: 'passed', at: new Date().toISOString(), browser: context.browser()?.version(), cpuThrottle: 4, storedUnits: 3000, maximumExpandedPatterns: 12000, initialParagraphs: 10000, appendedParagraphs: 300, millisecondsIncludingTypingAndActivation: elapsed, ...result, caveat: 'Synthetic page on this machine. Long tasks include Chrome layout/GC and fixture mutations. This is not a guarantee of zero perceptible delay on arbitrary websites.' };
  await writeFile('test-results/performance-report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); }
