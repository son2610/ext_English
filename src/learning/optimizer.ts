import { fsrs, createEmptyCard, default_w, clipParameters, type Card, type Grade } from 'ts-fsrs';
import type { Review } from '../domain/models';
export interface Calibration { reviews: number; trainingSamples: number; validationSamples: number; baselineLoss: number; candidateLoss: number; applied: boolean; weights: number[]; previousWeights: number[]; noteVi: string }
export function replayLoss(reviews: Review[], weights: number[], splitAt: number) {
  const engine = fsrs({ w: weights, enable_fuzz: false }); const cards = new Map<string, Card>();
  let train = 0, test = 0, trainN = 0, testN = 0, trainFailures = 0, testFailures = 0;
  for (const review of reviews) {
    let card = cards.get(review.unitId);
    if (review.prior.reps === 0) card = createEmptyCard(new Date(review.at));
    // Imported partial history or an interrupted sequence is unsuitable for fitting.
    if (!card || card.reps !== review.prior.reps || (card.last_review && review.at < card.last_review.getTime())) { cards.delete(review.unitId); continue; }
    if (card.last_review && review.at - card.last_review.getTime() >= 86400000) {
      const prediction = Math.max(0.001, Math.min(0.999, engine.get_retrievability(card, new Date(review.at), false)));
      const recalled = review.rating > 1 && !review.assisted;
      const loss = -Math.log(recalled ? prediction : 1 - prediction);
      if (review.at < splitAt) { train += loss; trainN++; if (!recalled) trainFailures++; }
      else { test += loss; testN++; if (!recalled) testFailures++; }
    }
    cards.set(review.unitId, engine.next(card, new Date(review.at), (review.assisted ? 1 : review.rating) as Grade).card);
  }
  return { train: train / Math.max(1, trainN), test: test / Math.max(1, testN), trainN, testN, trainFailures, testFailures };
}
export function calibrate(input: Review[], prior: number[] = [...default_w]): Calibration {
  const reviews = [...input].sort((a, b) => a.at - b.at || a.prior.reps - b.prior.reps);
  const previousWeights = clipParameters(prior, 1); const splitAt = reviews[Math.floor(reviews.length * 0.8)]?.at ?? Infinity;
  const baseline = replayLoss(reviews, previousWeights, splitAt);
  const result: Calibration = { reviews: reviews.length, trainingSamples: baseline.trainN, validationSamples: baseline.testN, baselineLoss: baseline.test, candidateLoss: baseline.test, applied: false, weights: previousWeights, previousWeights, noteVi: 'Chưa đủ lịch sử liên tục: cần 1.000 lượt, 200 mẫu huấn luyện và 80 mẫu kiểm định cách nhau ít nhất một ngày, mỗi phần có ít nhất 5 lần quên và 5 lần nhớ.' };
  if (reviews.length < 1000 || baseline.trainN < 200 || baseline.testN < 80 || baseline.trainFailures < 5 || baseline.testFailures < 5 || baseline.trainN - baseline.trainFailures < 5 || baseline.testN - baseline.testFailures < 5) return result;
  // Fit only training timestamps. The later 20% never selects coordinates or step sizes.
  const training = reviews.filter(r => r.at < splitAt);
  const indexes = [0, 1, 2, 3, 8, 11]; let weights = [...previousWeights];
  const objective = (candidate: number[]) => replayLoss(training, candidate, Infinity).train + indexes.reduce((penalty, i) => penalty + 0.002 * Math.log((candidate[i]! + 0.001) / (previousWeights[i]! + 0.001)) ** 2, 0);
  let best = objective(weights);
  for (const step of [0.3, 0.15, 0.07]) for (const index of indexes) {
    let choice = weights;
    for (const direction of [-1, 1]) {
      const candidate = [...weights]; candidate[index] = candidate[index]! * Math.exp(direction * step);
      const clipped = clipParameters(candidate, 1); const loss = objective(clipped);
      if (Number.isFinite(loss) && loss < best) { best = loss; choice = clipped; }
    }
    weights = choice;
  }
  const validation = replayLoss(reviews, weights, splitAt);
  const applied = validation.test < baseline.test - Math.max(0.005, baseline.test * 0.01);
  return { ...result, weights, candidateLoss: validation.test, applied, noteVi: applied ? 'Đã hiệu chỉnh 6 tham số về độ bền trí nhớ. Sai số trên phần lịch sử giữ riêng giảm; áp dụng từ lượt ôn tiếp theo.' : 'Tham số thử nghiệm chưa cải thiện đủ trên lịch sử giữ riêng. Giữ bộ tham số đang dùng.' };
}
