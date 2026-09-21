import { describe, expect, it } from 'vitest';
import { defaultLabPreferences, filterLabCards, gameReady, GAME_TEXT_LIMITS, LabPreferencesSchema, normalizeLabAnswer, type LabCard } from '../src/domain/lab';
import { buildChoiceQuestion, buildMatchRounds, matchPairs } from '../src/domain/lab-games';
import { defaultSettings, type Review, type Unit } from '../src/domain/models';
import { dueIn, reviewQueue } from '../src/ui/review-queue';

let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function card(id: string, english: string, meaningVi: string, kind: LabCard['kind'] = 'phrase', patch: Partial<LabCard> = {}): LabCard {
  return { id, english, meaningVi, meaningLabel: 'Nghĩa tiếng Việt', kind, groupIds: [], labelIds: [], due: false, difficult: false, createdAt: 0, ...patch };
}
const library = [
  card('a', 'Keep in mind', 'Hãy ghi nhớ'), card('b', 'Little by little', 'Từng chút một'),
  card('c', 'As long as', 'Miễn là'), card('d', 'Figure it out', 'Tìm ra cách giải quyết'),
  card('e', 'Get used to', 'Dần làm quen với'), card('f', 'If + S + had + V3', 'Giả định trái quá khứ', 'grammar'),
  card('g', 'Make a difference', 'Tạo nên sự khác biệt'),
];

describe('multiple choice from the learner library', () => {
  it('always contains the right answer once and never a second valid answer', () => {
    for (let run = 0; run < 50; run++) for (const target of library) {
      const question = buildChoiceQuestion(target, library, 'en-vi', random);
      expect(question.prompt).toBe(target.english);
      expect(question.options).toHaveLength(4);
      expect(question.options[question.answerIndex]).toEqual({ cardId: target.id, text: target.meaningVi });
      expect(question.options.filter(o => o.cardId === target.id)).toHaveLength(1);
      expect(new Set(question.options.map(o => normalizeLabAnswer(o.text))).size).toBe(4);
    }
  });
  it('asks Vietnamese → English and prefers distractors of the same kind', () => {
    const question = buildChoiceQuestion(library[0]!, library, 'vi-en', () => 0.5);
    expect(question.prompt).toBe('Hãy ghi nhớ');
    expect(question.options[question.answerIndex]!.text).toBe('Keep in mind');
    expect(question.options.every(o => o.cardId !== 'f')).toBe(true);
  });
  it('skips duplicate meanings, cards that share the prompt text, and overly long items', () => {
    const pool = [
      card('x', 'take off', 'cất cánh'), card('dup', 'lift off', 'Cất cánh'), card('same', 'Take off', 'cởi ra'),
      card('long', 'y', 'n'.repeat(GAME_TEXT_LIMITS.meaning + 1)), card('ok', 'land', 'hạ cánh'),
    ];
    const question = buildChoiceQuestion(pool[0]!, pool, 'en-vi', random);
    expect(question.options.map(o => o.cardId).sort()).toEqual(['ok', 'x']);
  });
  it('still produces a single-option question for a one-card library instead of failing', () => {
    const question = buildChoiceQuestion(library[0]!, [library[0]!], 'en-vi', random);
    expect(question.options).toEqual([{ cardId: 'a', text: 'Hãy ghi nhớ' }]); expect(question.answerIndex).toBe(0);
  });
});

