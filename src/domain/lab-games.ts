import { gameReady, normalizeLabAnswer, type LabCard } from './lab';

export type ChoiceDirection = 'en-vi' | 'vi-en';
export interface ChoiceOption { cardId: string; text: string }
export interface ChoiceQuestion { cardId: string; direction: ChoiceDirection; prompt: string; options: ChoiceOption[]; answerIndex: number }
export interface MatchTile { key: string; cardId: string; side: 'en' | 'vi'; text: string }
export interface MatchRound { cards: LabCard[]; tiles: MatchTile[] }

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const value = random();
    const j = Math.min(i, Math.floor((Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0) * (i + 1)));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
const textOf = (card: LabCard, side: 'en' | 'vi') => side === 'en' ? card.english : card.meaningVi;

/** One correct option plus distractors drawn from the learner's own library, never a second valid answer. */
export function buildChoiceQuestion(card: LabCard, pool: LabCard[], direction: ChoiceDirection, random = Math.random, size = 4): ChoiceQuestion {
  const promptSide = direction === 'en-vi' ? 'en' : 'vi', answerSide = direction === 'en-vi' ? 'vi' : 'en';
  const correct = textOf(card, answerSide), promptKey = normalizeLabAnswer(textOf(card, promptSide));
  const seen = new Set([normalizeLabAnswer(correct)]);
  // Prefer the same kind and a similar length, so the answer does not stand out by its shape alone.
  const ranked = pool.filter(other => other.id !== card.id && gameReady(other))
    .map(other => ({ other, score: (other.kind === card.kind ? 0 : 1) + Math.abs(textOf(other, answerSide).length - correct.length) / Math.max(20, correct.length) + random() * 0.8 }))
    .sort((a, b) => a.score - b.score);
  const distractors: ChoiceOption[] = [];
  for (const { other } of ranked) {
    if (distractors.length >= size - 1) break;
    const key = normalizeLabAnswer(textOf(other, answerSide));
    // Another card with the same prompt text would make its own answer correct too.
    if (!key || seen.has(key) || normalizeLabAnswer(textOf(other, promptSide)) === promptKey) continue;
    seen.add(key); distractors.push({ cardId: other.id, text: textOf(other, answerSide) });
  }
  const options = shuffle([{ cardId: card.id, text: correct }, ...distractors], random);
  return { cardId: card.id, direction, prompt: textOf(card, promptSide), options, answerIndex: options.findIndex(o => o.cardId === card.id) };
}

/** Split a deck into boards; identical English or Vietnamese tiles never share a board. */
export function buildMatchRounds(cards: LabCard[], pairs: number, random = Math.random): MatchRound[] {
  const size = Number.isFinite(pairs) ? Math.max(2, Math.floor(pairs)) : 6;
  const rounds: { cards: LabCard[]; en: Set<string>; vi: Set<string> }[] = [];
  for (const card of cards) {
    const en = normalizeLabAnswer(card.english), vi = normalizeLabAnswer(card.meaningVi);
    let round = rounds.find(r => r.cards.length < size && !r.en.has(en) && !r.vi.has(vi));
    if (!round) { round = { cards: [], en: new Set(), vi: new Set() }; rounds.push(round); }
    round.cards.push(card); round.en.add(en); round.vi.add(vi);
  }
  return rounds.map(round => ({
    cards: round.cards,
    tiles: shuffle(round.cards.flatMap((card): MatchTile[] => [
      { key: `${card.id}:en`, cardId: card.id, side: 'en', text: card.english },
      { key: `${card.id}:vi`, cardId: card.id, side: 'vi', text: card.meaningVi },
    ]), random),
  }));
}
/** Board sizes reuse the Lab "columns" preference: 2 → 4 pairs, 3 → 6 pairs, 4 → 8 pairs. */
export const matchPairs = (columns: 2 | 3 | 4) => columns * 2;
