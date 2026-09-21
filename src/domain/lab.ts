import { z } from 'zod';
import type { Capture, Unit } from './models';

export type LabMode = 'stream' | 'bubbles' | 'cloze' | 'match' | 'choice';

export const LabPreferencesSchema = z.object({
  mode: z.enum(['stream', 'bubbles', 'cloze', 'match', 'choice']).default('stream'),
  source: z.enum(['all', 'captures', 'phrases', 'grammar']).default('all'),
  scope: z.enum(['all', 'due', 'difficult']).default('all'),
  groupId: z.string().max(100).default(''),
  labelId: z.string().max(100).default(''),
  count: z.number().int().min(0).max(5000).default(20),
  seconds: z.number().min(0.6).max(10).default(2),
  order: z.enum(['random', 'newest']).default('random'),
  hideMeaning: z.boolean().default(false),
  repeat: z.boolean().default(false),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  // Multiple choice: English prompt → Vietnamese options, the reverse, or a random mix per question.
  direction: z.enum(['en-vi', 'vi-en', 'mixed']).default('en-vi'),
});
export type LabPreferences = z.infer<typeof LabPreferencesSchema>;
export const defaultLabPreferences: LabPreferences = LabPreferencesSchema.parse({});

export interface LabCard {
  id: string;
  english: string;
  meaningVi: string;
  meaningLabel: 'Nghĩa tiếng Việt' | 'Ghi chú của bạn';
  kind: 'capture' | 'phrase' | 'grammar';
  groupIds: string[];
  labelIds: string[];
  due: boolean;
  difficult: boolean;
  createdAt: number;
  unitId?: string;
  captureId?: string;
  cloze?: { sentence: string; answer: string; hintVi: string };
}

function safeCapture(capture: Capture): boolean {
  return !(capture.source.video && capture.analysis?.transcript?.uncertain && !capture.transcriptApproved);
}

function difficult(unit: Unit): boolean {
  return unit.leech || unit.failures >= 3 || unit.schedule.difficulty >= 8;
}

