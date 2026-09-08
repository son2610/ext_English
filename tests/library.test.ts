import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/data/db';
import { capture, claimJob, completeJob, acceptAnalysis, allData, enqueue, recordReview, encounter } from '../src/data/repository';
import { editCapture, editKnowledge, deleteLibraryItem } from '../src/data/library';
import { saveAssessment, savePractice, saveWeekly, completePractice } from '../src/data/enrichment';
import { exportData, parseBackup, importData } from '../src/data/backup';
import { SourceSchema, type Source, type Unit } from '../src/domain/models';
import { source, analysis } from './fixtures';
import { editSourceText, dictationText } from '../src/shared/source-text';
import { sourceLink } from '../src/shared/source-link';
import { gradeDictation } from '../src/learning/errors';
import { GeminiProvider } from '../src/ai/provider';

beforeEach(async () => { vi.restoreAllMocks(); const d = await db; for (const store of d.objectStoreNames) await d.clear(store); });
const video: Source = { ...source, video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start: 5.25, end: 9.8, language: 'en', automatic: true, timing: 'track', captionSource: 'text-track' } };
const grade = gradeDictation('The files.', 'file');
const drill = { instructionVi: 'Viết số nhiều.', answerEn: 'The files.', explanationVi: 'Thêm s.', category: 'plural' as const };
async function seed() {
  const saved = await capture(source, 'Ghi chú ban đầu', true);
  await completeJob((await claimJob())!, analysis); await acceptAnalysis(saved.id);
  return (await db).get('captures', saved.id).then(c => c!);
}
async function history(unit: Unit) {
  await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: 0, rating: 1, mode: 'production', answer: 'file', grade, durationMs: 1000, assisted: false });
  await saveAssessment({ id: crypto.randomUUID(), unitId: unit.id, at: Date.now(), mode: 'production', prompt: 'Viết', answer: 'file', grade, origin: 'ai' });
  await encounter(unit.id, source.url);
  await savePractice(unit.id, drill);
}
function response(data: unknown) { return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] }), { status: 200 }); }

describe('editable learning focus', () => {
  it('keeps the original quote, anchors and clip through repeated edits and backup', async () => {
    const edited = editSourceText(video, '  would have helped  ');
    expect(edited).toMatchObject({ exact: 'would have helped', originalExact: video.exact, video: video.video, context: video.context });
    expect(editSourceText(edited, 'helped').originalExact).toBe(video.exact);
    expect(SourceSchema.parse(edited)).toEqual(edited);
    expect(sourceLink(editSourceText(source, 'helped'))).toBe(sourceLink(source));
    const saved = await capture(edited, '', false);
    const c = (await db).get('captures', saved.id);
    expect(dictationText((await c)!)).toBe(video.exact);
    expect(parseBackup(JSON.stringify(await exportData())).captures[0]!.source.originalExact).toBe(video.exact);
    expect(() => editSourceText(source, ' \n ')).toThrow();
    expect(() => editSourceText(source, 'x'.repeat(8001))).toThrow();
  });
  it('sends the edited focus to grammar AI and the whole original quote to transcript repair', async () => {
    const repair = { textEn: video.exact, uncertain: false, warningVi: '', changes: [] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(repair)).mockResolvedValueOnce(response(analysis));
    await new GeminiProvider('fixture', 'model').analyze(editSourceText(video, 'would have helped'), 'Ghi chú');
    const bodies = fetcher.mock.calls.map(call => JSON.parse(String(call[1]!.body)) as { contents: { parts: { text: string }[] }[] });
    expect(bodies[0]!.contents[0]!.parts[0]!.text).toContain(JSON.stringify(video.exact));
    const grammarInput = bodies[1]!.contents[0]!.parts[0]!.text;
    expect(grammarInput).toContain('"selected":"would have helped"');
    expect(grammarInput).toContain('"originalQuote":');
  });
  it('invalidates old analysis and in-flight results while preserving independent lessons', async () => {
    const c = await seed(); const oldUnits = (await allData()).units;
    await editCapture(c.id, { exact: 'would have helped', note: 'Sửa câu' }, c.updatedAt);
    let fresh = (await (await db).get('captures', c.id))!;
    expect(fresh).toMatchObject({ status: 'saved', unitsCreated: false, leaseUntil: 0 }); expect(fresh.analysis).toBeUndefined();
    expect((await allData()).units).toEqual(oldUnits);
    await enqueue([c.id]); const job = (await claimJob())!;
    fresh = (await (await db).get('captures', c.id))!;
    await editCapture(c.id, { exact: 'helped', note: '' }, fresh.updatedAt);
    await completeJob(job, analysis);
    expect((await (await db).get('captures', c.id))!.analysis).toBeUndefined();
    await enqueue([c.id]); await completeJob((await claimJob())!, analysis); await acceptAnalysis(c.id);
    expect((await allData()).units.map(u => u.id).sort()).toEqual(oldUnits.map(u => u.id).sort());
  });
  it('keeps analysis when only the note changes, and rejects stale edits and deletion', async () => {
    const c = await seed();
    await editCapture(c.id, { exact: c.source.exact, note: 'Ghi chú mới' }, c.updatedAt);
    expect((await (await db).get('captures', c.id))!.analysis).toEqual(c.analysis);
    await expect(editCapture(c.id, { exact: 'overwrite', note: '' }, c.updatedAt)).rejects.toThrow('tab khác');
    await expect(deleteLibraryItem({ kind: 'capture', id: c.id, updatedAt: c.updatedAt })).rejects.toThrow('tab khác');
    expect(await (await db).count('backups')).toBe(0);
  });
  it('edits exercises without resetting FSRS or history and removes stale pending drills', async () => {
    await seed(); const unit = (await allData()).units[0]!; await history(unit);
    const before = (await (await db).get('units', unit.id))!;
    const practice = (await (await db).getAll('practices'))[0]!;
    const knowledge = { ...before.knowledge, form: 'A corrected formula', meaningVi: 'Nghĩa đã sửa', cloze: { ...before.knowledge.cloze, answer: 'had understood' } };
    await editKnowledge(unit.id, knowledge, before.updatedAt);
    const after = (await (await db).get('units', unit.id))!;
    expect(after.schedule).toEqual(before.schedule); expect(after.encounters).toBe(1); expect(after.failures).toBe(1);
    expect(after.knowledge.cloze.answer).toBe('had understood'); expect(after.canonical).not.toBe(before.canonical);
    expect(await (await db).count('reviews')).toBe(1); expect(await (await db).count('assessments')).toBe(1); expect(await (await db).count('practices')).toBe(0);
    await expect(completePractice(practice, 'file', grade)).rejects.toThrow('thay đổi');
    await expect(savePractice(unit.id, drill, before.updatedAt)).rejects.toThrow('thay đổi');
    await expect(editKnowledge(unit.id, { ...knowledge, cloze: { ...knowledge.cloze, sentence: 'no blank' } }, after.updatedAt)).rejects.toThrow('[[blank]]');
    await expect(editKnowledge(unit.id, { ...knowledge, form: ' ' }, after.updatedAt)).rejects.toThrow('trống');
    parseBackup(JSON.stringify(await exportData()));
  });
});

