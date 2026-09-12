import { z } from 'zod';
import type { AIConnection } from '../domain/ai-config';
import type { Usage } from '../domain/enrichment';
import { AIError, geminiHttpError, redact, stages } from './gemini-errors';
import type { GeminiJsonSchema } from './gemini-schema';

export interface AIRoute { connection: AIConnection; key: string; permitted?: boolean }
export interface GenerationRequest {
  route: AIRoute; model: string; system: string; input: string; schema: GeminiJsonSchema;
  purpose: Usage['task']; jsonOnly: boolean; signal: AbortSignal;
}
export interface Generation { text: string; tokens: number }

/** OpenAI strict mode requires every property; optional values use null on the wire only. */
export function strictSchema(schema: GeminiJsonSchema): GeminiJsonSchema {
  const result = { ...schema };
  if (schema.properties) {
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => {
      const converted = strictSchema(child);
      return [key, schema.required?.includes(key) ? converted : { anyOf: [converted, { type: 'null' }] }];
    }));
    result.required = Object.keys(schema.properties); result.additionalProperties = false;
  }
  if (schema.items) result.items = strictSchema(schema.items);
  if (schema.anyOf) result.anyOf = schema.anyOf.map(strictSchema);
  return result;
}
export function restoreOptionals(value: unknown, schema: GeminiJsonSchema): unknown {
  if (Array.isArray(value) && schema.items) return value.map(x => restoreOptionals(x, schema.items!));
  if (value && typeof value === 'object' && schema.properties) {
    return Object.fromEntries(Object.entries(value).filter(([key, v]) => !(v === null && schema.properties![key] && !schema.required?.includes(key)))
      .map(([key, v]) => [key, schema.properties![key] ? restoreOptionals(v, schema.properties![key]) : v]));
  }
  return value;
}
export function invalidOutput(detail = 'AI trả dữ liệu thiếu hoặc sai cấu trúc JSON.'): AIError { return new AIError(detail, true, 0, false, 'invalid_output'); }
function refusal(): AIError { return new AIError('Nhà cung cấp AI từ chối nội dung này. Hãy kiểm tra đoạn đã chọn; yêu cầu đã dừng.', false, 0, false, 'refusal', false); }

async function compatibleHttpError(response: Response, request: GenerationRequest): Promise<AIError> {
  const remote = z.object({ error: z.object({ message: z.string().optional(), code: z.union([z.string(), z.number()]).optional(), type: z.string().optional() }) }).safeParse(await response.json().catch(() => undefined));
  const message = remote.success ? remote.data.error.message ?? '' : '';
  const remoteCode = remote.success ? String(remote.data.error.code ?? remote.data.error.type ?? '') : '';
  if (/content_filter|content_policy|safety|sensitive_content/i.test(remoteCode)) return refusal();
  const schemaRejected = response.status === 400 && /schema|response_format|structured.?output/i.test(message);
  const retry = response.headers.get('retry-after');
  const delay = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
  const reason = response.status === 401 || response.status === 403 ? 'Kiểm tra API key và quyền truy cập model.'
    : response.status === 402 ? 'Tài khoản AI cần bổ sung số dư.' : response.status === 404 ? 'Kiểm tra tên model và địa chỉ API.'
    : response.status === 429 ? 'Nhà cung cấp đang giới hạn lượt gọi.' : 'Yêu cầu AI chưa hoàn tất.';
  return new AIError(`${stages[request.purpose]} · ${request.route.connection.name} · ${request.model} · HTTP ${response.status}. ${reason}${message ? ` Chi tiết: ${redact(message, request.route.key).slice(0, 800)}` : ''}`,
    response.status === 408 || response.status === 429 || response.status >= 500,
    Number.isFinite(delay) ? Math.max(0, Math.min(delay, 86400000)) : 0, schemaRejected, `http_${response.status}`);
}