function normalizeContext(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function validCloze(unit: Unit, captures: Capture[]): LabCard['cloze'] {
  const { sentence, answer, hintVi } = unit.knowledge.cloze;
  if ((sentence.match(/\[\[blank\]\]/g) ?? []).length !== 1 ||
      !answer.trim() || !hintVi.trim() || answer.includes('[[blank]]')) return undefined;
  // A backup or a later source edit can leave a structurally valid but ungrounded exercise.
  // Only use a cloze that still occurs in at least one of this unit's verified contexts.
  const restored = normalizeContext(sentence.replace('[[blank]]', () => answer));
  const grounded = captures.some(capture => [
    capture.source.exact, capture.source.originalExact ?? '', capture.source.context,
    capture.source.video ? capture.analysis?.transcript?.textEn ?? '' : '',
  ].some(text => normalizeContext(text).includes(restored)));
  return grounded ? { sentence: sentence.trim(), answer: answer.trim(), hintVi: hintVi.trim() } : undefined;
}

/** Derive a read-only practice deck; these cards never alter an FSRS schedule. */
export function buildLabCards(captures: Capture[], units: Unit[], now = Date.now()): LabCard[] {
  const safeCaptures = new Map(captures.filter(safeCapture).map(capture => [capture.id, capture]));
  const linked = new Map<string, Unit[]>();
  const cards: LabCard[] = [];
  const unitIds = new Set<string>();
  for (const unit of units) {
    if (unit.suspended || unit.reportedIssue?.trim() || unitIds.has(unit.id)) continue;
    const english = unit.knowledge.form.trim(), meaningVi = unit.knowledge.meaningVi.trim();
    if (!english || !meaningVi) continue;
    const parents = [...new Set(unit.captureIds)].flatMap(id => {
      const capture = safeCaptures.get(id);
      return capture ? [capture] : [];
    });
    if (!parents.length) continue;
    unitIds.add(unit.id);
    for (const capture of parents) {
      const list = linked.get(capture.id) ?? [];
      list.push(unit);
      linked.set(capture.id, list);
    }
    cards.push({
      id: `unit:${unit.id}`, unitId: unit.id,
      english, meaningVi, meaningLabel: 'Nghĩa tiếng Việt', kind: unit.knowledge.kind,
      groupIds: [...new Set(parents.flatMap(c => c.organization?.groupId ? [c.organization.groupId] : []))],
      labelIds: [...new Set(parents.flatMap(c => c.organization?.labelIds ?? []))],
      due: unit.schedule.due <= now, difficult: difficult(unit), createdAt: unit.createdAt,
      cloze: validCloze(unit, parents),
    });
  }
  for (const capture of safeCaptures.values()) {
    const english = capture.source.exact.trim();
    const translation = capture.analysis?.meaningVi.trim();
    const meaningVi = translation || capture.note.trim();
    if (!english || !meaningVi) continue;
    const related = linked.get(capture.id) ?? [];
    cards.push({
      id: `capture:${capture.id}`, captureId: capture.id,
      english, meaningVi, meaningLabel: translation ? 'Nghĩa tiếng Việt' : 'Ghi chú của bạn', kind: 'capture',
      groupIds: capture.organization?.groupId ? [capture.organization.groupId] : [],
      labelIds: [...new Set(capture.organization?.labelIds ?? [])],
      due: related.some(unit => unit.schedule.due <= now), difficult: related.some(difficult),
      createdAt: capture.source.capturedAt,
    });
  }
  return cards;
}

/** Match tiles and choice options stay readable; long sentences belong to the stream and cloze modes. */
export const GAME_TEXT_LIMITS = { english: 120, meaning: 160 } as const;
export function gameReady(card: LabCard): boolean {
  return card.english.length <= GAME_TEXT_LIMITS.english && card.meaningVi.length <= GAME_TEXT_LIMITS.meaning;
}
export const isGameMode = (mode: LabMode) => mode === 'match' || mode === 'choice';

export function filterLabCards(cards: LabCard[], preferences: LabPreferences): LabCard[] {
  return cards.filter(card =>
    (preferences.source === 'all' ||
      (preferences.source === 'captures' && card.kind === 'capture') ||
      (preferences.source === 'phrases' && card.kind === 'phrase') ||
      (preferences.source === 'grammar' && card.kind === 'grammar')) &&
    (preferences.scope === 'all' || (preferences.scope === 'due' ? card.due : card.difficult)) &&
    (!preferences.groupId || card.groupIds.includes(preferences.groupId)) &&
    (!preferences.labelId || card.labelIds.includes(preferences.labelId)) &&
    (preferences.mode !== 'cloze' || !!card.cloze) &&
    (!isGameMode(preferences.mode) || gameReady(card)),
  );
}

/** Sample once without replacement; count=0 means every unique card. */
export function sampleLabCards(cards: LabCard[], count: number, order: LabPreferences['order'], random = Math.random): LabCard[] {
  const unique = new Map<string, LabCard>();
  for (const card of cards) if (!unique.has(card.id)) unique.set(card.id, card);
  const deck = [...unique.values()];
  const limit = count === 0 ? deck.length : Math.min(deck.length, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
  if (order === 'newest') {
    deck.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    return deck.slice(0, limit);
  }
  // Partial Fisher–Yates: O(n) preparation and O(requested count) swaps, no retry loop.
  for (let i = 0; i < limit; i++) {
    const value = random();
    const bounded = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const target = i + Math.min(deck.length - i - 1, Math.floor(bounded * (deck.length - i)));
    [deck[i], deck[target]] = [deck[target]!, deck[i]!];
  }
  return deck.slice(0, limit);
}

/** Be forgiving about presentation while preserving the punctuation inside an answer. */
export function normalizeLabAnswer(text: string): string {
  let result = text.normalize('NFKC').toLowerCase().replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim();
  // Do not strip hyphens, plus signs, slash characters or leading apostrophes in 'em / 'tis.
  const boundary = /^[\s.,!?;:"“”„«»‹›()[\]{}]+|[\s.,!?;:"“”„«»‹›()[\]{}]+$/g;
  result = result.replace(boundary, '');
  while (result.startsWith("'") && result.endsWith("'") && result.length > 1) {
    result = result.slice(1, -1).trim().replace(boundary, '');
  }
  return result;
}

export function checkLabAnswer(answer: string, expected: string): boolean {
  const normalized = normalizeLabAnswer(answer);
  return !!normalized && normalized === normalizeLabAnswer(expected);
}
