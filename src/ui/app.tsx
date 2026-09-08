import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { allData, settings, saveSettings, enqueue, acceptAnalysis, addManualUnit, findDuplicate, recordReview, reviseUnit } from '../data/repository';
import { db } from '../data/db';
import { exportData, importData, parseBackup, type Backup } from '../data/backup';
import { defaultSettings, normalize, type Capture, type Grade, type Settings, type Unit } from '../domain/models';
import { dueQueue, exercise, scheduler } from '../domain/scheduler';
import { sourceLink } from '../shared/source-link';
import { send } from '../shared/messages';
import { GeminiProvider, type AIProvider } from '../ai/provider';
import { dayKey, statistics } from './stats';
import { CaptureManagement, UnitManagement } from './library-management';
import { dictationText as originalDictationText } from '../shared/source-text';
import './style.css';
import './enrichment.css';
import { Insights } from './insights';
import { AdvancedSettings, BudgetNotice, OriginalAudio, TranscriptCheck, UnitTools } from './learning-tools';
import { backfillAssessments, saveAssessment } from '../data/enrichment';
import { gradeDictation, alignDictation } from '../learning/errors';
import { loadFrequency, learningPriority } from '../learning/frequency';
import { optimizeSchedule, generateWeekly, prepareTargeted } from '../learning/maintenance';
import { version as appVersion } from '../../package.json';

type Page = 'home' | 'review' | 'library' | 'difficult' | 'insights' | 'settings';
type Data = Awaited<ReturnType<typeof allData>>;
const empty: Data = { captures: [], units: [], reviews: [] };
const pageNames: Record<Page, string> = { home: 'Góc học hôm nay', review: 'Ôn tập', library: 'Thư viện ngữ cảnh', difficult: 'Cần chăm sóc', insights: 'Hồ sơ & lộ trình', settings: 'Cài đặt & dữ liệu' };
function currentPage(): Page { const hash = location.hash.slice(1); return hash in pageNames ? hash as Page : 'home'; }
const formatDate = (time: number) => new Date(time).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
    review: <><path d="M20 7A9 9 0 1 0 21 14M20 3v5h-5"/><path d="M12 7v5l3 2"/></>,
    library: <><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="9" y="4" width="5" height="16" rx="1"/><path d="m16 5 4-1 3 15-4 1Z"/></>,
    difficult: <><path d="M12 21s-8-5-8-12a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 7-8 12-8 12Z"/><path d="M8 12h8m-4-4v8"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
    sound: <><path d="m10 4-5 5H2v6h3l5 5ZM14 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    leaf: <><path d="M20 3C4 1 1 13 8 17c8 5 13-3 12-14ZM4 22 16 8"/></>,
    link: <><path d="M13 4h7v7m0-7L10 14M9 5H4v15h15v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.leaf}</svg>;
}
async function provider(): Promise<AIProvider> {
  const [key, config] = await Promise.all([chrome.storage.local.get('geminiKey'), settings()]);
  return new GeminiProvider(typeof key.geminiKey === 'string' ? key.geminiKey : '', config.model, config.strongModel);
}
function download(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function speak(text: string) {
  if (!('speechSynthesis' in window)) throw new Error('Trình duyệt chưa hỗ trợ đọc thành tiếng.');
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.9;
  const voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  utterance.voice = voices.find(v => v.localService) ?? voices[0] ?? null;
  speechSynthesis.speak(utterance);
}
function AudioButton({ text }: { text: string }) { return <button className="icon-button" title="Nghe tiếng Anh" aria-label="Nghe tiếng Anh" onClick={() => speak(text)}><Icon name="sound" size={17}/></button>; }
function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`tag ${tone}`}>{children}</span>; }

