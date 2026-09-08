import { db } from '../data/db';
import { allData, settings } from '../data/repository';
import { saveWeekly, savePractice } from '../data/enrichment';
import { getProvider } from '../ai/factory';
import { OptimizationSchema } from '../domain/enrichment';
import type { Calibration } from './optimizer';
import { SettingsSchema, type Review } from '../domain/models';
import { localDay } from '../data/enrichment';
import { errorProfile } from './errors';

export function previousWeek(now = Date.now()) {
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - (end.getDay() + 6) % 7);
  const start = new Date(end); start.setDate(start.getDate() - 7);
  return { start: start.getTime(), end: end.getTime(), key: localDay(start.getTime()) };
}
export async function generateWeekly() {
  return navigator.locks.request('mach-doc-weekly', { ifAvailable: true }, async lock => {
    if (!lock) return;
    const week = previousWeek(); const { units, reviews } = await allData(); const database = await db;
    const learned = new Set(reviews.filter(r => r.at >= week.start && r.at < week.end).map(r => r.unitId));
    const covered = new Set((await database.getAllFromIndex('weekly', 'week', week.key)).flatMap(w => w.coverage.map(c => c.unitId)));
    const pending = units.filter(u => learned.has(u.id) && !covered.has(u.id));
    const ai = await getProvider();
    // Bounded work per visit, resumable across app closures and quota failures.
    for (let index = 0; index < Math.min(32, pending.length); index += 8) await saveWeekly({ ...await ai.weekly(pending.slice(index, index + 8)), week: week.key });
  });
}
export async function prepareTargeted() {
  return navigator.locks.request('mach-doc-targeted', { ifAvailable: true }, async lock => {
    if (!lock || !(await settings()).targetedAutomatic) return;
    const database = await db; const practices = await database.getAll('practices');
    if (practices.some(p => !p.completedAt || Date.now() - p.createdAt < 86400000)) return;
    const top = errorProfile(await database.getAll('assessments'))[0];
    if (!top || top.recent < 3) return;
    const unit = (await database.getAll('units')).find(u => top.units.has(u.id) && !u.reportedIssue);
    const key = await chrome.storage.local.get('geminiKey'); if (!unit || !key.geminiKey) return;
    await savePractice(unit.id, await (await getProvider()).targeted(unit.knowledge, top.examples), unit.updatedAt);
  });
}
function runWorker(reviews: Review[], weights?: number[]): Promise<Calibration> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(chrome.runtime.getURL('optimizer.js'), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Hiệu chỉnh vượt 60 giây; giữ nguyên lịch ôn.')); }, 60000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; result: Calibration; error?: string }>) => { clearTimeout(timeout); worker.terminate(); if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error)); };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error('Không mở được tiến trình hiệu chỉnh.')); };
    worker.postMessage({ reviews, weights });
  });
}
export async function optimizeSchedule(force = false) {
  return navigator.locks.request('mach-doc-calibration', { ifAvailable: true }, async lock => {
    if (!lock) return;
    const database = await db; const config = await settings(); if (!config.optimizationEnabled && !force) return;
    const reviews = await database.getAll('reviews');
    const last = (await database.getAll('optimization')).sort((a, b) => b.at - a.at)[0];
    if (!force && (reviews.length < 1000 || (last && (reviews.length - last.reviews < 200 || Date.now() - last.at < 7 * 86400000)))) return;
    const result = await runWorker(reviews, config.fsrsWeights);
    const record = OptimizationSchema.parse({ ...result, id: crypto.randomUUID(), at: Date.now() });
    const tx = database.transaction(['meta', 'optimization'], 'readwrite');
    const latest = SettingsSchema.parse((await tx.objectStore('meta').get('settings'))?.value ?? {});
    if (record.applied && latest.optimizationEnabled && JSON.stringify(latest.fsrsWeights) === JSON.stringify(config.fsrsWeights)) await tx.objectStore('meta').put({ key: 'settings', value: { ...latest, fsrsWeights: record.weights } });
    else if (record.applied) { record.applied = false; record.noteVi = 'Cài đặt đã thay đổi trong lúc hiệu chỉnh. Giữ tham số hiện tại.'; }
    await tx.objectStore('optimization').put(record); await tx.done;
  });
}
