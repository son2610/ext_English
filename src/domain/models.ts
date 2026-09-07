import { z } from 'zod';

const text = z.string().min(1).max(8000);
const short = z.string().min(1).max(500);
export const ExampleSchema = z.object({ en: text, vi: text });
export const KnowledgeSchema = z.object({
  key: short.describe('Stable English canonical identifier; include grammar formula or phrase sense, not source wording'),
  kind: z.enum(['grammar', 'phrase']),
  group: short.describe('Tên nhóm ngữ pháp bằng tiếng Việt; cụm từ dùng nhóm Cụm từ'),
  name: short.describe('Tên tiếng Việt'),
  form: short.describe('Công thức ngữ pháp hoặc cụm từ tiếng Anh'),
  meaningVi: text, explanationVi: text,
  evidence: short.describe('Exact continuous quote present in selected text or context'),
  examples: z.array(ExampleSchema).min(2).max(4),
  production: z.object({ instructionVi: text, answerEn: text }),
  cloze: z.object({ sentence: text, answer: short, hintVi: short }),
});
export const AnalysisSchema = z.object({
  schemaVersion: z.literal(1), meaningVi: text,
  contextNoteVi: text,
  knowledge: z.array(KnowledgeSchema).min(1).max(8),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Knowledge = z.infer<typeof KnowledgeSchema>;
export const GradeSchema = z.object({
  correct: z.boolean(), score: z.number().min(0).max(100),
  feedbackVi: text, correctedEn: text,
  errors: z.array(z.object({ original: short, correction: short, reasonVi: text })).max(12),
});
export type Grade = z.infer<typeof GradeSchema>;
export const SourceSchema = z.object({
  url: z.string().url().max(8000).refine(v => /^https?:\/\//i.test(v)),
  title: z.string().max(1000), frameUrl: z.string().url().max(8000).refine(v => /^https?:\/\//i.test(v)),
  exact: text, prefix: z.string().max(250), suffix: z.string().max(250),
  context: z.string().max(14000), heading: z.string().max(500),
  scrollY: z.number().nonnegative(), capturedAt: z.number().nonnegative(),
});
export type Source = z.infer<typeof SourceSchema>;
export const CaptureSchema = z.object({
  id: z.string().uuid(), source: SourceSchema, note: z.string().max(8000),
  status: z.enum(['saved', 'queued', 'processing', 'ready', 'error']),
  analysis: AnalysisSchema.optional(), error: z.string().max(2000).optional(),
  attempts: z.number().int().nonnegative(), nextAttemptAt: z.number().nonnegative(),
  leaseUntil: z.number().nonnegative(), updatedAt: z.number().nonnegative(),
  unitsCreated: z.boolean().default(false),
});
export type Capture = z.infer<typeof CaptureSchema>;
export const ScheduleSchema = z.object({
  due: z.number().nonnegative(), stability: z.number().nonnegative(), difficulty: z.number().nonnegative(),
  elapsed_days: z.number().nonnegative(), scheduled_days: z.number().nonnegative(),
  reps: z.number().int().nonnegative(), lapses: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3), learning_steps: z.number().int().nonnegative(),
  last_review: z.number().nonnegative().optional(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;
export const UnitSchema = z.object({
  id: z.string().uuid(), canonical: z.string().min(1).max(1024), knowledge: KnowledgeSchema,
  captureIds: z.array(z.string().uuid()).min(1).max(10000),
  schedule: ScheduleSchema, failures: z.number().int().nonnegative(),
  suspended: z.boolean(), leech: z.boolean(), encounters: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(), updatedAt: z.number().nonnegative(),
  alternativeVi: z.string().max(8000).optional(),
});
export type Unit = z.infer<typeof UnitSchema>;
export type ExerciseMode = 'production' | 'cloze' | 'transfer';
export const ReviewSchema = z.object({
  id: z.string().uuid(), unitId: z.string().uuid(), at: z.number().nonnegative(),
  rating: z.number().int().min(1).max(4), mode: z.enum(['production', 'cloze', 'transfer']),
  answer: z.string().max(8000), grade: GradeSchema.optional(),
  prior: ScheduleSchema, next: ScheduleSchema,
  durationMs: z.number().nonnegative(), assisted: z.boolean(),
});
export type Review = z.infer<typeof ReviewSchema>;
export const SettingsSchema = z.object({
  model: z.string().regex(/^[a-zA-Z0-9._-]+$/).max(100).default('gemini-3.5-flash'),
  retention: z.number().min(0.8).max(0.97).default(0.9),
  highlighting: z.boolean().default(false),
  backupDays: z.number().int().min(1).max(30).default(7),
  autoBackup: z.boolean().default(true),
  dailyNewLimit: z.number().int().min(1).max(50).default(10),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const defaultSettings = SettingsSchema.parse({});

export function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}
export function canonical(k: Knowledge): string {
  return `${k.kind}:${normalize(k.key)}`;
}
export function validateAnalysis(raw: unknown, source: Source): Analysis {
  const analysis = AnalysisSchema.parse(raw);
  const original = normalize(source.exact + ' ' + source.context);
  for (const item of analysis.knowledge) {
    if (!original.includes(normalize(item.evidence))) throw new Error('AI trích dẫn nội dung không có trong ngữ cảnh. Hãy thử phân tích lại.');
    if ((item.cloze.sentence.match(/\[\[blank\]\]/g) ?? []).length !== 1) throw new Error('Bài điền khuyết phải có đúng một chỗ trống.');
    const restored = normalize(item.cloze.sentence.replace('[[blank]]', item.cloze.answer));
    if (!original.includes(restored)) throw new Error('Bài điền khuyết không khớp câu gốc.');
  }
  return analysis;
}
