import { z } from 'zod';
import { AnalysisSchema, CaptureSchema, UnitSchema, ReviewSchema, SettingsSchema } from '../domain/models';
import { db } from './db';
import { settings } from './repository';
import { AssessmentSchema, UsageSchema, PracticeSchema, WeeklySchema, DictionarySchema, OptimizationSchema } from '../domain/enrichment';
import { classifyError } from '../learning/errors';

export const BackupSchema = z.object({
  format: z.literal('mach-doc'), version: z.union([z.literal(1), z.literal(2)]), exportedAt: z.number().nonnegative(),
  settings: SettingsSchema,
  captures: z.array(CaptureSchema).max(100000), units: z.array(UnitSchema).max(100000),
  reviews: z.array(ReviewSchema).max(2000000),
  encounters: z.array(z.object({ id: z.string().max(300), unitId: z.string().uuid(), day: z.string().max(30), page: z.string().max(100), at: z.number().nonnegative() })).max(2000000),
  assessments: z.array(AssessmentSchema).max(2000000).default([]),
  usage: z.array(UsageSchema).max(2000000).default([]),
  practices: z.array(PracticeSchema).max(100000).default([]),
  weekly: z.array(WeeklySchema).max(10000).default([]),
  dictionary: z.array(DictionarySchema).max(100000).default([]),
  optimization: z.array(OptimizationSchema).max(10000).default([]),
});
export type Backup = z.infer<typeof BackupSchema>;
export async function exportData(): Promise<Backup> {
  const config = await settings();
  const tx = (await db).transaction(['captures', 'units', 'reviews', 'encounters', 'assessments', 'usage', 'practices', 'weekly', 'dictionary', 'optimization'], 'readonly');
  const [captures, units, reviews, encounters] = await Promise.all([tx.objectStore('captures').getAll(), tx.objectStore('units').getAll(), tx.objectStore('reviews').getAll(), tx.objectStore('encounters').getAll()]);
  const [assessments, usage, practices, weekly, dictionary, optimization] = await Promise.all([tx.objectStore('assessments').getAll(), tx.objectStore('usage').getAll(), tx.objectStore('practices').getAll(), tx.objectStore('weekly').getAll(), tx.objectStore('dictionary').getAll(), tx.objectStore('optimization').getAll()]);
  await tx.done;
  return { format: 'mach-doc', version: 2, exportedAt: Date.now(), settings: config, captures, units, reviews, encounters, assessments, usage, practices, weekly, dictionary, optimization };
}
export function parseBackup(raw: string): Backup {
  if (raw.length > 150 * 1024 * 1024) throw new Error('File vượt giới hạn nhập 150 MB.');
  const backup = BackupSchema.parse(JSON.parse(raw));
  for (const collection of [backup.captures, backup.units, backup.reviews, backup.encounters, backup.assessments, backup.usage, backup.practices, backup.weekly, backup.dictionary, backup.optimization]) {
    if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error('File có ID bị lặp.');
  }
  const captures = new Set(backup.captures.map(c => c.id));
  const units = new Set(backup.units.map(u => u.id));
  if (backup.units.some(u => u.captureIds.some(id => !captures.has(id))) || backup.reviews.some(r => !units.has(r.unitId)) || backup.encounters.some(e => !units.has(e.unitId))) throw new Error('File thiếu dữ liệu liên kết; không thể nhập an toàn.');
  if (backup.assessments.some(a => !units.has(a.unitId)) || backup.practices.some(p => !units.has(p.unitId)) || backup.weekly.some(w => w.coverage.some(c => !units.has(c.unitId)))) throw new Error('File thiếu liên kết dữ liệu học bổ sung.');
  return backup;
}
export async function importData(backup: Backup): Promise<void> {
  // Validate again at the boundary; callers cannot bypass validation through TypeScript casts.
  const parsed = parseBackup(JSON.stringify(backup));
  const safety = JSON.stringify(await exportData());
  const database = await db;
  const tx = database.transaction(['captures', 'units', 'reviews', 'encounters', 'meta', 'backups', 'assessments', 'usage', 'practices', 'weekly', 'dictionary', 'optimization'], 'readwrite');
  await tx.objectStore('backups').put({ id: crypto.randomUUID(), at: Date.now(), json: safety });
  const snapshots = (await tx.objectStore('backups').getAll()).sort((a, b) => b.at - a.at);
  for (const old of snapshots.slice(5)) await tx.objectStore('backups').delete(old.id);
  // Conservative merge: existing IDs are kept intact so an old backup cannot roll back a schedule.
  for (const item of parsed.captures) if (!await tx.objectStore('captures').get(item.id)) await tx.objectStore('captures').add({ ...item, status: item.status === 'processing' ? 'queued' : item.status, leaseUntil: 0 });
  const existingUnits = new Set(await tx.objectStore('units').getAllKeys());
  for (const item of parsed.units) if (!existingUnits.has(item.id)) await tx.objectStore('units').add(item);
  for (const item of parsed.reviews) if (!existingUnits.has(item.unitId) && !await tx.objectStore('reviews').get(item.id)) await tx.objectStore('reviews').add(item);
  for (const item of parsed.encounters) if (!existingUnits.has(item.unitId) && !await tx.objectStore('encounters').get(item.id)) await tx.objectStore('encounters').add(item);
  for (const item of parsed.assessments) if (!await tx.objectStore('assessments').get(item.id)) await tx.objectStore('assessments').add(item);
  for (const review of parsed.reviews) if (review.grade && !await tx.objectStore('assessments').get(review.id)) await tx.objectStore('assessments').add({ id: review.id, unitId: review.unitId, at: review.at, mode: review.mode, prompt: '', answer: review.answer, grade: { ...review.grade, errors: review.grade.errors.map(error => ({ ...error, category: error.category ?? classifyError(error.original, error.correction) })) }, origin: 'legacy' });
  for (const item of parsed.usage) if (!await tx.objectStore('usage').get(item.id)) await tx.objectStore('usage').add(item);
  for (const item of parsed.practices) if (!await tx.objectStore('practices').get(item.id)) await tx.objectStore('practices').add(item);
  for (const item of parsed.weekly) if (!await tx.objectStore('weekly').get(item.id)) await tx.objectStore('weekly').add(item);
  for (const item of parsed.dictionary) if (!await tx.objectStore('dictionary').get(item.id)) await tx.objectStore('dictionary').add(item);
  for (const item of parsed.optimization) if (!await tx.objectStore('optimization').get(item.id)) await tx.objectStore('optimization').add(item);
  if (!await tx.objectStore('meta').get('settings')) await tx.objectStore('meta').put({ key: 'settings', value: parsed.settings });
  await tx.done;
}
export async function snapshot(): Promise<void> {
  const json = JSON.stringify(await exportData());
  const tx = (await db).transaction(['backups', 'meta'], 'readwrite');
  await tx.objectStore('backups').put({ id: crypto.randomUUID(), at: Date.now(), json });
  const backups = (await tx.objectStore('backups').getAll()).sort((a, b) => b.at - a.at);
  for (const old of backups.slice(5)) await tx.objectStore('backups').delete(old.id);
  await tx.objectStore('meta').put({ key: 'lastSnapshot', value: Date.now() });
  await tx.done;
}
// Exported separately for tooling and future provider adapters.
export const analysisJsonSchema = () => z.toJSONSchema(AnalysisSchema);
