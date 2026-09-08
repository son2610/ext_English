import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/data/db';
import { capture, claimJob, completeJob, acceptAnalysis, allData, enqueue, recordReview, settings, encounter, reviseUnit } from '../src/data/repository';
import { BackupSchema, exportData, importData, parseBackup } from '../src/data/backup';
import { defaultSettings, validateAnalysis } from '../src/domain/models';
import { scheduler, dueQueue, exercise } from '../src/domain/scheduler';
import { statistics } from '../src/ui/stats';
import { AhoCorasick } from '../src/content/matcher';
import { sourceLink } from '../src/shared/source-link';
import { AIError, GeminiProvider } from '../src/ai/provider';
import { analysis, source } from './fixtures';

beforeEach(async () => {
  vi.restoreAllMocks();
  const database = await db;
  for (const name of database.objectStoreNames) await database.clear(name);
});
async function analyzed() {
  const result = await capture(source, 'Ghi chú', true);
  const job = await claimJob(); expect(job).toBeDefined();
  await completeJob(job!, analysis);
  await acceptAnalysis(result.id);
  return allData();
}
describe('structured analysis and anchors', () => {
  it('accepts grounded structured output and rejects fabricated evidence or bad cloze', () => {
    expect(validateAnalysis(analysis, source).knowledge).toHaveLength(2);
    const fabricated = structuredClone(analysis); fabricated.knowledge[0]!.evidence = 'Never present in the source';
    expect(() => validateAnalysis(fabricated, source)).toThrow();
    const wrongCloze = structuredClone(analysis); wrongCloze.knowledge[0]!.cloze.answer = 'will know';
    expect(() => validateAnalysis(wrongCloze, source)).toThrow();
    const double = structuredClone(analysis); double.knowledge[0]!.cloze.sentence = '[[blank]] [[blank]]';
    expect(() => validateAnalysis(double, source)).toThrow();
  });
  it('preserves SPA hash and escapes fragment delimiters', () => {
    const link = sourceLink({ ...source, frameUrl: 'https://example.com/#/read', exact: 'well-known, & useful' });
    expect(link).toContain('#/read:~:text='); expect(link).toContain('well%2Dknown%2C%20%26%20useful');
    expect(() => sourceLink({ ...source, frameUrl: 'javascript:alert(1)' })).toThrow();
  });
});
describe('persistent capture and queue', () => {
  it('does not lose notes when an exact capture is repeated', async () => {
    const a = await capture(source, 'First', false);
    const b = await capture(source, 'Second', true);
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect((await allData()).captures[0]!.note).toBe('First\nSecond');
    expect((await allData()).captures[0]!.status).toBe('queued');
  });
  it('claims atomically and resumes expired jobs after worker death', async () => {
    await capture(source, '', true);
    const jobs = await Promise.all([claimJob(1000), claimJob(1000)]);
    expect(jobs.filter(Boolean)).toHaveLength(1);
    expect(await claimJob(90000)).toBeUndefined();
    const resumed = await claimJob(91001); expect(resumed?.attempts).toBe(2);
    await completeJob(jobs.find(Boolean)!, analysis);
    expect((await allData()).captures[0]!.status).toBe('processing');
    await completeJob(resumed!, analysis);
    expect((await allData()).captures[0]!.status).toBe('ready');
  });
  it('respects scheduled retries', async () => {
    await capture(source, '', true);
    const job = await claimJob(1000);
    await completeJob(job!, { error: 'Quota', retryAt: 500000 });
    expect(await claimJob(499999)).toBeUndefined();
    expect(await claimJob(500000)).toBeDefined();
  });
});
describe('units and scheduling', () => {
  it('creates independent schedules and offers idempotent merges preserving progress', async () => {
    const data = await analyzed(); expect(data.units).toHaveLength(2);
    const unit = data.units[0]!;
    await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: 0, rating: 3, mode: 'production', answer: 'An answer.', durationMs: 15000, assisted: false });
    const another = await capture({ ...source, url: 'https://example.com/two', frameUrl: 'https://example.com/two' }, '', true);
    await completeJob((await claimJob())!, analysis);
    await acceptAnalysis(another.id); await acceptAnalysis(another.id);
    const merged = await allData(); expect(merged.units).toHaveLength(2);
    expect(merged.units.find(u => u.id === unit.id)!.schedule.reps).toBe(1);
    expect(merged.units.every(u => u.captureIds.length === 2)).toBe(true);
  });
  it('rejects stale reviews and does not apply an idempotent review twice', async () => {
    const { units } = await analyzed(); const u = units[0]!;
    const input = { id: crypto.randomUUID(), unitId: u.id, expectedReps: 0, rating: 3 as const, mode: 'production' as const, answer: 'Test', durationMs: 1000, assisted: false };
    await recordReview(input); await recordReview(input);
    expect((await allData()).reviews).toHaveLength(1);
    await expect(recordReview({ ...input, id: crypto.randomUUID() })).rejects.toThrow('tab khác');
  });
  it('makes repeated failures leeches and treats hints as failed unaided retrieval', async () => {
    const { units } = await analyzed(); const u = units[0]!;
    for (let i = 0; i < 5; i++) await recordReview({ id: crypto.randomUUID(), unitId: u.id, expectedReps: i, rating: 4, mode: 'production', answer: 'Helped', durationMs: 2000, assisted: true });
    const updated = (await allData()).units.find(x => x.id === u.id)!;
    expect(updated.leech).toBe(true); expect(updated.suspended).toBe(true);
    expect((await allData()).reviews.every(r => r.rating === 1)).toBe(true);
    await reviseUnit(u.id, { suspended: false });
    expect((await (await db).get('units', u.id))?.failures).toBe(0);
  });
  it('uses actual FSRS state, rotates production/cloze/new examples and filters future items', async () => {
    const { units } = await analyzed(); const u = units[0]!;
    expect(exercise(u).mode).toBe('production');
    u.schedule = scheduler.review(u.schedule, 3, Date.now(), 0.9);
    expect(u.schedule.stability).toBeGreaterThan(0); expect(u.schedule.reps).toBe(1);
    expect(exercise(u).mode).toBe('cloze');
    u.schedule.reps = 2; expect(exercise(u).mode).toBe('transfer');
    u.schedule.due = Date.now() + 86400000;
    expect(dueQueue([u], Date.now(), 10)).toHaveLength(0);
    expect(dueQueue(units.filter(x => x.id !== u.id), Date.now(), 0)).toHaveLength(0);
  });
  it('separates exposure from review and deduplicates visits per page/day', async () => {
    const { units } = await analyzed(); const u = units[0]!;
    await Promise.all([encounter(u.id, 'https://example.com/#one'), encounter(u.id, 'https://example.com/#two')]);
    const updated = await (await db).get('units', u.id);
    expect(updated?.encounters).toBe(1); expect(updated?.schedule).toEqual(u.schedule);
    expect((await allData()).reviews).toHaveLength(0);
  });
});
describe('data ownership', () => {
  it('roundtrips all learning data, omits secrets and never rolls a schedule back', async () => {
    await analyzed(); const backup = await exportData();
    expect(BackupSchema.safeParse(backup).success).toBe(true);
    expect(JSON.stringify(backup)).not.toMatch(/geminiKey|apiKey/);
    const database = await db;
    for (const store of ['captures', 'units', 'reviews', 'encounters', 'meta'] as const) await database.clear(store);
    await importData(parseBackup(JSON.stringify(backup)));
    const restored = await exportData();
    expect(restored.units).toEqual(backup.units); expect(restored.captures).toEqual(backup.captures); expect(await settings()).toEqual(defaultSettings);
    const unit = restored.units[0]!;
    await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: 0, rating: 3, mode: 'production', answer: 'An answer', durationMs: 1000, assisted: false });
    await importData(backup);
    expect((await (await db).get('units', unit.id))?.schedule.reps).toBe(1);
    expect((await allData()).reviews).toHaveLength(1);
  });
  it('rejects malformed, duplicate and dangling imports before writing', async () => {
    await analyzed(); const backup = await exportData();
    const malformed = { ...backup, version: 3 };
    expect(() => parseBackup(JSON.stringify(malformed))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup, captures: [] }))).toThrow('liên kết');
    expect(() => parseBackup(JSON.stringify({ ...backup, units: [...backup.units, backup.units[0]] }))).toThrow('lặp');
    expect((await allData()).units).toHaveLength(2);
  });
  it('restores review answers, AI feedback and encounter data into an empty database', async () => {
    const { units } = await analyzed(); const unit = units[0]!;
    await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: 0, rating: 2, mode: 'production', answer: 'An equivalent answer.', grade: { correct: true, score: 90, feedbackVi: 'Đúng cấu trúc.', correctedEn: 'An equivalent answer.', errors: [] }, durationMs: 10000, assisted: false });
    await encounter(unit.id, 'https://example.com/read');
    const original = await exportData();
    const database = await db;
    for (const name of database.objectStoreNames) await database.clear(name);
    await importData(original);
    const restored = await exportData();
    expect(restored.reviews).toEqual(JSON.parse(JSON.stringify(original.reviews))); expect(restored.encounters).toEqual(original.encounters); expect(restored.units).toEqual(JSON.parse(JSON.stringify(original.units)));
  });
});
describe('matching and statistics', () => {
  it('matches shared suffixes, phrase boundaries and curly apostrophes without substring false positives', () => {
    const matcher = new AhoCorasick([{ id: '1', text: 'he', meaning: 'anh ấy' }, { id: '2', text: 'in spite of', meaning: 'mặc dù' }, { id: '3', text: "don't", meaning: 'không' }]);
    expect(matcher.search('The other hero. He works in spite of rain. Don’t stop.').map(m => m.pattern.id)).toEqual(['1', '2', '3']);
    const overlapping = new AhoCorasick([{ id: '1', text: 'have helped', meaning: '' }, { id: '2', text: 'would have helped', meaning: '' }]);
    expect(overlapping.search('I would have helped.')).toHaveLength(2);
  });
  it('does not display made-up retention when there are no mature reviews', async () => {
    const { units, reviews } = await analyzed();
    expect(statistics(units, reviews).retention).toBeNull(); expect(statistics(units, reviews).streak).toBe(0);
  });
});
describe('Gemini boundary', () => {
  it('uses schema output, isolates the key to a header and caches identical context', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(analysis) }] } }] }), { status: 200 }));
    const ai = new GeminiProvider('secret-test-key', 'gemini-test');
    await ai.analyze(source, ''); await ai.analyze(source, '');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).not.toContain('secret-test-key'); expect(options?.body).not.toContain('secret-test-key');
    expect(JSON.parse(options!.body as string).generationConfig.responseJsonSchema.type).toBe('object');
  });
  it('honors Retry-After and classifies authentication failures as nonretryable', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    const ai = new GeminiProvider('key', 'model');
    await expect(ai.analyze(source, '')).rejects.toMatchObject({ retryable: true, retryAfterMs: 120000 });
    fetcher.mockResolvedValue(new Response('', { status: 403 }));
    await expect(ai.analyze(source, '')).rejects.toMatchObject({ retryable: false });
  });
  it('does not persist invalid or truncated AI output as knowledge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] }), { status: 200 }));
    await expect(new GeminiProvider('key', 'model').analyze(source, '')).rejects.toBeInstanceOf(AIError);
    expect((await allData()).units).toHaveLength(0);
  });
  it('does not poison the cache with fabricated evidence', async () => {
    const bad = structuredClone(analysis); bad.knowledge[0]!.evidence = 'Fabricated evidence';
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(bad) }] } }] }), { status: 200 }));
    const ai = new GeminiProvider('key', 'model');
    await expect(ai.analyze(source, '')).rejects.toThrow();
    await expect(ai.analyze(source, '')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2); expect(await (await db).count('cache')).toBe(0);
  });
});
