import type { Source } from '../domain/models';
import { send } from '../shared/client';
import { timestamp } from './captions';
import { editSourceText } from '../shared/source-text';
export interface VideoEditorPayload { sources: Source[]; preferred: number; status: string }
let active: HTMLDialogElement | undefined;
export function openVideoEditor(payload: VideoEditorPayload) {
  if (active?.open) active.close();
  if (!payload.sources.length) return;
  const host = document.createElement('div'); host.dataset.machDoc = 'video-editor';
  host.style.cssText = 'all:initial!important';
  const root = host.attachShadow({ mode: 'closed' }); const sheet = new CSSStyleSheet();
  sheet.replaceSync(`*{box-sizing:border-box}dialog{width:min(640px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid #d7dfcf;border-radius:18px;background:#fcfcf8;color:#2d4237;font:14px/1.6 system-ui;box-shadow:0 18px 90px #0004}dialog::backdrop{background:#152c2255}h2{font:28px Georgia;margin:0 0 6px}p{font-size:12px;color:#74836b}.choices{display:grid;gap:8px;max-height:270px;overflow:auto;margin:15px 0}.choice{display:flex;gap:10px;border:1px solid #dde4d6;padding:12px;border-radius:10px;cursor:pointer}.choice:has(input:checked){background:#eaf0df;border-color:#8ba574}.choice b{display:block;font-size:11px;color:#7d8f6c}.choice span{font:17px/1.6 Georgia}input{accent-color:#315d49}textarea,select{font:14px system-ui;width:100%;padding:10px;margin-top:5px;border:1px solid #d4dccd;border-radius:8px;background:white;color:#2d4237}label{display:block;margin-top:10px}.check{display:flex;gap:8px;align-items:center}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}button{font:14px system-ui;padding:10px 15px;border:1px solid #d2ddc9;border-radius:8px;background:#fff;color:#315d49;cursor:pointer}.primary{background:#315d49;color:#fff}.error{color:#a25439}.status{background:#f5f0df;padding:10px;border-radius:8px}`);
  root.adoptedStyleSheets = [sheet];
  const dialog = document.createElement('dialog'); active = dialog;
  const form = document.createElement('form');
  form.innerHTML = '<h2>Giữ lại câu vừa nghe.</h2><p>Video đã tạm dừng. Chọn câu bạn muốn lưu; thời gian lấy từ phụ đề, không phải lúc bấm phím.</p><p class="status"></p><div class="choices"></div><label>Ngôn ngữ của câu chọn<select class="language"><option value="en">Tiếng Anh</option><option value="unknown">Chưa xác định / không phải tiếng Anh</option></select></label><label>Ghi chú của bạn<textarea rows="2" maxlength="8000" placeholder="Điều gì trong câu này khiến bạn chú ý?"></textarea></label><label class="check"><input type="checkbox" class="queue" checked> Đánh dấu để phân tích sau khi xem</label><p>Chưa gọi AI khi lưu. Sau khi xem xong, bạn chủ động chạy lô phân tích. Transcript tự động sẽ được AI sửa và ghi rõ chỗ chưa chắc chắn.</p><p class="error" role="status"></p><div class="actions"><button type="button" class="cancel">Hủy</button><button type="submit" class="primary">Lưu câu đã chọn</button></div>';
  form.querySelector('.status')!.textContent = payload.status;
  const choices = form.querySelector('.choices')!; const language = form.querySelector<HTMLSelectElement>('.language')!;
  let selected = Math.max(0, Math.min(payload.sources.length - 1, payload.preferred));
  const drafts = payload.sources.map(source => source.exact);
  const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'edit-text'; editButton.textContent = 'Chỉnh sửa câu / từ muốn lưu';
  const editArea = document.createElement('div'); editArea.hidden = true;
  const editLabel = document.createElement('label'); editLabel.textContent = 'Câu hoặc từ muốn lưu';
  const text = document.createElement('textarea'); text.className = 'selected-text'; text.rows = 3; text.maxLength = 8000; text.lang = 'en'; text.spellcheck = false;
  editLabel.append(text);
  const hint = document.createElement('p'); hint.textContent = 'Có thể sửa câu hoặc chỉ giữ một từ / cụm từ. Transcript gốc và mốc thời gian vẫn được giữ để nghe lại cả câu.';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Dùng lại câu gốc'; reset.className = 'reset-text';
  reset.addEventListener('click', () => { text.value = payload.sources[selected]!.exact; drafts[selected] = text.value; text.focus(); });
  editArea.append(editLabel, hint, reset); choices.after(editButton, editArea);
  text.addEventListener('input', () => { drafts[selected] = text.value; });
  editButton.addEventListener('click', () => { editArea.hidden = false; editButton.setAttribute('aria-expanded', 'true'); text.focus(); });
  editButton.setAttribute('aria-expanded', 'false');
  // The note stays independent from the editable learning focus.
  const note = form.querySelector<HTMLTextAreaElement>('textarea:not(.selected-text)')!; note.className = 'note';
  function syncLanguage() { language.value = /^en(?:-|$)/i.test(payload.sources[selected]!.video!.language) ? 'en' : 'unknown'; text.value = drafts[selected]!; }
  payload.sources.slice(0, 8).forEach((source, index) => {
    const label = document.createElement('label'); label.className = 'choice';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'sentence'; radio.checked = index === selected;
    const body = document.createElement('span'); const time = document.createElement('b'); time.textContent = `${timestamp(source.video!.start)}–${timestamp(source.video!.end)} · ${source.video!.timing === 'track' ? 'Mốc từ track phụ đề' : 'Mốc ước lượng — nên nghe kiểm tra'}`;
    body.append(time, document.createTextNode(source.exact)); label.append(radio, body); choices.append(label);
    radio.addEventListener('change', () => { selected = index; syncLanguage(); });
  });
  syncLanguage();
  form.querySelector('.cancel')!.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', event => {
    event.preventDefault(); const button = form.querySelector<HTMLButtonElement>('.primary')!; button.disabled = true;
    const chosen = payload.sources[selected]!;
    let source: Source;
    try { source = { ...editSourceText(chosen, drafts[selected]!), video: { ...chosen.video!, language: language.value } }; }
    catch (error) { form.querySelector('.error')!.textContent = (error as Error).message; button.disabled = false; text.focus(); return; }
    const analyze = form.querySelector<HTMLInputElement>('.queue')!.checked;
    if (analyze && language.value !== 'en') { form.querySelector('.error')!.textContent = 'Chưa xác nhận tiếng Anh: hãy bỏ chọn phân tích để chỉ lưu, hoặc chọn đúng ngôn ngữ.'; button.disabled = false; return; }
    void send({ type: 'capture', source, note: note.value, analyze }).then(() => { dialog.close(); }, error => { form.querySelector('.error')!.textContent = error instanceof Error ? error.message : 'Chưa lưu được.'; button.disabled = false; });
  });
  dialog.append(form); root.append(dialog); document.documentElement.append(host);
  dialog.addEventListener('close', () => { host.remove(); if (active === dialog) active = undefined; });
  dialog.showModal(); choices.querySelector<HTMLInputElement>('input:checked')?.focus();
}