function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [data, setData] = useState<Data>(empty);
  const [config, setConfig] = useState(defaultSettings);
  const [ranks, setRanks] = useState(new Map<string, number>());
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { const [next, nextConfig] = await Promise.all([allData(), settings()]); setData(next); setConfig(nextConfig); setLoaded(true); }, []);
  useEffect(() => {
    void backfillAssessments().then(() => prepareTargeted()).catch(error => setMessage(error instanceof Error ? error.message : 'Chưa tổng hợp được lịch sử lỗi cũ.'));
    void loadFrequency().then(setRanks).catch(() => setMessage('Chưa đọc được bảng tần suất offline.'));
    void optimizeSchedule().catch(error => setMessage(error instanceof Error ? error.message : 'Chưa hiệu chỉnh được lịch ôn.'));
    void settings().then(c => { if (c.weeklyAutomatic) return generateWeekly(); }).catch(error => setMessage(error instanceof Error ? error.message : 'Chưa tổng hợp được tuần.'));
  }, []);
  useEffect(() => {
    const load = () => void refresh().catch(() => setMessage('Không đọc được cơ sở dữ liệu. Hãy tải lại trang; dữ liệu chưa bị thay đổi.'));
    load();
    const changed = () => setPage(currentPage());
    addEventListener('hashchange', changed); addEventListener('focus', load);
    const interval = window.setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => { removeEventListener('hashchange', changed); removeEventListener('focus', load); clearInterval(interval); };
  }, [refresh]);
  useEffect(() => { if (!message) return; const timeout = setTimeout(() => setMessage(''), 12000); return () => clearTimeout(timeout); }, [message]);
  async function run(action: () => Promise<unknown>, success = '') {
    setBusy(true);
    try { await action(); await refresh(); if (success) setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Thao tác chưa hoàn tất. Hãy thử lại.'); }
    finally { setBusy(false); }
  }
  const startedToday = data.reviews.filter(r => r.prior.reps === 0 && dayKey(r.at) === dayKey(Date.now())).length;
  const queue = dueQueue(data.units, Date.now(), Math.max(0, config.dailyNewLimit - startedToday), unit => learningPriority(unit, ranks, config.learnerLevel));
  const stats = statistics(data.units, data.reviews);
  const difficult = data.units.filter(u => u.leech || u.suspended);
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#home"><span className="brand-mark"><Icon name="leaf" size={25}/></span><span>Mạch Đọc<small>HỌC TỪ ĐIỀU BẠN ĐỌC</small></span></a>
      <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
      <nav aria-label="Điều hướng chính">{(Object.keys(pageNames) as Page[]).map(key => <a key={key} href={`#${key}`} className={page === key ? 'nav-item active' : 'nav-item'} aria-current={page === key ? 'page' : undefined}><Icon name={key}/><span>{pageNames[key]}</span>{key === 'review' && queue.length > 0 && <b>{queue.length}</b>}{key === 'difficult' && difficult.length > 0 && <b>{difficult.length}</b>}</a>)}</nav>
      <div className="sidebar-note"><span className="tiny-leaf"><Icon name="leaf"/></span><p>Mỗi lần đọc,<br/>thêm một chút hiểu.</p><small>Không cần học nhiều.<br/>Chỉ cần quay lại đúng lúc.</small></div>
      <div className="local-status"><span/> Dữ liệu lưu trên máy bạn</div>
    </aside>
    <main>
      <header className="topbar"><span>Nhật ký học tiếng Anh <span className="slash">/</span> <strong>{pageNames[page]}</strong></span><span className="today-date">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span></header>
      {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Đóng thông báo" onClick={() => setMessage('')}>×</button></div>}
      <BudgetNotice config={config}/>
      {!loaded ? <div className="loading">Đang mở góc học của bạn…</div> : <div className="page">
        {page === 'home' && <>
          <div className="page-heading"><div><div className="eyebrow">CHẬM MỘT CHÚT. NHỚ LÂU HƠN.</div><h1>Một chút tiếng Anh, mỗi ngày<span className="sage-dot">.</span></h1><p>Những điều bạn từng gặp khi đọc, đang chờ được hiểu sâu hơn.</p></div><div className="streak-chip"><span>✦</span> {stats.streak} ngày liên tiếp</div></div>
          <section className="hero">
            <div className="hero-copy"><span className="hero-kicker"><span/> KHOẢNG NHỎ CHO VIỆC HỌC</span><h2>{queue.length ? <>Gặp lại điều đã học.<br/>Trước khi bạn quên.</> : <>Đọc điều bạn thích.<br/>Giữ lại điều chưa hiểu.</>}</h2><p>{queue.length ? `Có ${queue.length} đơn vị học dành cho bạn lúc này. Thử tự viết câu trả lời trước khi xem gợi ý nhé.` : 'Bôi đen một câu tiếng Anh trên trang đang đọc và nhấn dấu +. Mạch Đọc sẽ giữ cả câu chuyện xung quanh nó.'}</p><a className="button primary" href={queue.length ? '#review' : '#library'}>{queue.length ? 'Bắt đầu ôn tập' : 'Mở thư viện của bạn'}<Icon name="arrow" size={18}/></a><span className="hero-foot">{queue.length ? 'Viết lại · Điền khuyết · Dùng trong ngữ cảnh mới' : 'Lưu nhanh bằng Alt + Shift + S'}</span></div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="spark spark-one">✧</span><span className="spark spark-two">✦</span><div className="paper paper-back"/><div className="paper paper-front"><div className="paper-number">TỪ TRANG ĐỌC ĐẾN TRÍ NHỚ</div><span className="quote-mark">“</span><div className="paper-quote">Little by little,<br/><em>a little</em><br/>becomes a lot.</div><div className="paper-line"/><span className="paper-label">Từng chút một, thành điều lớn lao.</span></div><div className="leaf-stamp"><Icon name="leaf" size={33}/></div></div>
          </section>
          <section className="metrics" aria-label="Thống kê của bạn"><Metric label="Đơn vị kiến thức" value={String(data.units.length)} note={`${data.captures.length} ngữ cảnh đã lưu`} icon="library"/><Metric label="Tỉ lệ nhớ thực tế" value={stats.retention === null ? '—' : `${Math.round(stats.retention * 100)}%`} note={`${stats.sample} lượt ôn đã trưởng thành · 30 ngày`} icon="review"/><Metric label="Đã ôn hôm nay" value={String(stats.today)} note={`Mục tiêu ghi nhớ ${Math.round(config.retention * 100)}%`} icon="leaf"/></section>
          <div className="dashboard-bottom"><section className="panel"><div className="section-heading"><h3>Nhịp học của bạn</h3><span className="muted">28 ngày gần đây</span></div><div className="activity-grid">{stats.days.map(day => <div key={day.key} className={`activity-cell level-${Math.min(3, Math.ceil(day.count / 3))}`} title={`${day.key}: ${day.count} lượt ôn`} aria-label={`${day.key}: ${day.count} lượt ôn`}/>)}</div><div className="activity-footer"><span>Đi đều quan trọng hơn đi nhanh.</span><span>Ít <i/><i/><i/> Nhiều</span></div></section><section className="panel"><div className="section-heading"><h3>Điều cần luyện thêm</h3><a href="#difficult">Xem tất cả ↗</a></div>{stats.groups.filter(g => g.count > 0).slice(0, 3).map(g => <div className="group-stat" key={g.group}><div><span>{g.group}</span><span>{Math.round((g.retention ?? 0) * 100)}% <small>· {g.count} lượt</small></span></div><div className="progress-track"><span style={{ width: `${(g.retention ?? 0) * 100}%` }}/></div></div>)}{!stats.groups.some(g => g.count > 0) && <div className="small-empty"><Icon name="leaf" size={25}/><p>Sau vài lần ôn, bạn sẽ thấy<br/>nhóm kiến thức cần chú ý ở đây.</p></div>}</section></div>
          <section className="recent"><div className="section-heading"><h3>Nhặt được từ những trang đọc</h3><a href="#library">Đến thư viện <span>↗</span></a></div>{data.captures.length ? data.captures.slice().sort((a, b) => b.source.capturedAt - a.source.capturedAt).slice(0, 3).map(c => <a href="#library" className="recent-row" key={c.id}><span className="quote-tile">“</span><div><p>{c.source.exact}</p><small>{new URL(c.source.url).hostname} <span>·</span> {formatDate(c.source.capturedAt)}</small></div><Icon name="arrow" size={18}/></a>) : <div className="capture-empty"><span className="quote-tile">“</span><div><strong>Thư viện bắt đầu từ một câu khiến bạn tò mò.</strong><p>Mở một bài viết tiếng Anh, chọn đoạn văn và lưu lại. Bạn chưa cần API key.</p></div><kbd>Alt ⇧ S</kbd></div>}</section>
        </>}
        {page === 'library' && <Library data={data} busy={busy} run={run}/>}
        {page === 'review' && <ReviewPanel key={loaded ? 'loaded' : 'loading'} queue={queue} captures={data.captures} config={config} refresh={refresh} notify={setMessage}/>}
        {page === 'difficult' && <><Heading title="Thêm một cách hiểu khác." subtitle="Sai nhiều lần là một tín hiệu để đổi cách học. Sau 5 lần quên, mục được tạm dừng để bạn xem lại."/><div className="card-list">{difficult.map(u => <section className="panel knowledge-card" key={u.id}><div className="section-heading"><Tag tone="amber">{u.failures} lần quên</Tag><Tag>{u.knowledge.group}</Tag></div><h2>{u.knowledge.name}</h2><p className="english">{u.knowledge.form}</p><p>{u.alternativeVi ?? u.knowledge.explanationVi}</p><UnitTools unit={u} busy={busy} run={run}/><div className="actions"><button disabled={busy} onClick={() => void run(async () => { const ai = await provider(); await reviseUnit(u.id, { alternativeVi: await ai.explain(u.knowledge) }); }, 'Đã lưu cách giải thích mới.')}>Nhờ AI giải thích cách khác</button><button className="primary" disabled={busy} onClick={() => void run(() => reviseUnit(u.id, { suspended: false }), 'Đã đưa mục trở lại lịch ôn.')}>Tôi đã hiểu hơn · Ôn lại</button></div></section>)}{!difficult.length && <Empty title="Chưa có mục cần chăm sóc riêng." text="Những cấu trúc thường xuyên làm bạn vấp sẽ xuất hiện ở đây."/>}</div></>}
        {page === 'insights' && <Insights units={data.units} reviews={data.reviews} config={config} busy={busy} run={run}/>}
        {page === 'settings' && <SettingsPanel config={config} busy={busy} run={run}/>}
        <footer>MẠCH ĐỌC {appVersion} <span>·</span> Từ điều bạn đọc, thành điều bạn biết.</footer>
      </div>}
    </main>
  </div>;
}
type Run = (action: () => Promise<unknown>, success?: string) => Promise<void>;
function Heading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="page-heading"><div><div className="eyebrow">GÓC HỌC CỦA BẠN</div><h1>{title}</h1><p>{subtitle}</p></div></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <section className="empty-state"><Icon name="leaf" size={38}/><h2>{title}</h2><p>{text}</p></section>; }
function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) { return <div className="metric"><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div><span className="metric-icon"><Icon name={icon}/></span></div>; }

