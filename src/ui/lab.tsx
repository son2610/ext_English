import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildLabCards, checkLabAnswer, defaultLabPreferences, filterLabCards, GAME_TEXT_LIMITS, gameReady, LabPreferencesSchema, sampleLabCards, type LabCard, type LabMode, type LabPreferences } from '../domain/lab';
import { labPlaybackTimeline, labTimeline } from '../domain/lab-timeline';
import { matchPairs, type ChoiceDirection } from '../domain/lab-games';
import { ChoiceStage, formatSeconds, MatchStage } from './lab-games';
import { type Capture, type Settings, type Unit } from '../domain/models';
import type { Organizer } from '../domain/organization';
import { organizers } from '../data/organization';
import { saveLabPreferences } from '../data/repository';
import './lab.css';

const modes: { id: LabMode; name: string; number: string; icon: string; description: string; note: string }[] = [
  { id: 'stream', name: 'Lướt nhanh', number: '01', icon: 'ϟ', description: 'Tiếng Anh ở trên, nghĩa ở dưới. Một nhịp ngắn để gặp lại những điều quen thuộc.', note: 'Tập trung vào một mục' },
  { id: 'bubbles', name: 'Bong bóng', number: '02', icon: '▦', description: 'Một bảng màu sống động. Thẻ hiện ra, lật nghĩa rồi biến mất theo những nhịp riêng.', note: 'Nhìn, đoán, lật, gặp lại' },
  { id: 'cloze', name: 'Điền khuyết', number: '03', icon: '⌨', description: 'Một khoảng trống trong câu thật. Tự gõ phần còn thiếu trước khi xem đáp án.', note: 'Thử sức bằng cách tự viết' },
  { id: 'match', name: 'Ghép cặp', number: '04', icon: '⇄', description: 'Nối tiếng Anh với nghĩa tiếng Việt nhanh nhất có thể. Đồng hồ chạy, ghép nhầm được ghi lại.', note: 'Đua với chính mình' },
  { id: 'choice', name: 'Trắc nghiệm', number: '05', icon: '◉', description: 'Chọn đáp án đúng trong bốn lựa chọn. Đáp án nhiễu lấy từ chính thư viện của bạn.', note: 'Phân biệt điều dễ nhầm' },
];
const timedMode = (mode: LabMode) => mode === 'stream' || mode === 'bubbles';
const directionNames: Record<LabPreferences['direction'], string> = { 'en-vi': 'Anh → chọn nghĩa Việt', 'vi-en': 'Việt → chọn tiếng Anh', mixed: 'Trộn hai chiều' };
const kindNames = { capture: 'Câu đã lưu', phrase: 'Từ & cụm từ', grammar: 'Cấu trúc' };
const durationText = (ms: number) => { const total = Math.ceil(ms / 1000); return total < 60 ? `${total} giây` : `${Math.floor(total / 60)} phút ${total % 60 ? `${total % 60} giây` : ''}`; };

