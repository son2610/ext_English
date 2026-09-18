import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/data/db';
import { defaultSettings, SettingsSchema } from '../src/domain/models';
import { defaultLabPreferences, type LabPreferences } from '../src/domain/lab';
import { providers, type AIConfiguration } from '../src/domain/ai-config';
import {
  acceptAnalysis, allData, capture, claimJob, completeJob, recordReview,
  saveGeneralSettings, saveLabPreferences, saveSettings, settings,
} from '../src/data/repository';
import { exportData, importData, parseBackup } from '../src/data/backup';
import { analysis, source } from './fixtures';

const ai: AIConfiguration = {
  fallback: true,
  connections: [{ id: 'lab-fixture-deepseek', name: 'DeepSeek', provider: 'deepseek', enabled: true,
    model: providers.deepseek.model, baseUrl: providers.deepseek.baseUrl }],
};
const preferences: LabPreferences = {
  ...defaultLabPreferences, mode: 'bubbles', source: 'phrases', scope: 'difficult', count: 0,
  seconds: 0.6, columns: 4, order: 'newest', hideMeaning: true, repeat: true,
  groupId: crypto.randomUUID(), labelId: crypto.randomUUID(),
};

async function clearDatabase() {
  const database = await db;
  for (const store of database.objectStoreNames) await database.clear(store);
}

beforeEach(clearDatabase);

describe('Lab settings compatibility and portable backups', () => {
  it('defaults older Lab preferences to a finite session without losing saved options', () => {
    const { repeat: _repeat, ...olderLab } = preferences;
    expect(SettingsSchema.parse({ lab: olderLab }).lab).toEqual({ ...olderLab, repeat: false });
    const backup = parseBackup(JSON.stringify({ format: 'mach-doc', version: 3, exportedAt: Date.now(), settings: { lab: olderLab }, captures: [], units: [], reviews: [], encounters: [] }));
    expect(backup.settings.lab?.repeat).toBe(false);
  });
  it('loads settings and all supported backup versions created before Lab existed', async () => {
    const legacy = { ...defaultSettings, model: 'gemini-fixture', retention: 0.92 };
    delete legacy.lab;
    expect(SettingsSchema.parse(legacy)).toMatchObject({ model: 'gemini-fixture', retention: 0.92 });
    await saveSettings(legacy);
    expect((await settings()).lab).toBeUndefined();
    const backup = await exportData();
    for (const version of [1, 2, 3]) {
      const parsed = parseBackup(JSON.stringify({ ...backup, version, settings: legacy }));
      expect(parsed.settings.lab).toBeUndefined();
      expect(parsed.settings.retention).toBe(0.92);
    }
    await clearDatabase();
    await importData(parseBackup(JSON.stringify(backup)));
    expect(await settings()).toEqual(SettingsSchema.parse(legacy));
  });

  it('roundtrips every Lab preference through the actual v3 export/import path alongside AI configuration', async () => {
    await saveSettings({ ...defaultSettings, ai });
    await saveLabPreferences(preferences);
    const exported = parseBackup(JSON.stringify(await exportData()));
    expect(exported.version).toBe(3);
    expect(exported.settings.lab).toEqual(preferences);
    await clearDatabase();
    await importData(exported);
    expect(await settings()).toMatchObject({ ai, lab: preferences });
    expect((await exportData()).settings).toEqual(exported.settings);
  });

  it('rejects invalid imported Lab preferences before changing stored settings', async () => {
    await saveSettings({ ...defaultSettings, ai, lab: preferences });
    const backup = await exportData();
    const malformed = { ...backup, settings: { ...backup.settings, lab: { ...preferences, seconds: 0.1 } } };
    await expect(importData(malformed)).rejects.toThrow();
    expect(await settings()).toMatchObject({ ai, lab: preferences });
    expect(await (await db).count('backups')).toBe(0);
  });

  it('keeps the latest Lab and provider choices when a stale general settings form is saved', async () => {
    await saveSettings({ ...defaultSettings, lab: defaultLabPreferences });
    const stale = await settings();
    await saveSettings({ ...stale, ai });
    await saveLabPreferences(preferences);
    await saveGeneralSettings({ ...stale, retention: 0.93, dailyNewLimit: 7 });
    expect(await settings()).toMatchObject({ ai, lab: preferences, retention: 0.93, dailyNewLimit: 7 });
  });

  it('merges an older backup without rolling back existing Lab preferences or AI routes', async () => {
    await saveSettings({ ...defaultSettings, lab: defaultLabPreferences });
    const older = await exportData();
    await saveSettings({ ...defaultSettings, ai, lab: preferences });
    await importData(older);
    expect(await settings()).toMatchObject({ ai, lab: preferences });
    const safety = (await (await db).getAll('backups'))[0]!;
    expect(parseBackup(safety.json).settings).toMatchObject({ ai, lab: preferences });
  });

  it('saves Lab preferences while preserving AI, general preferences and existing FSRS history', async () => {
    await saveSettings({ ...defaultSettings, ai, retention: 0.94, dailyApiLimit: 13 });
    const saved = await capture(source, '', true);
    await completeJob((await claimJob())!, analysis);
    await acceptAnalysis(saved.id);
    const lesson = (await allData()).units[0]!;
    await recordReview({ id: crypto.randomUUID(), unitId: lesson.id, expectedReps: 0, rating: 3,
      mode: 'cloze', answer: lesson.knowledge.cloze.answer, durationMs: 1200, assisted: false });
    const before = await allData();
    await saveLabPreferences(preferences);
    expect(await settings()).toMatchObject({ ai, lab: preferences, retention: 0.94, dailyApiLimit: 13 });
    expect(await allData()).toEqual(before);
    expect(await (await db).count('usage')).toBe(0);
  });

  it.each(['general-first', 'lab-first'] as const)('preserves both edits when Lab and general settings save concurrently: %s', async order => {
    await saveSettings({ ...defaultSettings, ai, lab: defaultLabPreferences });
    const stale = await settings();
    const generalSave = () => saveGeneralSettings({ ...stale, retention: 0.91, dailyNewLimit: 4 });
    const labSave = () => saveLabPreferences(preferences);
    const operations = order === 'general-first' ? [generalSave, labSave] : [labSave, generalSave];
    await Promise.all(operations.map(save => save()));
    expect(await settings()).toMatchObject({ ai, lab: preferences, retention: 0.91, dailyNewLimit: 4 });
  });

  it('validates a Lab save before touching other settings', async () => {
    await saveSettings({ ...defaultSettings, ai, lab: preferences });
    const before = await settings();
    await expect(saveLabPreferences({ ...preferences, count: -2 })).rejects.toThrow();
    expect(await settings()).toEqual(before);
  });
});