function Library({ data, busy, run }: { data: Data; busy: boolean; run: Run }) {
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(30);
  const unitSearch = useMemo(() => {
    const index = new Map<string, string[]>();
    for (const unit of data.units) for (const id of unit.captureIds) {
      const texts = index.get(id) ?? []; texts.push(`${unit.knowledge.form} ${unit.knowledge.meaningVi}`); index.set(id, texts);
    }
    return index;
  }, [data.units]);
  const filtered = data.captures.filter(c => (!search || normalize(`${c.source.exact} ${c.note} ${c.analysis?.meaningVi ?? ''} ${(unitSearch.get(c.id) ?? []).join(' ')}`).includes(normalize(search))) && (filter === 'all' || (filter === 'pending' ? !c.unitsCreated : c.unitsCreated))).sort((a, b) => b.source.capturedAt - a.source.capturedAt);
  useEffect(() => { setSelected(prev => new Set([...prev].filter(id => data.captures.some(c => c.id === id && !c.unitsCreated)))); }, [data.captures]);
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <><Heading title="Những điều bạn muốn hiểu." subtitle={`${data.captures.length} đoạn đã lưu · ${data.units.length} đơn vị học độc lập. Câu gốc và ngữ cảnh luôn ở cùng nhau.`}/><div className="toolbar"><input className="search" aria-label="Tìm trong thư viện" placeholder="Tìm câu, ghi chú, nghĩa tiếng Việt…" value={search} onChange={e => { setSearch(e.target.value); setDisplayCount(30); }}/><select aria-label="Lọc thư viện" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tất cả ngữ cảnh</option><option value="pending">Chờ tạo bài học</option><option value="done">Đã tạo bài học</option></select><button disabled={busy || !selected.size} onClick={() => void run(async () => { await enqueue([...selected]); await send({ type: 'wake' }); setSelected(new Set()); }, 'Đã xếp hàng phân tích. Cần API key trong Cài đặt; mỗi phút xử lý thêm một đoạn.')}>Phân tích {selected.size ? `(${selected.size})` : 'đã chọn'}</button></div><p className="hint-line">Chọn AI sẽ gửi đoạn trích, ngữ cảnh và ghi chú tới Google. Hàng đợi xử lý tuần tự để tránh dồn request.</p><div className="card-list">{filtered.slice(0, displayCount).map(c => <CaptureCard key={c.id} capture={c} units={data.units} checked={selected.has(c.id)} toggle={() => toggle(c.id)} busy={busy} run={run}/>)}{filtered.length > displayCount && <button onClick={() => setDisplayCount(c => c + 30)}>Xem thêm 30 đoạn</button>}{!filtered.length && <Empty title="Chưa có đoạn nào ở đây." text="Bôi đen tiếng Anh trên một trang web, bấm dấu + hoặc Alt+Shift+S để lưu. Những gì bạn chưa hiểu là điểm bắt đầu tốt nhất."/>}</div></>;
}
function CaptureCard({ capture: c, units, checked, toggle, busy, run }: { capture: Capture; units: Unit[]; checked: boolean; toggle: () => void; busy: boolean; run: Run }) {
  const [separate, setSeparate] = useState<string[]>([]);

  const status = { saved: 'Đã lưu · Chưa phân tích', queued: 'Chờ AI', processing: 'AI đang phân tích', ready: 'Đã phân tích', error: 'Cần thử lại' }[c.status];
  return <article className="panel capture-card"><div className="section-heading"><div className="inline">{!c.unitsCreated && <input type="checkbox" aria-label={`Chọn đoạn ${c.source.exact.slice(0, 40)}`} checked={checked} onChange={toggle}/>}<Tag tone={c.unitsCreated ? 'green' : c.status === 'error' ? 'amber' : ''}>{c.unitsCreated ? 'Đã đưa vào lịch ôn' : status}</Tag><span className="muted">{formatDate(c.source.capturedAt)}</span></div><AudioButton text={c.source.exact}/></div><blockquote className="source-quote">{c.source.exact}</blockquote><CaptureManagement capture={c} units={units} busy={busy} run={run}/><OriginalAudio capture={c}/><TranscriptCheck capture={c} run={run} busy={busy}/><a className="source-link" href={sourceLink(c.source)} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14}/>{c.source.title || new URL(c.source.url).hostname}</a>{c.error && <p className="error-text">{c.error}{c.status === 'queued' && ` Thử lại sau ${new Date(c.nextAttemptAt).toLocaleTimeString('vi-VN')}.`}</p>}<details><summary>Ngữ cảnh & ghi chú cá nhân</summary><p className="context-text">{c.source.context}</p><p className="context-text">{c.note || 'Chưa có ghi chú.'}</p>{c.source.originalExact && <><strong>Câu gốc trước khi chỉnh sửa</strong><p className="english">{c.source.originalExact}</p></>}<p className="muted">Vị trí ghi nhận: {Math.round(c.source.scrollY)} px · {c.source.heading || 'Không có tiêu đề lân cận'}</p>{c.source.url !== c.source.frameUrl && <a href={c.source.url} target="_blank" rel="noopener noreferrer">Mở trang chứa iframe</a>}</details>{c.analysis && <><p className="meaning">{c.analysis.meaningVi}</p><p className="muted">{c.analysis.contextNoteVi}</p><details open={!c.unitsCreated}><summary>{c.analysis.knowledge.length} đơn vị kiến thức đề xuất</summary>{c.analysis.knowledge.map((k, i) => { const duplicate = findDuplicate(k, units); return <div className="knowledge-preview" key={`${k.key}:${i}`}><div className="inline"><Tag>{k.kind === 'grammar' ? 'Ngữ pháp' : 'Cụm từ'}</Tag><strong>{k.name}</strong></div><p className="formula">{k.form}</p><p>{k.meaningVi}</p><p>{k.explanationVi}</p><details><summary>Ví dụ mới & bài tập</summary>{k.examples.map((e, j) => <div className="example" key={j}><div><span className="english">{e.en}</span><AudioButton text={e.en}/></div><small>{e.vi}</small></div>)}<p>{k.production.instructionVi}</p><p className="english">{k.cloze.sentence.replace('[[blank]]', '________')}</p></details>{duplicate && !c.unitsCreated && <div className="duplicate-callout"><strong>Đã có: {duplicate.knowledge.name}</strong><p>Sẽ bổ sung ví dụ vào mục cũ, giữ tiến độ {duplicate.schedule.reps} lượt ôn.</p><label className="checkbox-label"><input type="checkbox" checked={separate.includes(k.key)} onChange={e => setSeparate(prev => e.target.checked ? [...prev, k.key] : prev.filter(x => x !== k.key))}/>Khác nghĩa / cấu trúc · Tạo riêng</label></div>}</div>; })}</details></>}{units.filter(u => u.captureIds.includes(c.id)).map(u => <div key={u.id}><strong>{u.knowledge.name}</strong><UnitManagement unit={u} busy={busy} run={run}/><UnitTools unit={u} busy={busy} run={run}/></div>)}{!c.unitsCreated && <div className="actions">{!c.analysis && <><button disabled={busy || ['processing', 'queued'].includes(c.status)} onClick={() => void run(async () => { await enqueue([c.id]); await send({ type: 'wake' }); }, 'Đã xếp hàng phân tích. Kiểm tra API key trong Cài đặt nếu chưa có.')}>Nhờ AI phân tích</button><button disabled={busy || !c.note.trim() || c.status === 'processing' || c.status === 'queued'} onClick={() => void run(() => addManualUnit(c.id), 'Đã tạo bài viết lại từ ghi chú của bạn.')}>Tạo bài từ ghi chú</button></>}{c.analysis && <button className="primary" disabled={busy || (!!c.analysis.transcript?.uncertain && !c.transcriptApproved)} onClick={() => void run(async () => { await acceptAnalysis(c.id, separate); await send({ type: 'wake' }); }, 'Đã tạo / ghép các đơn vị học và lên lịch ôn.')}>Duyệt & đưa vào lịch ôn</button>}</div>}</article>;
}

