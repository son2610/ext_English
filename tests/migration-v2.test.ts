import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDB } from 'idb';
import { source, analysis } from './fixtures';

it('retains captures, FSRS schedules and settings when adding organizers to an installed v2 database', async () => {
  const old = await openDB('mach-doc', 2, { upgrade(d) {
    const captures = d.createObjectStore('captures', { keyPath: 'id' }); captures.createIndex('status', 'status'); captures.createIndex('videoId', 'source.video.videoId');
    const units = d.createObjectStore('units', { keyPath: 'id' }); units.createIndex('canonical', 'canonical'); units.createIndex('due', 'schedule.due');
    const reviews = d.createObjectStore('reviews', { keyPath: 'id' }); reviews.createIndex('at', 'at'); reviews.createIndex('unitId', 'unitId');
    for (const name of ['encounters', 'backups', 'assessments', 'usage', 'practices', 'weekly', 'dictionary', 'optimization']) d.createObjectStore(name, { keyPath: 'id' });
    d.createObjectStore('cache', { keyPath: 'key' }); d.createObjectStore('meta', { keyPath: 'key' });
  } });
  const c = { id: crypto.randomUUID(), source, analysis, note: 'Dữ liệu đang dùng', status: 'ready', attempts: 1, nextAttemptAt: 0, leaseUntil: 0, updatedAt: 100, unitsCreated: true };
  const u = { id: crypto.randomUUID(), canonical: 'old:key', knowledge: analysis.knowledge[0], captureIds: [c.id], schedule: { due: 1000, reps: 42, lapses: 2, stability: 20, difficulty: 5, state: 2, elapsed_days: 10, scheduled_days: 20, learning_steps: 0 }, createdAt: 1, updatedAt: 10, suspended: false, leech: false, failures: 2, encounters: 12 };
  await old.put('captures', c); await old.put('units', u); await old.put('meta', { key: 'settings', value: { model: 'gemini-3.5-flash' } }); old.close();
  const { db } = await import('../src/data/db'); const next = await db;
  expect(next.version).toBe(3); expect(await next.getAll('organizers')).toEqual([]);
  expect(await next.get('captures', c.id)).toEqual(c); expect(await next.get('units', u.id)).toEqual(u);
  expect(await next.get('meta', 'settings')).toEqual({ key: 'settings', value: { model: 'gemini-3.5-flash' } });
});
