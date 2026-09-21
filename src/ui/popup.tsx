import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { allData, recordReview, settings } from '../data/repository';
import { defaultSettings, normalize, type Settings, type Unit } from '../domain/models';
import { exercise, scheduler } from '../domain/scheduler';
import { loadFrequency } from '../learning/frequency';
import { youtubeId } from '../video/captions';
import { send } from '../shared/client';
import { dueIn, reviewQueue } from './review-queue';
import './typography.css';
import './popup.css';

type Data = Awaited<ReturnType<typeof allData>>;
const ratingNames = ['Chưa nhớ', 'Khó', 'Nhớ', 'Dễ'] as const;
const modeNames = { production: 'Tự viết tiếng Anh', cloze: 'Điền khuyết câu gốc', transfer: 'Viết trong ngữ cảnh mới', dictation: 'Nghe chép' } as const;
function openApp(hash: string) { void chrome.tabs.create({ url: chrome.runtime.getURL(`app.html#${hash}`) }); window.close(); }
function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.9;
  const voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); utterance.voice = voices.find(v => v.localService) ?? voices[0] ?? null;
  speechSynthesis.speak(utterance);
}

function Popup() {
  const [state, setState] = useState<{ data: Data; config: Settings; ranks: Map<string, number> }>();
  const [error, setError] = useState(''); const [done, setDone] = useState(0); const [skipped, setSkipped] = useState<string[]>([]);
  const [youtubeTab, setYoutubeTab] = useState<number>(); const [videoNotice, setVideoNotice] = useState('');
  // Ranks decide the order of new items: load them with the data so the card never swaps under the learner.
  const load = async () => {
    const [data, config, ranks] = await Promise.all([allData(), settings(), loadFrequency().catch(() => new Map<string, number>())]);
    setState({ data, config, ranks });
  };
  useEffect(() => {
    void load().catch(() => setError('Không đọc được dữ liệu học. Hãy mở lại popup.'));
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { if (tab?.id && tab.url && youtubeId(tab.url)) setYoutubeTab(tab.id); }).catch(() => undefined);
  }, []);
  const queue = useMemo(() => state ? reviewQueue(state.data.units, state.data.reviews, state.config, state.ranks) : [], [state]);
  const unit = queue.find(u => !skipped.includes(u.id));
  async function captureVideo() {
    if (!youtubeTab) return;
    setVideoNotice('Đang mở hộp lưu câu trên video…');
    try {
      const reply = await chrome.tabs.sendMessage(youtubeTab, { type: 'capture-video' }) as { handled?: boolean } | undefined;
      if (reply?.handled) { window.close(); return; }
    } catch { /* No YouTube listener in this tab yet. */ }
    setVideoNotice('Chưa thấy video đang phát. Tải lại trang YouTube, bật phụ đề tiếng Anh rồi thử lại.');
  }
  const nextDue = state?.data.units.filter(u => !u.suspended && u.schedule.due > Date.now()).reduce((min, u) => Math.min(min, u.schedule.due), Infinity) ?? Infinity;
  return <main className="quick" aria-label="Ôn nhanh LumaRead">
    <header className="quick-top"><img src="icons/icon-32.png" alt=""/><div><strong>Ôn 30 giây</strong><small>{state ? `${queue.length} mục đến hạn` : 'Đang mở…'}</small></div><button className="quick-link" onClick={() => openApp('home')}>Mở góc học ↗</button></header>
    {youtubeTab && <section className="quick-youtube"><button className="primary" onClick={() => void captureVideo()}>Lưu câu vừa nghe</button><small>Tạm dừng video và chọn câu · <kbd>Alt ⇧ Y</kbd></small>{videoNotice && <p role="status">{videoNotice}</p>}</section>}
    {error ? <p className="quick-error" role="alert">{error}</p>
      : !state ? <p className="quick-empty">Đang chuẩn bị thẻ…</p>
      : unit ? <QuickCard key={`${unit.id}:${unit.schedule.reps}`} unit={unit} config={state.config} onDone={async () => { setDone(n => n + 1); await load(); }} onSkip={() => setSkipped(list => [...list, unit.id])} onStale={() => void load()}/>
      : <section className="quick-empty"><strong>{done ? `Xong ${done} mục. Nghỉ một chút nhé.` : 'Bạn đã theo kịp lịch ôn.'}</strong><p>{skipped.length ? `Đã bỏ qua ${skipped.length} mục trong lượt này; lịch của chúng không đổi.` : Number.isFinite(nextDue) ? `Mục tiếp theo đến hạn sau ${dueIn(nextDue)}.` : 'Lưu một câu tiếng Anh khi đọc để bắt đầu.'}</p><div className="quick-actions"><button onClick={() => openApp('library')}>Thư viện</button><button onClick={() => openApp('lab')}>Phòng Lab</button></div></section>}
    <footer className="quick-foot">{done ? `Đã ôn ${done} mục · ` : ''}Cùng lịch FSRS với trang Ôn tập · Gõ trước khi xem đáp án</footer>
  </main>;
}

