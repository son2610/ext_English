import type { Analysis, Source } from '../src/domain/models';
export const source: Source = {
  url: 'https://example.com/article', frameUrl: 'https://example.com/article', title: 'An article',
  exact: 'If I had known, I would have helped.', prefix: 'Yesterday. ', suffix: ' Things are different now.',
  context: 'Yesterday. If I had known, I would have helped. Things are different now.',
  heading: 'A lesson', scrollY: 200, capturedAt: 1700000000000,
};
export const analysis: Analysis = {
  schemaVersion: 1, meaningVi: 'Nếu tôi biết trước, tôi đã giúp.', contextNoteVi: 'Điều kiện trái với quá khứ.',
  knowledge: [{
    key: 'conditional-third', kind: 'grammar', group: 'Câu điều kiện', name: 'Câu điều kiện loại 3', form: 'If + S + had + V3, S + would have + V3',
    meaningVi: 'Giả định một tình huống khác trong quá khứ.', explanationVi: 'Sự việc thực tế không xảy ra; người nói hình dung kết quả khác.', evidence: 'If I had known',
    examples: [{ en: 'If we had tested the patch, we would have found the bug.', vi: 'Nếu đã kiểm thử bản vá, chúng tôi đã tìm ra lỗi.' }, { en: 'If she had left earlier, she would have caught the train.', vi: 'Nếu đã đi sớm hơn, cô ấy đã kịp tàu.' }],
    production: { instructionVi: 'Dùng câu điều kiện loại 3: Nếu đã đọc tài liệu, tôi đã hiểu hàm này.', answerEn: 'If I had read the documentation, I would have understood this function.' },
    cloze: { sentence: 'If I [[blank]], I would have helped.', answer: 'had known', hintVi: 'Quá khứ hoàn thành sau if.' },
  }, {
    key: 'would-have-helped:past-unreal-result', kind: 'phrase', group: 'Cụm từ', name: 'Lẽ ra đã giúp', form: 'would have helped', meaningVi: 'Đã giúp nếu điều kiện khác đi.', explanationVi: 'Kết quả giả định trong quá khứ.', evidence: 'would have helped',
    examples: [{ en: 'A clear example would have helped.', vi: 'Một ví dụ rõ ràng lẽ ra đã giúp ích.' }, { en: 'Your advice would have helped us.', vi: 'Lời khuyên của bạn lẽ ra đã giúp chúng tôi.' }],
    production: { instructionVi: 'Viết bằng tiếng Anh: Một ví dụ rõ ràng lẽ ra đã giúp ích.', answerEn: 'A clear example would have helped.' },
    cloze: { sentence: 'If I had known, I [[blank]].', answer: 'would have helped', hintVi: 'Kết quả không xảy ra trong quá khứ.' },
  }],
};
