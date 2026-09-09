// Reproducible font download and icon size export; no API key or image generation at build time.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
for (const [src, dest] of [
  ['hinted/ttf/NotoSans/NotoSans-Regular.ttf', 'NotoSans-Regular.ttf'],
  ['hinted/ttf/NotoSans/NotoSans-SemiBold.ttf', 'NotoSans-SemiBold.ttf'], ['LICENSE', 'OFL.txt'],
]) {
  const target = `public/fonts/${dest}`;
  if (await readFile(target).then(b => b.length > 100).catch(() => false)) continue;
  const response = await fetch(`https://raw.githubusercontent.com/notofonts/noto-fonts/main/${src}`);
  if (!response.ok) throw new Error(`Font download: HTTP ${response.status}`);
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  console.log(`Saved ${target}`);
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
try {
  const page = await browser.newPage();
  const source = `data:image/png;base64,${(await readFile('artifacts/store/lumaread-icon-original.png')).toString('base64')}`;
  const images = await page.evaluate(async source => {
    const img = new Image(); img.src = source; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let left = img.width, right = 0, top = img.height, bottom = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (data[(y * img.width + x) * 4 + 3] > 32) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return [16, 32, 48, 128, 256].map(size => {
      const out = document.createElement('canvas'); out.width = out.height = size;
      const context = out.getContext('2d'); context.imageSmoothingQuality = 'high';
      const content = size <= 32 ? size - 2 : size * .75;
      const scale = content / Math.max(right - left + 1, bottom - top + 1);
      const w = (right - left + 1) * scale, h = (bottom - top + 1) * scale;
      context.drawImage(img, left, top, right - left + 1, bottom - top + 1, (size - w) / 2, (size - h) / 2, w, h);
      return { size, png: out.toDataURL('image/png').split(',')[1] };
    });
  }, source);
  await mkdir('public/icons', { recursive: true });
  for (const { size, png } of images) await writeFile(`public/icons/icon-${size}.png`, Buffer.from(png, 'base64'));
  await writeFile('artifacts/store/icon-128.png', await readFile('public/icons/icon-128.png'));
  console.log('Exported PNG icons: 16, 32, 48, 128, 256.');
} finally { await browser.close(); }
