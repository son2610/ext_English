import { youtubeId } from './captions';
interface PlayerResponse { videoDetails?: { videoId?: string }; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl?: string; languageCode?: string; kind?: string; name?: { simpleText?: string } }[] } } }
interface PlayerElement extends HTMLElement { getPlayerResponse?: () => PlayerResponse; getOption?: (module: string, key: string) => { languageCode?: string; translationLanguage?: { languageCode?: string } } }
window.addEventListener('message', event => {
  if (event.source !== window || event.data?.namespace !== 'mach-doc-youtube' || event.data?.type !== 'request-tracks' || typeof event.data.requestId !== 'string') return;
  const id = youtubeId(location.href); if (!id || event.data.videoId !== id) return;
  try {
    const players = Array.from(document.querySelectorAll<PlayerElement>('#movie_player, .html5-video-player'));
    const player = players.find(p => p.getPlayerResponse?.()?.videoDetails?.videoId === id) ?? players[0];
    const response = player?.getPlayerResponse?.() ?? (window as Window & { ytInitialPlayerResponse?: PlayerResponse }).ytInitialPlayerResponse;
    if (response?.videoDetails?.videoId !== id) return;
    const selected = player?.getOption?.('captions', 'track');
    const tracks = (response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).slice(0, 30).flatMap(track => {
      if (!track.baseUrl || !track.languageCode) return [];
      const url = new URL(track.baseUrl); if (url.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(url.hostname) || url.pathname !== '/api/timedtext' || url.searchParams.get('v') !== id) return [];
      return [{ url: url.href, language: track.languageCode, automatic: track.kind === 'asr', name: track.name?.simpleText?.slice(0, 100) ?? track.languageCode }];
    });
    window.postMessage({ namespace: 'mach-doc-youtube', type: 'tracks', requestId: event.data.requestId, videoId: id, tracks, selectedLanguage: selected?.translationLanguage?.languageCode ?? selected?.languageCode ?? '' }, location.origin);
  } catch { /* YouTube's private player shape changed: isolated script will use its next adapter. */ }
});
