import { z } from 'zod';
import { GradeSchema } from './models';
import { errorCategories } from './error-categories';
export const AssessmentSchema = z.object({
  id: z.string().min(1).max(200), unitId: z.string().uuid(), at: z.number().nonnegative(),
  mode: z.enum(['production', 'cloze', 'transfer', 'dictation', 'targeted']),
  prompt: z.string().max(8000), answer: z.string().max(8000), grade: GradeSchema,
  origin: z.enum(['ai', 'dictation', 'legacy']),
});
export type Assessment = z.infer<typeof AssessmentSchema>;
export const UsageSchema = z.object({
  id: z.string().uuid(), at: z.number().nonnegative(), day: z.string(), month: z.string(),
  model: z.string().max(100), task: z.enum(['analysis', 'transcript', 'grading', 'explanation', 'targeted', 'weekly']),
  status: z.enum(['started', 'success', 'failed']), tokens: z.number().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;
export const DrillSchema = z.object({
  instructionVi: z.string().min(1).max(5000), answerEn: z.string().min(1).max(3000),
  explanationVi: z.string().min(1).max(5000), category: z.enum(errorCategories),
});
export type Drill = z.infer<typeof DrillSchema>;
export const PracticeSchema = DrillSchema.extend({ id: z.string().uuid(), unitId: z.string().uuid(), createdAt: z.number().nonnegative(), completedAt: z.number().nonnegative().optional() });
export type Practice = z.infer<typeof PracticeSchema>;
export const WeeklyTextSchema = z.object({
  titleVi: z.string().min(1).max(300), textEn: z.string().min(1).max(10000), meaningVi: z.string().min(1).max(10000),
  coverage: z.array(z.object({ unitId: z.string().uuid(), quote: z.string().min(1).max(1000) })).min(1).max(8),
});
export const WeeklySchema = WeeklyTextSchema.extend({ id: z.string().uuid(), week: z.string().max(20), createdAt: z.number().nonnegative() });
export type Weekly = z.infer<typeof WeeklySchema>;
export const DictionarySchema = z.object({
  id: z.string().min(1).max(150), word: z.string().max(100), checkedAt: z.number().nonnegative(),
  status: z.enum(['found', 'not_found']), phonetic: z.string().max(200),
  definitions: z.array(z.object({ partOfSpeech: z.string().max(100), definition: z.string().max(3000), example: z.string().max(3000).optional() })).max(8),
  sources: z.array(z.string().url()).max(10), license: z.string().max(500),
});
export type DictionaryEntry = z.infer<typeof DictionarySchema>;
export const OptimizationSchema = z.object({
  id: z.string().uuid(), at: z.number().nonnegative(), reviews: z.number().int().nonnegative(),
  trainingSamples: z.number().int().nonnegative(), validationSamples: z.number().int().nonnegative(),
  baselineLoss: z.number().finite(), candidateLoss: z.number().finite(), applied: z.boolean(),
  weights: z.array(z.number().finite()).length(21), previousWeights: z.array(z.number().finite()).length(21),
  noteVi: z.string().max(4000),
});
export type Optimization = z.infer<typeof OptimizationSchema>;
