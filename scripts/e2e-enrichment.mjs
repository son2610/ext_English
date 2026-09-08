import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { checkLibraryManagement } from './e2e-library.mjs';

await mkdir('test-results', { recursive: true });
const compiled = await build({ entryPoints: ['tests/fixtures.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { analysis } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const videoId = 'dQw4w9WgXcQ', secondId = 'abcdefghijk';
const sampleRate = 8000, length = sampleRate * 120, wav = Buffer.alloc(44 + length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(Math.sin(i / sampleRate * 440 * Math.PI * 2) * 600), 44 + i * 2);
function fixture(url) {
  const fallback = url.includes('fallback=1'); const foreign = url.includes('foreign=1'); const signed = url.includes('signed=1');
  return `<!doctype html><html><head><title>Phụ đề để kiểm thử</title><style>body{margin:30px;background:#fff;font:16px system-ui}main{display:flex;gap:24px}.html5-video-player{position:relative;width:720px}video{width:720px;height:400px;background:#151d18}#secondary{width:380px}.ytp-progress-bar{height:14px;background:#bbb;position:relative}.ytp-caption-window-container{padding:12px;background:#e8e8e8}.ytp-caption-segment{font:20px Georgia}</style></head><body><main><div class="html5-video-player" id="movie_player"><video controls preload="auto" src="https://www.youtube.com/__machdoc.wav"></video><div class="ytp-progress-bar"></div><div class="ytp-caption-window-container"><span class="ytp-caption-segment">${foreign ? 'Đây là phụ đề tiếng Việt' : 'if I had known'}</span></div></div><div id="secondary"></div></main><script>
    const video=document.querySelector('video');
    ${!fallback && !signed ? `const track=video.addTextTrack('captions','English','en'); track.mode='hidden'; track.addCue(new VTTCue(1,3,'The first sentence.')); track.addCue(new VTTCue(5.25,9.8,'If I had known, I would have helped.')); track.addCue(new VTTCue(10,13,'Now we continue.'));` : ''}
    document.getElementById('movie_player').getPlayerResponse=()=>({videoDetails:{videoId:new URL(location.href).searchParams.get('v')||location.pathname.split('/').pop()},captions:{playerCaptionsTracklistRenderer:{captionTracks:${signed ? `[{baseUrl:'https://www.youtube.com/api/timedtext?v=${videoId}&signature=fixture',languageCode:'en',kind:'asr'}]` : '[]'}}}});
    document.getElementById('movie_player').getOption=()=>({languageCode:'${foreign ? 'vi' : 'en'}'});
  </script></body></html>`;
}
let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
let context; const errors = []; const checks = [];
async function shadow(page, selector, action) {
  const cdp = await context.newCDPSession(page); const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  function find(node) { const attrs = Object.fromEntries(Array.from({ length: (node.attributes?.length ?? 0) / 2 }, (_, i) => [node.attributes[i * 2], node.attributes[i * 2 + 1]])); if (selector(node, attrs)) return node; for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) { const match = find(child); if (match) return match; } }
  const node = find(root); assert.ok(node, 'Closed shadow node must exist');
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: node.backendNodeId });
  const value = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: action, returnByValue: true, awaitPromise: true }); await cdp.detach();
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.text); return value.result.value;
}
const panel = (_, attrs) => attrs['data-mach-doc'] === 'youtube';
const dialog = (node, attrs) => node.nodeName === 'DIALOG' && 'open' in attrs;
async function clickClass(page, className) { return shadow(page, (_, attrs) => attrs.class?.split(' ').includes(className), 'function(){this.click()}'); }
async function database(page, store) { return page.evaluate(async name => { const d = await new Promise((resolve, reject) => { const request = indexedDB.open('mach-doc'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); const tx = d.transaction(name); const rows = await new Promise(resolve => { const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); }); d.close(); return rows; }, store); }
async function waitUntil(condition, label) { for (let i = 0; i < 80; i++) { if (await condition()) { console.log(`PASS: ${label}`); return; } await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out: ${label}`); }
try {
  const profilePath = resolve(`test-results/enrichment-profile-${Date.now()}`);
  context = await chromium.launchPersistentContext(profilePath, { executablePath, headless: true, viewport: { width: 1440, height: 1000 }, args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`, '--autoplay-policy=no-user-gesture-required'] });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://www.youtube.com/**', route => {
    if (!route.request().url().includes('__machdoc.wav')) return route.fulfill({ status: 200, contentType: 'text/html', body: fixture(route.request().url()) });
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/); const start = range ? Number(range[1]) : 0; const end = range?.[2] ? Number(range[2]) : wav.length - 1;
    return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) }, body: wav.subarray(start, end + 1) });
  });
  await context.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: fixture(route.request().url()) }));
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); const extensionId = new URL(worker.url()).host;
  const app = await context.newPage(); await app.goto(`chrome-extension://${extensionId}/app.html#library`); await app.getByRole('heading', { name: 'Những điều bạn muốn hiểu.' }).waitFor();
  const web = await context.newPage(); await web.goto(`https://www.youtube.com/watch?v=${videoId}&list=PLfixture`);
  await web.locator('[data-mach-doc="youtube"]').waitFor(); await web.waitForFunction(() => document.querySelector('video').readyState >= 1);
  assert.equal(await web.locator('[data-mach-doc="capture"]').evaluate(el => getComputedStyle(el).display), 'none');
  await web.waitForFunction(() => document.querySelector('video').seekable.length > 0);
  await web.locator('video').evaluate(async video => { await video.play(); video.currentTime = 11.2; });
  await waitUntil(async () => await web.locator('video').evaluate(v => v.currentTime > 11 && !v.seeking), 'initial media seek');
  await clickClass(web, 'save'); await web.locator('[data-mach-doc="video-editor"]').waitFor({ state: 'attached' });
  const selected = await shadow(web, dialog, 'function(){return {count:this.querySelectorAll(".choice").length,selected:this.querySelector("input:checked").closest(".choice").textContent}}');
  assert.equal(selected.count, 3); assert.ok(selected.selected.includes('If I had known')); assert.equal(await web.locator('video').evaluate(v => v.paused), true);
  await web.screenshot({ path: 'test-results/youtube-capture.png' });
  await shadow(web, dialog, 'function(){this.querySelector(".note").value="Giả định về quá khứ";this.querySelector("form").requestSubmit()}');
  await waitUntil(async () => (await database(app, 'captures')).length === 1, 'capture saved');
  const [captured] = await database(app, 'captures'); assert.equal(captured.source.video.start, 5.25); assert.equal(captured.source.video.end, 9.8); assert.equal(captured.status, 'saved'); assert.equal(captured.deferredAnalysis, true); assert.equal((await database(app, 'usage')).length, 0);
  checks.push('native-cues-delayed-selection-exact-timing', 'pause-on-capture', 'video-ai-deferred');
  await checkLibraryManagement({ app, web, shadow, dialog, clickClass, database, waitUntil, checks, captured });
  await web.reload(); await web.locator('[data-mach-doc="video-markers"]').waitFor(); assert.equal(await web.locator('[data-mach-doc="video-editor"]').count(), 0);
  await web.screenshot({ path: 'test-results/youtube-notes.png' });
  await clickClass(web, 'note'); await waitUntil(async () => await web.locator('video').evaluate(v => v.currentTime >= 5.25 && v.currentTime < 7), 'note seek');
  await clickClass(web, 'rewatch'); await waitUntil(async () => await web.locator('.ytp-caption-window-container').evaluate(e => getComputedStyle(e).visibility === 'hidden'), 'hide first caption');
  await web.locator('video').evaluate(v => { v.currentTime = 9.81; });
  await waitUntil(async () => await web.locator('.ytp-caption-window-container').evaluate(e => getComputedStyle(e).visibility === 'visible'), 'show repeated caption');
  await clickClass(web, 'stop'); assert.equal(await web.locator('video').evaluate(v => v.paused), true);
  checks.push('existing-notes-no-modal', 'progress-markers-and-seek', 'rewatch-repeat-hide-restore');
  // Authorize a batch only through the end-of-video prompt. No API key has been stored.
  await web.locator('video').evaluate(v => v.dispatchEvent(new Event('ended')));
  await waitUntil(async () => await shadow(web, (_, attrs) => attrs.class?.includes('banner'), 'function(){return this.textContent.includes("Phân tích lô")}'), 'end prompt');
  await shadow(web, (_, attrs) => attrs.class?.includes('banner'), 'function(){this.querySelector("button").click()}');
  await waitUntil(async () => (await database(app, 'captures'))[0].status === 'queued', 'released batch'); checks.push('end-video-opt-in-batch');
  await app.evaluate(async ({ analysis, id }) => { const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction('captures', 'readwrite'); const store = tx.objectStore('captures'); const r = store.get(id); r.onsuccess = () => store.put({ ...r.result, status: 'ready', analysis: { ...analysis, transcript: { textEn: r.result.source.exact, uncertain: true, warningVi: 'Cần nghe để xác nhận câu ASR.', changes: [{ original: 'if i had known', corrected: 'If I had known', reasonVi: 'Phục hồi viết hoa.' }] } } }); await new Promise(resolve => tx.oncomplete = resolve); d.close(); }, { analysis, id: captured.id });
  await app.reload(); const approve = app.getByRole('button', { name: 'Duyệt & đưa vào lịch ôn' }); await approve.waitFor(); assert.equal(await approve.isDisabled(), true);
  await app.getByLabel('Tôi đã nghe lại và xác nhận câu phục hồi đúng').check(); await waitUntil(() => approve.isEnabled(), 'transcript approval'); await approve.click();
  await app.getByText('Đã tạo / ghép các đơn vị học và lên lịch ôn.').waitFor(); checks.push('uncertain-transcript-approval-gate');
  await app.getByRole('link', { name: /^Ôn tập/ }).click(); await app.getByRole('button', { name: 'Đổi sang nghe chép chính tả' }).click();
  assert.equal(await app.locator('.source-quote').count(), 0); assert.equal(await app.locator('.model-answer').count(), 0);
  await app.getByRole('button', { name: /^▶ Nghe đoạn gốc/ }).click(); const frame = app.locator('iframe[title="Đoạn video gốc để luyện nghe"]'); await frame.waitFor(); assert.ok((await frame.getAttribute('src')).includes('start=5&end=10')); await new Promise(resolve => setTimeout(resolve, 1200)); const embedded = app.frames().find(f => f.url().includes('youtube-nocookie')); assert.equal(await embedded.locator('[data-mach-doc="youtube"]').count(), 0); assert.equal(await embedded.locator('.ytp-caption-window-container').evaluate(e => getComputedStyle(e).visibility), 'hidden');
  await app.getByLabel('Câu trả lời của bạn').fill('If I have known I would helped'); await app.getByRole('button', { name: 'So sánh lời gốc · Không dùng AI' }).click();
  await app.locator('.dictation-diff').waitFor(); assert.equal((await database(app, 'assessments')).length, 1); assert.equal((await database(app, 'reviews')).length, 0);
  await app.screenshot({ path: 'test-results/dictation.png', fullPage: true }); checks.push('dictation-source-audio-and-word-diff', 'assessment-durable-before-rating');
  await app.getByRole('button', { name: /^Chưa nhớ / }).click();
  await app.getByRole('link', { name: 'Hồ sơ & lộ trình' }).click(); await app.getByRole('heading', { name: 'Bản đồ ngữ pháp' }).waitFor();
  await app.screenshot({ path: 'test-results/insights.png', fullPage: true });
  await app.setViewportSize({ width: 760, height: 900 }); await app.screenshot({ path: 'test-results/insights-narrow.png', fullPage: true }); await app.setViewportSize({ width: 1440, height: 1000 }); checks.push('error-profile-grammar-map-frequency-responsive');
  // Source playback uses a real extension message, and resumes the clip on the source page.
  // Playwright cannot intercept the first request of a tab created through chrome.tabs.create.
  // Open that one test tab blank, verify its requested URL, then navigate through the fixture route.
  await worker.evaluate(() => { const create = chrome.tabs.create.bind(chrome.tabs); chrome.tabs.create = properties => { chrome.tabs.create = create; globalThis.requestedClipUrl = properties.url; return create({ ...properties, url: 'about:blank' }); }; });
  await app.getByRole('link', { name: 'Thư viện ngữ cảnh' }).click(); const pagePromise = context.waitForEvent('page');
  await app.getByRole('button', { name: 'Mở đoạn trên YouTube ↗' }).click(); const opened = await pagePromise;
  const requested = await worker.evaluate(() => globalThis.requestedClipUrl); assert.equal(requested, `https://www.youtube.com/watch?v=${videoId}&t=5s&md-review=1`); await opened.goto(requested);
  await waitUntil(async () => await opened.locator('video').evaluate(v => v.currentTime >= 5.25 && v.currentTime < 11), 'source clip seek');
  await waitUntil(async () => await opened.locator('video').evaluate(v => v.paused && v.currentTime >= 9.8 && v.currentTime < 11), 'source clip stop'); await opened.close(); checks.push('source-player-exact-clip-stop');
  // SPA navigation must detach the previous video's notes and capture from the new ID.
  await web.bringToFront(); await web.evaluate(id => { history.pushState({}, '', `/shorts/${id}`); document.dispatchEvent(new Event('yt-navigate-finish')); window.dispatchEvent(new Event('yt-navigate-finish')); }, secondId);
  await waitUntil(async () => await shadow(web, (_, attrs) => attrs.class === 'notes', 'function(){return this.textContent.includes("Chưa có note")}'), 'SPA clears old notes'); checks.push('shorts-spa-video-switch');
  // Fallback uses a rolling history and visibly estimated times; non-English cannot enter AI queue.
  await web.goto(`https://www.youtube.com/watch?v=${secondId}&fallback=1&foreign=1`); await web.locator('[data-mach-doc="youtube"]').waitFor(); await web.waitForFunction(() => document.querySelector('video').readyState >= 1);
  await web.locator('video').evaluate(async v => { v.currentTime = 20; await v.play(); }); await new Promise(resolve => setTimeout(resolve, 2200));
  await clickClass(web, 'save'); await web.locator('[data-mach-doc="video-editor"]').waitFor({ state: 'attached' });
  const fallback = await shadow(web, dialog, 'function(){return {language:this.querySelector("select").value,text:this.textContent}}'); assert.equal(fallback.language, 'unknown'); assert.ok(fallback.text.includes('Mốc ước lượng'));
  await shadow(web, dialog, 'function(){this.querySelector("form").requestSubmit()}'); const error = await shadow(web, dialog, 'function(){return this.querySelector(".error").textContent}'); assert.ok(error.includes('Chưa xác nhận tiếng Anh'));
  await web.keyboard.press('Escape'); checks.push('observed-caption-fallback', 'non-english-capture-guard');
  // Signed metadata is relayed through MAIN, fetched only through the validated worker endpoint.
  await worker.evaluate(() => { const original = globalThis.fetch; globalThis.fetch = async (input, options) => String(input).startsWith('https://www.youtube.com/api/timedtext') ? new Response(JSON.stringify({ events: [{ tStartMs: 5250, dDurationMs: 4550, segs: [{ utf8: 'if I had known I would have helped' }] }] }), { status: 200 }) : original(input, options); });
  await web.goto(`https://www.youtube.com/watch?v=${videoId}&signed=1`); await web.locator('[data-mach-doc="youtube"]').waitFor(); await web.waitForFunction(() => document.querySelector('video').readyState >= 1);
  await waitUntil(async () => await shadow(web, (_, attrs) => attrs.class === 'status', 'function(){return this.textContent.includes("tự động")}'), 'signed track');
  await web.locator('video').evaluate(v => { v.currentTime = 11; }); await clickClass(web, 'save'); await web.locator('[data-mach-doc="video-editor"]').waitFor({ state: 'attached' });
  const signed = await shadow(web, dialog, 'function(){return this.textContent}'); assert.ok(signed.includes('if I had known I would have helped')); assert.ok(signed.includes('Mốc từ track phụ đề')); await web.keyboard.press('Escape'); checks.push('main-bridge-signed-track-adapter');
  // A command sent to a playing embedded video opens the modal on the parent page.
  await context.route('https://reader.example.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; frame-src https://www.youtube.com; style-src 'unsafe-inline'" }, body: `<h1>Bài đọc có video nhúng</h1><iframe title="Video trong bài đọc" width="850" height="490" src="https://www.youtube.com/embed/${secondId}"></iframe>` }));
  const beforeTabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id));
  const parent = await context.newPage(); await parent.goto('https://reader.example.test/article'); const embeddedVideo = parent.frames().find(f => f.url().includes('/embed/'));
  await embeddedVideo.locator('video').waitFor(); await embeddedVideo.waitForFunction(() => document.querySelector('video').seekable.length > 0);
  await embeddedVideo.locator('video').evaluate(async v => { await v.play(); v.currentTime = 11.2; }); await embeddedVideo.waitForFunction(() => document.querySelector('video').currentTime > 11 && !document.querySelector('video').seeking);
  const parentId = await worker.evaluate(async old => (await chrome.tabs.query({})).find(t => !old.includes(t.id)).id, beforeTabs);
  const commands = await worker.evaluate(() => chrome.commands.getAll()); assert.ok(commands.some(c => c.name === 'capture-video'));
  await worker.evaluate(id => chrome.tabs.sendMessage(id, { type: 'capture-video' }), parentId);
  await parent.locator('[data-mach-doc="video-editor"]').waitFor({ state: 'attached' });
  const parentDialog = await shadow(parent, dialog, 'function(){const r=this.getBoundingClientRect();return {width:r.width,height:r.height,text:this.textContent}}'); assert.ok(parentDialog.width > 500 && parentDialog.text.includes('If I had known'));
  await parent.screenshot({ path: 'test-results/youtube-iframe-capture.png' }); await parent.keyboard.press('Escape'); await parent.close(); checks.push('video-command-cross-origin-iframe-parent-dialog');
  // Exercise new UI requests using deterministic Gemini/dictionary responses and a fake key.
  await app.evaluate(async () => { await chrome.storage.local.set({ geminiKey: 'fake-key-not-sent' }); const d = await new Promise(resolve => { const r = indexedDB.open('mach-doc'); r.onsuccess = () => resolve(r.result); }); const tx = d.transaction(['meta', 'reviews'], 'readwrite'); const settings = tx.objectStore('meta').get('settings'); settings.onsuccess = () => tx.objectStore('meta').put({ key: 'settings', value: { ...(settings.result?.value ?? {}), targetedAutomatic: false } }); const query = tx.objectStore('reviews').getAll(); query.onsuccess = () => { const end = new Date(); end.setHours(0,0,0,0); end.setDate(end.getDate()-(end.getDay()+6)%7); if (query.result[0]) tx.objectStore('reviews').put({ ...query.result[0], id: crypto.randomUUID(), at: end.getTime()-2*86400000 }); }; await new Promise(resolve => tx.oncomplete = resolve); d.close(); });
  let mockedCalls = 0;
  await app.route('https://generativelanguage.googleapis.com/**', route => {
    mockedCalls++; const input = JSON.parse(route.request().postDataJSON().contents[0].parts[0].text); let result;
    if (input.task.includes('Tạo MỘT bài tập')) result = { instructionVi: 'Viết lại điều bạn đã có thể làm hôm qua nếu biết sớm hơn.', answerEn: 'If I had known earlier, I would have helped.', explanationVi: 'Điều kiện trái quá khứ dùng had + V3; tiếng Việt không chia động từ theo cùng cách.', category: 'tense_aspect' };
    else if (input.task.startsWith('Viết một đoạn')) result = { titleVi: 'Một thay đổi nhỏ', textEn: 'If I had known, I would have helped. Next time, I will read the notes.', meaningVi: 'Nếu biết trước, tôi đã giúp. Lần tới tôi sẽ đọc ghi chú.', coverage: input.data.map(u => ({ unitId: u.id, quote: 'If I had known, I would have helped.' })) };
    else if (input.task.includes('Giải thích LẠI')) result = { explanationVi: 'Hãy tưởng tượng quay lại hôm qua: điều đó đã không xảy ra, nên dùng had + V3.' };
    else result = { correct: false, score: 65, feedbackVi: 'Hãy sửa thời điểm giả định trong quá khứ.', correctedEn: 'If I had known earlier, I would have helped.', errors: [{ original: 'have known', correction: 'had known', reasonVi: 'Điều kiện trái quá khứ.', category: 'tense_aspect', l1NoteVi: 'Tiếng Việt dùng từ chỉ thời gian; tiếng Anh còn thay dạng động từ.' }] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }], usageMetadata: { totalTokenCount: 140 } }) });
  });
  await app.route('https://api.dictionaryapi.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ phonetic: '/help/', meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To assist someone.', example: 'I can help.' }] }], sourceUrls: ['https://en.wiktionary.org/wiki/help'], license: { name: 'CC BY-SA 3.0' } }]) }));
  await app.bringToFront(); await app.reload(); await app.getByRole('link', { name: 'Hồ sơ & lộ trình' }).click();
  await app.getByRole('button', { name: 'Tạo bài nhắm vào lỗi thường gặp nhất' }).click(); await app.getByLabel('Câu trả lời tiếng Anh').fill('If I have known earlier I would help.');
  await app.getByRole('button', { name: 'Chấm & lưu vào hồ sơ lỗi' }).click(); await app.getByText('Hãy sửa thời điểm giả định trong quá khứ.', { exact: true }).waitFor();
  const assessments = await database(app, 'assessments'); assert.ok(assessments.some(a => a.mode === 'targeted' && a.grade.errors[0].l1NoteVi)); checks.push('targeted-production-strong-model-ui');
  await app.getByRole('button', { name: 'Tạo / tiếp tục tổng hợp tuần trước' }).click(); await app.getByText(/Một thay đổi nhỏ/).waitFor(); assert.equal((await database(app, 'weekly')).length, 1); checks.push('weekly-coverage-ui');
  await app.getByRole('link', { name: 'Thư viện ngữ cảnh' }).click(); await app.getByText('Kiểm tra nội dung & ưu tiên học', { exact: true }).first().click();
  const tools = app.locator('.unit-tools').first(); await tools.getByLabel('Từ / cụm cần đối chiếu từ điển').fill('help'); await tools.getByRole('button', { name: 'Tra nguồn từ điển' }).click(); await tools.getByText('To assist someone.', { exact: false }).waitFor();
  await tools.getByRole('button', { name: 'Giải thích theo cách khác' }).click(); await tools.getByText(/Hãy tưởng tượng quay lại hôm qua/).waitFor();
  await tools.getByLabel('Nội dung sai / điều cần kiểm tra').fill('Cần kiểm tra tên cấu trúc.'); await tools.getByRole('button', { name: 'Lưu báo lỗi & tạm dừng' }).click();
  await waitUntil(async () => (await database(app, 'units')).some(u => u.reportedIssue && u.suspended), 'reported unit suspended'); assert.equal((await database(app, 'dictionary')).length, 1); assert.equal((await database(app, 'usage')).length, mockedCalls);
  checks.push('dictionary-corroboration-explanation-report', 'api-usage-model-routing-ui');
  await app.evaluate(() => chrome.storage.local.remove('geminiKey'));
  assert.deepEqual(errors, []); await writeFile('test-results/enrichment-e2e-report.json', JSON.stringify({ status: 'passed', at: new Date().toISOString(), browser: context.browser()?.version(), checks, pageErrors: errors, note: 'YouTube fixture pages and synthetic audio; real extension, native TextTrack, native media controls, Shadow DOM and IndexedDB. No live Gemini call.' }, null, 2));
  console.log(`ENRICHMENT E2E PASS (${checks.length} checks)`);
} catch (error) { for (const [index, page] of (context?.pages() ?? []).entries()) { try { await page.screenshot({ path: `test-results/enrichment-failure-${index}.png` }); } catch {} } console.error('Page errors:', errors); throw error; }
finally { await context?.close(); }