/** Only this adapter knows provider envelopes. It never accepts or saves learning data. */
export async function generate(request: GenerationRequest): Promise<Generation> {
  const { route, model, system, input, schema, jsonOnly, signal } = request;
  const { provider, baseUrl } = route.connection;
  const gemini = provider === 'gemini';
  const strict = provider === 'openai' && !jsonOnly;
  const instructions = `${system}\nTrả một JSON đúng cấu trúc và giới hạn sau, không Markdown. Không thêm trường khác: ${JSON.stringify(strict ? strictSchema(schema) : schema)}`;
  const url = gemini ? `${baseUrl}/models/${encodeURIComponent(model)}:generateContent` : `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = gemini ? {
    systemInstruction: { parts: [{ text: system }, ...(jsonOnly ? [{ text: instructions }] : [])] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseMimeType: 'application/json', ...(!jsonOnly ? { responseJsonSchema: schema } : {}), temperature: 0.3, maxOutputTokens: 10000 },
  } : {
    model, stream: false,
    messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }],
    response_format: strict ? { type: 'json_schema', json_schema: { name: 'lumaread_response', strict: true, schema: strictSchema(schema) } } : { type: 'json_object' },
    ...(provider === 'openai' ? { max_completion_tokens: 10000 } : { max_tokens: 10000 }),
    ...(provider === 'deepseek' || provider === 'zai' ? { thinking: { type: 'disabled' } } : {}),
  };
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: gemini ? { 'Content-Type': 'application/json', 'x-goog-api-key': route.key } : { 'Content-Type': 'application/json', Authorization: `Bearer ${route.key}` }, body: JSON.stringify(body) });
  } catch { throw new AIError(`${stages[request.purpose]} · ${route.connection.name} · ${model}. Mất mạng hoặc AI phản hồi quá chậm. Đoạn đã lưu vẫn an toàn.`, true, 0, false, 'network'); }
  if (!response.ok) {
    const error = gemini ? await geminiHttpError(response, model, request.purpose, route.key) : await compatibleHttpError(response, request);
    if (gemini) error.code = `http_${response.status}`;
    throw error;
  }
  let envelope: unknown;
  try { envelope = await response.json(); } catch { if (signal.aborted) throw new AIError('AI phản hồi quá chậm khi tải kết quả.', true, 0, false, 'network'); throw invalidOutput(); }
  if (gemini) {
    const parsed = z.object({ promptFeedback: z.object({ blockReason: z.string().optional() }).optional(), candidates: z.array(z.object({ finishReason: z.string().optional(), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional(), usageMetadata: z.object({ totalTokenCount: z.number().nonnegative().optional() }).optional() }).safeParse(envelope);
    if (!parsed.success) throw invalidOutput();
    const candidate = parsed.data.candidates?.[0];
    if (parsed.data.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|SPII/.test(candidate?.finishReason ?? '')) throw refusal();
    if (!candidate?.content || (candidate.finishReason && candidate.finishReason !== 'STOP')) throw invalidOutput('AI chưa trả kết quả đầy đủ. Hãy chọn đoạn ngắn hơn nếu lỗi lặp lại.');
    return { text: candidate.content.parts.filter(p => !p.thought).map(p => p.text ?? '').join(''), tokens: parsed.data.usageMetadata?.totalTokenCount ?? 0 };
  }
  const parsed = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }) })), usage: z.object({ total_tokens: z.number().nonnegative().optional() }).optional() }).safeParse(envelope);
  if (!parsed.success) throw invalidOutput();
  const choice = parsed.data.choices[0];
  if (choice?.message.refusal || /content_filter|sensitive/.test(choice?.finish_reason ?? '')) throw refusal();
  if (!choice?.message.content || choice.finish_reason !== 'stop') throw invalidOutput('AI chưa trả JSON đầy đủ hoặc câu trả lời đã bị cắt ngắn.');
  return { text: choice.message.content, tokens: parsed.data.usage?.total_tokens ?? 0 };
}
