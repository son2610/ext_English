import { describe, expect, it } from 'vitest';
import {
  buildLabCards, checkLabAnswer, defaultLabPreferences, filterLabCards, LabPreferencesSchema,
  normalizeLabAnswer, sampleLabCards, type LabCard,
} from '../src/domain/lab';
import type { Capture, Unit } from '../src/domain/models';
import { source, analysis } from './fixtures';

const now = 1700001000000;
function capture(patch: Partial<Capture> = {}): Capture {
  return {
    id: crypto.randomUUID(), source: structuredClone(source), note: '', status: 'ready',
    analysis: structuredClone(analysis), attempts: 0, nextAttemptAt: 0, leaseUntil: 0,
    updatedAt: now, unitsCreated: true, ...patch,
  };
}
function unit(parent: Capture, patch: Partial<Unit> = {}): Unit {
  return {
    id: crypto.randomUUID(), canonical: 'grammar:conditional-third', knowledge: structuredClone(analysis.knowledge[0]!),
    captureIds: [parent.id], schedule: { due: now, stability: 1, difficulty: 5, elapsed_days: 0,
      scheduled_days: 1, reps: 1, lapses: 0, state: 2, learning_steps: 0 },
    failures: 0, suspended: false, leech: false, encounters: 0, createdAt: now - 1000, updatedAt: now,
    ...patch,
  };
}
function preference(patch: Partial<typeof defaultLabPreferences> = {}) {
  return { ...defaultLabPreferences, ...patch };
}
function sampleCards(): LabCard[] {
  const c = capture();
  return buildLabCards([c], [unit(c), unit(c, { knowledge: structuredClone(analysis.knowledge[1]!) })], now);
}

