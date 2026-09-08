import { db } from './db';
import { canonical, defaultSettings, KnowledgeSchema, normalize, SettingsSchema, type Knowledge } from '../domain/models';
import { editSourceText } from '../shared/source-text';
import type { Backup } from './backup';

const conflict = 'Mục này đã thay đổi ở tab khác. Hãy đóng phần sửa và mở lại để dùng dữ liệu mới nhất.';
const changedAt = (previous: number) => Math.max(Date.now(), previous + 1);

export async function editCapture(id: string, draft: { exact: string; note: string }, expectedUpdatedAt: number): Promise<void> {
  if (draft.note.length > 8000) throw new Error('Ghi chú tối đa 8.000 ký tự.');
  const tx = (await db).transaction('captures', 'readwrite');
  const item = await tx.store.get(id);
  if (!item || item.updatedAt !== expectedUpdatedAt) { await tx.done; throw new Error(conflict); }
  const source = editSourceText(item.source, draft.exact);
  const textChanged = source.exact !== item.source.exact;
  // Existing units are independent knowledge: keep their IDs and FSRS history.
  // A changed focus needs a fresh analysis; invalidate any in-flight worker lease.
  await tx.store.put({ ...item, source, note: draft.note, updatedAt: changedAt(item.updatedAt), ...(textChanged ? {
    analysis: undefined, transcriptApproved: false, unitsCreated: false, status: 'saved' as const,
    error: undefined, leaseUntil: 0, attempts: 0, nextAttemptAt: 0, deferredAnalysis: false,
  } : {}) });
  await tx.done;
}

export async function editKnowledge(id: string, draft: Knowledge, expectedUpdatedAt: number): Promise<void> {
  const knowledge = KnowledgeSchema.parse(draft);
  const strings = [knowledge.name, knowledge.group, knowledge.form, knowledge.meaningVi, knowledge.explanationVi, knowledge.evidence,
    knowledge.production.instructionVi, knowledge.production.answerEn, knowledge.cloze.answer, knowledge.cloze.hintVi,
    ...knowledge.examples.flatMap(e => [e.en, e.vi])];
  if (strings.some(value => !value.trim())) throw new Error('Các trường bài học không được để trống.');
  if ((knowledge.cloze.sentence.match(/\[\[blank\]\]/g) ?? []).length !== 1) throw new Error('Câu điền khuyết cần đúng một [[blank]].');
  const tx = (await db).transaction(['units', 'practices'], 'readwrite');
  const item = await tx.objectStore('units').get(id);
  if (!item || item.updatedAt !== expectedUpdatedAt) { await tx.done; throw new Error(conflict); }
  knowledge.kind = item.knowledge.kind;
  knowledge.key = normalize(knowledge.form) === normalize(item.knowledge.form) ? item.knowledge.key : `edited:${id}:${normalize(knowledge.form)}`.slice(0, 500);
  await tx.objectStore('units').put({ ...item, knowledge, canonical: canonical(knowledge), alternativeVi: undefined, updatedAt: changedAt(item.updatedAt) });
  // Pending drills were generated from the old wording. Completed work is history.
  let cursor = await tx.objectStore('practices').openCursor();
  while (cursor) { if (cursor.value.unitId === id && !cursor.value.completedAt) await cursor.delete(); cursor = await cursor.continue(); }
  await tx.done;
}

export type LibraryTarget = { kind: 'capture' | 'unit'; id: string; updatedAt: number };
const stores = ['captures', 'units', 'reviews', 'encounters', 'assessments', 'usage', 'practices', 'weekly', 'dictionary', 'optimization', 'meta', 'backups'] as const;

/** Snapshot and cascade share one transaction, including reviews arriving from other tabs. */
export async function deleteLibraryItem(target: LibraryTarget): Promise<void> {
  const tx = (await db).transaction(stores, 'readwrite');
  const item = await tx.objectStore(target.kind === 'capture' ? 'captures' : 'units').get(target.id);
  if (!item || item.updatedAt !== target.updatedAt) { await tx.done; throw new Error(conflict); }
  const [captures, units, reviews, encounters, assessments, usage, practices, weekly, dictionary, optimization, config] = await Promise.all([
    tx.objectStore('captures').getAll(), tx.objectStore('units').getAll(), tx.objectStore('reviews').getAll(), tx.objectStore('encounters').getAll(),
    tx.objectStore('assessments').getAll(), tx.objectStore('usage').getAll(), tx.objectStore('practices').getAll(), tx.objectStore('weekly').getAll(),
    tx.objectStore('dictionary').getAll(), tx.objectStore('optimization').getAll(), tx.objectStore('meta').get('settings'),
  ]);
  const backup: Backup = { format: 'mach-doc', version: 2, exportedAt: Date.now(), settings: SettingsSchema.parse(config?.value ?? defaultSettings), captures, units, reviews, encounters, assessments, usage, practices, weekly, dictionary, optimization };
  await tx.objectStore('backups').put({ id: crypto.randomUUID(), at: backup.exportedAt, json: JSON.stringify(backup) });
  const snapshots = (await tx.objectStore('backups').getAll()).sort((a, b) => b.at - a.at);
  for (const old of snapshots.slice(5)) await tx.objectStore('backups').delete(old.id);

  const removed = new Set<string>();
  if (target.kind === 'unit') removed.add(target.id);
  else {
    await tx.objectStore('captures').delete(target.id);
    for (const unit of units.filter(u => u.captureIds.includes(target.id))) {
      const captureIds = unit.captureIds.filter(id => id !== target.id);
      if (!captureIds.length) removed.add(unit.id);
      else await tx.objectStore('units').put({ ...unit, captureIds, updatedAt: changedAt(unit.updatedAt) });
    }
  }
  for (const id of removed) await tx.objectStore('units').delete(id);
  for (const row of reviews) if (removed.has(row.unitId)) await tx.objectStore('reviews').delete(row.id);
  for (const row of encounters) if (removed.has(row.unitId)) await tx.objectStore('encounters').delete(row.id);
  for (const row of assessments) if (removed.has(row.unitId)) await tx.objectStore('assessments').delete(row.id);
  for (const row of practices) if (removed.has(row.unitId)) await tx.objectStore('practices').delete(row.id);
  for (const row of weekly) {
    const coverage = row.coverage.filter(c => !removed.has(c.unitId));
    if (!coverage.length) await tx.objectStore('weekly').delete(row.id);
    else if (coverage.length !== row.coverage.length) await tx.objectStore('weekly').put({ ...row, coverage });
  }
  await tx.done;
}
