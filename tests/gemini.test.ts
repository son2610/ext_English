import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/data/db';
import { GeminiProvider, AIError } from '../src/ai/provider';
import { geminiSchema } from '../src/ai/gemini-schema';
import { AnalysisSchema, GradeSchema, defaultSettings, type Source } from '../src/domain/models';
import { TranscriptRepairSchema } from '../src/domain/video';
import { DrillSchema, WeeklyTextSchema } from '../src/domain/enrichment';
import { allData, capture, claimJob, completeJob, acceptAnalysis, enqueue, saveSettings } from '../src/data/repository';
import { source, analysis } from './fixtures';

beforeEach(async () => { vi.restoreAllMocks(); const d = await db; for (const name of d.objectStoreNames) await d.clear(name); });
const video: Source = { ...source, video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', start: 5.25, end: 9.8, language: 'en', automatic: true, timing: 'track', captionSource: 'text-track' } };
const repair = { textEn: source.exact, uncertain: false, warningVi: '', changes: [] };
const ok = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { totalTokenCount: 123 } }), { status: 200 });
const bad = (message: string, status = 'INVALID_ARGUMENT') => new Response(JSON.stringify({ error: { code: 400, status, message } }), { status: 400 });
const schemaFailure = () => bad('The input schema produces a constraint with too many states for serving.');
const ai = () => new GeminiProvider('fixture-key', 'gemini-3.5-flash');

describe('Gemini schema compatibility', () => {
  it('uses a small supported wire schema for all tasks while retaining local bounds', () => {
    for (const schema of [AnalysisSchema, GradeSchema, TranscriptRepairSchema, DrillSchema, WeeklyTextSchema]) {
      const serialized = JSON.stringify(geminiSchema(schema));
      expect(serialized).not.toMatch(/"(?:const|\$schema|minLength|maxLength|minItems|maxItems|minimum|maximum)":/);
      expect(serialized).toContain('"required":'); expect(serialized).toContain('Maximum');
    }
    expect(geminiSchema(AnalysisSchema).properties?.schemaVersion?.enum).toEqual([1]);
    expect(AnalysisSchema.safeParse({ ...analysis, knowledge: [] }).success).toBe(false);
    expect(TranscriptRepairSchema.safeParse({ ...repair, changes: Array(21).fill({ original: '', corrected: '', reasonVi: '' }) }).success).toBe(false);
  });
  it('recovers schema 400 once with JSON mode, preserves model, validates and caches', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(schemaFailure()).mockResolvedValueOnce(ok(analysis));
    expect(await ai().analyze(source, '')).toEqual(analysis); expect(await ai().analyze(source, '')).toEqual(analysis);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetcher.mock.calls[0]![1]!.body)); const fallback = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
    expect(first.generationConfig.responseJsonSchema.properties.transcript).toBeUndefined();
    expect(fallback.generationConfig.responseJsonSchema).toBeUndefined(); expect(fallback.generationConfig.responseMimeType).toBe('application/json');
    expect(fallback.systemInstruction.parts[1].text).toContain('schemaVersion');
    expect(JSON.stringify(fallback)).not.toContain('fixture-key'); expect(fetcher.mock.calls.every(([url]) => String(url).includes('/gemini-3.5-flash:'))).toBe(true);
    const usage = await (await db).getAll('usage'); expect(usage.map(u => u.status).sort()).toEqual(['failed', 'success']);
  });
  it('completes both YouTube stages with fallback and creates lessons only after approval', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(schemaFailure()).mockResolvedValueOnce(ok(repair)).mockResolvedValueOnce(schemaFailure()).mockResolvedValueOnce(ok(analysis));
    const saved = await capture(video, '', true); await enqueue([saved.id]); const job = (await claimJob())!;
    const result = await ai().analyze(job.source, job.note); await completeJob(job, result);
    expect(result.transcript).toEqual(repair); expect((await allData()).units).toHaveLength(0);
    await acceptAnalysis(saved.id); expect((await allData()).units).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const usage = await (await db).getAll('usage'); expect(usage.filter(u => u.task === 'transcript')).toHaveLength(2); expect(usage.filter(u => u.task === 'analysis')).toHaveLength(2);
  });
  it.each(['wrong shape', 'fabricated evidence'])('rejects %s from JSON fallback and never caches it', async kind => {
    const value = kind === 'wrong shape' ? { meaningVi: 'Thiếu dữ liệu.' } : { ...analysis, knowledge: analysis.knowledge.map(k => ({ ...k, evidence: 'Not present in the original source.' })) };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(schemaFailure()).mockResolvedValueOnce(ok(value));
    await expect(ai().analyze(source, '')).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await (await db).count('cache')).toBe(0); expect((await allData()).units).toHaveLength(0);
  });
  it('limits fallback to one attempt and charges every attempt to the local budget', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => schemaFailure());
    await expect(ai().analyze(video, '')).rejects.toMatchObject({ retryable: false, schemaRejected: true }); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await (await db).count('usage')).toBe(2);
    const d = await db; await d.clear('usage'); fetcher.mockClear(); await saveSettings({ ...defaultSettings, dailyApiLimit: 1 });
    await expect(ai().analyze(video, '')).rejects.toThrow('hạn mức'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('actionable Gemini errors', () => {
  it.each([
    ['INVALID_ARGUMENT', 'Request contains an invalid argument.'],
    ['FAILED_PRECONDITION', 'Free tier is not available in your country. Check billing before using schema.'],
    ['INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.'],
  ])('does not mistake %s / %s for schema incompatibility', async (status, message) => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => bad(message, status));
    const error = await ai().analyze(video, '').catch(e => e as AIError);
    expect(error).toBeInstanceOf(AIError); expect(error).toMatchObject({ retryable: false, schemaRejected: false });
    expect((error as AIError).message).toContain('Phục hồi phụ đề · gemini-3.5-flash · HTTP 400');
    expect((error as AIError).message).toContain(message); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('redacts API keys in server messages and field violations before persisting errors', async () => {
    const secret = 'AIzaFakeSecretThatMustNotAppearInDiagnostic';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: `API key not valid: ${secret}`, details: [{ reason: 'API_KEY_INVALID', fieldViolations: [{ field: 'key', description: `https://example.test/?key=${secret}` }] }] } }), { status: 400 }));
    const result = await new GeminiProvider(secret, 'gemini-3.5-flash').analyze(video, '').catch(e => e as AIError);
    expect((result as AIError).message).not.toContain(secret); expect((result as AIError).message).toContain('[đã ẩn khoá]');
    expect((result as AIError).message.length).toBeLessThan(2000);
  });
  it('identifies a grammar-stage failure and reuses successful transcript repair on retry', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(repair)).mockResolvedValueOnce(bad('Invalid generation parameter.')).mockResolvedValueOnce(ok(analysis));
    await expect(ai().analyze(video, '')).rejects.toThrow('Phân tích ngữ pháp · gemini-3.5-flash');
    expect((await ai().analyze(video, '')).transcript).toEqual(repair); expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
