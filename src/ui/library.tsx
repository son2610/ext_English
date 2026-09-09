import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Capture, Unit } from '../domain/models';
import type { Organizer } from '../domain/organization';
import { enqueue } from '../data/repository';
import { organizers, organizeCaptures, type OrganizationPatch } from '../data/organization';
import { send } from '../shared/messages';
import { filterLibrary, indexLibrary, type LibraryFilters, type LibraryEntry } from './library-index';
import { colorStyle, OrganizerManager } from './organizer-manager';
import { Modal } from './modal';
import './library.css';

type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;
const defaults: LibraryFilters = { search: '', group: 'all', label: 'all', state: 'all', source: 'all', sort: 'newest' };
const PAGE_SIZE = 24;
const date = (at: number) => new Date(at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });

export function Library({ captures, units, busy, run, notice, renderDetail, onOverlayChange }: {
  captures: Capture[]; units: Unit[]; busy: boolean; run: Run; notice: string;
  renderDetail: (capture: Capture) => ReactNode;
  onOverlayChange: (open: boolean) => void;
}) {
  const [filters, setFilters] = useState<LibraryFilters>(defaults);
  const [page, setPage] = useState(1); const [view, setView] = useState('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<Organizer[]>([]);
  const [opened, setOpened] = useState<string>(); const [managing, setManaging] = useState(false);
  useEffect(() => { onOverlayChange(managing || !!opened); return () => onOverlayChange(false); }, [managing, opened, onOverlayChange]);
  const search = useDeferredValue(filters.search);
  const entries = useMemo(() => indexLibrary(captures, units, Date.now()), [captures, units]);
  const filtered = useMemo(() => filterLibrary(entries, { ...filters, search }), [entries, filters, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groups = catalog.filter(o => o.kind === 'group'), labels = catalog.filter(o => o.kind === 'label');
  const catalogById = useMemo(() => new Map(catalog.map(o => [o.id, o])), [catalog]);
  const counts = useMemo(() => {
    const groups = new Map<string, number>();
    for (const c of captures) { const id = c.organization?.groupId ?? 'inbox'; groups.set(id, (groups.get(id) ?? 0) + 1); }
    return { groups, due: entries.filter(e => e.due).length, pending: captures.filter(c => !c.unitsCreated).length, reviewed: entries.filter(e => e.reviewed).length };
  }, [captures, entries]);
  useEffect(() => { void organizers().then(setCatalog).catch(() => void run(async () => { throw new Error('Chưa đọc được nhóm và nhãn. Hãy tải lại thư viện.'); })); }, [captures]);
  useEffect(() => {
    const ids = new Set(captures.map(c => c.id));
    setSelected(prev => new Set([...prev].filter(id => ids.has(id))));
    if (opened && !ids.has(opened)) setOpened(undefined);
  }, [captures, opened]);
  useEffect(() => {
    // Another tab can remove a group while it is selected here.
    setFilters(f => ({ ...f,
      group: f.group === 'all' || f.group === 'inbox' || catalog.some(o => o.kind === 'group' && o.id === f.group) ? f.group : 'all',
      label: f.label === 'all' || catalog.some(o => o.kind === 'label' && o.id === f.label) ? f.label : 'all',
    }));
  }, [catalog]);
  const change = (patch: Partial<LibraryFilters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); setSelected(new Set()); };
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const mutate = (action: () => Promise<unknown>) => run(async () => { await action(); setCatalog(await organizers()); await send({ type: 'library-changed' }); });
  const organize = (ids: string[], patch: OrganizationPatch) => mutate(() => organizeCaptures(ids, patch));
  const active = captures.find(c => c.id === opened);
  const activeIndex = filtered.findIndex(e => e.capture.id === opened);
  const allVisibleSelected = visible.length > 0 && visible.every(e => selected.has(e.capture.id));
  const actionable = captures.filter(c => selected.has(c.id) && !c.unitsCreated && c.status !== 'processing' && c.status !== 'queued');

  return <section className="library-workspace">
    <div className="page-heading library-heading"><div><div className="eyebrow">TỪ TRANG ĐỌC ĐẾN TRÍ NHỚ</div><h1>Thư viện ngữ cảnh<span className="sage-dot">.</span></h1><p>Những câu đáng giữ, trong một góc học ngăn nắp.</p></div><button onClick={() => setManaging(true)}>＋ Nhóm & nhãn</button></div>
    <div className="library-overview" aria-label="Tổng quan thư viện">
      {[['all', 'Ngữ cảnh đã lưu', captures.length], ['pending', 'Chờ tạo bài học', counts.pending], ['due', 'Có bài đến hạn', counts.due], ['done', 'Đã có lượt ôn', counts.reviewed]].map(([state, label, value]) => <div key={state}><span>{label}</span><strong>{value}</strong></div>)}
      <a href="#review" className="library-review-link">Ôn tập hôm nay <span>↗</span></a>
    </div>
    <nav className="group-strip" aria-label="Nhóm ngữ cảnh">
      <button aria-pressed={filters.group === 'all'} onClick={() => change({ group: 'all' })}>Tất cả <b>{captures.length}</b></button>
      <button aria-pressed={filters.group === 'inbox'} onClick={() => change({ group: 'inbox' })}>Chưa phân nhóm <b>{counts.groups.get('inbox') ?? 0}</b></button>
      {groups.map(group => <button key={group.id} style={colorStyle(group.color)} className="group-tab" aria-pressed={filters.group === group.id} onClick={() => change({ group: group.id })}><i/>{group.name}<b>{counts.groups.get(group.id) ?? 0}</b></button>)}
    </nav>
    <div className="library-filters">
      <input className="library-search" type="search" aria-label="Tìm trong thư viện" placeholder="Tìm câu, nghĩa, ghi chú… có hoặc không dấu" value={filters.search} onChange={e => change({ search: e.target.value })}/>
      <select aria-label="Lọc thư viện" value={filters.state} onChange={e => change({ state: e.target.value })}><option value="all">Mọi trạng thái học</option><option value="pending">Chờ tạo bài học</option><option value="done">Đã tạo bài học</option><option value="due">Có bài đến hạn</option><option value="difficult">Cần chăm sóc</option><option value="error">AI cần thử lại</option></select>
      <select aria-label="Lọc theo nhãn" value={filters.label} onChange={e => change({ label: e.target.value })}><option value="all">Mọi nhãn</option>{labels.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select aria-label="Lọc nguồn" value={filters.source} onChange={e => change({ source: e.target.value })}><option value="all">Mọi nguồn</option><option value="youtube">YouTube</option><option value="web">Trang đọc</option></select>
    </div>
    <div className="library-results-toolbar">
      <label className="checkbox-label"><input type="checkbox" aria-label="Chọn tất cả trên trang" checked={allVisibleSelected} disabled={!visible.length} onChange={() => setSelected(prev => { const next = new Set(prev); for (const e of visible) { if (allVisibleSelected) next.delete(e.capture.id); else next.add(e.capture.id); } return next; })}/>Chọn trang này</label>
      <span className="result-count" role="status">{filtered.length.toLocaleString('vi-VN')} kết quả</span>
      <select aria-label="Sắp xếp thư viện" value={filters.sort} onChange={e => change({ sort: e.target.value })}><option value="newest">Mới lưu trước</option><option value="oldest">Lưu lâu nhất</option><option value="updated">Mới cập nhật</option><option value="due">Hạn ôn gần nhất</option></select>
      <div className="segment view-switch"><button aria-label="Dạng thẻ" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>▦</button><button aria-label="Dạng danh sách gọn" aria-pressed={view === 'list'} onClick={() => setView('list')}>☷</button></div>
    </div>
    {!!selected.size && <div className="bulk-bar" aria-label="Thao tác hàng loạt"><strong>{selected.size} câu đã chọn</strong>
      <select aria-label="Chuyển nhóm hàng loạt" value="" disabled={busy} onChange={e => { if (e.target.value) void organize([...selected], { groupId: e.target.value === 'inbox' ? null : e.target.value }); }}><option value="">Chuyển vào nhóm…</option><option value="inbox">Chưa phân nhóm</option>{groups.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select>
      <select aria-label="Thêm nhãn hàng loạt" value="" disabled={busy} onChange={e => { if (e.target.value) void organize([...selected], { addLabel: e.target.value }); }}><option value="">Gắn nhãn…</option>{labels.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select>
      <select aria-label="Gỡ nhãn hàng loạt" value="" disabled={busy} onChange={e => { if (e.target.value) void organize([...selected], { removeLabel: e.target.value }); }}><option value="">Gỡ nhãn…</option>{labels.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select>
      <button disabled={busy || !actionable.length} onClick={() => void run(async () => { await enqueue(actionable.map(c => c.id)); await send({ type: 'wake' }); setSelected(new Set()); }, 'Đã xếp hàng phân tích. AI sẽ nhận đoạn trích, ngữ cảnh và ghi chú qua Google Gemini.')}>Phân tích ({actionable.length})</button>
      <button aria-label="Bỏ chọn tất cả" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
      <small>Phân tích AI gửi câu, ngữ cảnh và ghi chú đã chọn tới Google. Hàng đợi xử lý tuần tự.</small>
    </div>}
    {!filtered.length ? <div className="library-empty"><span>“</span><h2>{captures.length ? 'Chưa có câu khớp bộ lọc.' : 'Bắt đầu từ một câu khiến bạn tò mò.'}</h2><p>{captures.length ? 'Thử từ khoá ngắn hơn hoặc mở rộng nhóm và nhãn.' : 'Bôi đen tiếng Anh trên trang đang đọc, rồi nhấn Alt + Shift + S để lưu.'}</p>{captures.length > 0 && <button onClick={() => change(defaults)}>Xoá bộ lọc</button>}</div>
      : <div className={`capture-grid ${view === 'list' ? 'compact-list' : ''}`} aria-label="Các ngữ cảnh đã lưu" aria-busy={search !== filters.search}>{visible.map(entry => <CaptureTile key={entry.capture.id} entry={entry} catalog={catalogById} checked={selected.has(entry.capture.id)} toggle={() => toggle(entry.capture.id)} open={() => setOpened(entry.capture.id)}/>)}</div>}
    {filtered.length > 0 && <nav className="library-pagination" aria-label="Phân trang thư viện"><span>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} / {filtered.length} câu · {PAGE_SIZE} câu mỗi trang</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Trước</button><label>Trang <input type="number" aria-label="Đi đến trang" min={1} max={pages} value={currentPage} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) setPage(Math.max(1, Math.min(pages, Math.trunc(n)))); }}/><span>/ {pages}</span></label><button disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sau →</button></nav>}
    {managing && <Modal title="Quản lý nhóm & nhãn" close={() => setManaging(false)}>{notice && <p className="modal-notice" role="status">{notice}</p>}<OrganizerManager catalog={catalog} mutate={mutate} busy={busy}/></Modal>}
    {active && <Modal title="Chi tiết ngữ cảnh" wide close={() => setOpened(undefined)}>{notice && <p className="modal-notice" role="status">{notice}</p>}
      <div className="detail-nav"><span>{activeIndex >= 0 ? `${activeIndex + 1} / ${filtered.length} ngữ cảnh` : 'Ngữ cảnh đã chọn'}</span><button disabled={activeIndex <= 0} onClick={() => setOpened(filtered[activeIndex - 1]?.capture.id)}>← Câu trước</button><button disabled={activeIndex < 0 || activeIndex >= filtered.length - 1} onClick={() => setOpened(filtered[activeIndex + 1]?.capture.id)}>Câu sau →</button></div>
      <div key={active.id}><CaptureOrganization capture={active} catalog={catalog} busy={busy} organize={patch => organize([active.id], patch)}/>{renderDetail(active)}</div>
    </Modal>}
  </section>;
}

function CaptureTile({ entry: { capture: c, units, due, difficult, reviewed }, catalog, checked, toggle, open }: {
  entry: LibraryEntry; catalog: Map<string, Organizer>; checked: boolean; toggle: () => void; open: () => void;
}) {
  const group = c.organization?.groupId ? catalog.get(c.organization.groupId) : undefined;
  const labels = (c.organization?.labelIds ?? []).flatMap(id => { const label = catalog.get(id); return label ? [label] : []; });
  const status = c.status === 'processing' ? 'AI đang phân tích' : c.status === 'queued' ? 'Đang chờ AI' : c.status === 'error' ? 'AI cần thử lại' : !c.unitsCreated ? c.analysis ? 'Chờ duyệt bài học' : 'Chưa tạo bài học' : due ? `${due} bài đến hạn` : difficult ? 'Cần chăm sóc' : 'Đang trong lịch ôn';
  return <article className={`capture-tile ${checked ? 'selected' : ''}`} style={group ? colorStyle(group.color) : undefined}>
    <div className="tile-top"><input type="checkbox" checked={checked} aria-label={`Chọn đoạn ${c.source.exact.slice(0, 40)}`} onChange={toggle}/><span className="tile-group" title={group?.name}>{group?.name ?? 'Chưa phân nhóm'}</span><span className="tile-source">{c.source.video ? 'YouTube' : 'Trang đọc'}</span></div>
    <button className="tile-open" onClick={open} aria-label={`Xem ngữ cảnh: ${c.source.exact.slice(0, 100)}`}>
      <span className="tile-quote" lang="en">{c.source.exact}</span><span className={`tile-meaning ${!c.analysis?.meaningVi && !c.note ? 'placeholder' : ''}`}>{c.analysis?.meaningVi || c.note || 'Một câu mới, đang chờ bạn khám phá.'}</span>
      <span className="tile-labels">{labels.slice(0, 2).map(l => <span key={l.id} className="color-chip" style={colorStyle(l.color)}><i/>{l.name}</span>)}{labels.length > 2 && <span className="label-more" title={labels.slice(2).map(l => l.name).join(', ')}>+{labels.length - 2}</span>}</span>
      <span className="tile-progress"><span className={`study-status ${due ? 'due' : c.status === 'error' || difficult ? 'attention' : ''}`}>● {status}</span><span>{units.length ? `${reviewed}/${units.length} đã ôn` : 'Mở chi tiết ↗'}</span></span>
      <span className="tile-origin"><span title={c.source.title}>{c.source.title || new URL(c.source.url).hostname}</span><time dateTime={new Date(c.source.capturedAt).toISOString()}>{date(c.source.capturedAt)}</time></span>
    </button>
  </article>;
}

function CaptureOrganization({ capture, catalog, busy, organize }: { capture: Capture; catalog: Organizer[]; busy: boolean; organize: (patch: OrganizationPatch) => Promise<void> }) {
  const currentLabels = new Set(capture.organization?.labelIds ?? []);
  return <section className="capture-organization" aria-label="Sắp xếp ngữ cảnh">
    <label>Nhóm<select aria-label="Nhóm của câu" disabled={busy} value={capture.organization?.groupId ?? 'inbox'} onChange={e => void organize({ groupId: e.target.value === 'inbox' ? null : e.target.value })}><option value="inbox">Chưa phân nhóm</option>{catalog.filter(o => o.kind === 'group').map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label>Thêm nhãn<select aria-label="Thêm nhãn cho câu" disabled={busy} value="" onChange={e => { if (e.target.value) void organize({ addLabel: e.target.value }); }}><option value="">Chọn nhãn…</option>{catalog.filter(o => o.kind === 'label' && !currentLabels.has(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <div className="assigned-labels">{catalog.filter(o => currentLabels.has(o.id)).map(o => <button key={o.id} disabled={busy} className="color-chip" style={colorStyle(o.color)} aria-label={`Gỡ nhãn ${o.name}`} onClick={() => void organize({ removeLabel: o.id })}>{o.name} ×</button>)}</div>
    {!catalog.length && <small>Tạo nhóm và nhãn bằng nút “＋ Nhóm & nhãn” trong thư viện.</small>}
  </section>;
}
