import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabCard, LabPreferences } from '../domain/lab';
import { buildChoiceQuestion, buildMatchRounds, matchPairs, type ChoiceDirection, type MatchTile } from '../domain/lab-games';

export const formatSeconds = (ms: number) => `${(ms / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giây`;

/** Timed pairing board. Progress is reported to the session; nothing touches FSRS. */
export function MatchStage({ cards, columns, paused, elapsed, onMatched, onMistake }: {
  cards: LabCard[]; columns: LabPreferences['columns']; paused: boolean; elapsed: number;
  onMatched: (card: LabCard, firstTry: boolean) => void; onMistake: (cards: LabCard[]) => void;
}) {
  const [rounds] = useState(() => buildMatchRounds(cards, matchPairs(columns)));
  const [round, setRound] = useState(0);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MatchTile>();
  const [wrong, setWrong] = useState<string[]>([]);
  const confused = useRef(new Set<string>());
  const board = rounds[round];
  const byId = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards]);
  useEffect(() => { if (!wrong.length) return; const timer = window.setTimeout(() => setWrong([]), 450); return () => clearTimeout(timer); }, [wrong]);
  function choose(tile: MatchTile) {
    if (paused || matched.has(tile.cardId) || !board) return;
    if (!selected || selected.side === tile.side) { setSelected(selected?.key === tile.key ? undefined : tile); return; }
    setSelected(undefined);
    if (selected.cardId === tile.cardId) {
      const next = new Set(matched).add(tile.cardId);
      onMatched(byId.get(tile.cardId)!, !confused.current.has(tile.cardId));
      // A finished board gives way to the next one; the session ends after the last pair.
      if (board.cards.every(card => next.has(card.id)) && round < rounds.length - 1) { setRound(r => r + 1); setMatched(new Set()); }
      else setMatched(next);
      return;
    }
    setWrong([selected.key, tile.key]);
    const pair = [selected.cardId, tile.cardId].map(id => byId.get(id)!);
    for (const card of pair) confused.current.add(card.id);
    onMistake(pair);
  }
  if (!board) return null;
  return <section className="lab-match-stage panel" aria-label="Ghép cặp">
    <div className="lab-match-head"><span className="lab-stage-kicker">GHÉP CẶP <span>· Bảng {round + 1} / {rounds.length}</span></span><strong className="lab-match-timer" aria-live="off">{formatSeconds(elapsed)}</strong></div>
    <p className="lab-match-hint">Chọn một ô tiếng Anh rồi chọn nghĩa tiếng Việt của nó. Ghép nhầm được ghi lại để luyện thêm.</p>
    <div className="lab-match-board" role="group" aria-label={`Bảng ${round + 1}`}>{board.tiles.map(tile => {
      const done = matched.has(tile.cardId);
      return <button key={tile.key} className={`lab-match-tile side-${tile.side} ${selected?.key === tile.key ? 'selected' : ''} ${wrong.includes(tile.key) ? 'wrong' : ''} ${done ? 'matched' : ''}`}
        data-card-id={tile.cardId} data-side={tile.side} lang={tile.side === 'en' ? 'en' : 'vi'} disabled={done || paused} aria-pressed={selected?.key === tile.key}
        aria-label={`${tile.side === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}: ${tile.text}`} onClick={() => choose(tile)}>
        <small>{tile.side === 'en' ? 'EN' : 'VI'}</small><span>{tile.text}</span>
      </button>;
    })}</div>
  </section>;
}

/** Four options with distractors from the learner's own library; keys 1–4 answer, Enter continues. */
export function ChoiceStage({ card, pool, position, total, direction, paused, marked, onAnswer, onNext, onMark, onSpeak, last }: {
  card: LabCard; pool: LabCard[]; position: number; total: number; direction: ChoiceDirection; paused: boolean; marked: boolean; last: boolean;
  onAnswer: (correct: boolean) => void; onNext: () => void; onMark: () => void; onSpeak: (text: string) => void;
}) {
  const question = useMemo(() => buildChoiceQuestion(card, pool, direction), [card, pool, direction]);
  const [chosen, setChosen] = useState<number>();
  const next = useRef<HTMLButtonElement>(null);
  const answered = chosen !== undefined, correct = chosen === question.answerIndex;
  // In the Vietnamese → English direction, hearing the English first would give the answer away.
  const canSpeak = direction === 'en-vi' || answered;
  function choose(index: number) {
    if (paused || answered || !question.options[index]) return;
    setChosen(index); onAnswer(index === question.answerIndex);
  }
  useEffect(() => { if (answered) next.current?.focus(); }, [answered]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || paused) return;
      if ((event.target as Element | null)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (!answered && /^[1-9]$/.test(event.key)) { event.preventDefault(); choose(Number(event.key) - 1); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  });
  return <section className="lab-choice-stage panel" aria-label="Trắc nghiệm">
    <span className="lab-stage-kicker">TRẮC NGHIỆM <span>· {position} / {total}</span></span>
    <h2 className={direction === 'en-vi' ? 'lab-choice-prompt english-prompt' : 'lab-choice-prompt'} lang={direction === 'en-vi' ? 'en' : 'vi'}>{question.prompt}</h2>
    <p className="lab-choice-hint">{direction === 'en-vi' ? 'Chọn nghĩa tiếng Việt đúng.' : 'Chọn cách nói tiếng Anh đúng.'} Phím 1–{question.options.length} để chọn.</p>
    <div className="lab-choice-options" role="group" aria-label="Các đáp án">{question.options.map((option, index) => {
      const state = !answered ? '' : index === question.answerIndex ? 'correct' : index === chosen ? 'wrong' : 'muted';
      return <button key={option.cardId} className={`lab-choice-option ${state}`} lang={direction === 'en-vi' ? 'vi' : 'en'} disabled={paused || (answered && index !== chosen && index !== question.answerIndex)} aria-pressed={chosen === index} onClick={() => choose(index)}>
        <kbd>{index + 1}</kbd><span>{option.text}</span>
      </button>;
    })}</div>
    {answered && <div className={`lab-cloze-feedback ${correct ? 'correct' : 'retry'}`} role="status">
      <strong>{correct ? 'Chính xác.' : 'Chưa đúng. Đáp án:'}</strong>
      <p lang="en">{card.english}</p><p>{card.meaningVi}</p>
      {!correct && <small>Mục này đã được đánh dấu để luyện lại. Đáp án nhiễu lấy từ thư viện của bạn nên có thể gần nghĩa.</small>}
    </div>}
    <div className="actions">
      <button onClick={onMark}>{marked ? '★ Đã đánh dấu' : '☆ Muốn gặp lại'}</button>
      {canSpeak && <button onClick={() => onSpeak(card.english)}>Nghe tiếng Anh</button>}
      {answered && <button ref={next} className="primary" disabled={paused} onClick={onNext}>{last ? 'Xem kết quả' : 'Câu tiếp theo'}</button>}
    </div>
  </section>;
}
