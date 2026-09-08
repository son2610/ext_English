import { send as sendMessage } from '../shared/client';
export function send<T>(message: Record<string, unknown>): Promise<T> { return sendMessage<T>({ ...message, pageUrl: location.href }); }