function ReviewPanel({ queue, captures, config, refresh, notify }: { queue: Unit[]; captures: Capture[]; config: Settings; refresh: () => Promise<void>; notify: (text: string) => void }) {
  const [session, setSession] = useState<Unit[]>(() => queue.slice(0, 30));
  const [completed, setCompleted] = useState(0);
  const [answer, setAnswer] = useState(''); const [revealed, setRevealed] = useState(false);
  const [assisted, setAssisted] = useState(false); const [grade, setGrade] = useState<Grade>();
  const [busy, setBusy] = useState(false); const [started, setStarted] = useState(Date.now());
  const [reviewId, setReviewId] = useState(() => crypto.randomUUID());
  const unit = session[0];
  const [dictationChoice, setDictation] = useState<boolean>();
  const dictation = dictationChoice ?? (!!unit && unit.schedule.reps % 4 === 3);
  const source = unit ? captures.find(c => unit.captureIds.includes(c.id)) : undefined;
  const dictationText = source ? originalDictationText(source) : unit?.knowledge.evidence ?? '';
  const task = unit ? dictation ? { mode: 'dictation' as const, prompt: 'Nghe câu, rồi viết lại bằng tiếng Anh. Chú ý các từ nhỏ và âm cuối.', answer: dictationText, hint: 'Nghe lại chậm hơn; tập trung vào mạo từ, trợ động từ và đuôi từ.' } : exercise(unit) : undefined;
  const reset = () => { setDictation(undefined); setAnswer(''); setRevealed(false); setAssisted(false); setGrade(undefined); setStarted(Date.now()); setReviewId(crypto.randomUUID()); };
  async function checkAI() {
    if (!unit || !task || !answer.trim()) return;
    setBusy(true);
    try {
      const result = dictation ? gradeDictation(task.answer, answer) : await (await provider()).grade(unit.knowledge, task.prompt, answer);
      await saveAssessment({ id: reviewId, unitId: unit.id, at: Date.now(), mode: task.mode, prompt: task.prompt, answer, grade: result, origin: dictation ? 'dictation' : 'ai' });
      setGrade(result); setRevealed(true);
    }
    catch (error) { notify(error instanceof Error ? error.message : 'Chưa chấm được. Bạn có thể tự đối chiếu đáp án.'); }
    finally { setBusy(false); }
  }
  async function rate(rating: 1 | 2 | 3 | 4) {
    if (!unit || !task) return;
    setBusy(true);
    try {
      await recordReview({ id: reviewId, unitId: unit.id, expectedReps: unit.schedule.reps, rating, mode: task.mode, answer, grade, durationMs: Date.now() - started, assisted, });
      setSession(prev => prev.slice(1)); setCompleted(n => n + 1); reset(); await refresh(); void send({ type: 'wake' }).catch(() => undefined);
    } catch (error) { notify(error instanceof Error ? error.message : 'Chưa lưu được lượt ôn.'); }
    finally { setBusy(false); }
  }
  const toolsRun = async (action: () => Promise<unknown>, success = '') => { setBusy(true); try { await action(); const fresh = unit ? await (await db).get('units', unit.id) : undefined; if (fresh) setSession(prev => fresh.suspended ? prev.filter(u => u.id !== fresh.id) : prev.map(u => u.id === fresh.id ? fresh : u)); await refresh(); if (success) notify(success); } catch (error) { notify(error instanceof Error ? error.message : 'Chưa hoàn tất thao tác.'); } finally { setBusy(false); } };
  return <><Heading title="Nhớ bằng cách tự viết." subtitle="Luân phiên cách luyện, giữ nguyên một kiến thức. Cứ thử trước, rồi mới đối chiếu."/>{!unit || !task ? <><Empty title={completed ? `Bạn đã dành thời gian cho ${completed} điều đã học.` : 'Bạn đã theo kịp lịch ôn.'} text="Những mục chưa đến hạn sẽ quay lại đúng lúc. Bạn có thể tiếp tục đọc và lưu thêm ngữ cảnh."/>{queue.length > 0 && <button onClick={() => { setSession(queue.slice(0, 30)); reset(); }}>Tải các mục đang đến hạn ({queue.length})</button>}<a className="button primary" href="#home">Về góc học</a></> : <div className="review-layout"><section className="panel review-card"><div className="section-heading"><Tag tone="green">{task.mode === 'dictation' ? 'Nghe chép chính tả' : task.mode === 'cloze' ? 'Điền khuyết câu gốc' : task.mode === 'transfer' ? 'Viết trong ngữ cảnh mới' : 'Tự viết tiếng Anh'}</Tag><span className="muted">Đã ôn {completed} · Còn {session.length}</span></div><div className="review-progress"><span style={{ width: `${completed / (completed + session.length) * 100}%` }}/></div><div className="actions left">{!revealed && <button disabled={busy || !!answer} onClick={() => setDictation(!dictation)}>{dictation ? 'Quay lại bài viết / điền khuyết' : 'Đổi sang nghe chép chính tả'}</button>}</div>{dictation && (source?.source.video ? <OriginalAudio capture={source} blind/> : <AudioButton text={dictationText}/>)}<span className="eyebrow">{unit.knowledge.group}</span><h2 className={task.mode === 'cloze' ? 'english prompt' : 'prompt'}>{task.prompt}</h2><label className="answer-label">Câu trả lời của bạn<textarea autoFocus key={unit.id} lang="en" spellCheck={false} value={answer} onChange={e => setAnswer(e.target.value)} disabled={revealed || busy} maxLength={8000} placeholder="Thử viết bằng tiếng Anh…"/></label>{!revealed && <><div className="actions"><button disabled={busy || assisted} onClick={() => { setAssisted(true); }}>Cần gợi ý</button>{!dictation && <button disabled={busy || !answer.trim()} onClick={() => setRevealed(true)}>Tự đối chiếu</button>}<button className="primary" disabled={busy || !answer.trim()} onClick={() => void checkAI()}>{busy ? 'Đang chấm…' : dictation ? 'So sánh lời gốc · Không dùng AI' : 'Nhờ AI chấm'}</button></div>{assisted && <p className="hint-box">{task.hint} · Lượt này được ghi nhận là cần gợi ý.</p>}<button className="text-button" disabled={busy} onClick={() => { setAssisted(true); setRevealed(true); }}>Chưa nhớ · Xem để học lại</button></>}{revealed && <div className="answer-feedback">{grade && <><Tag tone={grade.correct ? 'green' : 'amber'}>{grade.correct ? 'Dùng đúng kiến thức đích' : 'Còn điểm cần sửa'} · {grade.score}/100</Tag><p>{grade.feedbackVi}</p>{grade.errors.map((e, i) => <div className="error-detail" key={i}><span><del>{e.original}</del> → <strong>{e.correction}</strong></span><p>{e.reasonVi}</p>{e.l1NoteVi && <p className="hint-box">{e.l1NoteVi}</p>}</div>)}{dictation && <div className="dictation-diff" aria-label="Đối chiếu từng từ">{alignDictation(task.answer, answer).map((word, i) => <span key={i} className={`diff-${word.kind}`}>{word.kind === 'equal' ? word.expected : <><del>{word.actual || '∅'}</del> → <strong>{word.expected || '∅'}</strong></>}</span>)}</div>}<p className="english">{grade.correctedEn}</p></>}<div className="section-heading"><span className="eyebrow">MỘT ĐÁP ÁN THAM KHẢO</span><AudioButton text={task.answer}/></div><p className="english model-answer">{task.answer}</p>{task.mode === 'cloze' && <p>{normalize(answer) === normalize(task.answer) ? 'Khớp đáp án câu gốc.' : 'Khác đáp án câu gốc. Nếu bạn dùng cách diễn đạt tương đương, hãy tự đánh giá hoặc hỏi AI ở lượt tiếp theo.'}</p>}<p>{unit.alternativeVi ?? unit.knowledge.explanationVi}</p><p className="muted">{assisted ? 'Đã dùng gợi ý / xem đáp án trước khi trả lời: lịch ôn sẽ ghi nhận “Chưa nhớ”.' : 'AI chỉ tư vấn. Bạn quyết định mức nhớ; “Khó” nghĩa là vẫn tự nhớ đúng.'}</p><div className="rating-buttons">{([1, 2, 3, 4] as const).map((r, i) => { const due = scheduler.review(unit.schedule, assisted ? 1 : r, Date.now(), config.retention, config.fsrsWeights).due; const minutes = Math.round((due - Date.now()) / 60000); return <button disabled={busy || (assisted && r !== 1)} key={r} className={`rating rating-${r}`} onClick={() => void rate(r)}><strong>{['Chưa nhớ', 'Khó', 'Nhớ', 'Dễ'][i]}</strong><small>{minutes < 60 ? `${Math.max(1, minutes)} phút` : minutes < 1440 ? `${Math.round(minutes / 60)} giờ` : `${Math.round(minutes / 1440)} ngày`}</small></button>; })}</div><UnitTools unit={unit} busy={busy} run={toolsRun}/>{source && !dictation && <OriginalAudio capture={source}/>}</div>}</section><aside className="review-aside"><div className="panel"><Icon name="leaf" size={27}/><h3>Để trí nhớ làm việc.</h3><p>Cố nhớ một chút là một phần của việc học. Không cần một câu hoàn hảo, chỉ cần tự thử.</p><p className="muted">Mục tiêu ghi nhớ {Math.round(config.retention * 100)}% · FSRS</p></div>{revealed && source && <div className="panel"><span className="eyebrow">BẠN ĐÃ GẶP Ở ĐÂY</span><p className="english">{source.source.exact}</p><a href={sourceLink(source.source)} target="_blank" rel="noopener noreferrer">Quay lại ngữ cảnh gốc ↗</a></div>}<button className="text-button" disabled={busy} onClick={() => { setSession(prev => prev.slice(1)); reset(); }}>Bỏ qua lần này · Không đổi lịch</button></aside></div>}</>;
}

