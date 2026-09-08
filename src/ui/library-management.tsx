import { useState, type FormEvent } from 'react';
import type { Capture, Knowledge, Unit } from '../domain/models';
import { deleteLibraryItem, editCapture, editKnowledge, type LibraryTarget } from '../data/library';
import { send } from '../shared/client';
import './library-management.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;
async function changed() { await send({ type: 'library-changed' }).catch(() => undefined); }

function DeleteItem({ target, description, busy, run, label }: { target: LibraryTarget; description: string; busy: boolean; run: Run; label: string }) {
  // Capture the version when the user opens confirmation, never silently delete a newer item.
  const [pending, setPending] = useState<LibraryTarget>();
  return <>
    <button className="text-button danger" disabled={busy} onClick={() => setPending(target)}>{label}</button>
    {pending && <div className="delete-confirm" role="group" aria-label="Xác nhận xoá">
      <strong>{label}?</strong><p>{description}</p>
      <p className="muted">Tự tạo bản sao trước khi xoá. Bạn có thể tải bản sao trong Cài đặt & dữ liệu → bản chụp trên máy, rồi nhập lại.</p>
      <div className="actions left"><button disabled={busy} onClick={() => setPending(undefined)}>Huỷ xoá</button><button className="danger" disabled={busy} onClick={() => void run(async () => { await deleteLibraryItem(pending); setPending(undefined); await changed(); }, 'Đã xoá mục và lưu bản sao khôi phục.')}>Xác nhận xoá</button></div>
    </div>}
  </>;
}

export function CaptureManagement({ capture, units, busy, run }: { capture: Capture; units: Unit[]; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState<Capture>();
  const linked = units.filter(u => u.captureIds.includes(capture.id));
  const exclusive = linked.filter(u => u.captureIds.length === 1).length;
  return <div className="capture-management">
    <div className="management-actions"><button disabled={busy || !!editing} onClick={() => setEditing(capture)}>Chỉnh sửa câu / ghi chú</button>
      <DeleteItem target={{ kind: 'capture', id: capture.id, updatedAt: capture.updatedAt }} busy={busy} run={run} label="Xoá ngữ cảnh" description={`Xoá đoạn này cùng ${exclusive} bài học chỉ thuộc đoạn này và lịch sử của chúng. ${linked.length - exclusive} bài học dùng chung với ngữ cảnh khác được giữ nguyên.`}/>
    </div>
    {editing && <CaptureEditor initial={editing} busy={busy} run={run} close={() => setEditing(undefined)}/>}
  </div>;
}

function CaptureEditor({ initial, busy, run, close }: { initial: Capture; busy: boolean; run: Run; close: () => void }) {
  const [exact, setExact] = useState(initial.source.exact);
  const [note, setNote] = useState(initial.note);
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => { await editCapture(initial.id, { exact, note }, initial.updatedAt); close(); await changed(); }, 'Đã lưu chỉnh sửa ngữ cảnh.');
  }
  return <form className="library-editor" aria-label="Chỉnh sửa ngữ cảnh" onSubmit={submit}>
    <h3>Chỉnh sửa nội dung đã lưu</h3>
    <label>Câu hoặc từ muốn lưu<textarea autoFocus required maxLength={8000} lang="en" value={exact} onChange={e => setExact(e.target.value)}/></label>
    <label>Ghi chú của bạn<textarea maxLength={8000} value={note} onChange={e => setNote(e.target.value)}/></label>
    <p className="muted">Câu gốc và vị trí được giữ để quay lại. Đổi câu sẽ bỏ phân tích cũ để bạn phân tích lại khi cần; các bài đã tạo và lịch ôn vẫn được giữ. Bạn có thể sửa từng bài bên dưới.</p>
    <div className="actions"><button type="button" disabled={busy} onClick={close}>Huỷ chỉnh sửa</button><button className="primary" disabled={busy || !exact.trim()}>Lưu chỉnh sửa</button></div>
  </form>;
}

