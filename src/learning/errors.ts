import type { Assessment } from '../domain/enrichment';
import type { ErrorCategory } from '../domain/error-categories';
import type { Grade } from '../domain/models';

export function tokens(text: string): string[] { return text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)?|\d+/g) ?? []; }
const articles = new Set(['a', 'an', 'the']);
const prepositions = new Set(['in', 'on', 'at', 'by', 'for', 'from', 'of', 'to', 'with', 'into', 'about', 'over']);
const auxiliary = new Set(['do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'must', 'may', 'might', 'not', "don't", "doesn't", "didn't"]);
export function classifyError(original: string, correction: string): ErrorCategory {
  const a = tokens(original), b = tokens(correction);
  const changed = [...a.filter(x => !b.includes(x)), ...b.filter(x => !a.includes(x))];
  if (changed.some(x => articles.has(x))) return 'article';
  if (changed.some(x => prepositions.has(x))) return 'preposition';
  if (changed.some(x => auxiliary.has(x))) return 'auxiliary';
  if (changed.some(x => ['have', 'has', 'had', 'been', 'was', 'were'].includes(x)) || (a.length === 1 && b.length === 1 && (a[0]!.replace(/ed$/, '') === b[0] || b[0]!.replace(/ed$/, '') === a[0]))) return 'tense_aspect';
  if (a.length === 1 && b.length === 1 && (a[0]!.replace(/s$/, '') === b[0] || b[0]!.replace(/s$/, '') === a[0])) return 'plural';
  if (a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ') && a.join(' ') !== b.join(' ')) return 'word_order';
  return 'other';
}
export interface Alignment { expected: string; actual: string; kind: 'equal' | 'missing' | 'extra' | 'replace' }
export function alignDictation(expected: string, actual: string): Alignment[] {
  if (tokens(expected).length > 300 || tokens(actual).length > 300) throw new Error('Bài nghe chép chính tả giới hạn 300 từ. Hãy chọn đoạn ngắn hơn.');
  const a = tokens(expected).slice(0, 300), b = tokens(actual).slice(0, 300);
  const costs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) costs[i]![0] = i;
  for (let j = 0; j <= b.length; j++) costs[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) costs[i]![j] = Math.min(costs[i - 1]![j]! + 1, costs[i]![j - 1]! + 1, costs[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  const result: Alignment[] = []; let i = a.length, j = b.length;
  while (i || j) {
    if (i && j && costs[i]![j] === costs[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)) { result.push({ expected: a[i - 1]!, actual: b[j - 1]!, kind: a[i - 1] === b[j - 1] ? 'equal' : 'replace' }); i--; j--; }
    else if (i && costs[i]![j] === costs[i - 1]![j]! + 1) { result.push({ expected: a[i - 1]!, actual: '', kind: 'missing' }); i--; }
    else { result.push({ expected: '', actual: b[j - 1]!, kind: 'extra' }); j--; }
  }
  return result.reverse();
}
export function gradeDictation(expected: string, actual: string): Grade {
  const alignment = alignDictation(expected, actual), wrong = alignment.filter(x => x.kind !== 'equal');
  return { correct: !wrong.length, score: Math.round(100 * Math.max(0, 1 - wrong.length / Math.max(1, tokens(expected).length))), correctedEn: expected,
    feedbackVi: wrong.length ? `Có ${wrong.length} vị trí khác lời gốc. Bỏ qua viết hoa và dấu câu; cách rút gọn vẫn được đối chiếu nguyên dạng.` : 'Bạn đã nghe và viết đúng các từ trong câu.',
    errors: wrong.map(item => ({ original: item.actual || '(bỏ sót)', correction: item.expected || '(bỏ từ thừa)', category: classifyError(item.actual, item.expected), reasonVi: item.kind === 'missing' ? 'Bạn bỏ sót từ này khi nghe.' : item.kind === 'extra' ? 'Lời gốc không có từ này.' : 'Từ bạn viết khác lời gốc.', l1NoteVi: articles.has(item.expected) || /s$|ed$/.test(item.expected) ? 'Tiếng Việt không đánh dấu mạo từ, số nhiều và thì theo cùng cách; hãy nghe kỹ phần từ nhỏ hoặc âm cuối. Đây là gợi ý luyện nghe, không khẳng định nguyên nhân lỗi.' : undefined })) };
}
export function errorProfile(assessments: Assessment[], now = Date.now()) {
  const rows = new Map<ErrorCategory, { category: ErrorCategory; count: number; recent: number; units: Set<string>; examples: Grade['errors'] }>();
  for (const assessment of assessments) for (const error of assessment.grade.errors) {
    const category = error.category ?? classifyError(error.original, error.correction);
    const row = rows.get(category) ?? { category, count: 0, recent: 0, units: new Set<string>(), examples: [] };
    row.count++; if (assessment.at >= now - 30 * 86400000) row.recent++;
    row.units.add(assessment.unitId); row.examples.push(error); rows.set(category, row);
  }
  return [...rows.values()].map(r => ({ ...r, examples: r.examples.slice(-4) })).sort((a, b) => b.recent - a.recent || b.count - a.count);
}
