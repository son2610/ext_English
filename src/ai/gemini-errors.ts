import { z } from 'zod';
import type { Usage } from '../domain/enrichment';

export class AIError extends Error {
  constructor(message: string, public retryable: boolean, public retryAfterMs = 0, public schemaRejected = false) { super(message); }
}
const stages: Record<Usage['task'], string> = { analysis: 'Phân tích ngữ pháp', transcript: 'Phục hồi phụ đề', grading: 'Chấm bài', explanation: 'Giải thích lại', targeted: 'Tạo bài luyện', weekly: 'Tổng hợp tuần' };
const errorSchema = z.object({ error: z.object({
  message: z.string().optional(), status: z.string().optional(),
  details: z.array(z.object({ reason: z.string().optional(), fieldViolations: z.array(z.object({ field: z.string().optional(), description: z.string().optional() })).optional() })).optional(),
}) });

function redact(text: string, key: string): string {
  let safe = text;
  for (const secret of [key, key.trim(), encodeURIComponent(key.trim())].filter(Boolean)) safe = safe.split(secret).join('[đã ẩn khoá]');
  return safe.replace(/AIza[\w-]{20,}/g, '[đã ẩn khoá]').replace(/([?&](?:key|api_key)=)[^\s&"']+/gi, '$1[đã ẩn khoá]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

export async function geminiHttpError(response: Response, model: string, task: Usage['task'], key: string): Promise<AIError> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => undefined));
  const remote = parsed.success ? parsed.data.error : undefined;
  const reasons = remote?.details?.map(d => d.reason ?? '').join(' ') ?? '';
  const fields = remote?.details?.flatMap(d => d.fieldViolations ?? []).map(v => [v.field, v.description].filter(Boolean).join(': ')).join('; ') ?? '';
  const detail = [remote?.message, fields].filter(Boolean).join(' · ');
  const status = remote?.status?.replace(/[^A-Z_]/g, '').slice(0, 60) ?? '';
  const auth = response.status === 401 || response.status === 403 || /API_KEY|AUTHENTICATION|PERMISSION_DENIED/.test(reasons + ' ' + status) || /api.?key.*(invalid|expired|not valid|blocked)/i.test(detail);
  const prerequisite = status === 'FAILED_PRECONDITION' || /billing|quota|free tier|(?:location|region|country).{0,60}(?:not supported|not available|unsupported)|(?:not available|unsupported).{0,60}(?:location|region|country)/i.test(detail);
  const schemaRejected = response.status === 400 && !auth && !prerequisite && /schema|structured.?output|constraint.*states/i.test(detail);
  const reason = auth ? 'API key không hợp lệ hoặc chưa có quyền truy cập.'
    : response.status === 404 ? 'Không tìm thấy model; kiểm tra tên model trong Cài đặt.'
    : response.status === 429 ? 'Đã chạm giới hạn Gemini.'
    : prerequisite ? 'Google yêu cầu kiểm tra điều kiện sử dụng của tài khoản.'
    : schemaRejected ? 'Google từ chối định dạng dữ liệu yêu cầu.'
    : response.status === 400 ? 'Google từ chối một tham số trong yêu cầu.' : 'Yêu cầu Gemini chưa hoàn tất.';
  const retry = response.headers.get('retry-after');
  const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
  const message = `${stages[task]} · ${model} · HTTP ${response.status}${status ? ` ${status}` : ''}. ${reason}${detail ? ` Google: ${redact(detail, key).slice(0, 1000)}` : ''}`;
  return new AIError(message, response.status === 429 || response.status === 408 || response.status >= 500, Number.isFinite(delay) ? delay : 0, schemaRejected);
}
