import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openDB } from 'idb';
import { source } from './fixtures';
it('upgrades a real version 1 database in place, retaining captures and settings', async () => {
  const old = await openDB('mach-doc', 1, { upgrade(d) {
    d.createObjectStore('captures', { keyPath: 'id' }).createIndex('status', 'status');
    const units = d.createObjectStore('units', { keyPath: 'id' }); units.createIndex('canonical', 'canonical'); units.createIndex('due', 'schedule.due');
    const reviews = d.createObjectStore('reviews', { keyPath: 'id' }); reviews.createIndex('at', 'at'); reviews.createIndex('unitId', 'unitId');
    d.createObjectStore('encounters', { keyPath: 'id' }); d.createObjectStore('cache', { keyPath: 'key' }); d.createObjectStore('meta', { keyPath: 'key' }); d.createObjectStore('backups', { keyPath: 'id' });
  } });
  const capture = { id: crypto.randomUUID(), source, note: 'Ghi chú cũ cần giữ', status: 'saved', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: 1, unitsCreated: false };
  await old.put('captures', capture); await old.put('meta', { key: 'settings', value: { model: 'my-old-model', retention: 0.92 } }); old.close();
  const { db } = await import('../src/data/db'); const upgraded = await db;
  expect(upgraded.version).toBe(2); expect(await upgraded.get('captures', capture.id)).toEqual(capture);
  expect(upgraded.transaction('captures').store.indexNames.contains('videoId')).toBe(true);
  expect(upgraded.objectStoreNames.contains('assessments')).toBe(true);
  const { settings } = await import('../src/data/repository'); const config = await settings();
  expect(config.model).toBe('my-old-model'); expect(config.retention).toBe(0.92); expect(config.highlighting).toBe(false); expect(config.dailyApiLimit).toBe(50);
});
