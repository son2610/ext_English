export const errorCategories = ['article', 'tense_aspect', 'preposition', 'plural', 'word_order', 'agreement', 'word_choice', 'auxiliary', 'spelling', 'other'] as const;
export type ErrorCategory = typeof errorCategories[number];
export const errorLabels: Record<ErrorCategory, string> = {
  article: 'Mạo từ', tense_aspect: 'Thì / thể', preposition: 'Giới từ', plural: 'Số nhiều',
  word_order: 'Trật tự từ', agreement: 'Hòa hợp chủ ngữ – động từ', word_choice: 'Chọn từ / sắc thái',
  auxiliary: 'Trợ động từ', spelling: 'Chính tả / nghe nhầm', other: 'Chưa phân loại',
};
