import { describe, expect, it } from 'vitest';
import { labPlaybackTimeline, labTimeline } from '../src/domain/lab-timeline';

describe('Lab animation timeline', () => {
  it('shows each stream item for its full duration and completes exactly at the end', () => {
    expect(labTimeline('stream', 0, 3, 0.8, 9)).toEqual({ done: false, completed: 0, durationMs: 2400, items: [{ index: 0, slot: 0, side: 'front', phase: 'visible' }] });
    expect(labTimeline('stream', 799, 3, 0.8, 9).items[0]?.index).toBe(0);
    expect(labTimeline('stream', 800, 3, 0.8, 9)).toMatchObject({ completed: 1, items: [{ index: 1 }] });
    expect(labTimeline('stream', 2399, 3, 0.8, 9)).toMatchObject({ done: false, completed: 2, items: [{ index: 2 }] });
    expect(labTimeline('stream', 2400, 3, 0.8, 9)).toEqual({ done: true, completed: 3, durationMs: 2400, items: [] });
  });

  it.each([4, 9, 16])('staggered bubbles reuse their %i slots only after the previous card leaves', slots => {
    const seconds = 0.75, lifetime = seconds * 2000 + 240, step = lifetime / slots;
    expect(labTimeline('bubbles', 0, 100, seconds, slots).items).toHaveLength(1);
    expect(labTimeline('bubbles', step - 0.01, 100, seconds, slots).items).toHaveLength(1);
    expect(labTimeline('bubbles', step, 100, seconds, slots).items.map(item => item.index)).toEqual([0, 1]);
    expect(labTimeline('bubbles', lifetime - 0.01, 100, seconds, slots)).toMatchObject({ completed: 0 });
    const next = labTimeline('bubbles', lifetime, 100, seconds, slots);
    expect(next.completed).toBe(1);
    expect(next.items.map(item => item.index)).toEqual(Array.from({ length: slots }, (_, i) => i + 1));
    expect(next.items.find(item => item.slot === 0)?.index).toBe(slots);
    for (let tick = 0; tick < 500; tick++) {
      const snapshot = labTimeline('bubbles', tick * 31.73, 100, seconds, slots);
      expect(snapshot.items.length).toBeLessThanOrEqual(slots);
      expect(new Set(snapshot.items.map(item => item.slot)).size).toBe(snapshot.items.length);
      expect(snapshot.items.every(item => item.index >= snapshot.completed && item.index < 100)).toBe(true);
    }
  });

  it('gives a bubble its full English, translation and exit intervals', () => {
    expect(labTimeline('bubbles', 999, 1, 1, 9).items[0]).toMatchObject({ side: 'front', phase: 'visible' });
    expect(labTimeline('bubbles', 1000, 1, 1, 9).items[0]).toMatchObject({ side: 'back', phase: 'visible' });
    expect(labTimeline('bubbles', 1999, 1, 1, 9).items[0]).toMatchObject({ side: 'back', phase: 'visible' });
    expect(labTimeline('bubbles', 2000, 1, 1, 9).items[0]).toMatchObject({ side: 'back', phase: 'leaving' });
    expect(labTimeline('bubbles', 2239, 1, 1, 9)).toMatchObject({ done: false, completed: 0 });
    expect(labTimeline('bubbles', 2240, 1, 1, 9)).toEqual({ done: true, completed: 1, durationMs: 2240, items: [] });
  });

  it.each([4, 9, 16])('never truncates the final bubble in a partial %i-slot wave', slots => {
    const count = slots + 2, seconds = 0.4, lifetime = 1040, start = (count - 1) * lifetime / slots;
    expect(labTimeline('bubbles', start, count, seconds, slots).items.at(-1)).toMatchObject({ index: count - 1, side: 'front' });
    expect(labTimeline('bubbles', start + 399, count, seconds, slots).items.at(-1)?.side).toBe('front');
    expect(labTimeline('bubbles', start + 400, count, seconds, slots).items.at(-1)).toMatchObject({ side: 'back', phase: 'visible' });
    expect(labTimeline('bubbles', start + 799, count, seconds, slots).items.at(-1)?.phase).toBe('visible');
    expect(labTimeline('bubbles', start + 800, count, seconds, slots).items.at(-1)?.phase).toBe('leaving');
    const duration = labTimeline('bubbles', 0, count, seconds, slots).durationMs;
    expect(labTimeline('bubbles', duration - 0.01, count, seconds, slots)).toMatchObject({ done: false, completed: count - 1 });
    expect(labTimeline('bubbles', duration, count, seconds, slots)).toMatchObject({ done: true, completed: count, items: [] });
  });

  it('allows seeking backwards deterministically without retaining mutable timing state', () => {
    const first = labTimeline('bubbles', 1000, 100, 1.25, 9);
    labTimeline('bubbles', 8000, 100, 1.25, 9);
    expect(labTimeline('bubbles', 1000, 100, 1.25, 9)).toEqual(first);
  });

  it('keeps snapshots bounded even when seeking deep into a billion-item deck', () => {
    const count = 1_000_000_000, seconds = 0.5, slots = 16;
    const duration = labTimeline('bubbles', 0, count, seconds, slots).durationMs;
    const snapshot = labTimeline('bubbles', duration / 2, count, seconds, slots);
    expect(snapshot.items).toHaveLength(slots);
    expect(snapshot.completed).toBeGreaterThan(400_000_000);
    expect(snapshot.completed).toBeLessThan(600_000_000);
    expect(new Set(snapshot.items.map(item => item.slot)).size).toBe(slots);
    expect(labTimeline('bubbles', duration, count, seconds, slots).completed).toBe(count);
  });

  it('normalizes empty decks and malformed numeric inputs without NaN or negative output', () => {
    for (const count of [0, -10, NaN, Infinity]) {
      expect(labTimeline('bubbles', 100, count, 1, 9)).toEqual({ done: true, completed: 0, durationMs: 0, items: [] });
    }
    for (const elapsed of [-100, NaN, -Infinity]) {
      expect(labTimeline('bubbles', elapsed, 5, 1, 9)).toEqual(labTimeline('bubbles', 0, 5, 1, 9));
    }
    for (const seconds of [0, -1, NaN, Infinity]) {
      expect(labTimeline('bubbles', 100, 5, seconds, 9)).toEqual(labTimeline('bubbles', 100, 5, 1, 9));
    }
    expect(labTimeline('bubbles', Infinity, 5, 1, 9)).toMatchObject({ done: true, completed: 5, items: [] });
    expect(labTimeline('bubbles', 1500, 5.9, 1, NaN)).toEqual(labTimeline('bubbles', 1500, 5, 1, 9));
    for (const seconds of [Number.MIN_VALUE, Number.MAX_VALUE]) {
      const result = labTimeline('bubbles', 100, Number.MAX_VALUE, seconds, 16);
      expect(Number.isFinite(result.durationMs)).toBe(true);
      expect(Number.isFinite(result.completed)).toBe(true);
      expect(result.completed).toBeGreaterThanOrEqual(0);
      expect(result.items.length).toBeLessThanOrEqual(16);
    }
  });
});

