import { z } from 'zod';

export const providerIds = ['gemini', 'deepseek', 'openai', 'zai', 'compatible'] as const;
export type ProviderId = typeof providerIds[number];
export const providers: Record<ProviderId, { name: string; baseUrl: string; model: string; console: string }> = {
  gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.5-flash', console: 'https://aistudio.google.com/' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', console: 'https://platform.deepseek.com/' },
  openai: { name: 'OpenAI (GPT)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', console: 'https://platform.openai.com/' },
  zai: { name: 'Z.ai (GLM)', baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4.7-flash', console: 'https://z.ai/manage-apikey/apikey-list' },
  compatible: { name: 'API tương thích OpenAI', baseUrl: '', model: '', console: '' },
};
export function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && !/[\s\\]/.test(value) && !/%(?:2f|5c|2e)/i.test(url.pathname)
      && !url.pathname.endsWith('/chat/completions');
  } catch { return false; }
}
const modelId = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const AIConnectionSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(80), provider: z.enum(providerIds), enabled: z.boolean(),
  model: modelId, strongModel: modelId.optional(),
  baseUrl: z.string().max(500).refine(validBaseUrl, 'Cần URL gốc HTTPS, không chứa khóa, query hoặc /chat/completions.'),
}).refine(c => c.provider === 'compatible' || c.baseUrl === providers[c.provider].baseUrl, 'Địa chỉ API không khớp nhà cung cấp.');
export type AIConnection = z.infer<typeof AIConnectionSchema>;
export const AIConfigurationSchema = z.object({
  fallback: z.boolean(), connections: z.array(AIConnectionSchema).max(6),
}).refine(c => new Set(c.connections.map(x => x.id)).size === c.connections.length, 'Mỗi kết nối phải có ID riêng.');
export type AIConfiguration = z.infer<typeof AIConfigurationSchema>;
export function effectiveAI(config: { ai?: AIConfiguration; model: string; strongModel: string }): AIConfiguration {
  return config.ai ?? { fallback: true, connections: [{ id: 'legacy-gemini', name: 'Gemini hiện tại', provider: 'gemini', enabled: true, model: config.model, strongModel: config.strongModel, baseUrl: providers.gemini.baseUrl }] };
}
export function connectionBinding(connection: AIConnection): string { return `${connection.provider}:${connection.baseUrl}`; }
export function connectionOrigin(connection: AIConnection): string { return `${new URL(connection.baseUrl).origin}/*`; }
