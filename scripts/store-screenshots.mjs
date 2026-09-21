// Chrome Web Store screenshots for the 0.6.0 features, from the real dist build with demo data.
// 04: Lab matching board. 05: toolbar popup on a brand canvas. Both 1280 × 800, full bleed.
import { chromium } from 'playwright';
import { access, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let executablePath = process.env.CHROMIUM_PATH;
for (const path of [chromium.executablePath(), 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe']) {
  if (!executablePath) { try { await access(path); executablePath = path; } catch {} }
}
await mkdir('artifacts/store', { recursive: true });
const phrases = [
  ['Keep me in the loop', 'Nhớ cập nhật cho tôi', 'Nhắn đồng nghiệp: nhớ cập nhật cho mình khi có tin mới nhé.', 'Please keep me in the loop when there is any news.'],
  ['Touch base', 'Trao đổi nhanh, cập nhật tình hình'], ['On the same page', 'Cùng quan điểm, hiểu ý nhau'],
  ['Follow up', 'Hỏi lại, theo dõi tiếp'], ['Heads-up', 'Lời báo trước'], ['Figure it out', 'Tìm ra cách giải quyết'],
  ['Get used to', 'Dần làm quen với'], ['Take your time', 'Cứ từ từ, không cần vội'], ['Look forward to', 'Mong đợi điều gì đó'],
  ['Make a difference', 'Tạo nên sự khác biệt'], ['As long as', 'Miễn là'], ['Little by little', 'Từng chút một'],
];
const context = await chromium.launchPersistentContext(resolve(`test-results/store-profile-${Date.now()}`), {
  executablePath, headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${resolve('dist')}`, `--load-extension=${resolve('dist')}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const app = await context.newPage();
  await app.goto(`chrome-extension://${id}/app.html#home`); await app.locator('.page').waitFor();
  await app.evaluate(async phrases => {
    const d = await new Promise(r => { const q = indexedDB.open('mach-doc'); q.onsuccess = () => r(q.result); });
    const tx = d.transaction(['captures', 'units', 'meta'], 'readwrite'); const now = Date.now();
    tx.objectStore('meta').put({ key: 'settings', value: { autoBackup: false, targetedAutomatic: false, weeklyAutomatic: false, optimizationEnabled: false } });
    phrases.forEach(([en, vi, instruction, answer], i) => {
      const cid = crypto.randomUUID(), exact = `Could you ${en.toLowerCase()} before the release?`;
      tx.objectStore('captures').put({ id: cid, source: { url: 'https://example.com/notes', frameUrl: 'https://example.com/notes', title: 'Team notes', exact, prefix: '', suffix: '', context: exact, heading: '', scrollY: 0, capturedAt: now - i * 3600000 }, note: '', status: 'ready', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: now, unitsCreated: true });
      const k = { key: en, kind: 'phrase', group: 'Giao tiếp công việc', name: en, form: en, meaningVi: vi, explanationVi: vi, evidence: en.toLowerCase(), examples: [{ en: `We should ${en.toLowerCase()}.`, vi }, { en: `Let us ${en.toLowerCase()}.`, vi }], production: { instructionVi: instruction ?? `Viết bằng tiếng Anh: ${vi}`, answerEn: answer ?? en }, cloze: { sentence: `Could you [[blank]] before the release?`, answer: en.toLowerCase(), hintVi: vi } };
      // reps 6 = a production turn; the first phrase is the earliest due, so it is the popup card.
      tx.objectStore('units').put({ id: crypto.randomUUID(), canonical: `phrase:${en}`, knowledge: k, captureIds: [cid], schedule: { due: i < 8 ? now - 60000 * (20 - i) : now + 86400000, stability: 3, difficulty: 5, elapsed_days: 3, scheduled_days: 3, reps: 6, lapses: 0, state: 2, learning_steps: 0, last_review: now - 3 * 86400000 }, failures: 0, suspended: false, leech: false, encounters: 0, createdAt: now - i * 3600000, updatedAt: now });
    });
    await new Promise(r => { tx.oncomplete = r; }); d.close();
  }, phrases);

  // 04 — matching board mid-game: one pair solved, one tile selected, a few seconds on the clock.
  await app.goto(`chrome-extension://${id}/app.html#lab`); await app.reload();
  await app.getByRole('button', { name: 'Ghép cặp', exact: true }).click();
  await app.getByLabel('Nguồn nội dung').selectOption('phrases');
  await app.getByLabel('Số cặp mỗi bảng').selectOption('3');
  await app.getByLabel('Thứ tự').selectOption('random');
  await app.getByLabel('Số mục mỗi lượt', { exact: true }).fill('6');
  await app.getByRole('button', { name: 'Bắt đầu lượt luyện', exact: true }).click();
  await app.locator('.lab-match-board').waitFor();
  const ids = await app.locator('.lab-match-tile[data-side="en"]').evaluateAll(tiles => tiles.map(t => t.dataset.cardId));
  const tile = (card, side) => app.locator(`.lab-match-tile[data-card-id="${card}"][data-side="${side}"]`);
  for (const card of ids.slice(0, 1)) { await tile(card, 'en').click(); await tile(card, 'vi').click(); }
  await app.waitForTimeout(7200); await tile(ids[1], 'en').click(); await app.mouse.move(0, 0);
  await app.evaluate(() => { document.querySelector('.lab-session')?.scrollIntoView(); window.scrollTo(0, 0); });
  await app.screenshot({ path: 'artifacts/store/04-lab-match-1280x800.png' });

  // 05 — the real popup at 2× for a crisp capture, answer revealed.
  const popup = await context.newPage();
  const cdp = await context.newCDPSession(popup);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 380, height: 640, deviceScaleFactor: 2, mobile: false });
  await popup.goto(`chrome-extension://${id}/popup.html`); await popup.locator('.quick-card').waitFor();
  await popup.locator('.quick-answer').fill('Please keep me in the loop when you have news.');
  await popup.keyboard.press('Control+Enter'); await popup.locator('.quick-ratings').waitFor();
  await popup.evaluate(() => document.fonts.ready);
  const height = await popup.evaluate(() => Math.ceil(document.querySelector('.quick').getBoundingClientRect().height));
  const shot = (await popup.screenshot({ clip: { x: 0, y: 0, width: 380, height } })).toString('base64');

  const regular = (await readFile('public/fonts/NotoSans-Regular.ttf')).toString('base64');
  const bold = (await readFile('public/fonts/NotoSans-SemiBold.ttf')).toString('base64');
  const icon = (await readFile('public/icons/icon-128.png')).toString('base64');
  const canvas = await context.newPage();
  await canvas.setViewportSize({ width: 1280, height: 800 });
  await canvas.setContent(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><style>
@font-face{font-family:Noto;src:url(data:font/ttf;base64,${regular})}@font-face{font-family:Noto;src:url(data:font/ttf;base64,${bold});font-weight:600}
*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font:16px/1.6 Noto,sans-serif;background:#ebefe2;color:#23392d}
.wrap{position:relative;display:flex;height:800px;padding:0 70px 0 84px;align-items:center;gap:70px}
.wrap:before{content:'';position:absolute;left:-160px;bottom:-260px;width:620px;height:620px;border:1px solid #d5ddc6;border-radius:50%}
.copy{flex:1;position:relative}.kicker{font-size:13px;letter-spacing:2px;color:#6b815a;font-weight:600}
h1{font-size:44px;line-height:1.25;font-weight:600;letter-spacing:-1px;margin:14px 0 18px;color:#1f4a3a}h1 span{color:#b08a2e}
p{font-size:19px;line-height:1.7;color:#4f6352;margin:0 0 26px;max-width:540px}
ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}li{display:flex;gap:12px;align-items:center;font-size:17px;color:#3c5243}
li b{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#285747;color:#fff;font-size:14px;flex:none}
.browser{position:relative;width:470px;align-self:flex-start;margin-top:26px}
.bar{height:52px;border-radius:14px 14px 0 0;background:#dfe3da;display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:0 18px}
.bar i{width:22px;height:22px;border-radius:50%;background:#c7cdc2}.bar img{width:30px;height:30px;padding:3px;border-radius:8px;background:#fff;box-shadow:0 0 0 3px #c5ac66}
.pop{position:absolute;right:6px;top:60px;width:380px;border-radius:12px;overflow:hidden;background:#faf9f6;box-shadow:0 24px 60px #1e3a2b33,0 2px 8px #1e3a2b1a}
.pop img{display:block;width:380px}
</style></head><body><main class="wrap"><section class="copy"><div class="kicker">MỚI · BẢN 0.6.0</div>
<h1>Ôn 30 giây,<br>ngay trên <span>thanh công cụ</span>.</h1>
<p>Chờ build, chờ họp? Bấm biểu tượng LumaRead: một thẻ đến hạn, tự gõ câu trả lời rồi tự chấm. Cùng lịch ôn FSRS với trang Ôn tập.</p>
<ul><li><b>1</b>Gõ trước khi xem đáp án</li><li><b>2</b>Chấm nhanh bằng phím 1–4</li><li><b>3</b>Trên YouTube: lưu câu vừa nghe</li></ul></section>
<div class="browser"><div class="bar"><i></i><i></i><img src="data:image/png;base64,${icon}" alt=""></div><div class="pop"><img src="data:image/png;base64,${shot}" alt=""></div></div></main></body></html>`);
  await canvas.evaluate(() => document.fonts.ready);
  await canvas.screenshot({ path: 'artifacts/store/05-quick-review-1280x800.png' });
  console.log('Store screenshots saved: 04-lab-match-1280x800.png, 05-quick-review-1280x800.png');
} finally { await context.close(); }
