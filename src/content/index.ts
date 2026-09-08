import { selectedSource } from './selection';
import { send } from '../shared/client';
import type { Source } from '../domain/models';
import { startHighlights } from './highlights';
import { AhoCorasick, type Pattern } from './matcher';

const host = document.createElement('div');
host.dataset.machDoc = 'capture'; host.popover = 'manual';
host.style.cssText = 'all:initial!important;display:none!important;position:fixed!important;inset:auto!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;';
const root = host.attachShadow({ mode: 'closed' });
const style = document.createElement('style');
style.textContent = `:host{color-scheme:light}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #dcb961;outline-offset:3px}.icon{width:36px;height:36px;border:1px solid #fff8;border-radius:12px;background:#28594a;color:#fff;font:bold 22px Georgia;box-shadow:0 4px 20px #0003}.icon:hover{background:#153c31}dialog{color:#293c34;font:15px/1.6 system-ui;background:#fcfbf7;border:1px solid #d8dfd5;border-radius:20px;padding:24px;width:min(480px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-shadow:0 20px 100px #0004}dialog::backdrop{background:#13271e44}h2{font:600 24px Georgia;margin:0 0 4px}p{margin:8px 0}blockquote{margin:16px 0;background:#eff2e9;border-left:3px solid #739469;padding:12px;font:17px/1.7 Georgia;white-space:pre-wrap;max-height:160px;overflow:auto}label{display:block;margin-top:12px}textarea{width:100%;resize:vertical;border:1px solid #c5cebf;border-radius:9px;background:white;padding:10px;min-height:90px;color:#24392f}.check{display:flex;align-items:center;gap:8px}.check input{width:18px;height:18px}.muted{font-size:12px;color:#627163}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.actions button{padding:9px 16px;border-radius:9px;border:1px solid #c5cebf;background:white;color:#293c34}.actions .save{background:#28594a;color:white;border-color:#28594a}.error{color:#9b322e;font-size:13px}.toast{font:14px system-ui;background:#28594a;color:white;border-radius:10px;padding:12px;max-width:280px}`;
root.append(style);
const icon = document.createElement('button'); icon.className = 'icon'; icon.textContent = '+'; icon.title = 'Lưu để học · Alt+Shift+S'; icon.setAttribute('aria-label', 'Lưu đoạn tiếng Anh');
root.append(icon);
document.documentElement.append(host);
let current: Source | undefined;
let dialog: HTMLDialogElement | undefined;
let timer = 0; let toastTimer = 0;
function hide() { if (host.matches(':popover-open')) host.hidePopover(); host.style.setProperty('display', 'none', 'important'); }
function position(rect: DOMRect) {
  const x = Math.max(8, Math.min(innerWidth - 44, rect.right + 6));
  const y = Math.max(8, Math.min(innerHeight - 44, rect.bottom + 6));
  host.style.setProperty('left', `${x}px`, 'important'); host.style.setProperty('top', `${y}px`, 'important');
}
function update() {
  if (dialog?.open) return;
  const selection = selectedSource();
  if (!selection) { hide(); return; }
  current = selection.source;
  icon.hidden = false;
  position(selection.rect);
  if (!host.isConnected) document.documentElement.append(host);
  host.style.setProperty('display', 'block', 'important');
  if (!host.matches(':popover-open')) host.showPopover();
}
function schedule() { clearTimeout(timer); timer = window.setTimeout(update, 160); }
document.addEventListener('selectionchange', schedule, { passive: true });
document.addEventListener('pointerup', schedule, { passive: true });
document.addEventListener('keyup', event => { if (!root.contains(event.target as Node)) schedule(); });
window.addEventListener('scroll', () => { if (!dialog?.open) hide(); }, { passive: true, capture: true });
window.addEventListener('resize', () => { if (!dialog?.open) hide(); }, { passive: true });
icon.addEventListener('pointerdown', event => event.preventDefault());
icon.addEventListener('click', () => {
  if (!current) return;
  const source = current; hide();
  if (window === window.top) openEditor(source);
  else void send({ type: 'open-editor', source }).catch(() => openEditor(source));
});
function notify(message: string) {
  hide(); icon.hidden = true; root.querySelector('.toast')?.remove();
  const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; toast.setAttribute('role', 'status'); root.append(toast);
  host.style.setProperty('left', `${Math.max(8, innerWidth - 300)}px`, 'important'); host.style.setProperty('top', '16px', 'important');
  host.style.setProperty('display', 'block', 'important');
  host.showPopover(); clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { hide(); toast.remove(); icon.hidden = false; }, 4500);
}
function openEditor(source: Source) {
  if (dialog?.open) return;
  clearTimeout(toastTimer); root.querySelector('.toast')?.remove();
  hide();
  host.style.setProperty('display', 'block', 'important');
  icon.hidden = true;
  const previousFocus = document.activeElement as HTMLElement | null;
  dialog?.remove(); dialog = document.createElement('dialog');
  const form = document.createElement('form');
  // Only static markup enters HTML parsing. Page content and AI output always use textContent.
  form.innerHTML = `<h2>Giữ lại điều vừa gặp.</h2><p class="muted">Một đoạn đọc hôm nay, một điều hiểu sâu hơn ngày mai.</p><blockquote></blockquote><label>Ý nghĩa / ghi chú của bạn<textarea maxlength="8000" placeholder="Bạn hiểu đoạn này thế nào? Điều gì còn khó?"></textarea></label><label class="check"><input type="checkbox"> Nhờ AI phân tích</label><p class="muted">Khi chọn AI, đoạn trích, ngữ cảnh xung quanh và ghi chú sẽ được gửi tới Google Gemini. Bỏ chọn để chỉ lưu trên máy.</p><details><summary class="muted">Xem ngữ cảnh sẽ lưu / gửi</summary><p class="context muted"></p></details><p class="error" role="status"></p><div class="actions"><button type="button" class="cancel">Hủy</button><button type="submit" class="save">Lưu đoạn này</button></div>`;
  form.querySelector('blockquote')!.textContent = source.exact;
  form.querySelector('.context')!.textContent = source.context;
  form.querySelector('.cancel')!.addEventListener('click', () => dialog?.close());
  form.addEventListener('submit', event => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('.save')!; button.disabled = true; button.textContent = 'Đang lưu…';
    void send<{ duplicate: boolean }>({ type: 'capture', source, note: form.querySelector('textarea')!.value, analyze: form.querySelector('input')!.checked }).then(result => { dialog?.close(); notify(result.duplicate ? 'Đã bổ sung ghi chú vào đoạn đã lưu.' : 'Đã lưu. Bạn cứ tiếp tục đọc nhé.'); }, error => { form.querySelector('.error')!.textContent = error instanceof Error ? error.message : 'Không lưu được. Hãy thử lại.'; button.disabled = false; button.textContent = 'Lưu đoạn này'; });
  });
  dialog.append(form); root.append(dialog);
  dialog.addEventListener('close', () => { if (!root.querySelector('.toast')) { hide(); icon.hidden = false; } previousFocus?.focus({ preventScroll: true }); });
  dialog.showModal(); form.querySelector('textarea')!.focus();
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'show-editor' && 'source' in message) {
    // The trusted worker validates SourceSchema before relaying. Keep the heavy validator off reading pages.
    const source = message.source as Source | undefined;
    if (source && typeof source.exact === 'string' && typeof source.context === 'string' && source.exact.length <= 8000) { openEditor(source); respond({ ok: true }); }
  }
  if (message.type === 'show-video-editor' && 'payload' in message) {
    void import(chrome.runtime.getURL('video-editor.js')).then(module => module.openVideoEditor(message.payload)).then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  }
  if (message.type === 'quick-capture' && document.hasFocus() && !(document.activeElement instanceof HTMLIFrameElement)) {
    const selected = selectedSource();
    if (selected) void send({ type: 'capture', source: selected.source, note: '', analyze: false }).then(() => notify('Đã lưu nhanh · Phân tích sau trong Thư viện.'), error => notify(error instanceof Error ? error.message : 'Không lưu được.'));
  }
  if (message.type === 'refresh-highlights') void refreshHighlights();
  return false;
});
let stopHighlights: (() => void) | undefined;
let refreshVersion = 0;
async function refreshHighlights() {
  const version = ++refreshVersion;
  stopHighlights?.(); stopHighlights = undefined;
  try { const patterns = await send<Pattern[]>({ type: 'lexicon' }); if (version === refreshVersion && patterns.length) { const matcher = await AhoCorasick.prepare(patterns, () => version !== refreshVersion); if (matcher && version === refreshVersion) stopHighlights = startHighlights(patterns, matcher); } }
  catch { /* Disabled or extension reloaded; reading continues normally. */ }
}
void refreshHighlights();
