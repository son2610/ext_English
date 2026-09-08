import { db } from './db';
import { settings } from './repository';
import { AssessmentSchema, type Assessment, type Usage, type Practice, type Weekly } from '../domain/enrichment';
import type { Grade } from '../domain/models';
import { classifyError } from '../learning/errors';

export async function enrichmentData() {
  const database = await db;
  const [assessments, usage, practices, weekly, dictionary, optimization] = await Promise.all([
    database.getAll('assessments'), database.getAll('usage'), database.getAll('practices'), database.getAll('weekly'), database.getAll('dictionary'), database.getAll('optimization'),
  ]);
  return { assessments, usage, practices, weekly, dictionary, optimization };
}
export async function saveAssessment(input: Assessment): Promise<void> {
  const item = AssessmentSchema.parse(input);
  item.grade.errors = item.grade.errors.map(error => ({ ...error, category: error.category ?? classifyError(error.original, error.correction) }));
  const tx = (await db).transaction(['assessments', 'units'], 'readwrite');
  if (!await tx.objectStore('units').get(item.unitId)) { await tx.done; throw new Error('Không tìm thấy kiến thức của bài làm.'); }
  if (!await tx.objectStore('assessments').get(item.id)) await tx.objectStore('assessments').add(item);
  await tx.done;
}
export async function backfillAssessments() {
  const database = await db;
  if ((await database.get('meta', 'assessmentMigration'))?.value === 2) return;
  const tx = database.transaction(['reviews', 'assessments', 'meta'], 'readwrite');
  for (const review of await tx.objectStore('reviews').getAll()) {
    if (review.grade && !await tx.objectStore('assessments').get(review.id)) await tx.objectStore('assessments').add({ id: review.id, unitId: review.unitId, at: review.at, mode: review.mode, prompt: '', answer: review.answer, grade: { ...review.grade, errors: review.grade.errors.map(e => ({ ...e, category: e.category ?? classifyError(e.original, e.correction) })) }, origin: 'legacy' });
  }
  await tx.objectStore('meta').put({ key: 'assessmentMigration', value: 2 }); await tx.done;
}
export function localDay(at = Date.now()) { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export class BudgetError extends Error {}
export async function reserveUsage(model: string, task: Usage['task']): Promise<string> {
  const config = await settings(); const day = localDay(); const month = day.slice(0, 7);
  const tx = (await db).transaction('usage', 'readwrite');
  const daily = await tx.store.index('day').count(day); const monthly = await tx.store.index('month').count(month);
  if (daily >= config.dailyApiLimit || monthly >= config.monthlyApiLimit) { await tx.done; throw new BudgetError('Đã đạt hạn mức gọi AI bạn đặt. Tăng hạn mức trong Cài đặt hoặc chờ kỳ tiếp theo; bài đã lưu vẫn còn.'); }
  const id = crypto.randomUUID();
  await tx.store.add({ id, at: Date.now(), day, month, model, task, status: 'started', tokens: 0 }); await tx.done;
  return id;
}
export async function finishUsage(id: string, status: 'success' | 'failed', tokens = 0) {
  const tx = (await db).transaction('usage', 'readwrite'); const item = await tx.store.get(id);
  if (item) await tx.store.put({ ...item, status, tokens: Number.isFinite(tokens) ? Math.max(0, tokens) : 0 }); await tx.done;
}
export async function savePractice(unitId: string, drill: Omit<Practice, 'id' | 'unitId' | 'createdAt'>, expectedUpdatedAt?: number): Promise<Practice> {
  const practice: Practice = { ...drill, id: crypto.randomUUID(), unitId, createdAt: Date.now() };
  const tx = (await db).transaction(['units', 'practices'], 'readwrite');
  const unit = await tx.objectStore('units').get(unitId);
  if (!unit || (expectedUpdatedAt !== undefined && unit.updatedAt !== expectedUpdatedAt)) { await tx.done; throw new Error('Bài học đã thay đổi. Hãy tạo lại bài luyện.'); }
  await tx.objectStore('practices').put(practice); await tx.done; return practice;
}
export async function completePractice(practice: Practice, answer: string, grade: Grade) {
  const item = AssessmentSchema.parse({ id: practice.id, unitId: practice.unitId, at: Date.now(), mode: 'targeted', prompt: practice.instructionVi, answer, grade, origin: 'ai' });
  item.grade.errors = item.grade.errors.map(error => ({ ...error, category: error.category ?? classifyError(error.original, error.correction) }));
  const tx = (await db).transaction(['assessments', 'practices', 'units'], 'readwrite');
  if (!await tx.objectStore('units').get(practice.unitId)) { await tx.done; throw new Error('Không tìm thấy kiến thức của bài làm.'); }
  if (!await tx.objectStore('practices').get(practice.id)) { await tx.done; throw new Error('Bài luyện đã bị xoá hoặc thay đổi. Hãy tải lại.'); }
  if (!await tx.objectStore('assessments').get(item.id)) await tx.objectStore('assessments').add(item);
  await tx.objectStore('practices').put({ ...practice, completedAt: Date.now() }); await tx.done;
}
export async function saveWeekly(item: Omit<Weekly, 'id' | 'createdAt'>) {
  const tx = (await db).transaction(['weekly', 'units'], 'readwrite');
  const existing = new Set(await tx.objectStore('units').getAllKeys());
  const coverage = item.coverage.filter(c => existing.has(c.unitId));
  const covered = new Set((await tx.objectStore('weekly').index('week').getAll(item.week)).flatMap(w => w.coverage.map(c => c.unitId)));
  if (coverage.length && !coverage.every(c => covered.has(c.unitId))) await tx.objectStore('weekly').add({ ...item, coverage, id: crypto.randomUUID(), createdAt: Date.now() });
  await tx.done;
}
