import { z } from 'zod';
import { db } from '../data/db';
import { enqueue } from '../data/repository';
import { VideoSourceSchema } from '../domain/video';
import { parseJson3, youtubeId } from '../video/captions';
import type { ContentMessageSchema } from '../shared/messages';

export async function openVideoClip(raw: unknown, blind = false) {
  const clip = VideoSourceSchema.parse(raw);
  const tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${clip.videoId}&t=${Math.floor(clip.start)}s&md-review=1${blind ? '&md-blind=1' : ''}` });
  if (tab.id) await chrome.storage.session.set({ [`clip:${tab.id}`]: { ...clip, expires: Date.now() + 120000 } });
}
export async function videoMessage(message: z.infer<typeof ContentMessageSchema>, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab!.id!;
  if (message.type === 'video-open-library') return chrome.tabs.create({ url: chrome.runtime.getURL('app.html#library') }).then(() => null);
  // sender.url can retain the document's initial URL after history.pushState.
  // An isolated content script supplies the current URL; it must stay on the sender origin.
  const currentUrl = 'pageUrl' in message ? message.pageUrl : sender.url ?? '';
  if (new URL(currentUrl).origin !== new URL(sender.url ?? '').origin) throw new Error('Nguồn trang đã thay đổi.');
  const id = youtubeId(currentUrl);
  if (!id) throw new Error('Yêu cầu phụ đề phải đến từ khung phát YouTube.');
  if ('videoId' in message && message.videoId !== id) throw new Error('Video đã thay đổi. Hãy thử lại.');
  if (message.type === 'video-ready') {
    const key = `clip:${tabId}`; const result = await chrome.storage.session.get(key); const parsed = z.object({ videoId: z.string(), start: z.number(), end: z.number(), expires: z.number() }).safeParse(result[key]);
    const clip = parsed.success ? parsed.data : undefined;
    if (clip && clip.videoId === id && clip.expires > Date.now()) { await chrome.storage.session.remove(key); return clip; }
    return null;
  }
  if (message.type === 'video-open-editor') {
    if (message.sources.some(s => s.video?.videoId !== id)) throw new Error('Nguồn câu không khớp video.');
    const reply = await chrome.tabs.sendMessage(tabId, { type: 'show-video-editor', payload: message }, { frameId: 0 });
    if (!reply?.ok) throw new Error('Không mở được hộp lưu trên trang chính.'); return null;
  }
  if (message.type === 'video-fetch-track') {
    const url = new URL(message.url);
    if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== id) throw new Error('Địa chỉ phụ đề không hợp lệ.');
    url.searchParams.set('fmt', 'json3');
    const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Track phụ đề không tải được.');
    const reader = response.body?.getReader(); if (!reader) return [];
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 8 * 1024 * 1024) throw new Error('Track quá lớn. Dùng phụ đề đang hiển thị.'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
    const text = await new Blob(chunks as BlobPart[]).text();
    return parseJson3(JSON.parse(text), message.language, message.automatic);
  }
  if (message.type === 'video-notes' || message.type === 'video-release-batch') {
    const captures = await (await db).getAllFromIndex('captures', 'videoId', id);
    if (message.type === 'video-release-batch') { await enqueue(captures.filter(c => c.deferredAnalysis && !c.unitsCreated).map(c => c.id)); return null; }
    return captures.map(c => ({ id: c.id, text: c.source.exact, note: c.note || c.analysis?.meaningVi || '', start: c.source.video!.start, end: c.source.video!.end, deferred: !!c.deferredAnalysis })).sort((a, b) => a.start - b.start);
  }
  return null;
}
