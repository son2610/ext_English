import type { Pattern } from '../content/matcher';
// Deliberately small, audited morphological families; no fuzzy stemming on reading pages.
const families = [
  'be am is are was were been being', 'have has had having', 'do does did done doing',
  'go goes went gone going', 'get gets got gotten getting', 'take takes took taken taking',
  'make makes made making', 'give gives gave given giving', 'write writes wrote written writing',
  'read reads reading', 'run runs ran running', 'come comes came coming', 'see sees saw seen seeing',
  'know knows knew known knowing', 'think thinks thought thinking', 'say says said saying',
  'find finds found finding', 'leave leaves left leaving', 'keep keeps kept keeping',
  'put puts putting', 'set sets setting', 'build builds built building', 'use uses used using',
  'work works worked working', 'look looks looked looking', 'want wants wanted wanting',
  'need needs needed needing', 'start starts started starting', 'learn learns learned learnt learning',
  'try tries tried trying', 'apply applies applied applying', 'change changes changed changing',
  'child children', 'person people', 'man men', 'woman women', 'foot feet', 'tooth teeth',
];
const forms = new Map(families.flatMap(f => { const words = f.split(' '); return words.map(w => [w, words] as const); }));
export function expandInflections(patterns: Pattern[], maximum = 12000): Pattern[] {
  const result: Pattern[] = []; const seen = new Set<string>();
  for (const pattern of patterns) {
    const words = pattern.text.toLowerCase().split(/\s+/); const variants = [words];
    // One morphological slot per phrase avoids combinatorial expansion and dubious rewrites.
    const index = words.findIndex(word => forms.has(word));
    if (index >= 0) for (const form of forms.get(words[index]!)!) variants.push(words.map((w, i) => i === index ? form : w));
    for (const variant of variants) { const text = variant.join(' '); const key = `${pattern.id}:${text}`; if (!seen.has(key) && result.length < maximum) { seen.add(key); result.push({ ...pattern, text, meaning: text === pattern.text.toLowerCase() ? pattern.meaning : `${pattern.meaning} · Dạng biến đổi của “${pattern.text}”; kiểm tra nghĩa theo ngữ cảnh.` }); } }
  }
  return result;
}
