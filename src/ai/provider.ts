import { StructuredClient } from './structured-client';
import { providers } from '../domain/ai-config';
import { AIError } from './gemini-errors';
import { z } from 'zod';
import { AnalysisSchema, GradeSchema, validateAnalysis, type Analysis, type Grade, type Knowledge, type Source } from '../domain/models';

import { TranscriptRepairSchema } from '../domain/video';
import { DrillSchema, WeeklyTextSchema, type Drill, type Usage } from '../domain/enrichment';

export { AIError } from './gemini-errors';

export interface AIProvider {
  analyze(source: Source, note: string): Promise<Analysis>;
  grade(knowledge: Knowledge, prompt: string, answer: string): Promise<Grade>;
  explain(knowledge: Knowledge): Promise<string>;
  targeted(knowledge: Knowledge, errors: Grade['errors']): Promise<Drill>;
  weekly(units: { id: string; knowledge: Knowledge }[]): Promise<z.infer<typeof WeeklyTextSchema>>;
}
export class LearningProvider implements AIProvider {
  constructor(private client: StructuredClient) {}
  private request<T>(task: string, data: unknown, schema: z.ZodType<T>, cacheable = true, validate?: (value: T) => T, purpose: Usage['task'] = 'analysis', deadline?: number): Promise<T> {
    return this.client.request(task, data, schema, cacheable, validate, purpose, deadline);
  }
  async analyze(source: Source, note: string): Promise<Analysis> {
    if (source.video && !/^en(?:-|$)/i.test(source.video.language)) throw new AIError('Cần phụ đề tiếng Anh; không phân tích track dịch sang ngôn ngữ khác.', false);
    const deadline = Date.now() + 80000; // Both video stages must finish within the worker's 90s lease.
    const transcript = source.video ? await this.request('Khôi phục câu tiếng Anh từ transcript. Đây có thể là phụ đề tự động ASR có từ nghe sai, câu vụn, thiếu dấu câu. Gộp thành câu có nghĩa, viết hoa và thêm dấu câu trước khi học ngữ pháp. Chỉ sửa lỗi có căn cứ trong ngữ cảnh; không đoán tên riêng hoặc bịa lời nói. Giữ ý người nói. Ghi mọi thay đổi từ vựng trong changes. Đặt uncertain=true nếu cần nghe audio để xác nhận, warningVi giải thích vì sao. Bạn KHÔNG được nghe audio trong yêu cầu này.', { raw: source.originalExact ?? source.exact, context: source.context, automatic: source.video.automatic }, TranscriptRepairSchema, true, undefined, 'transcript', Math.min(deadline, Date.now() + 38000)) : undefined;
    const result = await this.request(`Giải nghĩa đoạn chọn trong đúng ngữ cảnh. selected là câu/từ người học muốn lưu, có thể đã tự chỉnh; tập trung vào selected, dùng originalQuote và repairedTranscript làm ngữ cảnh, không thay selected bằng toàn bộ transcript. Tách 2–6 đơn vị độc lập nếu có đủ nội dung: cấu trúc ngữ pháp và collocation/chunk đáng học; không bịa thêm khi đoạn quá ngắn. key phải là mã canonical ổn định (ví dụ grammar:conditional-third), cụm từ phải phân biệt nghĩa. Mỗi đơn vị có tên, nhóm, công thức, evidence trích nguyên văn LIÊN TỤC trong nguồn, 2 ví dụ MỚI khác câu gốc với từ dễ hiểu, một yêu cầu tự viết tiếng Anh bằng tiếng Việt kèm đáp án mẫu, và cloze trên câu GỐC (hoặc transcript đã sửa) có đúng một [[blank]]. Thay [[blank]] bằng answer phải khôi phục nguyên văn một đoạn của nguồn. Không đưa đáp án vào instructionVi. Nêu rõ nếu thiếu ngữ cảnh. Nếu là transcript ASR, tránh biến lỗi nhận dạng thành cấu trúc ngữ pháp để học; nêu sự chưa chắc chắn.`, { selected: source.originalExact ? source.exact : transcript?.textEn ?? source.exact, originalQuote: source.originalExact, repairedTranscript: transcript?.textEn, context: source.context, heading: source.heading, note, automaticTranscript: source.video?.automatic ?? false }, AnalysisSchema.omit({ transcript: true }), true, value => validateAnalysis({ ...value, ...(transcript ? { transcript } : {}) }, source), 'analysis', deadline);
    return validateAnalysis(result, source);
  }
  grade(knowledge: Knowledge, prompt: string, answer: string): Promise<Grade> {
    return this.request('Chấm bài sản xuất tiếng Anh cho người Việt. Chấp nhận đáp án tương đương, không so chuỗi với đáp án mẫu. Đánh giá đúng ý đề và cấu trúc đích. Mỗi lỗi phải có original/correction/reasonVi/category theo taxonomy; dùng l1NoteVi để giải thích ảnh hưởng tiếng Việt nếu CÓ căn cứ (thiếu mạo từ, không chia thì/đuôi số nhiều, trật tự từ...), không mặc định mọi lỗi do tiếng mẹ đẻ. score 0–100; correct chỉ true khi ý và cấu trúc đích đúng. correctedEn là câu hoàn chỉnh.', { knowledge, prompt, answer }, GradeSchema, false, undefined, 'grading');
  }
  async explain(knowledge: Knowledge): Promise<string> {
    const schema = z.object({ explanationVi: z.string().min(1).max(8000) });
    const result = await this.request('Người học thường xuyên sai kiến thức này. Giải thích LẠI bằng cách khác: đối chiếu tiếng Việt, một cặp câu đúng/sai, mẹo phân biệt và một ví dụ rất đơn giản. Tránh chỉ lặp lại giải thích cũ.', knowledge, schema, false, undefined, 'explanation');
    return result.explanationVi;
  }
  targeted(knowledge: Knowledge, errors: Grade['errors']): Promise<Drill> {
    return this.request('Tạo MỘT bài tập tự viết tiếng Anh nhắm đúng lỗi người học Việt mắc nhiều lần trong dữ liệu. Đổi tình huống mới nhưng từ vựng dễ hiểu. instructionVi không chứa đáp án tiếng Anh. Có answerEn tham khảo, explanationVi đối chiếu với tiếng Việt nếu phù hợp, category của lỗi đích. Không biến thành bài chọn đáp án.', { knowledge, errors }, DrillSchema, false, undefined, 'targeted');
  }
  weekly(units: { id: string; knowledge: Knowledge }[]) {
    return this.request('Viết một đoạn tiếng Anh ngắn, mạch lạc, có ý nghĩa, dùng lại TẤT CẢ kiến thức trong danh sách. Từ vựng xung quanh đơn giản. Kèm titleVi, meaningVi. coverage phải có từng unitId và quote là đoạn nguyên văn trong textEn thể hiện cấu trúc/cụm từ đó. Đây là đọc tổng hợp, không thay thế active recall và không được tự chấm là đã nhớ.', units, WeeklyTextSchema, true, result => {
      const ids = new Set(units.map(u => u.id));
      if (result.coverage.length !== ids.size || new Set(result.coverage.map(c => c.unitId)).size !== ids.size || result.coverage.some(c => !ids.has(c.unitId) || !result.textEn.includes(c.quote))) throw new AIError('Đoạn tổng hợp chưa bao phủ đúng các mục được chọn. Hãy thử lại.', false);
      return result;
    }, 'weekly');
  }
}

/** Backward-compatible single-provider entry point; UI and worker use getProvider(). */
export class GeminiProvider extends LearningProvider {
  constructor(key: string, model: string, strongModel?: string) {
    super(new StructuredClient([{ connection: { id: 'legacy-gemini', name: 'Google Gemini', provider: 'gemini', enabled: true, baseUrl: providers.gemini.baseUrl, model, strongModel }, key }], false, false));
  }
}
