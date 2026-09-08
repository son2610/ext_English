import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/data/db';
import { capture, enqueue, claimJob, completeJob, acceptAnalysis, allData, saveSettings, encounter, recordReview } from '../src/data/repository';
import { defaultSettings, GradeSchema, type Review, type Source } from '../src/domain/models';
import { source, analysis } from './fixtures';
import { youtubeId, parseJson3, recentSentences, CaptionHistory, groupSentences, type CaptionCue } from '../src/video/captions';
import { RewatchController } from '../src/video/rewatch';
import { alignDictation, gradeDictation, errorProfile } from '../src/learning/errors';
import { reserveUsage, finishUsage, saveAssessment, backfillAssessments, savePractice, completePractice, saveWeekly } from '../src/data/enrichment';
import { exportData, parseBackup, importData } from '../src/data/backup';
import { GeminiProvider } from '../src/ai/provider';
import { lookupDictionary } from '../src/ai/dictionary';
import { expandInflections } from '../src/learning/inflections';
import { AhoCorasick } from '../src/content/matcher';
import { familiarity, parseFrequency, learningPriority } from '../src/learning/frequency';
import { grammarTopic } from '../src/learning/taxonomy';
import { scheduler, dueQueue } from '../src/domain/scheduler';
import { calibrate, replayLoss } from '../src/learning/optimizer';
import { default_w } from 'ts-fsrs';
import { previousWeek } from '../src/learning/maintenance';

beforeEach(async () => { vi.restoreAllMocks(); const database = await db; for (const name of database.objectStoreNames) await database.clear(name); });
const clip = { provider: 'youtube' as const, videoId: 'dQw4w9WgXcQ', start: 10.25, end: 14.75, language: 'en', automatic: true, timing: 'track' as const, captionSource: 'timedtext' as const };
const video: Source = { ...source, video: clip };
const cue = (text: string, start: number, end: number): CaptionCue => ({ text, start, end, language: 'en', automatic: false, timing: 'track', source: 'text-track' });
async function seed() { const result = await capture(source, '', true); await completeJob((await claimJob())!, analysis); await acceptAnalysis(result.id); return (await allData()).units[0]!; }
function response(value: unknown) { return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { totalTokenCount: 123 } }), { status: 200 }); }

