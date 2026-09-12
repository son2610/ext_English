import { settings } from '../data/repository';
import { LearningProvider } from './provider';
import { StructuredClient } from './structured-client';
import { loadRoutes } from './configuration';
import { effectiveAI } from '../domain/ai-config';
export async function getProvider() {
  const config = await settings();
  return new LearningProvider(new StructuredClient(await loadRoutes(config), effectiveAI(config).fallback));
}
export async function hasConfiguredProvider(): Promise<boolean> { return (await loadRoutes()).some(r => r.key && r.permitted); }
