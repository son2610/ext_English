import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { db } from '../src/data/db';
import { LearningProvider } from '../src/ai/provider';
import { StructuredClient } from '../src/ai/structured-client';
import { strictSchema, restoreOptionals, type AIRoute } from '../src/ai/transports';
import { AIConfigurationSchema, effectiveAI, providers, type AIConfiguration, type ProviderId } from '../src/domain/ai-config';
import { AnalysisSchema, GradeSchema, defaultSettings } from '../src/domain/models';
import { saveGeneralSettings, saveSettings, settings } from '../src/data/repository';
import { exportData, importData, parseBackup } from '../src/data/backup';
import { keyStatus, loadRoutes, saveAIConfiguration } from '../src/ai/configuration';
import { geminiSchema } from '../src/ai/gemini-schema';
import { analysis, source } from './fixtures';

const route = (provider: ProviderId, changes: Partial<AIRoute['connection']> = {}): AIRoute => ({ connection: { id: provider, name: providers[provider].name, provider, model: providers[provider].model, baseUrl: providers[provider].baseUrl, enabled: true, ...changes }, key: `fixture-${provider}-secret`, permitted: true });
const gemini = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { totalTokenCount: 41 } }));
const chat = (value: unknown, finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }], usage: { total_tokens: 73 } }));
const http = (status: number, message = 'Unavailable', retry?: string) => new Response(JSON.stringify({ error: { message } }), { status, headers: retry ? { 'Retry-After': retry } : {} });
const make = (routes = [route('gemini'), route('deepseek')], fallback = true) => new LearningProvider(new StructuredClient(routes, fallback));
let storage: Record<string, unknown>;
beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); const d = await db; for (const name of d.objectStoreNames) await d.clear(name);
  storage = {};
  vi.stubGlobal('chrome', { storage: { local: {
    setAccessLevel: vi.fn(async () => undefined),
    get: vi.fn(async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]]))),
    set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(storage, value); }),
    remove: vi.fn(async (key: string) => { delete storage[key]; }),
  } }, permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) } });
  vi.stubGlobal('navigator', { locks: { request: async (_: string, callback: () => Promise<void>) => callback() } });
});

