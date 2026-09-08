import type { Knowledge } from '../domain/models';
export const grammarTopics = [
  { id: 'articles', parent: 'Cụm danh từ', name: 'Mạo từ', level: 'A1', match: /article|mạo từ/ },
  { id: 'plural', parent: 'Cụm danh từ', name: 'Số nhiều & danh từ đếm được', level: 'A1', match: /plural|countable|số nhiều|đếm được/ },
  { id: 'present', parent: 'Thì & thể', name: 'Hiện tại', level: 'A1', match: /present.simple|present.continuous|hiện tại đơn|hiện tại tiếp/ },
  { id: 'past', parent: 'Thì & thể', name: 'Quá khứ', level: 'A2', match: /past.simple|past.continuous|quá khứ đơn|quá khứ tiếp/ },
  { id: 'perfect', parent: 'Thì & thể', name: 'Thể hoàn thành', level: 'B1', match: /perfect|hoàn thành/ },
  { id: 'future', parent: 'Thì & thể', name: 'Diễn đạt tương lai', level: 'A2', match: /future|tương lai/ },
  { id: 'conditional3', parent: 'Câu phức', name: 'Điều kiện loại 3 / hỗn hợp', level: 'B2', match: /conditional.third|conditional.3|conditional.mixed|điều kiện loại 3|hỗn hợp/ },
  { id: 'conditional', parent: 'Câu phức', name: 'Câu điều kiện', level: 'B1', match: /conditional|điều kiện/ },
  { id: 'relative', parent: 'Câu phức', name: 'Mệnh đề quan hệ', level: 'B1', match: /relative|quan hệ/ },
  { id: 'reported', parent: 'Câu phức', name: 'Lời nói gián tiếp', level: 'B1', match: /reported|gián tiếp/ },
  { id: 'passive', parent: 'Động từ', name: 'Bị động', level: 'B1', match: /passive|bị động/ },
  { id: 'modal', parent: 'Động từ', name: 'Động từ khuyết thiếu', level: 'A2', match: /modal|khuyết thiếu/ },
  { id: 'gerund', parent: 'Động từ', name: 'Danh động từ / nguyên mẫu', level: 'B1', match: /gerund|infinitive|danh động|nguyên mẫu/ },
  { id: 'agreement', parent: 'Cấu trúc câu', name: 'Hòa hợp chủ ngữ – động từ', level: 'A2', match: /agreement|hòa hợp/ },
  { id: 'preposition', parent: 'Cấu trúc câu', name: 'Giới từ', level: 'A2', match: /preposition|giới từ/ },
  { id: 'comparison', parent: 'Cấu trúc câu', name: 'So sánh', level: 'A2', match: /comparative|superlative|so sánh/ },
  { id: 'inversion', parent: 'Cấu trúc nâng cao', name: 'Đảo ngữ / nhấn mạnh', level: 'C1', match: /inversion|cleft|đảo ngữ|chẻ|nhấn mạnh/ },
] as const;
export function grammarTopic(k: Knowledge) {
  if (k.kind !== 'grammar') return undefined;
  for (const text of [k.key, k.name, k.group]) { const topic = grammarTopics.find(topic => topic.match.test(text.toLowerCase())); if (topic) return topic; }
  return undefined;
}
