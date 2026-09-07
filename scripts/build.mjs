import { build, context } from 'esbuild';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
if (process.env.NO_NEW_TAB === '1') delete manifest.chrome_url_overrides;
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));
const notices = [];
for (const dependency of ['idb', 'react', 'react-dom', 'scheduler', 'ts-fsrs', 'zod']) {
  const metadata = JSON.parse(await readFile(`node_modules/${dependency}/package.json`, 'utf8'));
  const license = await readFile(`node_modules/${dependency}/LICENSE`, 'utf8');
  notices.push(`${dependency} ${metadata.version}\n${license}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n----------------------------------------\n\n'));
const entries = [
  { entryPoints: { app: 'src/ui/app.tsx', background: 'src/background/index.ts', offscreen: 'src/background/offscreen.ts' }, format: 'esm' },
  { entryPoints: { content: 'src/content/index.ts' }, format: 'iife' },
];
for (const entry of entries) {
  const options = { ...entry, bundle: true, outdir: 'dist', target: 'chrome120', sourcemap: true, minify: !process.argv.includes('--watch'), legalComments: 'eof' };
  if (process.argv.includes('--watch')) await (await context(options)).watch();
  else await build(options);
}
console.log('Đã tạo extension trong dist/.');
