import { z } from 'zod';

export interface GeminiJsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, GeminiJsonSchema>;
  required?: string[];
  items?: GeminiJsonSchema;
  additionalProperties?: boolean;
  anyOf?: GeminiJsonSchema[];
}

/** Keep the server's decoding grammar small; Zod remains the strict local validator. */
export function geminiSchema(schema: z.ZodType): GeminiJsonSchema {
  function convert(raw: Record<string, unknown>): GeminiJsonSchema {
    const result: GeminiJsonSchema = {};
    if (typeof raw.type === 'string' || Array.isArray(raw.type)) result.type = raw.type as string | string[];
    if (Array.isArray(raw.enum)) result.enum = raw.enum;
    if ('const' in raw) result.enum = [raw.const];
    const hints = typeof raw.description === 'string' ? [raw.description] : [];
    for (const [key, description] of [['minLength', 'Minimum characters'], ['maxLength', 'Maximum characters'], ['minItems', 'Minimum items'], ['maxItems', 'Maximum items'], ['minimum', 'Minimum value'], ['maximum', 'Maximum value']] as const) {
      if (typeof raw[key] === 'number') hints.push(`${description}: ${raw[key]}.`);
    }
    if (hints.length) result.description = hints.join(' ');
    if (raw.properties && typeof raw.properties === 'object') result.properties = Object.fromEntries(Object.entries(raw.properties).map(([key, value]) => [key, convert(value as Record<string, unknown>)]));
    if (Array.isArray(raw.required)) result.required = raw.required as string[];
    if (raw.items && typeof raw.items === 'object') result.items = convert(raw.items as Record<string, unknown>);
    if (typeof raw.additionalProperties === 'boolean') result.additionalProperties = raw.additionalProperties;
    if (Array.isArray(raw.anyOf)) result.anyOf = raw.anyOf.map(value => convert(value as Record<string, unknown>));
    return result;
  }
  return convert(z.toJSONSchema(schema, { reused: 'inline' }));
}
