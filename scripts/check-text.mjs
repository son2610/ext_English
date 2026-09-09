import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const decoder = new TextDecoder('utf-8', { fatal: true });
let count = 0;
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = `${path}/${entry.name}`;
    if (entry.isDirectory()) { if (!['fonts', 'icons', 'data'].includes(entry.name)) await scan(target); continue; }
    if (!/\.(tsx?|css|html|json)$/.test(entry.name)) continue;
    const text = decoder.decode(await readFile(target));
    assert.ok(!text.includes('\uFFFD') && !/á[»º]|Ã[¡¢£¨©ª¬­³´µ¶¹º¼½]/u.test(text), `Encoding artifact: ${target}`);
    count++;
  }
}
await scan('src'); await scan('public');
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
assert.ok(manifest.name.length <= 75 && manifest.description.length <= 132);
assert.equal(manifest.version, JSON.parse(await readFile('package.json', 'utf8')).version);
for (const size of [16, 32, 48, 128]) {
  const data = await readFile(`public/${manifest.icons[size]}`);
  assert.equal(data.subarray(1, 4).toString(), 'PNG'); assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
}
console.log(`UTF-8 check passed: ${count} source files; manifest limits/version and all PNG icon dimensions valid.`);
