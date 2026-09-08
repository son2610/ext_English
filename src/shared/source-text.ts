import type { Capture, Source } from '../domain/models';

/** Keep the captured quote for anchors and audio even when the learning focus is edited. */
export function editSourceText(source: Source, value: string): Source {
  const exact = value.trim();
  if (!exact || exact.length > 8000) throw new Error('Nhập câu hoặc từ muốn lưu, từ 1 đến 8.000 ký tự.');
  if (exact === source.exact) return source;
  return { ...source, exact, originalExact: source.originalExact ?? source.exact };
}

export function dictationText(capture: Capture): string {
  const repair = capture.analysis?.transcript;
  if (repair && (!repair.uncertain || capture.transcriptApproved)) return repair.textEn;
  return capture.source.originalExact ?? capture.source.exact;
}
