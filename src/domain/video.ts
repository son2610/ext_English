import { z } from 'zod';
export const VideoSourceSchema = z.object({
  provider: z.literal('youtube'), videoId: z.string().regex(/^[\w-]{11}$/),
  start: z.number().min(0).max(604800), end: z.number().min(0).max(604800),
  language: z.string().max(30), automatic: z.boolean(),
  timing: z.enum(['track', 'observed', 'manual']),
  captionSource: z.enum(['text-track', 'timedtext', 'transcript-dom', 'rendered', 'manual']),
}).refine(v => v.end > v.start && v.end - v.start <= 90, 'Khoảng video phải dài hơn 0 và không quá 90 giây.');
export type VideoSource = z.infer<typeof VideoSourceSchema>;
export const TranscriptRepairSchema = z.object({
  textEn: z.string().min(1).max(8000), uncertain: z.boolean(), warningVi: z.string().max(2000),
  changes: z.array(z.object({ original: z.string().max(1000), corrected: z.string().max(1000), reasonVi: z.string().max(2000) })).max(20),
});
export type TranscriptRepair = z.infer<typeof TranscriptRepairSchema>;
