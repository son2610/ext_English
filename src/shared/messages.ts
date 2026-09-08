import { z } from 'zod';
import { SourceSchema } from '../domain/models';
const pageUrl = z.string().url().max(8000);
export const ContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('capture'), source: SourceSchema, note: z.string().max(8000), analyze: z.boolean() }),
  z.object({ type: z.literal('open-editor'), source: SourceSchema }),
  z.object({ type: z.literal('lexicon') }),
  z.object({ type: z.literal('encounter'), unitIds: z.array(z.string().uuid()).max(100) }),
  z.object({ type: z.literal('video-open-editor'), pageUrl, sources: z.array(SourceSchema).min(1).max(8), preferred: z.number().int().min(0).max(7), status: z.string().max(2000) }),
  z.object({ type: z.literal('video-fetch-track'), pageUrl, videoId: z.string().regex(/^[\w-]{11}$/), url: z.string().url().max(16000), language: z.string().max(30), automatic: z.boolean() }),
  z.object({ type: z.literal('video-notes'), pageUrl, videoId: z.string().regex(/^[\w-]{11}$/) }),
  z.object({ type: z.literal('video-ready'), pageUrl, videoId: z.string().regex(/^[\w-]{11}$/) }),
  z.object({ type: z.literal('video-release-batch'), pageUrl, videoId: z.string().regex(/^[\w-]{11}$/) }),
  z.object({ type: z.literal('video-open-library') }),
]);
export { send, type Reply } from './client';