describe('matching boards', () => {
  it('uses every card once, respects the board size and keeps identical tiles apart', () => {
    const deck = [...library, card('h', 'keep in mind', 'Ghi nhớ nhé'), card('i', 'Stay calm', 'Hãy ghi nhớ')];
    const rounds = buildMatchRounds(deck, matchPairs(2), random);
    expect(rounds.flatMap(r => r.cards.map(c => c.id)).sort()).toEqual(deck.map(c => c.id).sort());
    for (const round of rounds) {
      expect(round.cards.length).toBeLessThanOrEqual(4);
      expect(round.tiles).toHaveLength(round.cards.length * 2);
      expect(new Set(round.cards.map(c => normalizeLabAnswer(c.english))).size).toBe(round.cards.length);
      expect(new Set(round.cards.map(c => normalizeLabAnswer(c.meaningVi))).size).toBe(round.cards.length);
      for (const c of round.cards) expect(round.tiles.filter(t => t.cardId === c.id).map(t => t.side).sort()).toEqual(['en', 'vi']);
    }
  });
  it('maps the board preference to pairs and handles tiny or malformed input', () => {
    expect([2, 3, 4].map(n => matchPairs(n as 2 | 3 | 4))).toEqual([4, 6, 8]);
    expect(buildMatchRounds([], 6, random)).toEqual([]);
    expect(buildMatchRounds(library, Number.NaN, random)[0]!.cards).toHaveLength(6);
  });
});

describe('game preferences and eligibility', () => {
  it('accepts the new modes, defaults the choice direction and keeps older saved preferences valid', () => {
    expect(LabPreferencesSchema.parse({ mode: 'bubbles', columns: 4 })).toMatchObject({ mode: 'bubbles', direction: 'en-vi' });
    for (const mode of ['match', 'choice']) expect(LabPreferencesSchema.safeParse({ mode }).success).toBe(true);
    for (const direction of ['en-vi', 'vi-en', 'mixed']) expect(LabPreferencesSchema.safeParse({ direction }).success).toBe(true);
    expect(LabPreferencesSchema.safeParse({ direction: 'both' }).success).toBe(false);
  });
  it('limits the games to short items while other modes keep long sentences', () => {
    const long = card('long', 'A'.repeat(GAME_TEXT_LIMITS.english + 1), 'Dài', 'capture');
    const cards = [...library, long];
    expect(gameReady(long)).toBe(false);
    expect(filterLabCards(cards, { ...defaultLabPreferences, mode: 'match' }).map(c => c.id)).not.toContain('long');
    expect(filterLabCards(cards, { ...defaultLabPreferences, mode: 'choice' }).map(c => c.id)).not.toContain('long');
    expect(filterLabCards(cards, { ...defaultLabPreferences, mode: 'stream' }).map(c => c.id)).toContain('long');
  });
});

describe('shared review queue for the popup and the review page', () => {
  const now = new Date(2026, 8, 21, 12).getTime();
  const unit = (id: string, reps: number, due = now - 1000): Unit => ({ id, canonical: `phrase:${id}`, knowledge: { key: id, kind: 'phrase', group: id, name: id, form: id, meaningVi: id, explanationVi: id, evidence: id, examples: [{ en: id, vi: id }, { en: id, vi: id }], production: { instructionVi: id, answerEn: id }, cloze: { sentence: `[[blank]] ${id}`, answer: id, hintVi: id } }, captureIds: [crypto.randomUUID()], schedule: { due, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps, lapses: 0, state: reps ? 2 : 0, learning_steps: 0 }, failures: 0, suspended: false, leech: false, encounters: 0, createdAt: 0, updatedAt: 0 });
  it('counts new items started today against the daily limit and keeps learned items first', () => {
    const units = [unit('new1', 0), unit('old', 3), unit('new2', 0), unit('later', 2, now + 60000)];
    const startedToday = { prior: { reps: 0 }, at: now - 3600000 } as Review;
    expect(reviewQueue(units, [], { ...defaultSettings, dailyNewLimit: 2 }, new Map(), now).map(u => u.id)).toEqual(['old', 'new1', 'new2']);
    expect(reviewQueue(units, [startedToday], { ...defaultSettings, dailyNewLimit: 2 }, new Map(), now).map(u => u.id)).toEqual(['old', 'new1']);
  });
  it('words intervals the same way on both surfaces', () => {
    expect(dueIn(0 + 30_000, 0)).toBe('1 phút'); expect(dueIn(3 * 3600_000, 0)).toBe('3 giờ'); expect(dueIn(4 * 86400_000, 0)).toBe('4 ngày');
  });
});
