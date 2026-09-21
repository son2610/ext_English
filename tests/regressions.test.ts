import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/data/db';
import { acceptAnalysis, addManualUnit, allData, capture, claimJob, completeJob, enqueue, MAX_ATTEMPTS, recordReview, reviseUnit, saveGeneralSettings, saveSettings, settings } from '../src/data/repository';
import { defaultSettings, validateAnalysis, type Capture, type Unit } from '../src/domain/models';
import { buildLabCards } from '../src/domain/lab';
import { exercise, initialsHint } from '../src/domain/scheduler';
import { AhoCorasick } from '../src/content/matcher';
import { hasConfiguredProvider } from '../src/ai/factory';
import { pruneCooldowns } from '../src/ai/structured-client';
import { providers, type AIConfiguration } from '../src/domain/ai-config';
import { dictationPassage, DICTATION_AUTO_WORDS } from '../src/learning/errors';
import { statistics } from '../src/ui/stats';
import { analysis, source } from './fixtures';

beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  const database = await db;
  for (const name of database.objectStoreNames) await database.clear(name);
});
async function manualUnit(exact = 'take for granted', note = 'coi là điều hiển nhiên'): Promise<Unit> {
  const saved = await capture({ ...source, exact }, note, false);
  await addManualUnit(saved.id);
  return (await allData()).units[0]!;
}
const at = (unit: Unit, reps: number): Unit => ({ ...unit, schedule: { ...unit.schedule, reps } });

describe('note-only lessons in review', () => {
  it('never shows an empty cloze or prints the answer in the prompt', async () => {
    const unit = await manualUnit();
    for (let reps = 0; reps < 12; reps++) {
      const task = exercise(at(unit, reps));
      expect(task.prompt.replace(/_+/g, '').trim()).not.toBe('');
      expect(task.prompt.toLowerCase()).not.toContain('take for granted');
      expect(task.hint.toLowerCase()).not.toContain('take for granted');
      expect(task.answer).toBe('take for granted');
    }
    expect(exercise(at(unit, 1)).mode).toBe('production');
    expect(exercise(at(unit, 2)).mode).toBe('production');
    expect(exercise(at(unit, 0)).hint).toBe('t___ f__ g______');
  });
  it('keeps the AI rotation and hints unchanged for analyzed lessons', async () => {
    const saved = await capture(source, '', true); await completeJob((await claimJob())!, analysis); await acceptAnalysis(saved.id);
    const unit = (await allData()).units.find(u => u.knowledge.kind === 'grammar')!;
    expect([0, 1, 2].map(reps => exercise(at(unit, reps)).mode)).toEqual(['production', 'cloze', 'transfer']);
    expect(exercise(at(unit, 1)).prompt).toBe('If I ________, I would have helped.');
    expect(exercise(at(unit, 0)).hint).toBe(unit.knowledge.form);
    expect(initialsHint('a well-known API')).toBe('_ w___-k____ A__');
  });
  it('still offers the Lab cloze with its hint for note-only lessons', async () => {
    const unit = await manualUnit();
    const card = buildLabCards((await allData()).captures, [unit]).find(c => c.unitId === unit.id)!;
    expect(card.cloze).toEqual({ sentence: '[[blank]]', answer: 'take for granted', hintVi: 'coi là điều hiển nhiên' });
  });
});

describe('dictation passages', () => {
  const web = (exact: string): Capture => ({ id: crypto.randomUUID(), source: { ...source, exact }, note: '', status: 'ready', attempts: 0, nextAttemptAt: 0, leaseUntil: 0, updatedAt: 0, unitsCreated: true });
  it('uses the short saved sentence, but the quoted evidence for a long web selection', () => {
    expect(dictationPassage(web('If I had known, I would have helped.'), 'If I had known')).toBe('If I had known, I would have helped.');
    const long = Array.from({ length: DICTATION_AUTO_WORDS + 10 }, (_, i) => `word${i}`).join(' ');
    expect(dictationPassage(web(long), 'If I had known')).toBe('If I had known');
    expect(dictationPassage(web(long), '')).toBe(long);
    expect(dictationPassage(undefined, 'If I had known')).toBe('If I had known');
  });
  it('keeps a video passage aligned with its audio clip', () => {
    const long = Array.from({ length: DICTATION_AUTO_WORDS + 10 }, (_, i) => `word${i}`).join(' ');
    const video = { ...web(long), source: { ...source, exact: long, video: { provider: 'youtube' as const, videoId: 'dQw4w9WgXcQ', start: 1, end: 20, language: 'en', automatic: false, timing: 'track' as const, captionSource: 'timedtext' as const } } };
    expect(dictationPassage(video, 'word1')).toBe(long);
  });
});

describe('literal answers and matching', () => {
  it('restores cloze answers containing "$" replacement patterns literally', () => {
    const text = 'The fee rose to $& more, then $$ again.';
    const item = { ...analysis.knowledge[0]!, evidence: 'The fee rose', cloze: { sentence: 'The fee rose to [[blank]] more, then $$ again.', answer: '$&', hintVi: 'Ký hiệu' } };
    expect(() => validateAnalysis({ ...analysis, knowledge: [item] }, { ...source, exact: text, context: text })).not.toThrow();
  });
  it('matches phrases containing characters outside the Basic Multilingual Plane', () => {
    const matcher = new AhoCorasick([{ id: 'rocket', text: 'ship it 🚀', meaning: 'phát hành' }]);
    expect(matcher.search('Time to ship it 🚀 today').map(m => m.pattern.id)).toEqual(['rocket']);
  });
});

