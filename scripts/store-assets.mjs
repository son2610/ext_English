import { chromium } from 'playwright';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('artifacts/store', { recursive: true });
const regular = (await readFile('public/fonts/NotoSans-Regular.ttf')).toString('base64');
const bold = (await readFile('public/fonts/NotoSans-SemiBold.ttf')).toString('base64');
const icon = (await readFile('public/icons/icon-256.png')).toString('base64');
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>LumaRead — Nhận diện</title><style>
@font-face{font-family:Noto;src:url(data:font/ttf;base64,${regular})} @font-face{font-family:Noto;src:url(data:font/ttf;base64,${bold});font-weight:600}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 Noto,sans-serif}.promo{position:relative;overflow:hidden;width:100vw;height:100vh;background:#164f3c;color:#fbf6df;display:flex;align-items:center;justify-content:space-between;padding:60px 90px}.promo:before{content:'';position:absolute;right:-220px;top:-180px;width:900px;height:900px;border:1px solid #ffffff14;border-radius:50%}.promo:after{content:'';position:absolute;right:-90px;top:-50px;width:640px;height:640px;border:1px solid #ffffff1c;border-radius:50%}.copy{position:relative;z-index:2;max-width:680px}.brand{display:flex;align-items:center;font-size:34px;font-weight:600;letter-spacing:-1px;margin-left:-18px}.brand img{width:90px;height:90px;margin-right:1px}h1{font-size:58px;line-height:1.35;letter-spacing:-1.5px;margin:26px 0 20px;font-weight:600}h1 span{color:#edc967}.tagline{color:#d0dfcf;font-size:18px;margin:0}.foot{font-size:12px;letter-spacing:2px;color:#a8c9b8;margin-top:32px}.cards{position:relative;width:345px;height:360px;margin-left:20px;flex:none;z-index:1}.card{position:absolute;inset:40px 10px auto 10px;background:#fffcf3;border:1px solid #f2e6c3;border-radius:15px;color:#2f4b3b;padding:27px;transform:rotate(5deg);box-shadow:0 20px 50px #082a3138}.back{inset:12px 36px auto -12px;height:310px;transform:rotate(-9deg);background:#8fac8e;border:1px solid #bad1a1}.eyebrow{font-size:10px;letter-spacing:1.2px;color:#648562}.quote{font:28px/1.5 Georgia,serif;margin:19px 0}.meaning{font-size:12px;color:#6d806b}.labels{display:flex;gap:6px;margin-top:24px}.labels span{font-size:10px;background:#efe4f6;color:#795197;padding:5px 9px;border-radius:5px}.labels span:last-child{background:#f8efcf;color:#8c6e2a}.spark{position:absolute;right:-25px;top:-5px;color:#edc967;font-size:75px;transform:rotate(8deg)}
@media(max-width:600px){.promo{padding:22px 29px}.copy{max-width:100%}.brand{font-size:25px;margin-left:-12px}.brand img{width:64px;height:64px}.copy h1{font-size:34px;line-height:1.38;letter-spacing:-.8px;margin:9px 0 13px}.tagline{font-size:12px}.foot{font-size:8px;letter-spacing:1.6px;margin-top:19px}.cards{display:none}.promo:before{width:430px;height:430px;right:-255px;top:10px}.promo:after{width:300px;height:300px;right:-175px;top:75px}}
</style></head><body><main class="promo"><div class="copy"><div class="brand"><img src="data:image/png;base64,${icon}" alt="">LumaRead</div><h1>Đọc. Hiểu. <span>Nhớ.</span></h1><p class="tagline">Tiếng Anh, từ điều bạn đọc mỗi ngày.</p><div class="foot">NGỮ CẢNH THẬT · BÀI HỌC CỦA BẠN</div></div><div class="cards" aria-hidden="true"><div class="card back"></div><div class="card"><div class="eyebrow">MỘT CÂU ĐÁNG GIỮ</div><div class="quote">The more you practice, the more natural it becomes.</div><div class="meaning">Càng luyện tập, càng tự nhiên.</div><div class="labels"><span>Luyện viết</span><span>Cụm từ hay</span></div></div><span class="spark">✦</span></div></main></body></html>`;
await writeFile('artifacts/store/brand-preview.html', html);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  for (const [width, height, name] of [[440, 280, 'promo'], [1400, 560, 'marquee']]) {
    await page.setViewportSize({ width, height }); await page.setContent(html); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `artifacts/store/${name}-${width}x${height}.png` });
  }
} finally { await browser.close(); }
await copyFile('public/privacy.html', 'artifacts/store/privacy.html');
await copyFile('public/fonts/OFL.txt', 'artifacts/store/FONT-LICENSE.txt');
console.log(`Store artwork saved to ${resolve('artifacts/store')}`);