export function UnitManagement({ unit, busy, run }: { unit: Unit; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState<Unit>();
  return <div className="unit-management">
    <p className="english">{unit.knowledge.form}</p><p>{unit.knowledge.meaningVi}</p>
    <div className="management-actions"><button disabled={busy || !!editing} onClick={() => setEditing(unit)}>Chỉnh sửa bài học</button>
      <DeleteItem target={{ kind: 'unit', id: unit.id, updatedAt: unit.updatedAt }} busy={busy} run={run} label="Xoá bài học" description={`Xoá bài học này khỏi lịch ôn và xoá lịch sử trả lời, bài luyện, số lần gặp của nó. ${unit.captureIds.length} ngữ cảnh gốc được giữ để bạn xem lại.`}/>
    </div>
    {editing && <KnowledgeEditor initial={editing} busy={busy} run={run} close={() => setEditing(undefined)}/>}
  </div>;
}

function KnowledgeEditor({ initial, busy, run, close }: { initial: Unit; busy: boolean; run: Run; close: () => void }) {
  const [draft, setDraft] = useState<Knowledge>(() => structuredClone(initial.knowledge));
  const field = (key: 'name' | 'group' | 'form' | 'meaningVi' | 'explanationVi' | 'evidence', label: string, max = 8000) => <label>{label}<textarea aria-label={label} required maxLength={max} value={draft[key]} onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}/></label>;
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => { await editKnowledge(initial.id, draft, initial.updatedAt); close(); await changed(); }, 'Đã sửa bài học, giữ nguyên lịch ôn và tiến độ.');
  }
  return <form className="library-editor" aria-label="Chỉnh sửa bài học" onSubmit={submit}>
    <h3>Sửa bài học</h3>
    <p className="muted">Giữ nguyên tiến độ {initial.schedule.reps} lượt ôn. Nếu đổi từ hoặc công thức, hãy sửa cả đáp án và ví dụ tương ứng. Bài dùng chung sẽ cập nhật ở mọi ngữ cảnh.</p>
    {field('form', 'Từ / cụm từ hoặc công thức', 500)}
    {field('name', 'Tên bài học', 500)}{field('group', 'Nhóm kiến thức', 500)}
    {field('meaningVi', 'Nghĩa tiếng Việt')}{field('explanationVi', 'Giải thích')}
    <details className="exercise-editor"><summary>Chỉnh sửa ví dụ & đáp án</summary>
      {field('evidence', 'Trích dẫn minh hoạ', 500)}
      {draft.examples.map((example, i) => <div key={i} className="example-editor">
        <label>Ví dụ tiếng Anh {i + 1}<textarea required maxLength={8000} value={example.en} onChange={e => setDraft(prev => ({ ...prev, examples: prev.examples.map((v, j) => j === i ? { ...v, en: e.target.value } : v) }))}/></label>
        <label>Nghĩa ví dụ {i + 1}<textarea required maxLength={8000} value={example.vi} onChange={e => setDraft(prev => ({ ...prev, examples: prev.examples.map((v, j) => j === i ? { ...v, vi: e.target.value } : v) }))}/></label>
      </div>)}
      <label>Yêu cầu bài viết<textarea required maxLength={8000} value={draft.production.instructionVi} onChange={e => setDraft(prev => ({ ...prev, production: { ...prev.production, instructionVi: e.target.value } }))}/></label>
      <label>Đáp án bài viết<textarea aria-label="Đáp án bài viết" required maxLength={8000} value={draft.production.answerEn} onChange={e => setDraft(prev => ({ ...prev, production: { ...prev.production, answerEn: e.target.value } }))}/></label>
      <label>Câu điền khuyết · dùng [[blank]] cho chỗ trống<textarea required maxLength={8000} value={draft.cloze.sentence} onChange={e => setDraft(prev => ({ ...prev, cloze: { ...prev.cloze, sentence: e.target.value } }))}/></label>
      <label>Đáp án điền khuyết<textarea required maxLength={500} value={draft.cloze.answer} onChange={e => setDraft(prev => ({ ...prev, cloze: { ...prev.cloze, answer: e.target.value } }))}/></label>
      <label>Gợi ý điền khuyết<textarea required maxLength={500} value={draft.cloze.hintVi} onChange={e => setDraft(prev => ({ ...prev, cloze: { ...prev.cloze, hintVi: e.target.value } }))}/></label>
    </details>
    <div className="actions"><button type="button" disabled={busy} onClick={close}>Huỷ chỉnh sửa</button><button className="primary" disabled={busy}>Lưu bài học</button></div>
  </form>;
}
