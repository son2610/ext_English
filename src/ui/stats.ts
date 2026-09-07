import type { Review, Unit } from '../domain/models';
export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function statistics(units: Unit[], reviews: Review[], now = Date.now()) {
  const recent = reviews.filter(r => r.at >= now - 30 * 86400000 && r.at <= now);
  const mature = recent.filter(r => r.prior.state === 2);
  const recalled = mature.filter(r => r.rating >= 2 && !r.assisted);
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(now); date.setDate(date.getDate() - (27 - i));
    const key = dayKey(date.getTime());
    return { key, count: recent.filter(r => dayKey(r.at) === key).length };
  });
  const studiedDays = new Set(reviews.map(r => dayKey(r.at)));
  let streak = 0; const cursor = new Date(now);
  if (!studiedDays.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (studiedDays.has(dayKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  const groups = [...new Set(units.map(u => u.knowledge.group))].map(group => {
    const ids = new Set(units.filter(u => u.knowledge.group === group).map(u => u.id));
    const attempts = recent.filter(r => ids.has(r.unitId));
    const remembered = attempts.filter(r => r.rating >= 2 && !r.assisted).length;
    return { group, count: attempts.length, retention: attempts.length ? remembered / attempts.length : null };
  }).sort((a, b) => (a.retention ?? 2) - (b.retention ?? 2));
  return { retention: mature.length ? recalled.length / mature.length : null, sample: mature.length, days, streak, groups, today: reviews.filter(r => dayKey(r.at) === dayKey(now)).length };
}
