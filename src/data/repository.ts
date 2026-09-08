import { db } from './db';
import { canonical, defaultSettings, normalize, SettingsSchema, type Analysis, type Capture, type Grade, type Knowledge, type Review, type Settings, type Source, type Unit, type ExerciseMode } from '../domain/models';
import { scheduler } from '../domain/scheduler';

export async function settings(): Promise<Settings> {
  return SettingsSchema.parse((await (await db).get('meta', 'settings'))?.value ?? defaultSettings);
}
export async function saveSettings(value: Settings): Promise<void> {
  await (await db).put('meta', { key: 'settings', value: SettingsSchema.parse(value) });
}
export async function allData() {
  const database = await db;
  const tx = database.transaction(['captures', 'units', 'reviews'], 'readonly');
  const [captures, units, reviews] = await Promise.all([tx.objectStore('captures').getAll(), tx.objectStore('units').getAll(), tx.objectStore('reviews').getAll()]);
  await tx.done;
  return { captures, units, reviews };
}
export async function capture(source: Source, note: string, analyze: boolean): Promise<{ id: string; duplicate: boolean }> {
  const database = await db;
  const tx = database.transaction('captures', 'readwrite');
  const existing = (await tx.store.getAll()).find(c => c.source.video && source.video ? c.source.video.videoId === source.video.videoId && Math.abs(c.source.video.start - source.video.start) < 0.4 && normalize(c.source.exact) === normalize(source.exact) : !c.source.video && !source.video && c.source.frameUrl === source.frameUrl && normalize(c.source.exact) === normalize(source.exact));
  if (existing) {
    existing.note = [existing.note, note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n');
    if (analyze && !existing.analysis && existing.status !== 'processing') { existing.status = source.video ? 'saved' : 'queued'; existing.deferredAnalysis = !!source.video; existing.attempts = 0; existing.nextAttemptAt = 0; }
    existing.updatedAt = Date.now();
    await tx.store.put(existing); await tx.done;
    return { id: existing.id, duplicate: true };
  }
  const id = crypto.randomUUID();
  await tx.store.add({ id, source, note, status: analyze && !source.video ? 'queued' : 'saved', deferredAnalysis: !!source.video && analyze, attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: Date.now(), unitsCreated: false });
  await tx.done;
  return { id, duplicate: false };
}
export async function enqueue(ids: string[]) {
  const tx = (await db).transaction('captures', 'readwrite');
  const items = await Promise.all(ids.map(id => tx.store.get(id)));
  if (items.some(item => item && !item.unitsCreated && item.source.video && !/^en(?:-|$)/i.test(item.source.video.language))) { await tx.done; throw new Error('Phụ đề chưa xác định là tiếng Anh. Hãy chọn track tiếng Anh trước.'); }
  for (const item of items) {
    if (!item || item.unitsCreated || (item.status === 'processing' && item.leaseUntil > Date.now())) continue;
    await tx.store.put({ ...item, status: 'queued', deferredAnalysis: false, error: undefined, attempts: 0, nextAttemptAt: 0, updatedAt: Date.now() });
  }
  await tx.done;
}
export async function claimJob(now = Date.now()): Promise<Capture | undefined> {
  const tx = (await db).transaction('captures', 'readwrite');
  const items = await tx.store.getAll();
  const item = items.find(c => (c.status === 'queued' && c.nextAttemptAt <= now) || (c.status === 'processing' && c.leaseUntil <= now));
  if (item) {
    item.status = 'processing'; item.leaseUntil = now + 90000; item.attempts++;
    await tx.store.put(item);
  }
  await tx.done;
  return item;
}
export async function completeJob(item: Capture, result: Analysis | { error: string; retryAt?: number }): Promise<void> {
  const tx = (await db).transaction('captures', 'readwrite');
  const current = await tx.store.get(item.id);
  if (current?.status === 'processing' && current.leaseUntil === item.leaseUntil) {
    const patch = 'knowledge' in result ? { analysis: result, status: 'ready' as const, error: undefined } : { status: result.retryAt ? 'queued' as const : 'error' as const, error: result.error, nextAttemptAt: result.retryAt ?? 0 };
    await tx.store.put({ ...current, ...patch, leaseUntil: 0, updatedAt: Date.now() });
  }
  await tx.done;
}
export function findDuplicate(k: Knowledge, units: Unit[]): Unit | undefined {
  return units.find(u => u.canonical === canonical(k) || (u.knowledge.kind === k.kind && normalize(u.knowledge.form) === normalize(k.form) && normalize(u.knowledge.name) === normalize(k.name)));
}
export async function acceptAnalysis(id: string, separateKeys: string[] = []): Promise<void> {
  const tx = (await db).transaction(['captures', 'units'], 'readwrite');
  const item = await tx.objectStore('captures').get(id);
  if (!item?.analysis || item.unitsCreated) { await tx.done; return; }
  if (item.analysis.transcript?.uncertain && !item.transcriptApproved) { await tx.done; throw new Error('Transcript chưa chắc chắn. Hãy đối chiếu audio và xác nhận bản sửa trước.'); }
  const units = await tx.objectStore('units').getAll();
  for (const k of item.analysis.knowledge) {
    const duplicate = separateKeys.includes(k.key) ? undefined : findDuplicate(k, units);
    if (duplicate) {
      duplicate.captureIds = [...new Set([...duplicate.captureIds, id])];
      duplicate.knowledge.examples = [...duplicate.knowledge.examples, ...k.examples].filter((e, i, a) => a.findIndex(x => normalize(x.en) === normalize(e.en)) === i).slice(-4);
      duplicate.updatedAt = Date.now();
      await tx.objectStore('units').put(duplicate);
    } else {
      const unit: Unit = { id: crypto.randomUUID(), canonical: canonical(k), knowledge: k, captureIds: [id], schedule: scheduler.initial(Date.now()), failures: 0, suspended: false, leech: false, encounters: 0, createdAt: Date.now(), updatedAt: Date.now() };
      units.push(unit); await tx.objectStore('units').add(unit);
    }
  }
  await tx.objectStore('captures').put({ ...item, unitsCreated: true, updatedAt: Date.now() });
  await tx.done;
}
export async function addManualUnit(id: string): Promise<void> {
  const tx = (await db).transaction('captures', 'readwrite');
  const item = await tx.store.get(id);
  if (item?.unitsCreated) { await tx.done; return; }
  if (!item || !item.note.trim()) throw new Error('Hãy ghi nghĩa tiếng Việt trước khi tạo bài học thủ công.');
  if (item.source.exact.length > 500) throw new Error('Bài thủ công cần đoạn chọn ngắn hơn 500 ký tự.');
  const k: Knowledge = { key: `manual:${normalize(item.source.exact)}`.slice(0, 490), kind: 'phrase', group: 'Ghi chú cá nhân', name: 'Cụm từ của bạn', form: item.source.exact, meaningVi: item.note, explanationVi: item.note, evidence: item.source.exact, examples: [{ en: item.source.exact, vi: item.note }, { en: item.source.exact, vi: item.note }], production: { instructionVi: `Viết lại bằng tiếng Anh: ${item.note}`, answerEn: item.source.exact }, cloze: { sentence: '[[blank]]', answer: item.source.exact, hintVi: item.note.slice(0, 500) } };
  await tx.store.put({ ...item, analysis: { schemaVersion: 1, meaningVi: item.note, contextNoteVi: 'Ghi chú thủ công; chưa qua AI.', knowledge: [k] }, status: 'ready', leaseUntil: 0, updatedAt: Date.now() });
  await tx.done;
  await acceptAnalysis(id);
}
export async function recordReview(input: { id: string; unitId: string; expectedReps: number; rating: 1 | 2 | 3 | 4; mode: ExerciseMode; answer: string; grade?: Grade; durationMs: number; assisted: boolean }): Promise<void> {
  const config = await settings();
  const tx = (await db).transaction(['units', 'reviews'], 'readwrite');
  if (await tx.objectStore('reviews').get(input.id)) { await tx.done; return; }
  const unit = await tx.objectStore('units').get(input.unitId);
  if (!unit || unit.schedule.reps !== input.expectedReps || unit.suspended) { await tx.done; throw new Error('Mục này đã thay đổi ở tab khác. Hãy tải lại phiên ôn.'); }
  const now = Date.now();
  // Looking at hints is recorded as a failed unaided retrieval, regardless of self-rating.
  const rating = input.assisted ? 1 : input.rating;
  const next = scheduler.review(unit.schedule, rating, now, config.retention, config.fsrsWeights);
  const review: Review = { id: input.id, unitId: input.unitId, mode: input.mode, answer: input.answer, grade: input.grade, durationMs: input.durationMs, assisted: input.assisted, rating, at: now, prior: unit.schedule, next };
  const failures = unit.failures + (rating === 1 ? 1 : 0);
  const leech = failures >= 5;
  await tx.objectStore('reviews').add(review);
  await tx.objectStore('units').put({ ...unit, schedule: next, failures, leech, suspended: leech || unit.suspended, updatedAt: now });
  await tx.done;
}
export async function reviseUnit(id: string, patch: Pick<Partial<Unit>, 'suspended' | 'alternativeVi' | 'reportedIssue' | 'priority'>): Promise<void> {
  const tx = (await db).transaction('units', 'readwrite');
  const unit = await tx.store.get(id);
  if (unit) await tx.store.put({ ...unit, ...patch, failures: patch.suspended === false ? 0 : unit.failures, leech: patch.suspended === false ? false : unit.leech, updatedAt: Date.now() });
  await tx.done;
}
export async function encounter(unitId: string, page: string) {
  const day = new Date().toLocaleDateString('en-CA');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(page.split('#')[0]));
  const pageHash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  const id = `${unitId}:${day}:${pageHash}`;
  const tx = (await db).transaction(['units', 'encounters'], 'readwrite');
  const unit = await tx.objectStore('units').get(unitId);
  if (unit && !await tx.objectStore('encounters').get(id)) {
    await tx.objectStore('encounters').add({ id, unitId, day, page: pageHash, at: Date.now() });
    await tx.objectStore('units').put({ ...unit, encounters: unit.encounters + 1, updatedAt: Date.now() });
  }
  await tx.done;
}