function SettingsPanel({ config, busy, run }: { config: Settings; busy: boolean; run: Run }) {
  const [draft, setDraft] = useState(config); const [key, setKey] = useState(''); const [hasKey, setHasKey] = useState(false);
  const [importPreview, setImportPreview] = useState<Backup>();
  const [snapshots, setSnapshots] = useState<{ id: string; at: number; json: string }[]>([]);
  const [lastDownload, setLastDownload] = useState(0);
  useEffect(() => { void chrome.storage.local.get('geminiKey').then(r => setHasKey(!!r.geminiKey)); void db.then(async d => { setSnapshots((await d.getAll('backups')).sort((a, b) => b.at - a.at)); setLastDownload(Number((await d.get('meta', 'lastBackupDownload'))?.value ?? 0)); }); }, [busy]);
  function set<K extends keyof Settings>(field: K, value: Settings[K]) { setDraft(prev => ({ ...prev, [field]: value })); }
  return <><Heading title="Theo nhịp của bạn." subtitle="Thiết lập một lần, rồi tập trung vào việc đọc. Bạn giữ quyền kiểm soát dữ liệu và AI."/><div className="settings-grid"><section className="panel"><div className="section-heading"><h2>Trợ giúp từ Gemini</h2><Tag tone={hasKey ? 'green' : 'amber'}>{hasKey ? 'Đã lưu khóa' : 'Chưa có khóa'}</Tag></div><label>API key của bạn<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={hasKey ? 'Để trống để giữ khóa hiện tại' : 'Dán API key từ Google AI Studio'}/></label><p className="muted">Khóa lưu trong hồ sơ Chrome trên máy này; không gửi cho trang web, không nằm trong file export. Ai truy cập được hồ sơ máy vẫn có thể đọc khóa. Không dùng chung khóa khi phát hành công khai.</p><label>Model Gemini<input value={draft.model} onChange={e => set('model', e.target.value)} placeholder="gemini-3.5-flash"/></label><p className="muted">Tên model có thể thay đổi. Xem model và quota trong <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Các tính năng AI cần mạng và có thể phát sinh phí theo tài khoản của bạn.</p><button className="text-button danger" disabled={busy || !hasKey} onClick={() => void run(async () => { await chrome.storage.local.remove('geminiKey'); setHasKey(false); }, 'Đã xóa API key trên máy.')}>Xóa khóa đã lưu</button></section><section className="panel"><h2>Nhịp ôn tập</h2><label>Mục tiêu ghi nhớ · {Math.round(draft.retention * 100)}%<input type="range" min="80" max="97" value={Math.round(draft.retention * 100)} onChange={e => set('retention', Number(e.target.value) / 100)}/></label><p className="muted">90% là điểm bắt đầu. Mục tiêu cao hơn thường cần ôn nhiều hơn. Thay đổi áp dụng từ lượt ôn tiếp theo.</p><label>Giới hạn kiến thức mới mỗi ngày<input type="number" min="1" max="50" value={draft.dailyNewLimit} onChange={e => set('dailyNewLimit', Number(e.target.value))}/></label><label className="checkbox-label"><input type="checkbox" checked={draft.highlighting} onChange={e => set('highlighting', e.target.checked)}/> Đánh dấu cụm từ đã lưu khi đọc</label><p className="muted">Thử nghiệm · Mặc định tắt. Đánh dấu nhẹ, hover xem nghĩa, ghi nhận tối đa một lần/cụm/trang/ngày. Đối chiếu trong cùng nút văn bản; có thể bật thêm dạng biến đổi phổ biến ở phần Cá nhân hóa. Tắt nếu trang đọc có độ trễ.</p></section><section className="panel"><h2>Dữ liệu thuộc về bạn</h2><p>Xuất đầy đủ ngữ cảnh, phân tích, đơn vị học, lịch FSRS, lịch sử trả lời và số lần gặp. File JSON đọc được, có phiên bản schema.</p><div className="actions left"><button disabled={busy} onClick={() => void run(async () => download(JSON.stringify(await exportData(), null, 2), `mach-doc-${dayKey(Date.now())}.json`), 'Đã tạo file export, không chứa API key.')}>Xuất toàn bộ JSON</button><label className="button file-button">Chọn file để nhập<input type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file) void run(async () => { if (file.size > 150 * 1024 * 1024) throw new Error('File vượt 150 MB.'); setImportPreview(parseBackup(await file.text())); }); e.target.value = ''; }}/></label></div>{importPreview && <div className="import-preview"><h3>Kiểm tra trước khi nhập</h3><p>{importPreview.captures.length} đoạn · {importPreview.units.length} đơn vị · {importPreview.reviews.length} lượt ôn</p><p>Ghép dữ liệu mới. Mục đã có cùng ID giữ nguyên cùng lịch sử của nó; bản sao cũ không ghi đè tiến độ. Tạo bản chụp an toàn trước khi nhập. Cài đặt hiện tại được giữ nếu đã thiết lập.</p><div className="actions"><button onClick={() => setImportPreview(undefined)}>Hủy</button><button className="primary" disabled={busy} onClick={() => void run(async () => { await importData(importPreview); setImportPreview(undefined); await send({ type: 'wake' }); }, 'Đã nhập dữ liệu thành công.')}>Xác nhận nhập dữ liệu</button></div></div>}</section><section className="panel"><h2>Sao lưu định kỳ</h2><label className="checkbox-label"><input type="checkbox" checked={draft.autoBackup} onChange={e => set('autoBackup', e.target.checked)}/>Tự sao lưu khi Chrome đang chạy</label><label>Chu kỳ (ngày)<input type="number" min="1" max="30" value={draft.backupDays} onChange={e => set('backupDays', Number(e.target.value))}/></label><p className="muted">Giữ 5 bản chụp trong extension và tải JSON vào Downloads/MachDoc. Kiểm tra file đã tải; chuyển một bản sang ổ đĩa hoặc nơi lưu riêng trước khi gỡ extension. Không sao lưu lúc Chrome đóng.</p><p className="muted">Lần tải hoàn tất gần nhất: {lastDownload ? new Date(lastDownload).toLocaleString('vi-VN') : 'Chưa có'}</p><button disabled={busy} onClick={() => void run(() => send({ type: 'backup-now' }), 'Đã tạo bản chụp và yêu cầu Chrome tải file sao lưu.')}>Sao lưu ngay</button>{snapshots.length > 0 && <details><summary>{snapshots.length} bản chụp trên máy</summary>{snapshots.map(s => <button className="snapshot-button" key={s.id} onClick={() => download(s.json, `mach-doc-snapshot-${s.at}.json`)}>{new Date(s.at).toLocaleString('vi-VN')} ↓</button>)}</details>}</section><AdvancedSettings draft={draft} set={set}/></div><div className="save-settings"><p>Phím tắt: <kbd>Alt ⇧ S</kbd> lưu nhanh · <kbd>Alt ⇧ R</kbd> ôn tập · <kbd>Alt ⇧ Y</kbd> lưu câu YouTube<br/><small>Đổi tổ hợp tại chrome://extensions/shortcuts. Tab mới mở góc học; xem README để dùng bản không thay tab mới.</small></p><button className="primary" disabled={busy} onClick={() => void run(async () => { await saveSettings(draft); if (key.trim()) { await chrome.storage.local.set({ geminiKey: key.trim() }); setKey(''); setHasKey(true); } await send({ type: 'settings-changed' }); await send({ type: 'wake' }); }, 'Đã lưu cài đặt.')}>Lưu cài đặt</button></div></>;
}

class ErrorBoundary extends React.Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="empty-state"><h1>Góc học chưa mở được.</h1><p>Dữ liệu chưa bị thay đổi. Thử tải lại trang; nếu còn lỗi, mở DevTools để kiểm tra.</p><button onClick={() => location.reload()}>Tải lại</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