describe('Lab preferences', () => {
  it('defaults to a bounded offline session and validates speed/count/columns', () => {
    expect(LabPreferencesSchema.parse({})).toMatchObject({ mode: 'stream', count: 20, seconds: 2, columns: 3 });
    expect(LabPreferencesSchema.safeParse({ count: 0, seconds: 0.6, columns: 4 }).success).toBe(true);
    expect(LabPreferencesSchema.safeParse({ count: 5000, seconds: 10 }).success).toBe(true);
    for (const invalid of [{ count: -1 }, { count: 5001 }, { count: 1.5 }, { seconds: 0.59 }, { seconds: Infinity }, { columns: 5 }]) {
      expect(LabPreferencesSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe('Lab deck derived from the existing library', () => {
  it('uses stored translations or explicitly labeled notes without inventing missing meanings', () => {
    const analyzed = capture({ note: 'Ghi chú khác với nghĩa của AI' });
    const manual = capture({ analysis: undefined, note: '  Ghi chú riêng  ' });
    const missing = capture({ analysis: undefined, note: ' \n ' });
    const blankFront = capture({ source: { ...source, exact: '  ' } });
    const blankMeaning = capture({ analysis: { ...analysis, meaningVi: '  ' }, note: 'Nghĩa tôi ghi' });
    const cards = buildLabCards([analyzed, manual, missing, blankFront, blankMeaning], [], now);
    expect(cards.map(c => c.captureId)).toEqual([analyzed.id, manual.id, blankMeaning.id]);
    expect(cards[0]).toMatchObject({ english: source.exact, meaningVi: analysis.meaningVi, meaningLabel: 'Nghĩa tiếng Việt' });
    expect(cards[1]).toMatchObject({ meaningVi: 'Ghi chú riêng', meaningLabel: 'Ghi chú của bạn', due: false, difficult: false });
    expect(cards[2]).toMatchObject({ meaningVi: 'Nghĩa tôi ghi', meaningLabel: 'Ghi chú của bạn' });
  });

  it('maps shared units to all safe source groups and labels without duplicating them', () => {
    const groupA = crypto.randomUUID(), groupB = crypto.randomUUID(), labelA = crypto.randomUUID(), labelB = crypto.randomUUID();
    const a = capture({ organization: { groupId: groupA, labelIds: [labelA] } });
    const b = capture({ organization: { groupId: groupB, labelIds: [labelA, labelB] } });
    const lesson = unit(a, { captureIds: [a.id, b.id, a.id], knowledge: structuredClone(analysis.knowledge[1]!) });
    const cards = buildLabCards([a, b], [lesson], now);
    const phrase = cards.find(c => c.kind === 'phrase')!;
    expect(phrase).toMatchObject({ english: 'would have helped', meaningVi: analysis.knowledge[1]!.meaningVi,
      groupIds: [groupA, groupB], labelIds: [labelA, labelB], due: true });
    expect(filterLabCards(cards, preference({ source: 'phrases', groupId: groupB, labelId: labelB }))).toEqual([phrase]);
    expect(filterLabCards(cards, preference({ source: 'captures', groupId: groupB }))).toHaveLength(1);
    expect(filterLabCards(cards, preference({ labelId: 'unknown-label' }))).toEqual([]);
  });

  it('does not use suspended, flagged, orphaned or blank knowledge and derives flags from active units', () => {
    const a = capture(), b = capture();
    const suspended = unit(a, { suspended: true, failures: 10, leech: true });
    const flagged = unit(a, { reportedIssue: 'Nghĩa cần kiểm tra', failures: 10 });
    const active = unit(b, { failures: 3 });
    const future = unit(a, { schedule: { ...unit(a).schedule, due: now + 1 } });
    const orphaned = unit(capture());
    const blank = unit(a, { knowledge: { ...analysis.knowledge[0]!, form: ' ' } });
    const cards = buildLabCards([a, b], [suspended, flagged, active, future, orphaned, blank], now);
    expect(cards.filter(c => c.unitId).map(c => c.unitId)).toEqual([active.id, future.id]);
    expect(cards.find(c => c.captureId === a.id)).toMatchObject({ difficult: false });
    expect(cards.find(c => c.captureId === b.id)).toMatchObject({ due: true, difficult: true });
    expect(filterLabCards(cards, preference({ scope: 'difficult' })).map(c => c.id)).toEqual([`unit:${active.id}`, `capture:${b.id}`]);
    expect(filterLabCards(cards, preference({ source: 'grammar', scope: 'due' })).map(c => c.unitId)).toEqual([active.id]);
  });

  it('keeps uncertain video content out until approved, including organizers from unsafe shared sources', () => {
    const unsafeGroup = crypto.randomUUID();
    const uncertain = capture({
      source: { ...source, video: { provider: 'youtube', videoId: 'abcdefghijk', start: 1, end: 8,
        language: 'en', automatic: true, timing: 'observed', captionSource: 'rendered' } },
      analysis: { ...analysis, transcript: { textEn: source.exact, uncertain: true, warningVi: 'Cần kiểm tra', changes: [] } },
      organization: { groupId: unsafeGroup, labelIds: [] },
    });
    const safe = capture();
    const solelyUnsafe = unit(uncertain), shared = unit(safe, { captureIds: [safe.id, uncertain.id] });
    let cards = buildLabCards([uncertain, safe], [solelyUnsafe, shared], now);
    expect(cards.map(c => c.id)).toEqual([`unit:${shared.id}`, `capture:${safe.id}`]);
    expect(cards[0]!.groupIds).toEqual([]);
    cards = buildLabCards([{ ...uncertain, transcriptApproved: true }], [solelyUnsafe], now);
    expect(cards).toHaveLength(2);
    expect(cards.every(c => c.groupIds.includes(unsafeGroup))).toBe(true);
  });

  it('only exposes cloze exercises with one complete, grounded blank', () => {
    const c = capture();
    const good = unit(c);
    const badClozes = [
      { sentence: 'If I [[blank]] [[blank]], I would have helped.', answer: 'had known', hintVi: 'Gợi ý' },
      { sentence: source.exact, answer: 'had known', hintVi: 'Gợi ý' },
      { sentence: 'If I [[blank]], I would have helped.', answer: ' ', hintVi: 'Gợi ý' },
      { sentence: 'If I [[blank]], I would have helped.', answer: 'had known', hintVi: ' ' },
      { sentence: 'A different [[blank]].', answer: 'sentence', hintVi: 'Gợi ý' },
      { sentence: 'If I [[blank]], I would have helped.', answer: '[[blank]]', hintVi: 'Gợi ý' },
    ];
    const lessons = [good, ...badClozes.map(cloze => unit(c, { knowledge: { ...analysis.knowledge[0]!, cloze } }))];
    const cards = buildLabCards([c], lessons, now);
    expect(cards).toHaveLength(lessons.length + 1);
    const clozeCards = filterLabCards(cards, preference({ mode: 'cloze' }));
    expect(clozeCards.map(card => card.unitId)).toEqual([good.id]);
    expect(clozeCards[0]!.cloze).toEqual(analysis.knowledge[0]!.cloze);
    expect(filterLabCards(cards, preference({ mode: 'cloze', source: 'captures' }))).toEqual([]);
  });

  it('never mutates source data, schedules, clozes or organizer arrays', () => {
    const c = capture({ organization: { groupId: crypto.randomUUID(), labelIds: [crypto.randomUUID()] } });
    const lessons = [unit(c)], before = structuredClone({ c, lessons });
    const cards = buildLabCards([c], lessons, now);
    filterLabCards(cards, preference()); sampleLabCards(cards, 0, 'newest');
    cards[0]!.groupIds.push('new'); cards[0]!.labelIds.push('new'); cards[0]!.cloze!.answer = 'changed';
    cards.find(card => card.kind === 'capture')!.labelIds.push('new');
    expect({ c, lessons }).toEqual(before);
  });
});

describe('Lab session sampling', () => {
  it('samples without replacement for any requested count and never mutates input order', () => {
    const cards = sampleCards(), before = [...cards];
    const duplicated = [...cards, cards[0]!];
    expect(sampleLabCards(duplicated, 0, 'random', () => 0)).toEqual(cards);
    for (const count of [1, 2, 5000]) {
      const deck = sampleLabCards(duplicated, count, 'random', () => 0.9999999);
      expect(deck).toHaveLength(Math.min(count, cards.length));
      expect(new Set(deck.map(card => card.id)).size).toBe(deck.length);
    }
    expect(cards).toEqual(before);
  });

  it('handles empty input, hostile random boundaries and invalid defensive counts in a bounded pass', () => {
    const cards = sampleCards();
    expect(sampleLabCards([], 0, 'random')).toEqual([]);
    for (const value of [0, 1, -1, 2, NaN, Infinity]) {
      const deck = sampleLabCards(cards, 0, 'random', () => value);
      expect(new Set(deck.map(card => card.id))).toEqual(new Set(cards.map(card => card.id)));
    }
    for (const count of [-1, NaN, Infinity]) expect(sampleLabCards(cards, count, 'random')).toEqual([]);
    expect(sampleLabCards(cards, 1.9, 'random')).toHaveLength(1);
  });

  it('selects newest entries with deterministic ties and leaves original order intact', () => {
    const cards = sampleCards().map((card, index) => ({ ...card, id: ['b', 'a', 'c'][index]!, createdAt: index < 2 ? 10 : 5 }));
    expect(sampleLabCards(cards, 0, 'newest').map(card => card.id)).toEqual(['a', 'b', 'c']);
    expect(sampleLabCards(cards, 2, 'newest').map(card => card.id)).toEqual(['a', 'b']);
    expect(cards.map(card => card.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('Lab cloze answer matching', () => {
  it('accepts case, Unicode normalization, curly apostrophes, whitespace and surrounding punctuation', () => {
    expect(checkLabAnswer('  “HAD\n\tKNOWN!”  ', 'had known')).toBe(true);
    expect(checkLabAnswer('DON’T', "don't")).toBe(true);
    expect(checkLabAnswer('ｈａｄ ｋｎｏｗｎ', 'had known')).toBe(true);
    expect(checkLabAnswer('café'.normalize('NFD'), 'café')).toBe(true);
    expect(checkLabAnswer("'had known'.", 'had known')).toBe(true);
    expect(normalizeLabAnswer('[(had known)]')).toBe('had known');
  });

  it('preserves meaningful internal punctuation, hyphens, leading apostrophes and nonempty answers', () => {
    expect(checkLabAnswer('re-sign', 'resign')).toBe(false);
    expect(checkLabAnswer('cant', "can't")).toBe(false);
    expect(checkLabAnswer('a b', 'a, b')).toBe(false);
    expect(checkLabAnswer('a/b', 'ab')).toBe(false);
    expect(checkLabAnswer('C++', 'C')).toBe(false);
    expect(checkLabAnswer("'em", 'em')).toBe(false);
    expect(checkLabAnswer('', '')).toBe(false);
    expect(checkLabAnswer('...', '...')).toBe(false);
  });
});