describe('one validated contract across providers', () => {
  it.each([400, 401, 402, 403, 404, 408, 429, 500, 503])('fails over HTTP %s from Gemini to DeepSeek with separate credentials', async status => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(http(status)).mockResolvedValueOnce(chat(analysis));
    expect(await make().analyze(source, '')).toEqual(analysis);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[1]!; const body = JSON.parse(String(options!.body));
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options!.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer fixture-deepseek-secret' });
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
    expect(JSON.stringify(body)).not.toContain('fixture-'); expect(JSON.stringify(body)).not.toContain(source.url);
    expect(body.response_format).toEqual({ type: 'json_object' }); expect(body.messages[0].content).toContain('schemaVersion');
    const usage = (await (await db).getAll('usage')).sort((a, b) => a.at - b.at);
    expect(usage.map(u => [u.provider, u.status, u.fallback])).toEqual([['gemini', 'failed', false], ['deepseek', 'success', true]]);
  });
  it.each(['shape', 'bounds', 'evidence', 'cloze', 'truncated', 'json', 'empty'])('rejects %s before accepting another provider', async kind => {
    const invalid = kind === 'shape' ? { meaningVi: 'Thiếu trường.' } : kind === 'bounds' ? { ...analysis, knowledge: [] } : kind === 'evidence' ? { ...analysis, knowledge: analysis.knowledge.map(k => ({ ...k, evidence: 'Never seen here.' })) } : kind === 'cloze' ? { ...analysis, knowledge: analysis.knowledge.map(k => ({ ...k, cloze: { ...k.cloze, sentence: 'Fake [[blank]].' } })) } : analysis;
    const first = kind === 'json' ? new Response('not JSON') : kind === 'empty' ? chat(undefined) : chat(invalid, kind === 'truncated' ? 'length' : 'stop');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(first).mockResolvedValueOnce(gemini(analysis));
    expect(await make([route('deepseek'), route('gemini')]).analyze(source, '')).toEqual(analysis);
    expect(await (await db).count('cache')).toBe(1); expect(await (await db).count('units')).toBe(0);
    expect((await (await db).getAll('usage')).filter(u => u.status === 'failed')[0]?.errorCode).toBe('invalid_output');
  });
  it('validates OpenAI strict nullable optionals without weakening required fields', async () => {
    const grade = { correct: true, score: 95, feedbackVi: 'Đúng.', correctedEn: 'I would have helped.', errors: [{ original: 'help', correction: 'helped', reasonVi: 'Quá khứ phân từ.', category: null, l1NoteVi: null }] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(chat(grade));
    const result = await make([route('openai')]).grade(analysis.knowledge[0]!, 'Viết câu.', 'I would have helped.');
    expect(GradeSchema.safeParse(result).success).toBe(true); expect(result.errors[0]).not.toHaveProperty('category');
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.response_format.json_schema.strict).toBe(true); expect(body.max_completion_tokens).toBe(10000);
    const converted = strictSchema(geminiSchema(GradeSchema)); expect(converted.required).toEqual(Object.keys(converted.properties!));
    const missing = restoreOptionals({ ...grade, feedbackVi: null }, geminiSchema(GradeSchema)); expect(GradeSchema.safeParse(missing).success).toBe(false);
  });
  it('supports GLM and custom HTTPS Chat Completions endpoints', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(http(503)).mockResolvedValueOnce(chat(analysis));
    await make([route('zai'), route('compatible', { baseUrl: 'https://inference.example.com/v1', model: 'org/model:latest' })]).analyze(source, '');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://api.z.ai/api/paas/v4/chat/completions', 'https://inference.example.com/v1/chat/completions']);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).not.toHaveProperty('thinking');
  });
  it('uses backup strong model for grading, explanation and targeted practice; weekly stays on main model', async () => {
    const targets = [route('gemini', { strongModel: 'primary-strong' }), route('deepseek', { strongModel: 'backup-strong' })];
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(http(503)).mockResolvedValueOnce(chat({ correct: true, score: 100, feedbackVi: 'Đúng.', correctedEn: 'I would have helped.', errors: [] }));
    await make(targets).grade(analysis.knowledge[0]!, 'Đề.', 'Bài.');
    expect(String(fetcher.mock.calls[0]![0])).toContain('primary-strong');
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body)).model).toBe('backup-strong');
    fetcher.mockResolvedValueOnce(chat({ explanationVi: 'Một cách giải thích khác.' }));
    await make(targets).explain(analysis.knowledge[0]!);
    fetcher.mockResolvedValueOnce(chat({ instructionVi: 'Viết câu điều kiện.', answerEn: 'I would have helped.', explanationVi: 'Giả định quá khứ.', category: 'tense_aspect' }));
    await make(targets).targeted(analysis.knowledge[0]!, []);
    expect(fetcher.mock.calls.slice(2).every(([, options]) => JSON.parse(String(options!.body)).model === 'backup-strong')).toBe(true);
    const id = crypto.randomUUID();
    fetcher.mockResolvedValueOnce(http(503)).mockResolvedValueOnce(chat({ titleVi: 'Tuần học', textEn: 'I would have helped.', meaningVi: 'Tôi đã có thể giúp.', coverage: [{ unitId: id, quote: 'I would have helped.' }] }));
    await make(targets).weekly([{ id, knowledge: analysis.knowledge[0]! }]);
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]!.body)).model).toBe(providers.deepseek.model);
  });
  it('falls back on wrong weekly coverage', async () => {
    const id = crypto.randomUUID(); const valid = { titleVi: 'Tuần học', textEn: 'I would have helped.', meaningVi: 'Tôi đã có thể giúp.', coverage: [{ unitId: id, quote: 'I would have helped.' }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(gemini({ ...valid, coverage: [{ unitId: crypto.randomUUID(), quote: valid.textEn }] })).mockResolvedValueOnce(chat(valid));
    expect(await make().weekly([{ id, knowledge: analysis.knowledge[0]! }])).toEqual(valid);
  });
  it('reuses validated YouTube repair when grammar switches provider', async () => {
    const repair = { textEn: source.exact, uncertain: false, warningVi: '', changes: [] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(gemini(repair)).mockResolvedValueOnce(http(503)).mockResolvedValueOnce(chat(analysis));
    const video = { ...source, video: { provider: 'youtube' as const, videoId: 'dQw4w9WgXcQ', start: 1, end: 5, language: 'en', automatic: true, timing: 'track' as const, captionSource: 'text-track' as const } };
    const result = await make().analyze(video, ''); expect(result.transcript).toEqual(repair);
    expect(fetcher).toHaveBeenCalledTimes(3); expect((await (await db).getAll('usage')).filter(u => u.task === 'transcript')).toHaveLength(1);
    const data = JSON.parse(JSON.parse(String(fetcher.mock.calls[2]![1]!.body)).messages[1].content).data;
    expect(data.repairedTranscript).toBe(source.exact);
  });
});

describe('bounded routing and portable credentials', () => {
  it('honors fallback off and the shared budget, without calling a backup', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(http(503));
    await expect(make(undefined, false).analyze(source, '')).rejects.toThrow('503'); expect(fetcher).toHaveBeenCalledTimes(1);
    await saveSettings({ ...defaultSettings, dailyApiLimit: 1 });
    await expect(make().analyze(source, '')).rejects.toMatchObject({ code: 'budget', fallbackAllowed: false }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('skips a cooling provider across client instances, honors Retry-After and resumes afterwards', async () => {
    let now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(http(503, 'High demand', '120')).mockResolvedValueOnce(chat(analysis)).mockResolvedValueOnce(chat(analysis)).mockResolvedValueOnce(gemini(analysis));
    await make().analyze(source, '1'); now += 61000; await make().analyze(source, '2');
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('googleapis'))).toHaveLength(1);
    now += 61000; await make().analyze(source, '3'); expect(fetcher.mock.calls.filter(([url]) => String(url).includes('googleapis'))).toHaveLength(2);
  });
  it('fails over network errors and keeps diagnostics free of every configured secret', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(http(401, 'Invalid fixture-deepseek-secret or fixture-gemini-secret'));
    const error = await make().analyze(source, '').catch(e => e);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(error.message).not.toContain('fixture-'); expect(error.message).toContain('[đã ẩn khoá]');
    expect(JSON.stringify(await exportData())).not.toContain('fixture-');
  });
  it('bounds every attempt and stops a chain with an expired deadline', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(chat({ ok: true }));
    await expect(new StructuredClient([route('deepseek')]).request('Test', {}, z.object({ ok: z.boolean() }), false, undefined, 'analysis', Date.now() - 1)).rejects.toMatchObject({ code: 'timeout' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['gemini', 'openai'] as const)('stops on an explicit %s safety refusal', async provider => {
    const response = provider === 'gemini' ? new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })) : new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'Refused.' } }] }));
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(make([route(provider), route('deepseek')]).analyze(source, '')).rejects.toMatchObject({ code: 'refusal', fallbackAllowed: false });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(await (await db).count('cache')).toBe(0);
  });
  it('leaves the library and cache empty when all providers return invalid data', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(gemini({})).mockResolvedValueOnce(chat({}));
    await expect(make().analyze(source, '')).rejects.toMatchObject({ code: 'all_failed' });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(await (await db).count('cache')).toBe(0); expect(await (await db).count('units')).toBe(0);
  });
  it('migrates the existing Gemini key and config, preserves new routes when general settings save, and exports no secrets', async () => {
    storage.geminiKey = 'existing-google-key'; await saveSettings({ ...defaultSettings, model: 'gemini-existing', strongModel: 'gemini-strong' });
    const ai = effectiveAI(await settings()); expect((await loadRoutes())[0]?.key).toBe('existing-google-key');
    ai.connections.push(route('deepseek').connection);
    await saveAIConfiguration(ai, { deepseek: 'deepseek-new-key' });
    expect(storage.geminiKey).toBeUndefined(); expect((await loadRoutes()).map(r => r.key)).toEqual(['existing-google-key', 'deepseek-new-key']);
    expect((await keyStatus(await settings())).deepseek).toBe('deepseek:https://api.deepseek.com');
    await saveGeneralSettings({ ...defaultSettings, retention: 0.92 }); expect((await settings()).ai).toEqual(ai);
    const backup = parseBackup(JSON.stringify(await exportData())); expect(backup.settings.ai).toEqual(ai);
    expect(JSON.stringify(backup)).not.toMatch(/existing-google-key|deepseek-new-key|aiKeys/);
    await (await db).clear('meta'); storage = {}; await importData(backup);
    expect((await loadRoutes()).every(r => !r.key)).toBe(true);
  });
  it('does not send an old key to a changed custom endpoint, supports removal and never revives the legacy key', async () => {
    const first = route('compatible', { baseUrl: 'https://first.example.com/v1', model: 'model-1' }).connection;
    const ai: AIConfiguration = { fallback: true, connections: [first] };
    await saveAIConfiguration(ai, { compatible: 'first-key' });
    await saveAIConfiguration({ ...ai, connections: [{ ...first, baseUrl: 'https://second.example.com/v1' }] }, {});
    expect((await loadRoutes())[0]?.key).toBe(''); expect(JSON.stringify(storage)).not.toContain('first-key');
    await saveAIConfiguration(ai, { compatible: 'second-key' }); await saveAIConfiguration(ai, { compatible: null });
    expect((await loadRoutes())[0]?.key).toBe('');
    storage.geminiKey = 'stale-legacy'; await saveAIConfiguration({ fallback: true, connections: [] }, {}); expect(await loadRoutes()).toEqual([]);
  });
  it('leaves settings and keys unchanged when permission is denied', async () => {
    storage.geminiKey = 'original'; const config = await settings();
    Object.assign(chrome.permissions, { request: vi.fn(async () => false) });
    await expect(saveAIConfiguration({ fallback: true, connections: [route('deepseek').connection] }, { deepseek: 'new-key' })).rejects.toThrow('cấp quyền');
    expect(await settings()).toEqual(config); expect(storage).toEqual({ geminiKey: 'original' });
  });
  it.each(['http://example.com/v1', 'https://key:secret@example.com/v1', 'https://example.com/v1?api_key=secret', 'https://example.com/v1#secret', 'https://example.com/v1/chat/completions'])('rejects unsafe or mistaken endpoint %s', baseUrl => {
    expect(AIConfigurationSchema.safeParse({ fallback: true, connections: [route('compatible', { baseUrl, model: 'model' }).connection] }).success).toBe(false);
  });
  it('skips unkeyed and unpermitted routes without consuming quota', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(chat(analysis));
    await make([{ ...route('gemini'), key: '' }, { ...route('openai'), permitted: false }, route('deepseek')]).analyze(source, '');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(await (await db).count('usage')).toBe(1);
  });
});
