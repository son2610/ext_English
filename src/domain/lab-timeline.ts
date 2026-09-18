export type LabTimelineMode = 'stream' | 'bubbles';

export interface LabTimelineItem {
  index: number;
  slot: number;
  side: 'front' | 'back';
  phase: 'visible' | 'leaving';
}

export interface LabTimeline {
  done: boolean;
  completed: number;
  durationMs: number;
  items: LabTimelineItem[];
}

export interface LabPlaybackTimeline extends LabTimeline {
  cycle: number;
  totalCompleted: number;
  cycleElapsedMs: number;
}

const LEAVING_MS = 240;

// Allow exact computed boundaries despite floating point division (e.g. nine slots).
function floorBoundary(value: number): number {
  return Math.floor(value + Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(value)) * 4));
}

/** Pure animation snapshot. The caller owns the clock, pause state and shuffled deck. */
export function labTimeline(mode: LabTimelineMode, elapsedMs: number, count: number, seconds: number, slots: number): LabTimeline {
  const faceMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(3_600_000, Math.max(1, seconds * 1000)) : 1000;
  const lifetime = mode === 'bubbles' ? 2 * faceMs + LEAVING_MS : faceMs;
  const size = Number.isFinite(count) ? Math.max(0, Math.min(Math.floor(count), Math.floor(Number.MAX_SAFE_INTEGER / lifetime))) : 0;
  const slotCount = slots === 4 || slots === 9 || slots === 16 ? slots : 9;
  const step = mode === 'bubbles' ? lifetime / slotCount : lifetime;
  const durationMs = size ? (size - 1) * step + lifetime : 0;
  const elapsed = elapsedMs === Infinity ? durationMs : Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;

  if (!size || elapsed >= durationMs) return { done: true, completed: size, durationMs, items: [] };

  if (mode === 'stream') {
    const index = Math.min(size - 1, floorBoundary(elapsed / faceMs));
    return { done: false, completed: index, durationMs, items: [{ index, slot: 0, side: 'front', phase: 'visible' }] };
  }

  const completed = Math.min(size, Math.max(0, floorBoundary((elapsed - lifetime) / step) + 1));
  const latest = Math.min(size - 1, floorBoundary(elapsed / step));
  const items: LabTimelineItem[] = [];
  // Only inspect active slots; cost is independent of the size of the saved library.
  for (let index = Math.max(completed, latest - slotCount + 1); index <= latest; index++) {
    const age = Math.max(0, elapsed - index * step);
    const face = floorBoundary(age / faceMs);
    items.push({ index, slot: index % slotCount, side: face >= 1 ? 'back' : 'front', phase: face >= 2 ? 'leaving' : 'visible' });
  }
  return { done: false, completed, durationMs, items };
}

/** Repeat complete finite cycles without retaining a growing deck or timer history. */
export function labPlaybackTimeline(mode: LabTimelineMode, elapsedMs: number, count: number, seconds: number, slots: number, repeat = false): LabPlaybackTimeline {
  if (!repeat) {
    const frame = labTimeline(mode, elapsedMs, count, seconds, slots);
    const elapsed = elapsedMs === Infinity ? frame.durationMs : Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    return { ...frame, cycle: 0, totalCompleted: frame.completed, cycleElapsedMs: Math.min(elapsed, frame.durationMs) };
  }

  const first = labTimeline(mode, 0, count, seconds, slots);
  if (!first.durationMs) return { ...first, cycle: 0, totalCompleted: 0, cycleElapsedMs: 0 };

  const elapsed = Number.isFinite(elapsedMs) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, elapsedMs)) : 0;
  let cycle = floorBoundary(elapsed / first.durationMs);
  let cycleElapsedMs = Math.max(0, elapsed - cycle * first.durationMs);
  // Division and multiplication can differ by an ULP after extremely long sessions.
  if (cycleElapsedMs >= first.durationMs) { cycle++; cycleElapsedMs = 0; }
  const frame = labTimeline(mode, cycleElapsedMs, count, seconds, slots);
  const size = labTimeline(mode, first.durationMs, count, seconds, slots).completed;
  return { ...frame, cycle, totalCompleted: Math.min(Number.MAX_SAFE_INTEGER, cycle * size + frame.completed), cycleElapsedMs };
}
