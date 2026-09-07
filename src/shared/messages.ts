import { z } from 'zod';
import { SourceSchema } from '../domain/models';
export const ContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('capture'), source: SourceSchema, note: z.string().max(8000), analyze: z.boolean() }),
  z.object({ type: z.literal('open-editor'), source: SourceSchema }),
  z.object({ type: z.literal('lexicon') }),
  z.object({ type: z.literal('encounter'), unitIds: z.array(z.string().uuid()).max(100) }),
]);
export { send, type Reply } from './client';