describe('settings and queue safety', () => {
  it('does not roll back calibrated FSRS weights when a stale general form is saved', async () => {
    const stale = await settings();
    const weights = Array.from({ length: 21 }, (_, i) => i / 10 + 0.1);
    await saveSettings({ ...(await settings()), fsrsWeights: weights });
    await saveGeneralSettings({ ...stale, retention: 0.93 });
    expect(await settings()).toMatchObject({ retention: 0.93, fsrsWeights: weights });
  });
  it('does not resend analyzed captures from a bulk request, but still queues unanalyzed ones', async () => {
    const done = await capture(source, '', true); await completeJob((await claimJob())!, analysis);
    const fresh = await capture({ ...source, exact: 'Things are different now.' }, '', false);
    await enqueue([done.id, fresh.id]);
    const database = await db;
    expect(await database.get('captures', done.id)).toMatchObject({ status: 'ready', analysis });
    expect((await database.get('captures', fresh.id))?.status).toBe('queued');
  });
  it('stops reclaiming a job whose every attempt was interrupted', async () => {
    const saved = await capture(source, '', true);
    let now = 1000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) { expect((await claimJob(now))?.attempts).toBe(attempt); now += 91000; }
    expect(await claimJob(now)).toBeUndefined();
    const item = (await (await db).get('captures', saved.id))!;
    expect(item).toMatchObject({ status: 'error', leaseUntil: 0 }); expect(item.error).toContain('Nhờ AI phân tích');
    await enqueue([saved.id]); expect((await claimJob(now))?.attempts).toBe(1);
  });
  it('keeps failures when a content report is cleared, and still resets a released leech', async () => {
    const saved = await capture(source, '', true); await completeJob((await claimJob())!, analysis); await acceptAnalysis(saved.id);
    const unit = (await allData()).units[0]!;
    for (let i = 0; i < 2; i++) await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: i, rating: 1, mode: 'production', answer: '', durationMs: 1, assisted: false });
    await reviseUnit(unit.id, { reportedIssue: 'Sai tên', suspended: true });
    await reviseUnit(unit.id, { reportedIssue: '', suspended: false });
    expect(await (await db).get('units', unit.id)).toMatchObject({ failures: 2, leech: false, suspended: false });
    for (let i = 2; i < 5; i++) await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: i, rating: 1, mode: 'production', answer: '', durationMs: 1, assisted: false });
    expect(await (await db).get('units', unit.id)).toMatchObject({ failures: 5, leech: true, suspended: true });
    await reviseUnit(unit.id, { suspended: false });
    expect(await (await db).get('units', unit.id)).toMatchObject({ failures: 0, leech: false, suspended: false });
  });
});

describe('provider readiness and cooldown rows', () => {
  const connection = (provider: 'gemini' | 'deepseek') => ({ id: provider, name: providers[provider].name, provider, enabled: true, model: providers[provider].model, baseUrl: providers[provider].baseUrl });
  beforeEach(() => {
    const storage: Record<string, unknown> = { aiKeys: { [`deepseek:deepseek:${providers.deepseek.baseUrl}`]: { binding: `deepseek:${providers.deepseek.baseUrl}`, key: 'fixture-deepseek-secret' } } };
    vi.stubGlobal('chrome', { storage: { local: {
      setAccessLevel: vi.fn(async () => undefined),
      get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(key => [key, storage[key]]))),
    } }, permissions: { contains: vi.fn(async () => true) } });
  });
  it('treats a queue as blocked when fallback is off and only a later connection has a key', async () => {
    const ai = (fallback: boolean): AIConfiguration => ({ fallback, connections: [connection('gemini'), connection('deepseek')] });
    await saveSettings({ ...defaultSettings, ai: ai(false) }); expect(await hasConfiguredProvider()).toBe(false);
    await saveSettings({ ...defaultSettings, ai: ai(true) }); expect(await hasConfiguredProvider()).toBe(true);
  });
  it('removes only expired cooldown rows', async () => {
    const database = await db;
    await database.put('meta', { key: 'aiCooldown:old', value: 1000 });
    await database.put('meta', { key: 'aiCooldown:active', value: 9000 });
    await database.put('meta', { key: 'lastSnapshot', value: 1 });
    await pruneCooldowns(5000);
    expect((await database.getAllKeys('meta')).sort()).toEqual(['aiCooldown:active', 'lastSnapshot']);
  });
});

describe('statistics after the single-pass rewrite', () => {
  it('counts days and knowledge groups exactly as before', () => {
    const now = new Date(2026, 8, 21, 12).getTime(), day = 86400000;
    const unit = (id: string, group: string) => ({ id, knowledge: { group } }) as Unit;
    const review = (unitId: string, ago: number, rating: number, assisted = false) => ({ id: crypto.randomUUID(), unitId, at: now - ago, rating, assisted, prior: { state: 2 } }) as never;
    const units = [unit('a', 'Thì'), unit('b', 'Giới từ'), unit('c', 'Thì')];
    const reviews = [review('a', 0, 3), review('c', 0, 3), review('b', day, 2, true), review('b', 2 * day, 4), review('gone', 0, 4), review('a', 40 * day, 1)];
    const stats = statistics([...units, unit('d', 'Mạo từ')], reviews, now);
    expect(stats.days.at(-1)).toMatchObject({ count: 3 }); expect(stats.days.at(-2)).toMatchObject({ count: 1 }); expect(stats.days.at(-3)).toMatchObject({ count: 1 });
    expect(stats.days.reduce((n, d) => n + d.count, 0)).toBe(5);
    expect(stats.groups).toEqual([{ group: 'Giới từ', count: 2, retention: 0.5 }, { group: 'Thì', count: 2, retention: 1 }, { group: 'Mạo từ', count: 0, retention: null }]);
    expect(stats.streak).toBe(3);
  });
});
