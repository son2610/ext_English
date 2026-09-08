import type { Knowledge, Unit } from '../domain/models';
import { grammarTopic } from './taxonomy';
export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export interface Familiarity { level?: Level; rank?: number; priority: number; basis: 'word-rank' | 'grammar-map' | 'unknown' }
export function parseFrequency(text: string): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const [i, line] of text.split(/\r?\n/).entries()) { const [word, count] = line.split(' '); if (word && Number(count) > 0) ranks.set(word, i + 1); }
  return ranks;
}
const common = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'be', 'have', 'would']);
export function familiarity(k: Knowledge, ranks: Map<string, number>): Familiarity {
  const topic = grammarTopic(k);
  if (topic) return { level: topic.level, priority: ['A1', 'A2'].includes(topic.level) ? 4 : topic.level === 'B1' ? 3 : 2, basis: 'grammar-map' };
  if (k.kind === 'grammar') return { priority: 2, basis: 'unknown' };
  const words = k.form.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const content = words.filter(w => !common.has(w));
  const selected = content.length ? content : words;
  if (!selected.length || selected.some(w => !ranks.has(w))) return { priority: 1, basis: 'unknown' };
  const rank = Math.max(...selected.map(w => ranks.get(w)!));
  const level: Level = rank <= 1000 ? 'A1' : rank <= 2500 ? 'A2' : rank <= 5000 ? 'B1' : rank <= 10000 ? 'B2' : rank <= 20000 ? 'C1' : 'C2';
  return { rank, level, priority: rank <= 2500 ? 4 : rank <= 5000 ? 3 : rank <= 10000 ? 2 : 1, basis: 'word-rank' };
}
let frequencyPromise: Promise<Map<string, number>> | undefined;
export function loadFrequency() {
  frequencyPromise ??= fetch(chrome.runtime.getURL('data/en-frequency.txt')).then(r => { if (!r.ok) throw new Error('Không đọc được dữ liệu tần suất offline.'); return r.text(); }).then(parseFrequency).catch(error => { frequencyPromise = undefined; throw error; });
  return frequencyPromise;
}
export function learningPriority(unit: Unit, ranks: Map<string, number>, learnerLevel: Level = 'B1') {
  if (unit.priority === 'high') return 10; if (unit.priority === 'low') return 0;
  const info = familiarity(unit.knowledge, ranks); const levels: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const distance = info.level ? levels.indexOf(info.level) - levels.indexOf(learnerLevel) : 0;
  return Math.max(0.25, info.priority - Math.max(0, distance - 1) * 0.5);
}