describe('YouTube source, timing and playback', () => {
  it('recognizes supported video URL forms without trusting lookalike domains', () => {
    for (const url of [`https://www.youtube.com/watch?v=${clip.videoId}&list=PLx`, `https://www.youtube.com/shorts/${clip.videoId}`, `https://m.youtube.com/live/${clip.videoId}`, `https://www.youtube-nocookie.com/embed/${clip.videoId}`, `https://youtu.be/${clip.videoId}`]) expect(youtubeId(url)).toBe(clip.videoId);
    expect(youtubeId(`https://youtube.com.attacker.test/watch?v=${clip.videoId}`)).toBeUndefined(); expect(youtubeId('https://youtube.com/watch?v=short')).toBeUndefined();
  });
  it('selects a recently finished sentence, preserving cue time rather than delayed keypress', () => {
    const recent = recentSentences([cue('The first sentence.', 1, 3), cue('I would have helped.', 5.25, 9.8), cue('Now we continue.', 10, 13)], 11.2);
    expect(recent.choices).toHaveLength(3); const chosen = recent.choices.find(c => c.id === recent.preferred)!;
    expect(chosen.text).toBe('I would have helped.'); expect(chosen.start).toBe(5.25); expect(chosen.end).toBe(9.8);
  });
  it('groups ASR fragments, removes rolling overlap and retains bounded original timing', () => {
    const grouped = groupSentences([cue('if I had', 2, 4), cue('had known', 3, 5), cue('I would have helped.', 5.2, 7)]);
    expect(grouped).toHaveLength(1); expect(grouped[0]?.text).toBe('if I had known I would have helped.'); expect(grouped[0]?.start).toBe(2); expect(grouped[0]?.end).toBe(7);
    expect(groupSentences([cue('bad', 5, 2), cue('too long', 0, 100)])).toEqual([]);
  });
  it('parses timedtext JSON3 and labels display observation as approximate through seeks', () => {
    const parsed = parseJson3({ events: [{ tStartMs: 10250, dDurationMs: 4500, segs: [{ utf8: 'Hello &amp; ' }, { utf8: 'welcome.' }] }, { tStartMs: 1, segs: [] }] }, 'en', true);
    expect(parsed[0]).toMatchObject({ start: 10.25, end: 14.75, text: 'Hello & welcome.', timing: 'track' });
    const history = new CaptionHistory(); history.observe('One', 3, 'en'); history.observe('One', 4, 'en'); history.observe('Two', 4.5, 'en'); history.observe('After seek', 80, 'en');
    expect(history.cues[0]).toMatchObject({ start: 3, end: 4.5, timing: 'observed' }); expect(history.cues[1]!.end).toBeLessThan(6); expect(history.cues[2]!.start).toBe(80);
  });
  it('pauses at boundaries, repeats clips, controls first-pass captions and restores speed', async () => {
    const media = { currentTime: 0, playbackRate: 1.25, pause: vi.fn(), play: vi.fn(async () => undefined) }; const change = vi.fn();
    const controller = new RewatchController(media, [{ start: 2, end: 4 }, { start: 7, end: 8 }], 2, 0.75, change, true);
    await controller.start(); expect(media.currentTime).toBe(2); expect(change).toHaveBeenLastCalledWith(true, 0, 1);
    media.currentTime = 4; await controller.tick(); expect(media.currentTime).toBe(2); expect(change).toHaveBeenLastCalledWith(false, 0, 2);
    media.currentTime = 4; await controller.tick(); expect(media.currentTime).toBe(7); expect(change).toHaveBeenLastCalledWith(true, 1, 1);
    media.currentTime = 8; await controller.tick(); media.currentTime = 8; await controller.tick();
    expect(controller.active).toBe(false); expect(media.playbackRate).toBe(1.25); expect(media.pause).toHaveBeenCalled();
  });
  it('defers video AI until explicit release, deduplicates only the same clip, and indexes notes', async () => {
    const first = await capture(video, 'Note', true); expect(await claimJob()).toBeUndefined();
    expect((await capture(video, 'More', true)).id).toBe(first.id);
    expect((await capture({ ...video, video: { ...clip, start: 20, end: 24 } }, '', true)).duplicate).toBe(false);
    expect(await (await db).countFromIndex('captures', 'videoId', clip.videoId)).toBe(2);
    await enqueue([first.id]); expect((await claimJob())?.id).toBe(first.id);
  });
  it('rejects mixed-language batches atomically and requires approval for uncertain repairs', async () => {
    const english = await capture(video, '', true); const other = await capture({ ...video, video: { ...clip, start: 20, end: 24, language: 'vi' } }, '', true);
    await expect(enqueue([english.id, other.id])).rejects.toThrow(); expect(await claimJob()).toBeUndefined();
    await enqueue([english.id]); const job = (await claimJob())!;
    await completeJob(job, { ...analysis, transcript: { textEn: source.exact, uncertain: true, warningVi: 'Cần nghe lại từ này.', changes: [] } });
    await expect(acceptAnalysis(english.id)).rejects.toThrow(); expect((await allData()).units).toHaveLength(0);
    const database = await db; const c = (await database.get('captures', english.id))!; await database.put('captures', { ...c, transcriptApproved: true }); await acceptAnalysis(c.id);
    expect((await allData()).units).toHaveLength(2);
  });
});
describe('durable errors, budget and portable data', () => {
  it('aligns article and ending omissions and saves every mismatch instead of truncating', () => {
    const result = gradeDictation('The developers worked on the files.', 'developers work on file');
    expect(result.correct).toBe(false); expect(result.errors.some(e => e.category === 'article')).toBe(true); expect(result.errors.some(e => e.category === 'tense_aspect')).toBe(true);
    expect(GradeSchema.safeParse(result).success).toBe(true); expect(gradeDictation('Hello, world!', 'hello world').correct).toBe(true);
    expect(gradeDictation(Array.from({ length: 20 }, (_, i) => `word${i}`).join(' '), 'no').errors.length).toBeGreaterThan(12);
    expect(() => alignDictation('word '.repeat(301), 'word')).toThrow('300');
  });
  it('persists assessment before any FSRS rating, idempotently, and retains old grades on migration', async () => {
    const unit = await seed(); const grade = gradeDictation('The files worked.', 'file work');
    const assessment = { id: crypto.randomUUID(), unitId: unit.id, at: Date.now(), mode: 'dictation' as const, prompt: 'Nghe', answer: 'file work', grade, origin: 'dictation' as const };
    await saveAssessment(assessment); await saveAssessment(assessment); expect(await (await db).count('assessments')).toBe(1); expect((await allData()).reviews).toHaveLength(0);
    await recordReview({ id: crypto.randomUUID(), unitId: unit.id, expectedReps: 0, rating: 1, mode: 'production', answer: 'file work', grade, durationMs: 500, assisted: false });
    await backfillAssessments(); await backfillAssessments(); expect(await (await db).count('assessments')).toBe(2); expect(errorProfile(await (await db).getAll('assessments'))[0]!.count).toBeGreaterThan(0);
  });
  it('reserves quota transactionally under concurrency and keeps failed calls counted', async () => {
    await saveSettings({ ...defaultSettings, dailyApiLimit: 2 });
    const results = await Promise.allSettled([reserveUsage('fast', 'analysis'), reserveUsage('strong', 'grading'), reserveUsage('fast', 'analysis')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2); const first = results.find(r => r.status === 'fulfilled');
    if (first?.status === 'fulfilled') await finishUsage(first.value, 'failed');
    await expect(reserveUsage('fast', 'analysis')).rejects.toThrow('hạn mức'); expect(await (await db).count('usage')).toBe(2);
  });
  it('roundtrips added stores and still imports version 1 backups', async () => {
    const unit = await seed(); const grade = gradeDictation('The file.', 'file');
    const practice = await savePractice(unit.id, { instructionVi: 'Viết câu', answerEn: 'The file.', explanationVi: 'Mạo từ.', category: 'article' }); await completePractice(practice, 'file', grade);
    await saveWeekly({ week: '2026-08-31', titleVi: 'Một tuần', textEn: 'The file.', meaningVi: 'Tập tin.', coverage: [{ unitId: unit.id, quote: 'The file' }] });
    const usage = await reserveUsage('test', 'weekly'); await finishUsage(usage, 'success', 300); await encounter(unit.id, source.url);
    await capture(video, 'Một clip cần giữ', true);
    await (await db).put('dictionary', { id: 'help', word: 'help', checkedAt: Date.now(), status: 'found', phonetic: '/help/', definitions: [{ partOfSpeech: 'verb', definition: 'To assist.' }], sources: ['https://en.wiktionary.org/wiki/help'], license: 'CC BY-SA 3.0' });
    await (await db).put('optimization', { id: crypto.randomUUID(), at: Date.now(), reviews: 1200, trainingSamples: 500, validationSamples: 100, baselineLoss: 0.3, candidateLoss: 0.31, applied: false, weights: [...default_w], previousWeights: [...default_w], noteVi: 'Giữ tham số cũ.' });
    const backup = await exportData(); const database = await db; for (const name of database.objectStoreNames) await database.clear(name);
    await importData(parseBackup(JSON.stringify(backup))); const restored = await exportData();
    for (const key of ['captures', 'assessments', 'practices', 'weekly', 'usage', 'encounters', 'dictionary', 'optimization'] as const) expect(restored[key]).toEqual(JSON.parse(JSON.stringify(backup[key])));
    const legacy: Record<string, unknown> = { ...backup, version: 1 }; for (const key of ['assessments', 'practices', 'weekly', 'usage', 'dictionary', 'optimization']) delete legacy[key];
    expect(parseBackup(JSON.stringify(legacy)).assessments).toEqual([]);
  });
  it('routes models by task, tracks tokens, and repairs ASR before grammatical analysis', async () => {
    const repair = { textEn: source.exact, uncertain: true, warningVi: 'Nghe lại.', changes: [] }; const grade = gradeDictation('The file.', 'file');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(repair)).mockResolvedValueOnce(response(analysis)).mockResolvedValueOnce(response(grade));
    const ai = new GeminiProvider('test-key', 'fast-model', 'strong-model'); const result = await ai.analyze(video, '');
    expect(result.transcript).toEqual(repair); await ai.grade(analysis.knowledge[0]!, 'Viết', 'file');
    expect(String(fetcher.mock.calls[0]![0])).toContain('fast-model'); expect(String(fetcher.mock.calls[2]![0])).toContain('strong-model');
    const usage = await (await db).getAll('usage'); expect(usage.map(u => u.task).sort()).toEqual(['analysis', 'grading', 'transcript']); expect(usage.every(u => u.tokens === 123 && u.status === 'success')).toBe(true);
  });
  it('validates weekly coverage and caches dictionary evidence without interpreting 404 as invalid language', async () => {
    const unit = await seed(); const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ titleVi: 'Tuần', textEn: 'A sentence.', meaningVi: 'Một câu.', coverage: [{ unitId: unit.id, quote: 'Not here' }] }));
    await expect(new GeminiProvider('test', 'fast').weekly([unit])).rejects.toThrow('bao phủ');
    fetcher.mockResolvedValue(new Response('[]', { status: 404 })); const missing = await lookupDictionary('would have'); expect(missing.status).toBe('not_found');
    const calls = fetcher.mock.calls.length; await lookupDictionary('would have'); expect(fetcher).toHaveBeenCalledTimes(calls);
  });
});
describe('offline priorities, morphology and conservative calibration', () => {
  it('recognizes audited inflections with word boundaries and leaves exposure outside FSRS', () => {
    const matcher = new AhoCorasick(expandInflections([{ id: 'write', text: 'write down', meaning: 'ghi lại' }]));
    expect(matcher.search('She wrote down the notes.')).toHaveLength(1); expect(matcher.search('Rewrite downstairs.')).toHaveLength(0);
    expect(expandInflections([{ id: '1', text: 'go away', meaning: '' }], 2)).toHaveLength(2);
  });
  it('prioritizes common new items without displacing any overdue learned units', async () => {
    const unit = await seed(); const old = { ...unit, id: 'old', schedule: { ...unit.schedule, reps: 2, due: 1 } };
    const rare = { ...unit, id: 'rare', priority: 'low' as const }; const common = { ...unit, id: 'common', priority: 'high' as const };
    const queue = dueQueue([rare, old, common], Date.now(), 1, u => learningPriority(u, new Map())); expect(queue.map(u => u.id)).toEqual(['old', 'common']);
    const ranks = parseFrequency('hello 1000\nworld 500'); expect(familiarity({ ...unit.knowledge, kind: 'phrase', form: 'hello world' }, ranks)).toMatchObject({ rank: 2, level: 'A1' });
    expect(familiarity({ ...unit.knowledge, kind: 'phrase', form: 'unobtainium' }, ranks).level).toBeUndefined();
    expect(grammarTopic({ ...unit.knowledge, kind: 'grammar', key: 'grammar:conditional-third', group: 'Thể hoàn thành' })?.id).toBe('conditional3');
  });
  it('refuses to calibrate sparse or partial history and never optimizes against held-out outcomes', () => {
    expect(calibrate([]).applied).toBe(false);
    const history: Review[] = [];
    for (let unit = 0; unit < 100; unit++) {
      let card = scheduler.initial(1700000000000);
      for (let n = 0; n < 12; n++) { const at = 1700000000000 + n * 3 * 86400000 + unit * 1000; const rating = n % 3 === 1 ? 1 : 3; const next = scheduler.review(card, rating, at, 0.9); history.push({ id: `review-${unit}-${n}`, unitId: `unit-${unit}`, at, rating, mode: 'production', answer: '', prior: card, next, durationMs: 1000, assisted: false }); card = next; }
    }
    const first = calibrate(history); expect(first.trainingSamples).toBeGreaterThan(200); expect(first.validationSamples).toBeGreaterThan(80);
    expect(first.weights).not.toEqual(first.previousWeights);
    const split = history.slice().sort((a, b) => a.at - b.at)[Math.floor(history.length * 0.8)]!.at;
    const changed = history.map(r => r.at >= split ? { ...r, rating: r.rating === 1 ? 3 : 1 } : r);
    const second = calibrate(changed); expect(first.weights).toEqual(second.weights);
    expect(Number.isFinite(replayLoss(history, [...default_w], split).test)).toBe(true);
    const partial = history.filter(r => r.prior.reps !== 0); expect(calibrate(partial).applied).toBe(false);
  }, 20000);
  it('uses local calendar week boundaries rather than a rolling seven-day window', () => {
    const now = new Date(2026, 8, 7, 12).getTime(); const week = previousWeek(now); expect(new Date(week.start).getDay()).toBe(1); expect(new Date(week.end).getDay()).toBe(1); expect(week.key).toBe('2026-08-31');
  });
});
