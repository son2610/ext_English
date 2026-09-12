import { z } from 'zod';
import { db } from '../data/db';
import { settings } from '../data/repository';
import { SettingsSchema, type Settings } from '../domain/models';
import { AIConfigurationSchema, connectionBinding, connectionOrigin, effectiveAI, type AIConfiguration, type AIConnection } from '../domain/ai-config';
import type { AIRoute } from './transports';

const vaultSchema = z.record(z.string(), z.object({ binding: z.string().max(550), key: z.string().min(1).max(4096) }));
type Vault = z.infer<typeof vaultSchema>;
export type KeyChanges = Record<string, string | null>; // undefined retains; null explicitly removes.
async function credentials(): Promise<{ vault: Vault; legacy: string }> {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const stored = await chrome.storage.local.get(['aiKeys', 'geminiKey']);
  return { vault: vaultSchema.parse(stored.aiKeys ?? {}), legacy: typeof stored.geminiKey === 'string' ? stored.geminiKey : '' };
}
function keyFor(connection: AIConnection, vault: Vault, legacy: string, isLegacy: boolean): string {
  const saved = vault[`${connection.id}:${connectionBinding(connection)}`];
  if (saved?.binding === connectionBinding(connection)) return saved.key;
  return isLegacy && connection.id === 'legacy-gemini' && connection.provider === 'gemini' ? legacy : '';
}
export async function loadRoutes(value?: Settings): Promise<AIRoute[]> {
  const config = value ?? await settings();
  const { vault, legacy } = await credentials();
  return Promise.all(effectiveAI(config).connections.filter(c => c.enabled).map(async connection => ({
    connection, key: keyFor(connection, vault, legacy, !config.ai),
    permitted: await chrome.permissions.contains({ origins: [connectionOrigin(connection)] }),
  })));
}
export async function keyStatus(config: Settings): Promise<Record<string, string>> {
  const { vault, legacy } = await credentials();
  // The UI only receives destination bindings, never stored secret strings.
  return Object.fromEntries(effectiveAI(config).connections.filter(c => keyFor(c, vault, legacy, !config.ai)).map(c => [c.id, connectionBinding(c)]));
}
export async function saveAIConfiguration(input: AIConfiguration, changes: KeyChanges): Promise<void> {
  const parsed = AIConfigurationSchema.safeParse(input);
  if (!parsed.success) throw new Error('Kiểm tra tên kết nối, model và URL gốc HTTPS của từng AI (không thêm /chat/completions).');
  const ai = parsed.data;
  // Invoke permissions.request from the save click, before any asynchronous storage reads.
  const origins = [...new Set(ai.connections.filter(c => c.enabled).map(connectionOrigin))];
  if (origins.length && !await chrome.permissions.request({ origins })) throw new Error('Chưa được Chrome cấp quyền kết nối AI. Cấu hình cũ vẫn được giữ.');
  await navigator.locks.request('lumaread-ai-configuration', async () => {
    const current = await settings(); const { vault, legacy } = await credentials(); const next: Vault = {};
    for (const connection of ai.connections) {
      const change = changes[connection.id];
      const key = change === null ? '' : typeof change === 'string' ? change.trim() : keyFor(connection, vault, legacy, !current.ai);
      if (key) {
        if (key.length > 4096 || /\s/.test(key)) throw new Error('API key không được chứa khoảng trắng hoặc xuống dòng.');
        next[`${connection.id}:${connectionBinding(connection)}`] = { binding: connectionBinding(connection), key };
      }
    }
    // Retain old slots until metadata commits, so an interrupted save cannot lose existing keys.
    await chrome.storage.local.set({ aiKeys: { ...vault, ...next } });
    const tx = (await db).transaction('meta', 'readwrite');
    const latest = SettingsSchema.parse((await tx.store.get('settings'))?.value ?? {});
    await tx.store.put({ key: 'settings', value: { ...latest, ai } });
    for (const entry of await tx.store.getAll()) if (entry.key.startsWith('aiCooldown:')) await tx.store.delete(entry.key);
    await tx.done;
    await chrome.storage.local.set({ aiKeys: next });
    await chrome.storage.local.remove('geminiKey');
  });
}
