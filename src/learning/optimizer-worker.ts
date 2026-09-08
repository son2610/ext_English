import { calibrate } from './optimizer';
import type { Review } from '../domain/models';
self.onmessage = (event: MessageEvent<{ reviews: Review[]; weights?: number[] }>) => {
  try { self.postMessage({ ok: true, result: calibrate(event.data.reviews, event.data.weights) }); }
  catch { self.postMessage({ ok: false, error: 'Chưa hiệu chỉnh được tham số. Lịch ôn hiện tại được giữ nguyên.' }); }
};
