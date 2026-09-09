import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/data/db';
import { capture, claimJob, completeJob, acceptAnalysis, allData, recordReview } from '../src/data/repository';
import { saveOrganizer, organizers, organizeCaptures, deleteOrganizer } from '../src/data/organization';
import { deleteLibraryItem } from '../src/data/library';
import { exportData, importData, parseBackup } from '../src/data/backup';
import { indexLibrary, filterLibrary } from '../src/ui/library-index';
import { source, analysis } from './fixtures';
import type { Organizer } from '../src/domain/organization';

beforeEach(async () => { const d = await db; for (const store of d.objectStoreNames) await d.clear(store); });
async function catalog() {
  await saveOrganizer({ kind: 'group', name: 'Công nghệ', color: 'blue' });
  await saveOrganizer({ kind: 'label', name: 'Cần luyện viết', color: 'rose' });
  const rows = await organizers();
  return { group: rows.find(o => o.kind === 'group')!, label: rows.find(o => o.kind === 'label')! };
}

describe('portable library organization', () => {
  it('bulk labels merge concurrently and AI completion preserves organization and source', async () => {
    const { group, label } = await catalog();
    const a = await capture(source, 'Ghi chú', true), b = await capture({ ...source, exact: 'Another quote.' }, '', false);
    const job = (await claimJob())!;
    await Promise.all([organizeCaptures([a.id, b.id], { groupId: group.id }), organizeCaptures([a.id, b.id], { addLabel: label.id })]);
    await completeJob(job, analysis);
    const rows = (await allData()).captures;
    for (const row of rows) expect(row.organization).toEqual({ groupId: group.id, labelIds: [label.id] });
    expect(rows.find(c => c.id === a.id)).toMatchObject({ status: 'ready', source, analysis });
    await organizeCaptures([a.id], { removeLabel: label.id });
    expect((await (await db).get('captures', b.id))!.organization!.labelIds).toEqual([label.id]);
  });
  it('renaming and deleting groups retain lessons, history and quotes; stale edits fail', async () => {
    const { group, label } = await catalog();
    const c = await capture(source, 'Ghi chú', true); await completeJob((await claimJob())!, analysis); await acceptAnalysis(c.id);
    const u = (await allData()).units[0]!;
    await recordReview({ id: crypto.randomUUID(), unitId: u.id, expectedReps: 0, rating: 3, mode: 'production', answer: 'answer', durationMs: 1000, assisted: false });
    await organizeCaptures([c.id], { groupId: group.id, addLabel: label.id });
    const before = await allData();
    await saveOrganizer({ ...group, name: 'Phát triển phần mềm', color: 'purple' }, group);
    await expect(deleteOrganizer(group)).rejects.toThrow('đã thay đổi');
    await deleteOrganizer((await organizers()).find(o => o.id === group.id)!);
    let next = await allData();
    expect(next.units).toEqual(before.units); expect(next.reviews).toEqual(before.reviews);
    expect(next.captures[0]!.source).toEqual(source);
    expect(next.captures[0]!.organization).toEqual({ groupId: undefined, labelIds: [label.id] });
    await deleteOrganizer(label); next = await allData();
    expect(next.captures[0]!.organization!.labelIds).toEqual([]);
  });
  it('exports and imports groups/labels, accepts legacy backups, rejects dangling and wrong-kind links', async () => {
    const { group, label } = await catalog(); const c = await capture(source, '', false);
    await organizeCaptures([c.id], { groupId: group.id, addLabel: label.id });
    const backup = parseBackup(JSON.stringify(await exportData()));
    expect(backup.version).toBe(3); expect(backup.organizers).toHaveLength(2);
    for (const store of (await db).objectStoreNames) await (await db).clear(store);
    await importData(backup);
    expect((await allData()).captures[0]!.organization).toEqual(backup.captures[0]!.organization);
    expect(await organizers()).toHaveLength(2);
    expect(() => parseBackup(JSON.stringify({ ...backup, organizers: [] }))).toThrow('thiếu nhóm');
    expect(() => parseBackup(JSON.stringify({ ...backup, organizers: backup.organizers.map(o => ({ ...o, kind: 'label' })) }))).toThrow('thiếu nhóm');
    for (const version of [1, 2]) {
      const legacy = { ...backup, version, organizers: undefined, captures: backup.captures.map(c => ({ ...c, organization: undefined })) };
      expect(parseBackup(JSON.stringify(legacy)).organizers).toEqual([]);
    }
  });
  it('capture deletion snapshots include taxonomy and linked metadata for recovery', async () => {
    const { group } = await catalog(); const saved = await capture(source, '', false);
    await organizeCaptures([saved.id], { groupId: group.id });
    const c = (await allData()).captures[0]!;
    await deleteLibraryItem({ kind: 'capture', id: c.id, updatedAt: c.updatedAt });
    const backup = parseBackup((await (await db).getAll('backups'))[0]!.json);
    expect(backup.organizers.some(o => o.id === group.id)).toBe(true);
    await importData(backup); expect((await allData()).captures[0]!.organization!.groupId).toBe(group.id);
  });
  it('validates an entire batch before writing and never resurrects deleted captures', async () => {
    const { group, label } = await catalog();
    const a = await capture(source, '', false), b = await capture({ ...source, exact: 'Other.' }, '', false);
    const d = await db, stored = (await d.get('captures', b.id))!;
    const extra: Organizer[] = Array.from({ length: 30 }, (_, i) => ({ ...label, id: crypto.randomUUID(), name: `Nhãn ${i}` }));
    for (const o of extra) await d.put('organizers', o);
    await d.put('captures', { ...stored, organization: { labelIds: extra.map(o => o.id) } });
    await expect(organizeCaptures([a.id, b.id], { groupId: group.id, addLabel: label.id })).rejects.toThrow('30 nhãn');
    expect((await d.get('captures', a.id))!.organization).toBeUndefined();
    await d.delete('captures', a.id); await organizeCaptures([a.id], { groupId: group.id }); expect(await d.get('captures', a.id)).toBeUndefined();
    await expect(organizeCaptures([b.id], { groupId: label.id })).rejects.toThrow('không còn tồn tại');
    expect((await d.get('captures', b.id))!.organization!.groupId).toBeUndefined();
  });
  it('normalizes Vietnamese names and prevents duplicate or stale organizer edits', async () => {
    const { group } = await catalog();
    await expect(saveOrganizer({ ...group, name: '  cong nghe  ' })).rejects.toThrow('đã có');
    await saveOrganizer({ ...group, name: 'Tiếng Việt'.normalize('NFD') }, group);
    const fresh = (await organizers()).find(o => o.id === group.id)!; expect(fresh.name).toBe('Tiếng Việt');
    await expect(saveOrganizer({ ...group, name: 'Old' }, group)).rejects.toThrow('đã thay đổi');
  });
  it('searches accents/decomposed text and derives learning filters from shared units without changing schedules', async () => {
    const { group, label } = await catalog(); const c = await capture(source, 'Điều kiện'.normalize('NFD'), true);
    await completeJob((await claimJob())!, analysis); await acceptAnalysis(c.id); await organizeCaptures([c.id], { groupId: group.id, addLabel: label.id });
    const data = await allData(), before = structuredClone(data.units), entries = indexLibrary(data.captures, data.units, Date.now());
    const filters = { search: 'DIEU kien', group: group.id, label: label.id, state: 'due', source: 'web', sort: 'due' };
    expect(filterLibrary(entries, filters).map(e => e.capture.id)).toEqual([c.id]);
    expect(filterLibrary(entries, { ...filters, group: 'inbox' })).toEqual([]);
    expect(filterLibrary(entries, { ...filters, source: 'youtube' })).toEqual([]);
    data.units[0]!.suspended = true;
    expect(filterLibrary(indexLibrary(data.captures, data.units, Date.now()), { ...filters, state: 'difficult' })).toHaveLength(1);
    expect((await allData()).units).toEqual(before);
  });
});
