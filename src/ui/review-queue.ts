import type { Review, Settings, Unit } from '../domain/models';
import { dueQueue } from '../domain/scheduler';
import { learningPriority } from '../learning/frequency';
import { dayKey } from './stats';

/** One due list for the review page and the toolbar popup, so both show the same next item. */
export function reviewQueue(units: Unit[], reviews: Review[], config: Settings, ranks: Map<string, number>, now = Date.now()): Unit[] {
  const today = dayKey(now);
  const startedToday = reviews.filter(r => r.prior.reps === 0 && dayKey(r.at) === today).length;
  return dueQueue(units, now, Math.max(0, config.dailyNewLimit - startedToday), unit => learningPriority(unit, ranks, config.learnerLevel));
}
/** Human wording of the next interval shown on rating buttons. */
export function dueIn(due: number, now = Date.now()): string {
  const minutes = Math.round((due - now) / 60000);
  return minutes < 60 ? `${Math.max(1, minutes)} phút` : minutes < 1440 ? `${Math.round(minutes / 60)} giờ` : `${Math.round(minutes / 1440)} ngày`;
}
