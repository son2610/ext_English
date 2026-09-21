import type { Review, Unit } from '../domain/models';
export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function statistics(units: Unit[], reviews: Review[], now = Date.now()) {
  const recent = reviews.filter(r => r.at >= now - 30 * 86400000 && r.at <= now);
  const mature = recent.filter(r => r.prior.state === 2);
  const recalled = mature.filter(r => r.rating >= 2 && !r.assisted);
  const perDay = new Map<string, number>();
  for (const r of recent) { const key = dayKey(r.at); perDay.set(key, (perDay.get(key) ?? 0) + 1); }
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(now); date.setDate(date.getDate() - (27 - i));
    const key = dayKey(date.getTime());
    return { key, count: perDay.get(key) ?? 0 };
  });
  const studiedDays = new Set(reviews.map(r => dayKey(r.at)));
  let streak = 0; const cursor = new Date(now);
  if (!studiedDays.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (studiedDays.has(dayKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  // One pass over recent reviews instead of one pass per knowledge group.
  const groupOf = new Map(units.map(u => [u.id, u.knowledge.group]));
  const tally = new Map(units.map(u => [u.knowledge.group, { count: 0, remembered: 0 }]));
  for (const r of recent) {
    const row = tally.get(groupOf.get(r.unitId) ?? '');
    if (row && groupOf.has(r.unitId)) { row.count++; if (r.rating >= 2 && !r.assisted) row.remembered++; }
  }
  const groups = [...tally].map(([group, { count, remembered }]) => ({ group, count, retention: count ? remembered / count : null }))
    .sort((a, b) => (a.retention ?? 2) - (b.retention ?? 2));
  return { retention: mature.length ? recalled.length / mature.length : null, sample: mature.length, days, streak, groups, today: reviews.filter(r => dayKey(r.at) === dayKey(now)).length };
}
