import { cleanCaption, type CaptionCue, youtubeId } from './captions';
import { send } from './client';
export interface CaptionTrack { url: string; language: string; automatic: boolean; name: string }
export async function playerTracks(videoId: string): Promise<{ tracks: CaptionTrack[]; selectedLanguage: string }> {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => { window.removeEventListener('message', receive); resolve({ tracks: [], selectedLanguage: '' }); }, 1200);
    function receive(event: MessageEvent<unknown>) {
      const value = event.data;
      if (event.source !== window || !value || typeof value !== 'object' || !('namespace' in value) || value.namespace !== 'mach-doc-youtube' || !('type' in value) || value.type !== 'tracks' || !('requestId' in value) || value.requestId !== requestId || !('videoId' in value) || value.videoId !== videoId || !('tracks' in value) || !Array.isArray(value.tracks)) return;
      const tracks: CaptionTrack[] = value.tracks.slice(0, 30).filter((t: unknown): t is CaptionTrack => !!t && typeof t === 'object' && 'url' in t && typeof t.url === 'string' && t.url.length < 16000 && 'language' in t && typeof t.language === 'string' && t.language.length < 30 && 'automatic' in t && typeof t.automatic === 'boolean' && 'name' in t && typeof t.name === 'string');
      clearTimeout(timeout); window.removeEventListener('message', receive);
      resolve({ tracks, selectedLanguage: 'selectedLanguage' in value && typeof value.selectedLanguage === 'string' ? value.selectedLanguage.slice(0, 30) : '' });
    }
    window.addEventListener('message', receive);
    window.postMessage({ namespace: 'mach-doc-youtube', type: 'request-tracks', requestId, videoId }, location.origin);
  });
}
export function nativeCaptions(video: HTMLVideoElement): CaptionCue[] {
  const tracks = Array.from(video.textTracks).filter(t => /^en(?:-|$)/i.test(t.language));
  const track = tracks.find(t => t.mode === 'showing') ?? tracks[0]; if (!track?.cues) return [];
  return Array.from(track.cues).slice(0, 50000).flatMap(cue => {
    const text = 'text' in cue && typeof cue.text === 'string' ? cleanCaption(cue.text) : '';
    return text ? [{ text, start: cue.startTime, end: cue.endTime, language: track.language, automatic: /auto|asr/i.test(track.label), source: 'text-track' as const, timing: 'track' as const }] : [];
  });
}
export function transcriptDom(language: string): CaptionCue[] {
  const rows = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer')).slice(0, 5000);
  const parsed = rows.flatMap(row => {
    const stamp = row.querySelector('.segment-timestamp')?.textContent?.trim() ?? '';
    const text = cleanCaption(row.querySelector('.segment-text')?.textContent ?? '');
    if (!/^\d+(?::\d{2}){1,2}$/.test(stamp) || !text) return [];
    const start = stamp.split(':').reduce((n, chunk) => n * 60 + Number(chunk), 0);
    return [{ text, start }];
  });
  // DOM transcript gives starts only; inferred ends are explicitly marked observed.
  return parsed.flatMap((p, i) => {
    const end = parsed[i + 1]?.start;
    return end && end > p.start && end - p.start <= 30 ? [{ ...p, end, language, automatic: true, source: 'transcript-dom' as const, timing: 'observed' as const }] : [];
  });
}
export async function fetchTrack(track: CaptionTrack, videoId: string): Promise<CaptionCue[]> {
  if (youtubeId(location.href) !== videoId) return [];
  return send<CaptionCue[]>({ type: 'video-fetch-track', videoId, url: track.url, language: track.language, automatic: track.automatic });
}
