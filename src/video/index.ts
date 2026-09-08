import { CaptionHistory, recentSentences, timestamp, youtubeId, type CaptionCue } from './captions';
import { nativeCaptions, playerTracks, fetchTrack, transcriptDom } from './sources';
import { send } from './client';
import type { Source } from '../domain/models';
import { RewatchController } from './rewatch';
import type { VideoEditorPayload } from './editor';
const studyPlayer = new URL(location.href).searchParams.get('md-review') === '1' || Array.from(location.ancestorOrigins).includes(`chrome-extension://${chrome.runtime.id}`);
const blindPlayer = new URL(location.href).searchParams.get('md-blind') === '1';
if (blindPlayer) { const sheet = new CSSStyleSheet(); sheet.replaceSync('.ytp-caption-window-container{visibility:hidden!important}video::cue{color:transparent!important;background:transparent!important}'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; }

export interface VideoNote { id: string; text: string; note: string; start: number; end: number; deferred: boolean }
interface Session { id: string; video: HTMLVideoElement; cues: CaptionCue[]; history: CaptionHistory; language: string; status: string; notes: VideoNote[]; version: number }
let session: Session | undefined; let generation = 0; let lastNotesRead = 0;
let rewatch: RewatchController | undefined; let replayTimer = 0; let lastCaption = '';
let observer: MutationObserver | undefined; let captionTimer = 0; let noteSignature = '';
const host = document.createElement('aside'); host.dataset.machDoc = 'youtube';
const root = host.attachShadow({ mode: 'closed' }); const sheet = new CSSStyleSheet();
sheet.replaceSync(`*{box-sizing:border-box}section{color:#304637;background:#f8faf2;border:1px solid #dce5d2;border-radius:13px;font:13px/1.6 system-ui;box-shadow:0 8px 32px #102b1714;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#eaf0df;gap:10px}header strong{font:21px Georgia}button,select,input{font:12px system-ui}button{cursor:pointer;border:1px solid #cddbc0;border-radius:7px;color:#315947;background:white;padding:7px 9px}button.primary{color:white;background:#315947;border-color:#315947}.body{padding:13px;max-height:60vh;overflow:auto}.status{font-size:11px;color:#7c896f;margin:0 0 10px}.notes{display:grid;gap:7px;max-height:290px;overflow:auto}.note{text-align:left;width:100%;padding:10px;background:#fff}.note.active{background:#e7efda;border-color:#96ad7d}.note b{color:#7a9065;display:block;font-size:10px}.note span{display:block;font:15px/1.5 Georgia}.note small{display:block;margin-top:5px;color:#89967d}.controls{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.controls label{display:flex;align-items:center;gap:5px;font-size:11px}.controls select{max-width:80px;padding:5px;border:1px solid #d4dfc9;border-radius:5px;background:white}.timeline{height:15px;position:relative;border-radius:5px;background:#e0e8d5;margin:12px 0}.mark{position:absolute;top:0;height:15px;width:8px;padding:0;border:0;border-radius:3px;background:#6f9658}.banner{padding:10px;background:#f3ebd7;border-radius:8px;margin-top:12px;font-size:12px}.empty{font-size:12px;color:#8a967d}.error{color:#a45837}.hidden{display:none}a{color:#315947}`);
root.adoptedStyleSheets = [sheet];
const section = document.createElement('section');
section.innerHTML = '<header><strong>Mạch Đọc</strong><button class="save primary" title="Alt+Shift+Y">Lưu câu</button><button class="collapse" aria-label="Thu gọn danh sách">−</button></header><div class="body"><p class="status">Đang tìm phụ đề…</p><div class="timeline" aria-label="Các vị trí đã lưu"></div><div class="notes"></div><div class="controls"><button class="previous">← Note trước</button><button class="next">Note sau →</button></div><div class="controls"><label>Lặp <select class="repeats"><option>2</option><option>3</option><option>5</option><option>1</option></select></label><label>Tốc độ <select class="speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="0.5">0.5×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div><label><input type="checkbox" class="hide-first" checked> Ẩn phụ đề ở lần đầu</label><div class="controls"><button class="rewatch">Luyện lại các đoạn</button><button class="stop">Dừng</button></div><p class="status playback"></p><div class="banner hidden"></div><button class="study">Mở thư viện / phân tích sau</button></div>';
root.append(section);
const status = section.querySelector<HTMLElement>('.status')!, body = section.querySelector<HTMLElement>('.body')!;
const notesElement = section.querySelector<HTMLElement>('.notes')!, timeline = section.querySelector<HTMLElement>('.timeline')!;
const banner = section.querySelector<HTMLElement>('.banner')!;
let mountedBody = false;
function mount() {
  if (studyPlayer) return;
  const side = document.querySelector('#secondary');
  const usableSide = side && side.getBoundingClientRect().width > 200;
  const parent = usableSide ? side : document.body;
  if (!parent) return;
  if (host.parentElement !== parent) parent.prepend(host);
  host.style.cssText = usableSide ? 'all:initial!important;display:block!important;margin:0 0 16px!important;' : 'all:initial!important;display:block!important;position:fixed!important;right:14px!important;bottom:18px!important;width:min(330px,calc(100vw - 28px))!important;z-index:2147483000!important;';
  if (!mountedBody) { mountedBody = true; body.classList.add('hidden'); }
}
function showStatus(text: string) { status.textContent = text; }
function captionsElement(video: HTMLVideoElement) { return video.closest('.html5-video-player')?.querySelector('.ytp-caption-window-container'); }
let hiddenCaption: { element: HTMLElement; value: string; priority: string } | undefined;
function concealCaptions(hidden: boolean) {
  if (hiddenCaption) { hiddenCaption.element.style.setProperty('visibility', hiddenCaption.value, hiddenCaption.priority); hiddenCaption = undefined; }
  if (hidden && session) {
    const element = captionsElement(session.video);
    if (element instanceof HTMLElement) { hiddenCaption = { element, value: element.style.getPropertyValue('visibility'), priority: element.style.getPropertyPriority('visibility') }; element.style.setProperty('visibility', 'hidden', 'important'); }
  }
}
function stopReplay() { rewatch?.stop(); rewatch = undefined; clearInterval(replayTimer); concealCaptions(false); }
async function readNotes(force = false) {
  if (studyPlayer) return;
  const current = session; if (!current || (!force && Date.now() - lastNotesRead < 15000)) return;
  lastNotesRead = Date.now();
  try { const notes = await send<VideoNote[]>({ type: 'video-notes', videoId: current.id }); if (session !== current) return; current.notes = notes; renderNotes(); }
  catch (error) { showStatus(error instanceof Error ? error.message : 'Chưa tải được note.'); }
}
let markerHost: HTMLElement | undefined;
function renderNotes() {
  const current = session; if (!current) return;
  const signature = JSON.stringify(current.notes); if (signature === noteSignature && markerHost?.isConnected) return;
  noteSignature = signature;
  notesElement.replaceChildren(); timeline.replaceChildren(); markerHost?.remove(); markerHost = undefined;
  if (!current.notes.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Chưa có note cho video này. Alt+Shift+Y để chọn trong các câu vừa nói.'; notesElement.append(empty); return; }
  body.classList.remove('hidden');
  const progress = current.video.closest('.html5-video-player')?.querySelector('.ytp-progress-bar');
  let markerRoot: ShadowRoot | undefined;
  if (progress) {
    markerHost = document.createElement('span'); markerHost.dataset.machDoc = 'video-markers';
    markerHost.style.cssText = 'position:absolute!important;inset:0!important;pointer-events:none!important;z-index:50!important;';
    markerRoot = markerHost.attachShadow({ mode: 'closed' }); progress.append(markerHost);
  }
  const duration = Number.isFinite(current.video.duration) && current.video.duration > 0 ? current.video.duration : Math.max(...current.notes.map(n => n.end));
  for (const note of current.notes.slice(0, 300)) {
    const item = document.createElement('button'); item.className = 'note'; item.dataset.noteId = note.id;
    const stamp = document.createElement('b'); stamp.textContent = `${timestamp(note.start)}–${timestamp(note.end)}`;
    const quote = document.createElement('span'); quote.textContent = note.text;
    const meaning = document.createElement('small'); meaning.textContent = note.note;
    item.append(stamp, quote, meaning); item.addEventListener('click', () => jump(note.start)); notesElement.append(item);
    const position = `${Math.min(99, note.start / duration * 100)}%`;
    const mark = document.createElement('button'); mark.className = 'mark'; mark.style.left = position; mark.title = `${timestamp(note.start)} · ${note.text}\n${note.note}`; mark.setAttribute('aria-label', `Tới note ${timestamp(note.start)}`);
    mark.addEventListener('click', () => jump(note.start)); timeline.append(mark);
    if (markerRoot) { const actual = mark.cloneNode() as HTMLButtonElement; actual.style.cssText = `all:initial;position:absolute;left:${position};top:0;width:7px;height:100%;min-height:7px;pointer-events:auto;cursor:pointer;border-radius:2px;background:#d9ef82;box-shadow:0 0 2px #0008;`; actual.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); jump(note.start); }); markerRoot.append(actual); }
  }
}
function jump(time: number) { stopReplay(); if (session) { session.video.currentTime = time; void session.video.play().catch(() => showStatus('Bấm phát video để nghe đoạn này.')); } }
async function loadCaptions(current: Session) {
  const native = nativeCaptions(current.video);
  if (native.length) { current.cues = native; current.language = native[0]!.language; current.status = 'Đang dùng track phụ đề có timestamp.'; showStatus(current.status); return; }
  const metadata = await playerTracks(current.id); if (session !== current) return;
  current.language = metadata.selectedLanguage || 'unknown';
  const english = metadata.tracks.filter(t => /^en(?:-|$)/i.test(t.language)).sort((a, b) => Number(a.automatic) - Number(b.automatic));
  for (const track of english.slice(0, 3)) {
    try {
      const cues = await fetchTrack(track, current.id); if (session !== current) return;
      if (cues.length) { current.cues = cues; current.status = metadata.selectedLanguage && !/^en(?:-|$)/i.test(metadata.selectedLanguage) ? `Bạn đang xem phụ đề ${metadata.selectedLanguage}; câu lưu được lấy từ track tiếng Anh riêng.` : `Track tiếng Anh ${track.automatic ? 'tự động' : 'do người tạo cung cấp'} · Mốc thời gian từ phụ đề.`; showStatus(current.status); return; }
    } catch { /* Signed track endpoint is unavailable: continue to the next adapter. */ }
  }
  const transcript = transcriptDom(current.language);
  if (transcript.length) { current.cues = transcript; current.status = 'Dùng bảng transcript đang mở; mốc kết thúc suy ra từ câu kế tiếp. Hãy nghe kiểm tra.'; }
  else current.status = 'Chưa tải được track. Bật phụ đề tiếng Anh và phát vài câu để lưu từ lịch sử hiển thị; mốc này chỉ là ước lượng.';
  if (current.language !== 'unknown' && !/^en(?:-|$)/i.test(current.language)) current.status += ` Phụ đề hiện tại là ${current.language}, không phải tiếng Anh.`;
  showStatus(current.status);
}
function observeCaption() {
  if (studyPlayer) return;
  const current = session; if (!current || current.video.paused || current.video.closest('.ad-showing')) return;
  const text = Array.from(current.video.closest('.html5-video-player')?.querySelectorAll('.ytp-caption-segment') ?? []).map(n => n.textContent ?? '').join(' ');
  current.history.observe(text, current.video.currentTime, current.language); lastCaption = text;
}
async function captureRecent(): Promise<boolean> {
  const current = session; if (!current) return false;
  if (current.video.closest('.ad-showing')) { body.classList.remove('hidden'); showStatus('Đang phát quảng cáo; hãy chờ nội dung video trở lại.'); return true; }
  observeCaption(); stopReplay(); current.video.pause();
  const native = nativeCaptions(current.video); if (native.length) current.cues = native;
  if (!current.cues.some(c => c.timing === 'track' && /^en(?:-|$)/i.test(c.language))) {
    const metadata = await playerTracks(current.id); if (session !== current) return true;
    if (metadata.selectedLanguage && metadata.selectedLanguage !== current.language) {
      current.language = metadata.selectedLanguage; current.history = new CaptionHistory();
      current.cues = current.cues.filter(c => c.source !== 'transcript-dom');
      current.status = 'Ngôn ngữ phụ đề vừa đổi. Lịch sử hiển thị cũ đã được bỏ để tránh gán sai ngôn ngữ; phát vài câu rồi lưu lại.';
    }
  }
  const time = current.video.currentTime;
  let recent = recentSentences(current.cues, time);
  if (!recent.choices.length) recent = recentSentences(transcriptDom(current.language), time);
  if (!recent.choices.length) recent = recentSentences(current.history.cues, time);
  if (!recent.choices.length) { body.classList.remove('hidden'); showStatus('Chưa có câu phụ đề gần đây. Bật CC tiếng Anh, phát vài câu rồi thử lại. Video có thể không cung cấp phụ đề; không có thời gian câu đủ tin cậy để tự lưu.'); return true; }
  const sources: Source[] = recent.choices.map((sentence, i) => ({
    url: location.href, frameUrl: `https://www.youtube.com/watch?v=${current.id}`, title: document.title,
    exact: sentence.text, context: recent.choices.slice(Math.max(0, i - 2), i + 3).map(c => c.text).join('\n').slice(0, 14000), prefix: '', suffix: '', heading: '', scrollY: Math.max(0, scrollY), capturedAt: Date.now(),
    video: { provider: 'youtube', videoId: current.id, start: sentence.start, end: sentence.end, language: sentence.language, automatic: sentence.automatic, timing: sentence.timing, captionSource: sentence.source },
  }));
  const payload: VideoEditorPayload = { sources, preferred: recent.choices.findIndex(c => c.id === recent.preferred), status: current.status };
  try { await send({ type: 'video-open-editor', ...payload }); }
  catch { const module = await import(chrome.runtime.getURL('video-editor.js')) as typeof import('./editor'); module.openVideoEditor(payload); }
  return true;
}
section.querySelector('.save')!.addEventListener('click', () => { void captureRecent().catch(e => showStatus(e instanceof Error ? e.message : 'Chưa mở được hộp thoại.')); });
section.querySelector('.collapse')!.addEventListener('click', () => body.classList.toggle('hidden'));
section.querySelector('.previous')!.addEventListener('click', () => { const current = session; const note = current?.notes.filter(n => n.start < current.video.currentTime - 1).at(-1); if (note) jump(note.start); });
section.querySelector('.next')!.addEventListener('click', () => { const current = session; const note = current?.notes.find(n => n.start > current.video.currentTime + 0.5); if (note) jump(note.start); });
section.querySelector('.stop')!.addEventListener('click', stopReplay);
section.querySelector('.study')!.addEventListener('click', () => { void send({ type: 'video-open-library' }); });
section.querySelector('.rewatch')!.addEventListener('click', () => {
  const current = session; if (!current?.notes.length) return;
  stopReplay();
  rewatch = new RewatchController(current.video, current.notes, Number(section.querySelector<HTMLSelectElement>('.repeats')!.value), Number(section.querySelector<HTMLSelectElement>('.speed')!.value), (hidden, index, repetition) => { concealCaptions(hidden); section.querySelector('.playback')!.textContent = `Đoạn ${Math.min(index + 1, current.notes.length)}/${current.notes.length} · Lần ${repetition}`; }, section.querySelector<HTMLInputElement>('.hide-first')!.checked);
  void rewatch.start().then(() => { replayTimer = window.setInterval(() => { void rewatch?.tick().catch(e => showStatus(e instanceof Error ? e.message : 'Chưa phát được.')); if (!rewatch?.active) { clearInterval(replayTimer); concealCaptions(false); } }, 100); }, e => showStatus(e instanceof Error ? e.message : 'Chưa phát được.'));
});
function onEnded() {
  if (rewatch?.active) { void rewatch.tick(); return; }
  void readNotes(true).then(() => {
    if (!session?.notes.length) return;
    banner.replaceChildren(document.createTextNode(`Bạn đã lưu ${session.notes.length} câu trong video. `));
    const button = document.createElement('button'); button.textContent = 'Phân tích lô câu đã chọn';
    button.addEventListener('click', () => { const id = session?.id; if (id) void send({ type: 'video-release-batch', videoId: id }).then(() => { button.textContent = 'Đã xếp hàng · Mở thư viện để duyệt'; button.disabled = true; }, e => showStatus(e instanceof Error ? e.message : 'Chưa xếp hàng được.')); });
    banner.append(button); banner.classList.remove('hidden'); body.classList.remove('hidden');
  });
}
function refresh() {
  const id = youtubeId(location.href);
  const videos = Array.from(document.querySelectorAll('video')).filter(v => { const r = v.getBoundingClientRect(); return r.width > 100 && r.height > 60 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
  const video = videos.find(v => !v.paused) ?? videos[0];
  if (!id || !video) { if (session) { stopReplay(); session.video.removeEventListener('ended', onEnded); observer?.disconnect(); session = undefined; markerHost?.remove(); host.remove(); } return; }
  if (session?.id !== id || session.video !== video) {
    stopReplay(); session?.video.removeEventListener('ended', onEnded); observer?.disconnect(); markerHost?.remove(); noteSignature = ''; lastNotesRead = 0; lastCaption = ''; banner.classList.add('hidden');
    session = { id, video, cues: [], history: new CaptionHistory(), language: 'unknown', status: 'Đang tìm track tiếng Anh…', notes: [], version: ++generation };
    if (!studyPlayer) renderNotes();
    showStatus(session.status); video.addEventListener('ended', onEnded);
    const player = video.closest('.html5-video-player');
    if (player && !studyPlayer) { observer = new MutationObserver(() => { if (!captionTimer) captionTimer = window.setTimeout(() => { captionTimer = 0; observeCaption(); }, 100); }); observer.observe(player, { childList: true, subtree: true, characterData: true }); }
    if (!studyPlayer) void loadCaptions(session).catch(() => showStatus('Nguồn phụ đề không khả dụng. Thử bật CC tiếng Anh.'));
    void readNotes(true);
    void send<{ videoId: string; start: number; end: number } | null>({ type: 'video-ready', videoId: id }).then(clip => { if (clip && session?.id === clip.videoId) startClip(clip.start, clip.end); }).catch(() => undefined);
  }
  mount(); observeCaption(); void readNotes();
  if (session) for (const node of notesElement.querySelectorAll<HTMLElement>('.note')) { const note = session.notes.find(n => n.id === node.dataset.noteId); node.classList.toggle('active', !!note && video.currentTime >= note.start && video.currentTime < note.end); }
}
function startClip(start: number, end: number) {
  const active = session;
  if (!active || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 90) return;
  stopReplay(); rewatch = new RewatchController(active.video, [{ start, end }], 1, 1, () => undefined, false);
  void rewatch.start().then(() => { replayTimer = window.setInterval(() => { void rewatch?.tick(); if (!rewatch?.active) clearInterval(replayTimer); }, 100); }).catch(() => showStatus('Bấm phát video để nghe đoạn đã chọn.'));
}
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !raw || typeof raw !== 'object' || !('type' in raw)) return false;
  if (raw.type === 'capture-video') { refresh(); if (session && (window === window.top || !session.video.paused || document.hasFocus())) { void captureRecent().then(handled => respond({ handled })); return true; } }
  if (raw.type === 'video-notes-changed') { void readNotes(true); }
  if (raw.type === 'play-video-clip' && 'videoId' in raw && session?.id === raw.videoId && 'start' in raw && 'end' in raw && typeof raw.start === 'number' && typeof raw.end === 'number') {
    startClip(raw.start, raw.end); respond({ handled: true });
  }
  return false;
});
window.addEventListener('yt-navigate-finish', refresh); window.addEventListener('popstate', refresh);
window.addEventListener('pagehide', () => { stopReplay(); observer?.disconnect(); });
setInterval(() => { if (!document.hidden) refresh(); }, 1000);
refresh();