export function Lab({ captures, units, config, onActiveChange }: { captures: Capture[]; units: Unit[]; config: Settings; onActiveChange: (active: boolean) => void }) {
  const [preferences, setPreferences] = useState<LabPreferences>(() => config.lab ?? defaultLabPreferences);
  const [catalog, setCatalog] = useState<Organizer[]>([]);
  const [session, setSession] = useState<{ cards: LabCard[]; preferences: LabPreferences; id: number }>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const cards = useMemo(() => buildLabCards(captures, units), [captures, units]);
  const eligible = useMemo(() => filterLabCards(cards, preferences), [cards, preferences]);
  const count = preferences.count === 0 ? eligible.length : Math.min(preferences.count, eligible.length);
  const currentMode = modes.find(mode => mode.id === preferences.mode)!;
  // A pairing board needs two pairs; a multiple-choice question needs a second library item as a distractor.
  const minimum = preferences.mode === 'match' ? 2 : 1;
  const canStart = count >= minimum && (preferences.mode !== 'choice' || cards.filter(gameReady).length >= 2);
  useEffect(() => { let active = true; void organizers().then(value => { if (active) setCatalog(value); }).catch(() => { if (active) setError('Chưa tải được nhóm và nhãn. Hãy mở lại Phòng Lab.'); }); return () => { active = false; }; }, []);
  useEffect(() => { onActiveChange(!!session); return () => onActiveChange(false); }, [session, onActiveChange]);
  function change<K extends keyof LabPreferences>(key: K, value: LabPreferences[K]) { setPreferences(p => ({ ...p, [key]: value })); setError(''); }
  function selectMode(mode: LabMode) { setPreferences(p => ({ ...p, mode, source: mode === 'cloze' && p.source === 'captures' ? 'all' : p.source })); }
  async function start() {
    const parsed = LabPreferencesSchema.safeParse(preferences);
    if (!parsed.success) { setError('Chọn từ 0 đến 5.000 mục và thời gian từ 0,6 đến 10 giây.'); return; }
    if (!canStart) return;
    setBusy(true); setError('');
    try {
      await saveLabPreferences(parsed.data);
      const deck = sampleLabCards(eligible, parsed.data.count, parsed.data.order);
      setSession({ cards: deck, preferences: parsed.data, id: Date.now() });
    } catch { setError('Chưa lưu được thiết lập Lab. Dữ liệu học vẫn được giữ; hãy thử lại.'); }
    finally { setBusy(false); }
  }
  if (session) return <LabSession key={session.id} cards={session.cards} pool={cards} preferences={session.preferences} onExit={() => setSession(undefined)} onReplay={deck => setSession(s => s ? { ...s, cards: deck, id: Math.max(Date.now(), s.id + 1) } : s)}/>;
  return <div className="lab-workspace">
    <header className="lab-heading"><div><span className="eyebrow">MỘT CHÚT TÒ MÒ. MỘT CÁCH HỌC MỚI.</span><h1>Phòng Lab<span>.</span></h1><p>Biến thư viện của bạn thành những lượt luyện nhỏ, nhiều màu sắc.</p></div><span className="lab-local-badge"><i/> Luyện trên máy · Không cần AI</span></header>
    <section className="lab-intro"><div><span className="lab-small-label">THỬ MỘT NHỊP KHÁC</span><h2>Cùng một kiến thức.<br/>Một cách gặp lại mới.</h2><p>Lướt nhanh để làm quen, nhìn thẻ để đoán nghĩa, ghép cặp và trắc nghiệm để phân biệt điều dễ nhầm, tự viết để gọi lại điều đã học. Chọn cách bạn muốn thử hôm nay.</p><span className="lab-intro-count"><strong>{cards.length.toLocaleString('vi-VN')}</strong> mục có nội dung để luyện</span></div><div className="lab-mini-board" aria-hidden="true"><span>figure out<small>hiểu ra</small></span><span>as long as<small>miễn là</small></span><span>little by little<small>từng chút một</small></span><span>get used to<small>dần quen với</small></span><small>Minh họa</small></div></section>
    <div className="lab-section-title"><h2>01 <span>Chọn một cách luyện</span></h2><p>Năm trải nghiệm, cùng thư viện của bạn.</p></div>
    <div className="lab-mode-grid" role="group" aria-label="Chế độ Phòng Lab">{modes.map(mode => <button key={mode.id} className={`lab-mode-card mode-${mode.id} ${preferences.mode === mode.id ? 'selected' : ''}`} aria-label={mode.name} aria-pressed={preferences.mode === mode.id} onClick={() => selectMode(mode.id)}><span className="lab-mode-top"><span className="lab-mode-icon" aria-hidden="true">{mode.icon}</span><span>{mode.number}</span></span><strong>{mode.name}</strong><span className="lab-mode-description">{mode.description}</span><span className="lab-mode-note">{mode.note}<span aria-hidden="true">↗</span></span></button>)}</div>
    <section className="lab-setup panel"><div className="lab-section-title"><h2>02 <span>Chỉnh theo nhịp của bạn</span></h2><span className="lab-match-count">{eligible.length.toLocaleString('vi-VN')} mục phù hợp</span></div>
      <div className="lab-form-grid"><label>Nguồn nội dung<select value={preferences.source} onChange={e => change('source', e.target.value as LabPreferences['source'])}><option value="all">Tất cả nội dung</option>{preferences.mode !== 'cloze' && <option value="captures">Câu đã lưu</option>}<option value="phrases">Từ & cụm từ</option><option value="grammar">Cấu trúc ngữ pháp</option></select></label><label>Tiến độ<select value={preferences.scope} onChange={e => change('scope', e.target.value as LabPreferences['scope'])}><option value="all">Tất cả tiến độ</option><option value="due">Đến hạn ôn</option><option value="difficult">Cần luyện thêm</option></select></label>
      <label>Nhóm<select value={preferences.groupId} onChange={e => change('groupId', e.target.value)}><option value="">Mọi nhóm</option>{preferences.groupId && !catalog.some(c => c.id === preferences.groupId) && <option value={preferences.groupId}>Nhóm không còn tồn tại</option>}{catalog.filter(c => c.kind === 'group').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Nhãn<select value={preferences.labelId} onChange={e => change('labelId', e.target.value)}><option value="">Mọi nhãn</option>{preferences.labelId && !catalog.some(c => c.id === preferences.labelId) && <option value={preferences.labelId}>Nhãn không còn tồn tại</option>}{catalog.filter(c => c.kind === 'label').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Số mục mỗi lượt<input aria-label="Số mục mỗi lượt" type="number" min={0} max={5000} step={1} value={preferences.count} onChange={e => change('count', Number(e.target.value))}/><small>Nhập 0 để đi qua tất cả mục phù hợp.</small></label>
      {timedMode(preferences.mode) && <label>{preferences.mode === 'bubbles' ? 'Giây mỗi mặt' : 'Giây mỗi mục'}<input aria-label={preferences.mode === 'bubbles' ? 'Giây mỗi mặt' : 'Giây mỗi mục'} type="number" min={0.6} max={10} step={0.1} value={preferences.seconds} onChange={e => change('seconds', Number(e.target.value))}/><small>0,6–10 giây. Câu dài nên dùng nhịp chậm hơn.</small></label>}
      {preferences.mode === 'bubbles' && <label>Cỡ bảng<select value={preferences.columns} onChange={e => change('columns', Number(e.target.value) as 2 | 3 | 4)}><option value={2}>2 × 2 · Dễ theo dõi</option><option value={3}>3 × 3 · Nhiều màu sắc</option><option value={4}>4 × 4 · Thử thách tập trung</option></select></label>}
      {preferences.mode === 'match' && <label>Số cặp mỗi bảng<select value={preferences.columns} onChange={e => change('columns', Number(e.target.value) as 2 | 3 | 4)}><option value={2}>4 cặp · Khởi động</option><option value={3}>6 cặp · Vừa sức</option><option value={4}>8 cặp · Thử thách</option></select></label>}
      {preferences.mode === 'choice' && <label>Chiều hỏi<select value={preferences.direction} onChange={e => change('direction', e.target.value as LabPreferences['direction'])}>{(Object.keys(directionNames) as LabPreferences['direction'][]).map(d => <option key={d} value={d}>{directionNames[d]}</option>)}</select></label>}
      <label>Thứ tự<select value={preferences.order} onChange={e => change('order', e.target.value as LabPreferences['order'])}><option value="random">Trộn ngẫu nhiên</option><option value="newest">Mới lưu trước</option></select></label></div>
      {preferences.mode === 'stream' && <label className="checkbox-label lab-recall-option"><input aria-label="Ẩn nghĩa để tự đoán" type="checkbox" checked={preferences.hideMeaning} onChange={e => change('hideMeaning', e.target.checked)}/>Ẩn nghĩa để tự đoán<small>Nghĩa hiện trong nửa sau thời gian của mỗi mục.</small></label>}
      {timedMode(preferences.mode) && <label className="checkbox-label lab-recall-option"><input aria-label="Lặp lại liên tục" type="checkbox" checked={preferences.repeat} onChange={e => change('repeat', e.target.checked)}/>Lặp lại liên tục<small>Hết bộ từ sẽ chạy lại. Bấm nút ■ Dừng để kết thúc.</small></label>}
      <div className="lab-launch"><div><strong>{currentMode.name} · {count.toLocaleString('vi-VN')} mục{preferences.repeat && timedMode(preferences.mode) ? ' / vòng · ∞' : ''}</strong><p>{preferences.mode === 'cloze' ? 'Tự gõ, đối chiếu đáp án rồi chuyển câu. Không giới hạn thời gian.' : preferences.mode === 'match' ? `Ghép theo từng bảng ${matchPairs(preferences.columns)} cặp. Đồng hồ tính tổng thời gian; ghép nhầm được đánh dấu để luyện lại.` : preferences.mode === 'choice' ? `${directionNames[preferences.direction]}. Mỗi câu tối đa 4 đáp án, đáp án nhiễu lấy từ thư viện. Không giới hạn thời gian.` : `Khoảng ${durationText(labTimeline(preferences.mode, 0, count, preferences.seconds, preferences.columns ** 2).durationMs)}${preferences.repeat ? ' mỗi vòng · Tự lặp cho đến khi bạn bấm Dừng.' : ' · Mỗi mục xuất hiện một lần trong lượt.'}`}</p></div><button className="primary lab-start" disabled={busy || !canStart} onClick={() => void start()}>Bắt đầu lượt luyện <span aria-hidden="true">→</span></button></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!canStart && <div className="lab-empty" role="status"><strong>Chưa có mục phù hợp để bắt đầu.</strong><p>{cards.length ? `Thử chọn tất cả nguồn, nhóm, nhãn hoặc tiến độ. Điền khuyết cần bài học đã có câu và đáp án hợp lệ. Ghép cặp và Trắc nghiệm dùng mục ngắn (tối đa ${GAME_TEXT_LIMITS.english} ký tự tiếng Anh, ${GAME_TEXT_LIMITS.meaning} ký tự nghĩa) và cần ít nhất 2 mục.` : 'Thêm nghĩa hoặc ghi chú cho câu đã lưu, hoặc duyệt phân tích để tạo bài học. Lab chỉ dùng nội dung bạn đã có.'}</p><a href="#library">Mở thư viện ngữ cảnh ↗</a></div>}
    </section>
    <p className="lab-footnote">Lab là khoảng luyện thêm. Lướt hoặc xem nghĩa không tự ghi là đã nhớ và không đổi lịch FSRS. <a href="#review">Ôn đúng hạn →</a></p>
  </div>;
}

function useLabClock(tickMs: number) {
  const timer = useRef({ accumulated: 0, started: performance.now(), running: true });
  const [elapsed, setElapsed] = useState(0); const [paused, setPaused] = useState(false); const [reason, setReason] = useState('');
  const pause = useCallback((message = '') => {
    const clock = timer.current;
    if (clock.running) { clock.accumulated += performance.now() - clock.started; clock.running = false; setElapsed(clock.accumulated); }
    setPaused(true); setReason(message);
  }, []);
  const resume = useCallback(() => {
    if (document.hidden || timer.current.running) return;
    timer.current.started = performance.now(); timer.current.running = true; setPaused(false); setReason('');
  }, []);
  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => { const clock = timer.current; if (clock.running) setElapsed(clock.accumulated + performance.now() - clock.started); }, tickMs);
    return () => clearInterval(interval);
  }, [paused, tickMs]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) pause('Đã tạm dừng vì bạn chuyển sang tab khác. Bấm Tiếp tục khi sẵn sàng.'); };
    document.addEventListener('visibilitychange', hidden); hidden();
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [pause]);
  return { elapsed, paused, pause, resume, reason };
}

