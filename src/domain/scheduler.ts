import { createEmptyCard, fsrs, Rating, type Card, type Grade as FsrsGrade } from 'ts-fsrs';
import type { Schedule, Unit, ExerciseMode } from './models';

export interface Scheduler {
  initial(now: number): Schedule;
  review(card: Schedule, rating: 1 | 2 | 3 | 4, now: number, retention: number, weights?: number[]): Schedule;
}
function serialize(card: Card): Schedule {
  return { ...card, learning_steps: card.learning_steps ?? 0, due: card.due.getTime(), last_review: card.last_review?.getTime() };
}
export const scheduler: Scheduler = {
  initial: now => serialize(createEmptyCard(new Date(now))),
  review: (card, rating, now, retention, weights) => {
    const engine = fsrs({ request_retention: retention, enable_fuzz: false, maximum_interval: 3650, ...(weights ? { w: weights } : {}) });
    const converted = { ...card, due: new Date(card.due), last_review: card.last_review ? new Date(card.last_review) : undefined };
    return serialize(engine.next(converted, new Date(now), rating as FsrsGrade).card);
  },
};
export { Rating };
export function exercise(unit: Unit): { mode: ExerciseMode; prompt: string; answer: string; hint: string } {
  const n = unit.schedule.reps;
  if (n % 3 === 1) return { mode: 'cloze', prompt: unit.knowledge.cloze.sentence.replace('[[blank]]', '________'), answer: unit.knowledge.cloze.answer, hint: unit.knowledge.cloze.hintVi };
  if (n % 3 === 2) {
    const example = unit.knowledge.examples[Math.floor(n / 3) % unit.knowledge.examples.length]!;
    return { mode: 'transfer', prompt: `Viết câu tiếng Anh diễn đạt ý sau, dùng ${unit.knowledge.form}:\n${example.vi}`, answer: example.en, hint: unit.knowledge.name };
  }
  return { mode: 'production', prompt: unit.knowledge.production.instructionVi, answer: unit.knowledge.production.answerEn, hint: unit.knowledge.form };
}
export function dueQueue(units: Unit[], now: number, newLimit: number, priority: (unit: Unit) => number = () => 0): Unit[] {
  const due = units.filter(u => !u.suspended && u.schedule.due <= now).sort((a, b) => {
    if (a.schedule.reps > 0 && b.schedule.reps === 0) return -1;
    if (b.schedule.reps > 0 && a.schedule.reps === 0) return 1;
    return a.schedule.reps === 0 ? priority(b) - priority(a) || a.schedule.due - b.schedule.due : a.schedule.due - b.schedule.due;
  });
  let newCount = 0;
  const pending = due.filter(u => u.schedule.reps > 0 || newCount++ < newLimit);
  const result: Unit[] = [];
  while (pending.length) {
    const last = result.at(-1);
    const mature = pending[0]!.schedule.reps > 0;
    let index = pending.findIndex(u => (u.schedule.reps > 0) === mature && (!last || (u.knowledge.group !== last.knowledge.group && !u.captureIds.some(id => last.captureIds.includes(id)))));
    if (index < 0) index = 0;
    result.push(pending.splice(index, 1)[0]!);
  }
  return result;
}