describe('library deletion and recovery', () => {
  it('detaches shared knowledge, cascades exclusive history, prunes weekly links and snapshots atomically', async () => {
    const first = await seed();
    const second = await capture({ ...source, frameUrl: 'https://example.com/second' }, '', true);
    await completeJob((await claimJob())!, { ...analysis, knowledge: [analysis.knowledge[0]!] }); await acceptAnalysis(second.id);
    const units = (await allData()).units; const shared = units.find(u => u.captureIds.length === 2)!; const exclusive = units.find(u => u.captureIds.length === 1)!;
    for (const unit of units) await history(unit);
    const sharedBefore = (await (await db).get('units', shared.id))!;
    await saveWeekly({ week: '2026-W35', titleVi: 'Tuần', textEn: 'An example.', meaningVi: 'Ví dụ.', coverage: units.map(u => ({ unitId: u.id, quote: 'An example.' })) });
    await saveWeekly({ week: '2026-W34', titleVi: 'Tuần', textEn: 'An example.', meaningVi: 'Ví dụ.', coverage: [{ unitId: exclusive.id, quote: 'An example.' }] });
    await deleteLibraryItem({ kind: 'capture', id: first.id, updatedAt: first.updatedAt });
    const exported = parseBackup(JSON.stringify(await exportData()));
    expect(exported.captures.map(c => c.id)).toEqual([second.id]);
    expect(exported.units).toHaveLength(1); expect(exported.units[0]!.captureIds).toEqual([second.id]);
    expect(exported.units[0]!.schedule).toEqual(sharedBefore.schedule);
    for (const list of [exported.reviews, exported.encounters, exported.assessments, exported.practices]) expect(list.map(row => row.unitId)).toEqual([shared.id]);
    expect(exported.weekly).toHaveLength(1); expect(exported.weekly[0]!.coverage.map(c => c.unitId)).toEqual([shared.id]);
    const safety = parseBackup((await (await db).getAll('backups'))[0]!.json);
    expect(safety.captures).toHaveLength(2); expect(safety.reviews).toHaveLength(2);
    await importData(safety);
    expect((await allData()).captures).toHaveLength(2); expect((await allData()).units).toHaveLength(2);
    parseBackup(JSON.stringify(await exportData()));
  });
  it('deletes a lesson across captures and rejects late AI writes without resurrecting references', async () => {
    const c = await seed(); const unit = (await allData()).units[0]!; await history(unit);
    const fresh = (await (await db).get('units', unit.id))!;
    await deleteLibraryItem({ kind: 'unit', id: fresh.id, updatedAt: fresh.updatedAt });
    expect((await allData()).captures[0]!.id).toBe(c.id);
    expect(await (await db).count('reviews')).toBe(0);
    await expect(savePractice(unit.id, drill)).rejects.toThrow();
    await expect(saveAssessment({ id: crypto.randomUUID(), unitId: unit.id, at: Date.now(), mode: 'production', prompt: '', answer: '', grade, origin: 'ai' })).rejects.toThrow();
    await saveWeekly({ week: '2026-W35', titleVi: 'Tuần', textEn: 'An example.', meaningVi: 'Ví dụ.', coverage: [{ unitId: unit.id, quote: 'An example.' }] });
    expect(await (await db).count('weekly')).toBe(0);
    parseBackup(JSON.stringify(await exportData()));
  });
  it('does not resurrect a removed capture when its background analysis finishes', async () => {
    const c = await capture(source, '', true); const job = (await claimJob())!;
    await deleteLibraryItem({ kind: 'capture', id: job.id, updatedAt: job.updatedAt });
    await completeJob(job, analysis); await acceptAnalysis(c.id);
    expect((await allData()).captures).toHaveLength(0); expect((await allData()).units).toHaveLength(0);
  });
});