function LabSession({ cards, pool, preferences, onExit, onReplay }: { cards: LabCard[]; pool: LabCard[]; preferences: LabPreferences; onExit: () => void; onReplay: (cards: LabCard[]) => void }) {
  const root = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const ownsSpeech = useRef(false); const detail = useRef<HTMLElement>(null); const nextButton = useRef<HTMLButtonElement>(null);
  const clock = useLabClock(preferences.mode === 'match' ? 100 : timedMode(preferences.mode) ? 50 : 1000); const [ended, setEnded] = useState(false); const [focus, setFocus] = useState<LabCard>();
  const [fullscreen, setFullscreen] = useState(false); const [notice, setNotice] = useState('');
  const [index, setIndex] = useState(0); const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<boolean>(); const [attempts, setAttempts] = useState<{ card: LabCard; correct: boolean }[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set()); const [mistakes, setMistakes] = useState(0);
  // Fixed per question for the whole session, so a re-render never flips a question already on screen.
  const [directions] = useState<ChoiceDirection[]>(() => cards.map(() => preferences.direction === 'mixed' ? (Math.random() < 0.5 ? 'en-vi' : 'vi-en') : preferences.direction));
  const [positions] = useState(() => {
    const values = Array.from({ length: preferences.columns ** 2 }, (_, i) => i);
    for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [values[i], values[j]] = [values[j]!, values[i]!]; }
    return values;
  });
  const timed = timedMode(preferences.mode);
  const repeat = timed && preferences.repeat;
  const frame = labPlaybackTimeline(preferences.mode === 'bubbles' ? 'bubbles' : 'stream', clock.elapsed, cards.length, preferences.seconds, preferences.columns ** 2, repeat);
  const done = ended || (timed ? frame.done : preferences.mode === 'match' ? attempts.length >= cards.length : index >= cards.length);
  const completed = timed ? frame.totalCompleted : attempts.length;
  const active = cards[timed ? frame.items[0]?.index ?? 0 : index];
  const revealMeaning = !preferences.hideMeaning || clock.elapsed % (preferences.seconds * 1000) >= preferences.seconds * 500;
  const pause = clock.pause; const resume = clock.resume;
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => { if (done) pause(); }, [done, pause]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (done || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'Escape') { pause(); return; }
      if ((event.target as Element | null)?.closest('input,textarea,select,button,a,[contenteditable="true"]')) return;
      if (event.code === 'Space') { event.preventDefault(); if (clock.paused) { setFocus(undefined); resume(); } else pause(); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [clock.paused, done, pause, resume]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); if (ownsSpeech.current && 'speechSynthesis' in window) speechSynthesis.cancel(); };
  }, []);
  useEffect(() => { if (!timed && !clock.paused && !done) input.current?.focus(); }, [index, timed, clock.paused, done]);
  useEffect(() => { if (focus) detail.current?.focus(); }, [focus]);
  useEffect(() => { if (result !== undefined) nextButton.current?.focus(); }, [result]);
  async function toggleFullscreen() {
    try { if (document.fullscreenElement === root.current) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { setNotice('Trình duyệt chưa cho mở toàn màn hình. Bạn vẫn có thể luyện tại đây.'); }
  }
  function speak(card: LabCard) { pause(); speakText(card.english); }
  function speakText(text: string) {
    if (!('speechSynthesis' in window)) { setNotice('Trình duyệt chưa hỗ trợ đọc thành tiếng.'); return; }
    speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(text); speech.lang = 'en-US'; speech.rate = 0.9;
    const voices = speechSynthesis.getVoices().filter(v => /^en\b/i.test(v.lang)); speech.voice = voices.find(v => v.localService) ?? voices[0] ?? null;
    ownsSpeech.current = true; speechSynthesis.speak(speech);
  }
  function mark(card: LabCard) { setMarked(current => { const next = new Set(current); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next; }); }
  function check() {
    if (result !== undefined || !active?.cloze || !answer.trim()) return;
    const correct = checkLabAnswer(answer, active.cloze.answer); setResult(correct); setAttempts(old => [...old, { card: active, correct }]);
    if (!correct) setMarked(old => new Set([...old, active.id]));
  }
  function next() { if (result === undefined) return; setIndex(i => i + 1); setAnswer(''); setResult(undefined); }
  const missed = useMemo(() => cards.filter(card => marked.has(card.id)), [cards, marked]);
  return <div className={`lab-session ${clock.paused ? 'is-paused' : ''}`} data-mode={preferences.mode} ref={root} tabIndex={-1}>
    <div className="lab-session-top"><div><span className="eyebrow">PHÒNG LAB / {modes.find(m => m.id === preferences.mode)!.name.toLocaleUpperCase('vi-VN')}</span><h1>{done ? 'Hẹn gặp lại, theo một nhịp mới.' : preferences.mode === 'stream' ? 'Theo dòng tiếng Anh.' : preferences.mode === 'bubbles' ? 'Một bảng màu, nhiều điều quen.' : preferences.mode === 'match' ? 'Nối nhanh, nhớ lâu.' : preferences.mode === 'choice' ? 'Chọn điều bạn nhớ.' : 'Gọi lại phần còn thiếu.'}</h1></div><button onClick={() => void toggleFullscreen()}>{fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</button></div>
    {done ? <section className="lab-summary panel" data-testid="lab-summary"><span className="lab-complete-mark" aria-hidden="true">✦</span><span className="eyebrow">{ended && (repeat || completed < cards.length) ? 'BẠN ĐÃ DỪNG LƯỢT LUYỆN' : 'HOÀN THÀNH'}</span><h2>Một lượt luyện, thêm một chút quen.</h2><p><strong>{repeat ? completed.toLocaleString('vi-VN') : `${completed} / ${cards.length}`}</strong> {repeat ? 'lần hiển thị trọn lượt' : 'mục'} {!repeat && (timed ? 'đã hiển thị trọn lượt' : preferences.mode === 'match' ? 'đã ghép' : 'đã trả lời')} · {preferences.mode === 'match' ? formatSeconds(clock.elapsed) : durationText(clock.elapsed)}{repeat && ` · ${frame.cycle} vòng trọn bộ` }</p>{!timed && <p>{preferences.mode === 'match' ? `${attempts.filter(a => a.correct).length} cặp ghép đúng ngay · ${mistakes} lần ghép nhầm` : preferences.mode === 'choice' ? `${attempts.filter(a => a.correct).length} câu chọn đúng · ${attempts.filter(a => !a.correct).length} mục để xem lại` : `${attempts.filter(a => a.correct).length} đáp án khớp bài đã lưu · ${attempts.filter(a => !a.correct).length} mục để xem lại`}.</p>}<p className="muted">Đây là kết quả luyện thêm trong Lab. Lịch ôn và tỉ lệ nhớ của bạn được giữ nguyên.</p><div className="actions left"><button className="primary" onClick={() => onReplay(cards)}>Luyện lại lượt này</button>{missed.length > 0 && <button onClick={() => onReplay(missed)}>Luyện {missed.length} mục đã đánh dấu</button>}<button onClick={onExit}>Đổi thiết lập</button><a className="button" href="#review">Ôn đúng hạn →</a></div>{missed.length > 0 && <details className="lab-marked-list"><summary>{missed.length} mục muốn gặp lại trong lượt này</summary>{missed.slice(0, 100).map(card => <p key={card.id}><strong lang="en">{card.english}</strong><br/>{card.meaningVi}</p>)}{missed.length > 100 && <p>Hiển thị 100 mục đầu. Nút luyện lại dùng toàn bộ mục đã đánh dấu.</p>}</details>}</section> : <>
      <div className="lab-session-toolbar"><div className="lab-counter" data-testid="lab-progress" data-completed={completed} data-cycle={frame.cycle}><strong>{completed.toLocaleString('vi-VN')}</strong> / {repeat ? '∞' : cards.length.toLocaleString('vi-VN')}<span>{repeat ? `Vòng ${frame.cycle + 1} · ${cards.length} mục / vòng` : timed ? 'mục trọn lượt' : preferences.mode === 'match' ? 'cặp đã ghép' : 'câu đã trả lời'}</span></div><div className="actions left"><button className="primary" onClick={() => { if (clock.paused) { setFocus(undefined); resume(); } else pause(); }}>{clock.paused ? 'Tiếp tục' : 'Tạm dừng'}</button><button onClick={() => { pause(); setEnded(true); }} aria-label={repeat ? 'Dừng' : 'Kết thúc'}>{repeat && <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1" fill="currentColor"/></svg>}{repeat ? 'Dừng' : 'Kết thúc'}</button></div><small><kbd>Space</kbd> tạm dừng · <kbd>Esc</kbd> dừng nhịp</small></div>
      <progress className="lab-progress" aria-label="Tiến độ lượt luyện" value={timed ? frame.completed : completed} max={cards.length}/>
      {clock.paused && <p className="lab-pause-notice" role="status">{clock.reason || 'Đang tạm dừng. Bạn có thể xem kỹ thẻ trước khi tiếp tục.'}</p>}
      {preferences.mode === 'stream' && active && <section className="lab-stream-stage" aria-label="Thẻ lướt nhanh"><span className="lab-stage-kicker">{kindNames[active.kind]} <span>· {Math.min(frame.items[0]?.index ?? 0, cards.length - 1) + 1} / {cards.length}</span></span><div className="lab-stream-copy" key={`${frame.cycle}:${active.id}`}><p className={`lab-stream-front ${active.english.length > 200 ? 'long-copy' : ''}`} lang="en">{active.english}</p><div className={`lab-stream-translation ${revealMeaning ? '' : 'concealed'}`}><span>{active.meaningLabel}</span>{revealMeaning ? <p className="lab-stream-meaning">{active.meaningVi}</p> : <p className="lab-stream-placeholder">Thử gọi lại nghĩa trước khi mở…</p>}</div></div><div className="lab-stage-footer"><span>{preferences.seconds} giây / mục</span><div className="actions"><button onClick={() => { pause(); mark(active); }}>{marked.has(active.id) ? '★ Đã đánh dấu' : '☆ Muốn gặp lại'}</button><button onClick={() => speak(active)}>Nghe tiếng Anh</button></div></div></section>}
      {preferences.mode === 'bubbles' && <><div className="lab-bubble-board" role="group" aria-label="Bảng thẻ tự lật" style={{ '--lab-columns': preferences.columns } as CSSProperties}>{Array.from({ length: preferences.columns ** 2 }, (_, slot) => {
        const item = frame.items.find(i => positions[i.slot] === slot); const card = item && cards[item.index];
        return <div className="lab-bubble-slot" key={slot}>{item && card && <button key={`${frame.cycle}:${card.id}`} className={`lab-bubble lab-color-${slot % 6} ${item.phase === 'leaving' ? 'leaving' : ''}`} data-index={item.index} data-side={item.side} aria-label={`${item.side === 'front' ? card.english : card.meaningVi}. Bấm để dừng và xem thẻ.`} onFocus={e => { if (e.currentTarget.matches(':focus-visible')) { pause(); setFocus(card); } }} onClick={() => { pause(); setFocus(card); }}><span className="lab-bubble-rotor"><span className="lab-bubble-face lab-bubble-front" aria-hidden={item.side !== 'front'}><small>EN <span>{item.index + 1}</span></small><span lang="en">{card.english}</span><small>{kindNames[card.kind]} ↗</small></span><span className="lab-bubble-face lab-bubble-back" aria-hidden={item.side !== 'back'}><small>{card.meaningLabel} <span>{item.index + 1}</span></small><span>{card.meaningVi}</span><small>Bấm để xem đầy đủ ↗</small></span></span></button>}</div>;
      })}</div><p className="lab-board-hint">Mỗi mặt {preferences.seconds} giây · Bấm một ô để dừng và xem rõ · {preferences.columns} × {preferences.columns} ô</p></>}
      {focus && clock.paused && <section className="lab-focus-card panel" ref={detail} tabIndex={-1}><span className="eyebrow">THẺ BẠN ĐANG XEM</span><h2 lang="en">{focus.english}</h2><small>{focus.meaningLabel}</small><p>{focus.meaningVi}</p><div className="actions left"><button onClick={() => mark(focus)}>{marked.has(focus.id) ? '★ Đã đánh dấu' : '☆ Muốn gặp lại'}</button><button onClick={() => speak(focus)}>Nghe tiếng Anh</button><button onClick={() => { setFocus(undefined); resume(); }}>Đóng thẻ & tiếp tục</button></div></section>}
      {preferences.mode === 'cloze' && active?.cloze && <section className="lab-cloze-stage panel"><span className="lab-stage-kicker">TỰ VIẾT TIẾNG ANH <span>· {index + 1} / {cards.length}</span></span><h2>Điền phần còn thiếu.</h2><p className="lab-cloze-sentence" lang="en">{active.cloze.sentence.split('[[blank]]').map((part, i) => <Fragment key={i}>{i > 0 && <span className="lab-blank" aria-label="chỗ trống">···</span>}{part}</Fragment>)}</p><p className="lab-cloze-hint">Gợi ý: {active.cloze.hintVi}</p><form onSubmit={e => { e.preventDefault(); if (result === undefined) check(); else next(); }}><label>Phần còn thiếu<input ref={input} autoComplete="off" autoCapitalize="off" spellCheck={false} value={answer} maxLength={1000} disabled={clock.paused || result !== undefined} onChange={e => setAnswer(e.target.value)} placeholder="Gõ từ hoặc cụm từ bằng tiếng Anh…"/></label>{result === undefined ? <button className="primary" disabled={clock.paused || !answer.trim()}>Kiểm tra</button> : <><div className={`lab-cloze-feedback ${result ? 'correct' : 'retry'}`} role="status"><strong>{result ? 'Chính xác — bạn đã gọi lại được.' : 'Đáp án trong bài đã lưu:'}</strong><p lang="en">{active.cloze.answer}</p><p>{active.meaningVi}</p>{!result && <small>Đối chiếu theo đáp án đã lưu, không chấm ngữ nghĩa bằng AI. Mục này đã được đánh dấu để luyện lại.</small>}</div><button ref={nextButton} className="primary" disabled={clock.paused}>{index === cards.length - 1 ? 'Xem kết quả' : 'Câu tiếp theo'}</button></>}</form></section>}
      {preferences.mode === 'match' && <MatchStage cards={cards} columns={preferences.columns} paused={clock.paused} elapsed={clock.elapsed} onMatched={(card, firstTry) => setAttempts(old => [...old, { card, correct: firstTry }])} onMistake={pair => { setMistakes(n => n + 1); setMarked(old => new Set([...old, ...pair.map(card => card.id)])); }}/>}
      {preferences.mode === 'choice' && active && <ChoiceStage key={index} card={active} pool={pool} position={index + 1} total={cards.length} direction={directions[index] ?? 'en-vi'} paused={clock.paused} marked={marked.has(active.id)} last={index === cards.length - 1} onAnswer={correct => { setAttempts(old => [...old, { card: active, correct }]); if (!correct) setMarked(old => new Set([...old, active.id])); }} onNext={() => setIndex(i => i + 1)} onMark={() => mark(active)} onSpeak={speakText}/>}
    </>}
    {notice && <p role="status" className="hint-box">{notice}</p>}
  </div>;
}
