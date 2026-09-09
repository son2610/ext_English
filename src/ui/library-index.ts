import type { Capture, Unit } from '../domain/models';
import { searchText } from '../domain/organization';

export interface LibraryEntry {
  capture: Capture; units: Unit[]; search: string; due: number; nextDue: number; difficult: number; reviewed: number;
}
export interface LibraryFilters { search: string; group: string; label: string; state: string; source: string; sort: string }
export function indexLibrary(captures: Capture[], units: Unit[], now: number): LibraryEntry[] {
  const linked = new Map<string, Unit[]>();
  for (const unit of units) for (const id of unit.captureIds) {
    const list = linked.get(id) ?? []; list.push(unit); linked.set(id, list);
  }
  return captures.map(capture => {
    const lessons = linked.get(capture.id) ?? [], active = lessons.filter(u => !u.suspended);
    return {
      capture, units: lessons,
      search: searchText([capture.source.exact, capture.source.title, capture.note, capture.analysis?.meaningVi ?? '', ...lessons.map(u => `${u.knowledge.form} ${u.knowledge.meaningVi} ${u.knowledge.group}`)].join(' ')),
      due: active.filter(u => u.schedule.due <= now).length,
      nextDue: active.reduce((min, u) => Math.min(min, u.schedule.due), Infinity),
      difficult: lessons.filter(u => u.leech || u.suspended).length,
      reviewed: lessons.filter(u => u.schedule.reps > 0).length,
    };
  });
}
export function filterLibrary(entries: LibraryEntry[], filters: LibraryFilters): LibraryEntry[] {
  const tokens = searchText(filters.search).split(' ').filter(Boolean);
  const selected = entries.filter(({ capture: c, search, due, difficult }) =>
    tokens.every(token => search.includes(token)) &&
    (filters.group === 'all' || (filters.group === 'inbox' ? !c.organization?.groupId : c.organization?.groupId === filters.group)) &&
    (filters.label === 'all' || c.organization?.labelIds.includes(filters.label)) &&
    (filters.source === 'all' || (filters.source === 'youtube' ? !!c.source.video : !c.source.video)) &&
    (filters.state === 'all' || (filters.state === 'pending' && !c.unitsCreated) || (filters.state === 'done' && c.unitsCreated) || (filters.state === 'due' && due > 0) || (filters.state === 'difficult' && difficult > 0) || (filters.state === 'error' && c.status === 'error')),
  );
  return selected.sort((a, b) => {
    const delta = filters.sort === 'oldest' ? a.capture.source.capturedAt - b.capture.source.capturedAt
      : filters.sort === 'due' ? a.nextDue - b.nextDue
      : filters.sort === 'updated' ? b.capture.updatedAt - a.capture.updatedAt : b.capture.source.capturedAt - a.capture.source.capturedAt;
    return (Number.isNaN(delta) ? 0 : delta) || a.capture.id.localeCompare(b.capture.id);
  });
}
