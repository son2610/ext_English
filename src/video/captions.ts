import type { VideoSource } from '../domain/video';
export interface CaptionCue { text: string; start: number; end: number; language: string; automatic: boolean; source: VideoSource['captionSource']; timing: VideoSource['timing'] }
export interface CaptionSentence extends CaptionCue { id: string }
export function youtubeId(url: string): string | undefined {
  try {
    const u = new URL(url); if (!/(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|^youtu\.be$/.test(u.hostname)) return;
    const candidate = u.hostname === 'youtu.be' ? u.pathname.split('/')[1] : /^\/(shorts|embed|live)\//.test(u.pathname) ? u.pathname.split('/')[2] : u.searchParams.get('v');
    return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : undefined;
  } catch { return; }
}
export const cleanCaption = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
function overlap(a: string, b: string) {
  const x = a.split(' '), y = b.split(' ');
  for (let n = Math.min(x.length, y.length); n > 0; n--) if (x.slice(-n).join(' ').toLowerCase() === y.slice(0, n).join(' ').toLowerCase()) return y.slice(n).join(' ');
  return b;
}
export function groupSentences(cues: CaptionCue[]): CaptionSentence[] {
  const result: CaptionSentence[] = []; let current: CaptionSentence | undefined;
  for (const cue of cues.slice().sort((a, b) => a.start - b.start).slice(0, 50000)) {
    const text = cleanCaption(cue.text);
    if (!text || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end - cue.start > 90) continue;
    const gap = current ? cue.start - current.end : 0;
    if (current && gap <= 1.1 && cue.language === current.language && cue.end - current.start <= 16 && current.text.split(' ').length < 36 && !/[.!?]["']?$/.test(current.text)) {
      const addition = cue.start < current.end + 0.15 ? overlap(current.text, text) : text;
      current.text = `${current.text} ${addition}`.trim(); current.end = Math.max(current.end, cue.end);
    } else {
      current = { ...cue, text, id: `${cue.source}:${cue.start.toFixed(3)}:${cue.end.toFixed(3)}` }; result.push(current);
    }
  }
  return result;
}
export function recentSentences(cues: CaptionCue[], currentTime: number): { choices: CaptionSentence[]; preferred: string | undefined } {
  const choices = groupSentences(cues).filter(c => c.start <= currentTime + 0.25 && c.end >= currentTime - 50).slice(-8);
  const finished = choices.filter(c => c.end <= currentTime + 0.1).at(-1);
  return { choices, preferred: finished && currentTime - finished.end <= 8 ? finished.id : choices.at(-1)?.id };
}
export function parseJson3(raw: unknown, language: string, automatic: boolean): CaptionCue[] {
  if (!raw || typeof raw !== 'object' || !('events' in raw) || !Array.isArray(raw.events)) return [];
  const cues: CaptionCue[] = [];
  for (const event of raw.events.slice(0, 50000)) {
    if (!event || typeof event !== 'object' || !Array.isArray(event.segs)) continue;
    const start = Number(event.tStartMs) / 1000, duration = Number(event.dDurationMs) / 1000;
    const text = event.segs.map((s: unknown) => s && typeof s === 'object' && 'utf8' in s && typeof s.utf8 === 'string' ? s.utf8 : '').join('');
    if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0 && duration <= 90 && text.trim()) cues.push({ text: cleanCaption(text).slice(0, 8000), start, end: start + duration, language, automatic, source: 'timedtext', timing: 'track' });
  }
  return cues;
}
export function timestamp(seconds: number) { const rounded = Math.max(0, Math.floor(seconds)); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`; }
export class CaptionHistory {
  cues: CaptionCue[] = [];
  private previousTime = 0;
  private active: CaptionCue | undefined;
  observe(text: string, time: number, language: string) {
    if (Math.abs(time - this.previousTime) > 3) this.active = undefined;
    this.previousTime = time;
    const cleaned = cleanCaption(text);
    if (this.active && cleaned === this.active.text) { this.active.end = Math.max(this.active.end, time + 0.1); return; }
    if (this.active) this.active.end = Math.max(this.active.start + 0.1, time);
    this.active = cleaned ? { text: cleaned, start: time, end: time + 0.25, language, automatic: true, source: 'rendered', timing: 'observed' } : undefined;
    if (this.active) this.cues.push(this.active);
    if (this.cues.length > 300) this.cues.splice(0, this.cues.length - 300);
  }
}
