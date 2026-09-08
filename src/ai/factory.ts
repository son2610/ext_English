import { settings } from '../data/repository';
import { GeminiProvider } from './provider';
export async function getProvider() {
  const [key, config] = await Promise.all([chrome.storage.local.get('geminiKey'), settings()]);
  return new GeminiProvider(typeof key.geminiKey === 'string' ? key.geminiKey : '', config.model, config.strongModel);
}