function QuickCard({ unit, config, onDone, onSkip, onStale }: { unit: Unit; config: Settings; onDone: () => Promise<void>; onSkip: () => void; onStale: () => void }) {
  const task = useMemo(() => exercise(unit), [unit]);
  const [answer, setAnswer] = useState(''); const [revealed, setRevealed] = useState(false); const [assisted, setAssisted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [reviewId] = useState(() => crypto.randomUUID()); const started = useRef(Date.now()); const card = useRef<HTMLElement>(null);
  // Keep keys 1–4 working after the textarea disappears, without pre-selecting a rating that Enter could submit.
  useEffect(() => { if (revealed) card.current?.focus(); }, [revealed]);
  async function rate(rating: 1 | 2 | 3 | 4) {
    if (busy || (assisted && rating !== 1)) return;
    setBusy(true); setError('');
    try {
      await recordReview({ id: reviewId, unitId: unit.id, expectedReps: unit.schedule.reps, rating, mode: task.mode, answer, durationMs: Date.now() - started.current, assisted });
      void send({ type: 'wake' }).catch(() => undefined); // badge and queue refresh in the worker
      await onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Chưa lưu được lượt ôn.'); setBusy(false); }
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (!revealed && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && answer.trim()) { event.preventDefault(); setRevealed(true); }
    if (revealed && /^[1-4]$/.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); void rate(Number(event.key) as 1 | 2 | 3 | 4); }
  }
  const now = Date.now();
  return <section className="quick-card" ref={card} tabIndex={-1} onKeyDown={keyboard}>
    <div className="quick-meta"><span className="quick-tag">{modeNames[task.mode]}</span><span>{unit.knowledge.group}</span></div>
    <p className={task.mode === 'cloze' ? 'quick-prompt english' : 'quick-prompt'}>{task.prompt}</p>
    {!revealed ? <>
      <label className="quick-answer-label">Câu trả lời của bạn<textarea autoFocus className="quick-answer english" lang="en" spellCheck={false} maxLength={8000} value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} placeholder="Thử viết bằng tiếng Anh…"/></label>
      {assisted && <p className="quick-hint">{task.hint} · Lượt này được ghi nhận là cần gợi ý.</p>}
      <div className="quick-actions"><button className="quick-text" disabled={assisted} onClick={() => setAssisted(true)}>Gợi ý</button><button className="quick-text" onClick={() => { setAssisted(true); setRevealed(true); }}>Chưa nhớ · Xem đáp án</button><button className="primary" disabled={!answer.trim()} onClick={() => setRevealed(true)} title="Ctrl + Enter">Đối chiếu</button></div>
    </> : <>
      <div className="quick-model"><span>ĐÁP ÁN THAM KHẢO</span><button className="quick-sound" aria-label="Nghe tiếng Anh" title="Nghe tiếng Anh" onClick={() => speak(task.answer)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 4-5 5H2v6h3l5 5ZM14 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg></button></div>
      <p className="english quick-answer-text">{task.answer}</p>
      {answer.trim() && <p className="quick-yours"><span>Bạn viết:</span> <span className="english">{answer}</span></p>}
      {task.mode === 'cloze' && <p className="quick-muted">{normalize(answer) === normalize(task.answer) ? 'Khớp đáp án câu gốc.' : 'Khác đáp án câu gốc. Nếu bạn diễn đạt tương đương, hãy tự đánh giá.'}</p>}
      <div className="quick-ratings" role="group" aria-label="Mức nhớ">{([1, 2, 3, 4] as const).map((r, i) => <button key={r} className={`quick-rating rating-${r}`} disabled={busy || (assisted && r !== 1)} onClick={() => void rate(r)}><strong>{ratingNames[i]}</strong><small>{dueIn(scheduler.review(unit.schedule, assisted ? 1 : r, now, config.retention, config.fsrsWeights).due, now)}</small><kbd>{r}</kbd></button>)}</div>
      <p className="quick-muted">{assisted ? 'Đã xem gợi ý hoặc đáp án trước khi tự nhớ: lịch ôn ghi nhận “Chưa nhớ”.' : 'Bạn quyết định mức nhớ. Muốn AI chấm, hãy mở trang Ôn tập.'}</p>
    </>}
    {error && <p className="quick-error" role="alert">{error} <button className="quick-text" onClick={onStale}>Tải lại thẻ</button></p>}
    <button className="quick-text quick-skip" disabled={busy} onClick={onSkip}>Bỏ qua lần này · Không đổi lịch</button>
  </section>;
}

createRoot(document.getElementById('root')!).render(<Popup/>);
