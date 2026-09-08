import { ContentMessageSchema, type Reply } from '../shared/messages';
import { capture, claimJob, completeJob, encounter, settings } from '../data/repository';
import { db } from '../data/db';
import { snapshot } from '../data/backup';
import { GeminiProvider, AIError } from '../ai/provider';
import { z } from 'zod';
import { videoMessage, openVideoClip } from './video';
import { expandInflections } from '../learning/inflections';

// Keys are never placed in content-script messages or exported data.
const secureStorage = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const uiUrl = chrome.runtime.getURL('app.html');
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    await secureStorage;
    const config = await settings();
    const keyResult = await chrome.storage.local.get('geminiKey');
    if (typeof keyResult.geminiKey !== 'string' || !keyResult.geminiKey) return;
    const job = await claimJob();
    if (!job) return;
    try {
      const provider = new GeminiProvider(keyResult.geminiKey, config.model, config.strongModel);
      await completeJob(job, await provider.analyze(job.source, job.note));
    } catch (error) {
      const retryable = error instanceof AIError && error.retryable && job.attempts < 4;
      const delay = Math.max(error instanceof AIError ? error.retryAfterMs : 0, 60000 * 2 ** (job.attempts - 1)) + Math.random() * 10000;
      await completeJob(job, { error: error instanceof AIError ? error.message : 'Kết quả AI không hợp lệ. Hãy thử phân tích lại.', retryAt: retryable ? Date.now() + delay : undefined });
    }
  } finally { pumping = false; }
}
async function badge() {
  const database = await db;
  const units = await database.getAllFromIndex('units', 'due', IDBKeyRange.upperBound(Date.now()));
  const count = units.filter(u => !u.suspended).length;
  await chrome.action.setBadgeText({ text: count ? (count > 99 ? '99+' : String(count)) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#26584b' });
}
async function backupIfDue() {
  const database = await db;
  const config = await settings();
  if (!config.autoBackup) return;
  const last = Number((await database.get('meta', 'lastSnapshot'))?.value ?? 0);
  if (Date.now() - last > config.backupDays * 86400000) await snapshot();
  const lastDownload = Number((await database.get('meta', 'lastBackupDownload'))?.value ?? 0);
  if (await database.count('captures') && Date.now() - lastDownload > config.backupDays * 86400000) await downloadBackup();
}
async function downloadBackup() {
  const database = await db;
  const lease = database.transaction('meta', 'readwrite');
  const pending = Number((await lease.store.get('backupLeaseUntil'))?.value ?? 0);
  if (pending > Date.now()) { await lease.done; return; }
  await lease.store.put({ key: 'backupLeaseUntil', value: Date.now() + 600000 }); await lease.done;
  let blobUrl: string | undefined;
  try {
    if (!await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.BLOBS], justification: 'Tạo Blob JSON để tải bản sao lưu dữ liệu học xuống máy.' });
    const reply = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'backup-blob' }) as Reply<{ url: string }>;
    if (!reply.ok) throw new Error(reply.error);
    blobUrl = reply.data.url;
    const id = await chrome.downloads.download({ url: blobUrl, filename: `MachDoc/backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, conflictAction: 'uniquify', saveAs: false });
    await database.put('meta', { key: `download:${id}`, value: blobUrl });
    // Tiny local blobs can finish before the download ID is persisted. Reconcile that race.
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === 'complete' || item?.state === 'interrupted') await settleDownload(id, item.state);
  } catch (error) {
    await database.delete('meta', 'backupLeaseUntil');
    if (blobUrl) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url: blobUrl }).catch(() => undefined);
    throw error;
  }
}
async function settleDownload(id: number, state: 'complete' | 'interrupted') {
  const tx = (await db).transaction('meta', 'readwrite');
  const entry = await tx.store.get(`download:${id}`);
  if (!entry) { await tx.done; return; }
  if (state === 'complete') await tx.store.put({ key: 'lastBackupDownload', value: Date.now() });
  await tx.store.delete(`download:${id}`); await tx.store.delete('backupLeaseUntil'); await tx.done;
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url: entry.value }).catch(() => undefined);
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}
chrome.downloads.onChanged.addListener(delta => {
  if (delta.state?.current !== 'complete' && delta.state?.current !== 'interrupted') return;
  void settleDownload(delta.id, delta.state.current).catch(() => undefined);
});
async function initialize() {
  await secureStorage;
  if (!await chrome.alarms.get('maintenance')) await chrome.alarms.create('maintenance', { periodInMinutes: 1 });
  await badge();
}
chrome.runtime.onInstalled.addListener(() => { void initialize(); });
chrome.runtime.onStartup.addListener(() => { void initialize(); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'maintenance') void Promise.allSettled([pump(), badge(), backupIfDue()]);
});
chrome.action.onClicked.addListener(tab => {
  if (tab.id) void chrome.tabs.sendMessage(tab.id, { type: 'capture-video' }).then(reply => { if (!reply?.handled) void chrome.tabs.create({ url: uiUrl }); }, () => chrome.tabs.create({ url: uiUrl }));
  else void chrome.tabs.create({ url: uiUrl });
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'review') void chrome.tabs.create({ url: `${uiUrl}#review` });
  if (command === 'capture-video' && tab?.id) void chrome.tabs.sendMessage(tab.id, { type: 'capture-video' }).catch(() => undefined);
  if (command === 'capture' && tab?.id) void chrome.tabs.sendMessage(tab.id, { type: 'quick-capture' }).catch(() => chrome.tabs.create({ url: `${uiUrl}#library` }));
});
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond: (reply: Reply<unknown>) => void) => {
  if (typeof raw !== 'object' || raw === null || 'target' in raw) return false;
  const trustedUI = sender.id === chrome.runtime.id && !!sender.url?.startsWith(uiUrl);
  const content = sender.id === chrome.runtime.id && sender.tab?.id !== undefined;
  if (!trustedUI && !content) { respond({ ok: false, error: 'Nguồn yêu cầu không hợp lệ.' }); return false; }
  void (async (): Promise<unknown> => {
    if (trustedUI) {
      if ('type' in raw && raw.type === 'play-source' && 'video' in raw) { await openVideoClip(raw.video, 'blind' in raw && raw.blind === true); return null; }
      const message = z.object({ type: z.enum(['wake', 'backup-now', 'settings-changed', 'library-changed']) }).parse(raw);
      if (message.type === 'backup-now') { await snapshot(); await downloadBackup(); }
      if (message.type === 'wake') { void pump(); await badge(); }
      if (message.type === 'settings-changed' || message.type === 'library-changed') {
        const tabs = await chrome.tabs.query({});
        await Promise.allSettled(tabs.filter(t => t.id).map(t => chrome.tabs.sendMessage(t.id!, { type: 'refresh-highlights' })));
        if (message.type === 'library-changed') {
          await Promise.allSettled(tabs.filter(t => t.id).map(t => chrome.tabs.sendMessage(t.id!, { type: 'video-notes-changed' })));
          await badge();
        }
      }
      return null;
    }
    const message = ContentMessageSchema.parse(raw);
    if (message.type.startsWith('video-')) { const result = await videoMessage(message, sender); if (message.type === 'video-release-batch') void pump(); return result; }
    if (message.type === 'capture' || message.type === 'open-editor') {
      const topUrl = sender.tab?.url;
      const frameUrl = sender.url;
      const source = { ...message.source, url: topUrl && /^https?:/.test(topUrl) ? topUrl : message.source.url, frameUrl: frameUrl && /^https?:/.test(frameUrl) ? frameUrl : message.source.frameUrl };
      if (message.type === 'open-editor') {
        await chrome.tabs.sendMessage(sender.tab!.id!, { type: 'show-editor', source }, { frameId: 0 });
        return null;
      }
      const result = await capture(source, message.note, message.analyze);
      if (source.video) void chrome.tabs.sendMessage(sender.tab!.id!, { type: 'video-notes-changed' }).catch(() => undefined);
      else if (message.analyze) void pump();
      return result;
    }
    if (message.type === 'lexicon') {
      const config = await settings(); if (!config.highlighting) return [];
      const patterns = (await (await db).getAll('units')).filter(u => u.knowledge.kind === 'phrase').slice(0, 3000).map(u => ({ id: u.id, text: u.knowledge.form, meaning: u.knowledge.meaningVi }));
      return config.inflectionMatching ? expandInflections(patterns) : patterns;
    }
    if (message.type === 'encounter') {
      if ((await settings()).highlighting) for (const id of message.unitIds) await encounter(id, sender.url ?? '');
      return null;
    }
    return null;
  })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof z.ZodError ? 'Dữ liệu yêu cầu không hợp lệ.' : error instanceof Error ? error.message : 'Thao tác chưa thành công.' }));
  return true;
});
void initialize().catch(() => undefined);