describe('Lab repeated playback timeline', () => {
  it.each(['stream', 'bubbles'] as const)('preserves finite %s behavior when repetition is disabled', mode => {
    for (const elapsed of [0, 1000, 2500, 100000, Infinity, NaN, -20]) {
      const frame = labTimeline(mode, elapsed, 2, 1, 9);
      const { cycle, totalCompleted, cycleElapsedMs, ...finite } = labPlaybackTimeline(mode, elapsed, 2, 1, 9);
      expect(finite).toEqual(frame);
      expect(cycle).toBe(0);
      expect(totalCompleted).toBe(frame.completed);
      expect(Number.isFinite(cycleElapsedMs)).toBe(true);
      expect(cycleElapsedMs).toBeGreaterThanOrEqual(0);
      expect(cycleElapsedMs).toBeLessThanOrEqual(frame.durationMs);
    }
  });

  it('keeps a one-item stream running at every cycle boundary', () => {
    const before = labPlaybackTimeline('stream', 599, 1, 0.6, 9, true);
    expect(before).toMatchObject({ done: false, completed: 0, cycle: 0, totalCompleted: 0, cycleElapsedMs: 599, items: [{ index: 0 }] });
    for (const cycle of [1, 2, 10, 10000]) {
      expect(labPlaybackTimeline('stream', cycle * 600, 1, 0.6, 9, true)).toMatchObject({
        done: false, completed: 0, cycle, totalCompleted: cycle, cycleElapsedMs: 0, items: [{ index: 0, side: 'front' }],
      });
    }
  });

  it('repeats the same two-item deck and counts completed appearances across cycles', () => {
    expect(labPlaybackTimeline('stream', 1999, 2, 1, 4, true)).toMatchObject({ cycle: 0, completed: 1, totalCompleted: 1, items: [{ index: 1 }] });
    expect(labPlaybackTimeline('stream', 2000, 2, 1, 4, true)).toMatchObject({ done: false, cycle: 1, completed: 0, totalCompleted: 2, cycleElapsedMs: 0, items: [{ index: 0 }] });
    expect(labPlaybackTimeline('stream', 3500, 2, 1, 4, true)).toMatchObject({ done: false, cycle: 1, completed: 1, totalCompleted: 3, cycleElapsedMs: 1500, items: [{ index: 1 }] });
  });

  it('finishes both bubble faces and the exit phase before repeating a one-item deck', () => {
    expect(labPlaybackTimeline('bubbles', 999, 1, 1, 9, true).items[0]).toMatchObject({ side: 'front', phase: 'visible' });
    expect(labPlaybackTimeline('bubbles', 1000, 1, 1, 9, true).items[0]).toMatchObject({ side: 'back', phase: 'visible' });
    expect(labPlaybackTimeline('bubbles', 1999, 1, 1, 9, true).items[0]).toMatchObject({ side: 'back', phase: 'visible' });
    expect(labPlaybackTimeline('bubbles', 2000, 1, 1, 9, true).items[0]).toMatchObject({ side: 'back', phase: 'leaving' });
    expect(labPlaybackTimeline('bubbles', 2239, 1, 1, 9, true)).toMatchObject({ done: false, cycle: 0, totalCompleted: 0 });
    expect(labPlaybackTimeline('bubbles', 2240, 1, 1, 9, true)).toMatchObject({ done: false, cycle: 1, completed: 0, totalCompleted: 1, cycleElapsedMs: 0, items: [{ index: 0, side: 'front', phase: 'visible' }] });
  });

  it.each([4, 9, 16])('lets the last bubble finish before restarting a partial %i-slot board', slots => {
    const count = slots + 2, seconds = 0.7;
    const duration = labTimeline('bubbles', 0, count, seconds, slots).durationMs;
    for (const cycle of [0, 1, 2, 1000]) {
      const offset = cycle * duration;
      const lastBack = labPlaybackTimeline('bubbles', offset + duration - 241, count, seconds, slots, true);
      expect(lastBack.cycle).toBe(cycle);
      expect(lastBack.items.at(-1)).toMatchObject({ index: count - 1, side: 'back', phase: 'visible' });
      expect(labPlaybackTimeline('bubbles', offset + duration - 1, count, seconds, slots, true)).toMatchObject({ done: false, cycle, totalCompleted: (cycle + 1) * count - 1 });
      const restarted = labPlaybackTimeline('bubbles', (cycle + 1) * duration, count, seconds, slots, true);
      expect(restarted).toMatchObject({ done: false, cycle: cycle + 1, completed: 0, totalCompleted: (cycle + 1) * count, cycleElapsedMs: 0 });
      expect(restarted.items).toEqual([{ index: 0, slot: 0, side: 'front', phase: 'visible' }]);
    }
  });

  it('is deterministic when pause/resume preserves active elapsed time', () => {
    const frozenElapsed = 7312.5;
    const paused = labPlaybackTimeline('bubbles', frozenElapsed, 3, 0.9, 9, true);
    labPlaybackTimeline('bubbles', 300000, 3, 0.9, 9, true);
    expect(labPlaybackTimeline('bubbles', frozenElapsed, 3, 0.9, 9, true)).toEqual(paused);
    const resumed = labPlaybackTimeline('bubbles', frozenElapsed + 200, 3, 0.9, 9, true);
    expect((resumed.cycle - paused.cycle) * paused.durationMs + resumed.cycleElapsedMs - paused.cycleElapsedMs).toBeCloseTo(200);
  });

  it('keeps long repeated sessions bounded and their counters finite', () => {
    const count = 5000, slots = 16, seconds = 0.6;
    const duration = labTimeline('bubbles', 0, count, seconds, slots).durationMs;
    const elapsed = 1000000 * duration + duration / 2;
    const frame = labPlaybackTimeline('bubbles', elapsed, count, seconds, slots, true);
    expect(frame.done).toBe(false);
    expect(frame.cycle).toBe(1000000);
    expect(frame.totalCompleted).toBeGreaterThanOrEqual(1000000 * count);
    expect(frame.items).toHaveLength(slots);
    expect(new Set(frame.items.map(item => item.slot)).size).toBe(slots);
    expect(frame.items.every(item => item.index < count)).toBe(true);
    const huge = labPlaybackTimeline('stream', Number.MAX_VALUE, 2, Number.MIN_VALUE, 9, true);
    expect(huge.done).toBe(false);
    expect(Number.isSafeInteger(huge.cycle)).toBe(true);
    expect(Number.isSafeInteger(huge.totalCompleted)).toBe(true);
    expect(huge.items).toHaveLength(1);
  });

  it('does not create infinite or NaN cycles for empty decks and malformed inputs', () => {
    for (const count of [0, -1, NaN, Infinity]) {
      expect(labPlaybackTimeline('bubbles', 100000, count, 1, 9, true)).toMatchObject({ done: true, cycle: 0, totalCompleted: 0, cycleElapsedMs: 0, items: [] });
    }
    for (const elapsed of [NaN, Infinity, -Infinity, -100]) {
      expect(labPlaybackTimeline('bubbles', elapsed, 2, 1, 9, true)).toEqual(labPlaybackTimeline('bubbles', 0, 2, 1, 9, true));
    }
    expect(labPlaybackTimeline('bubbles', 5000, 2.9, NaN, NaN, true)).toEqual(labPlaybackTimeline('bubbles', 5000, 2, 1, 9, true));
  });
});
