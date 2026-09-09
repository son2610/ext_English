import { useState, type CSSProperties } from 'react';
import { colors, type Organizer } from '../domain/organization';
import { deleteOrganizer, saveOrganizer } from '../data/organization';

export const colorStyle = (color: Organizer['color']): CSSProperties => ({ '--chip-ink': colors[color].ink, '--chip-soft': colors[color].soft, '--chip-stripe': colors[color].stripe } as CSSProperties);
type Mutate = (action: () => Promise<unknown>) => Promise<void>;
export function OrganizerManager({ catalog, mutate, busy }: { catalog: Organizer[]; mutate: Mutate; busy: boolean }) {
  const [kind, setKind] = useState<Organizer['kind']>('group');
  const [name, setName] = useState(''); const [color, setColor] = useState<Organizer['color']>('emerald');
  const [editing, setEditing] = useState<Organizer>(); const [removing, setRemoving] = useState<Organizer>();
  const reset = () => { setName(''); setEditing(undefined); setRemoving(undefined); };
  return <div className="organizer-manager">
    <p className="muted">Mỗi câu thuộc một nhóm và có thể mang nhiều nhãn. Dùng nhóm cho chủ đề lớn, nhãn cho đặc điểm như “Công việc”, “Cần luyện viết”.</p>
    <div className="segment" aria-label="Loại danh mục">{(['group', 'label'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); reset(); }}>{k === 'group' ? 'Nhóm' : 'Nhãn màu'}</button>)}</div>
    <form className="organizer-form" onSubmit={e => { e.preventDefault(); void mutate(async () => { await saveOrganizer({ kind, name, color }, editing); reset(); }); }}>
      <label>{editing ? 'Đổi tên' : kind === 'group' ? 'Tên nhóm mới' : 'Tên nhãn mới'}<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'group' ? 'Ví dụ: Tiếng Anh công nghệ' : 'Ví dụ: Dùng trong cuộc họp'}/></label>
      <fieldset className="color-picker"><legend>Màu nhận diện</legend>{(Object.keys(colors) as Organizer['color'][]).map(c => <label key={c} style={colorStyle(c)}><input type="radio" name="organizer-color" value={c} checked={color === c} onChange={() => setColor(c)}/><span className="color-dot"/>{colors[c].name}</label>)}</fieldset>
      <div className="actions"><button type="button" disabled={busy} onClick={reset}>Huỷ chỉnh sửa</button><button className="primary" disabled={busy || !name.trim()}>{editing ? 'Lưu danh mục' : kind === 'group' ? 'Tạo nhóm' : 'Tạo nhãn'}</button></div>
    </form>
    <div className="organizer-list">{catalog.filter(o => o.kind === kind).map(o => <div className="organizer-row" key={o.id}>
      <span className="color-chip" style={colorStyle(o.color)}><i/>{o.name}</span>
      <button disabled={busy} aria-label={`Sửa ${o.name}`} onClick={() => { setEditing(o); setName(o.name); setColor(o.color); setRemoving(undefined); }}>Sửa</button>
      <button className="danger" disabled={busy} aria-label={`Xoá ${o.name}`} onClick={() => setRemoving(o)}>Xoá</button>
      {removing?.id === o.id && <div className="delete-confirm"><p>Xoá {kind === 'group' ? 'nhóm' : 'nhãn'} “{o.name}”? Các câu và tiến độ học vẫn được giữ lại{kind === 'group' ? '; các câu trong nhóm trở về Chưa phân nhóm' : ''}.</p><div className="actions"><button onClick={() => setRemoving(undefined)}>Giữ lại</button><button disabled={busy} onClick={() => void mutate(async () => { await deleteOrganizer(removing); reset(); })}>Xác nhận xoá danh mục</button></div></div>}
    </div>)}{!catalog.some(o => o.kind === kind) && <p className="muted">Tạo {kind === 'group' ? 'nhóm' : 'nhãn'} đầu tiên ở phía trên.</p>}</div>
  </div>;
}
