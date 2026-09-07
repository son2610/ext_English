# Mạch Đọc

Chrome Extension học tiếng Anh từ chính những trang bạn đọc. TypeScript strict, Manifest V3, React, IndexedDB, FSRS thật qua `ts-fsrs`. Không có backend của ứng dụng, không analytics, không tải mã từ CDN. Capture và ôn thủ công chạy offline; phân tích/chấm bài bằng Gemini cần mạng và API key của bạn.

## Cài bản hiện tại

Đã có thư mục **`dist/`** được build trong workspace này.

1. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**.
2. Chọn **Tải tiện ích đã giải nén / Load unpacked**, trỏ tới `D:\project code\gg_ext_english\dist`.
3. Mở tab mới hoặc bấm icon extension. Vào **Cài đặt & dữ liệu** để nhập API key Gemini nếu muốn dùng AI.
4. Tải lại những trang web đã mở trước khi cài extension.

Chrome 120 trở lên. Dùng Chromium/Chrome trên desktop. Extension không được chạy trên `chrome://`, Chrome Web Store, trang của extension khác và một số trình xem PDF. Không hỗ trợ chọn chữ trong ảnh/canvas, editor đặc biệt hoặc closed Shadow DOM. Không có cách hợp lệ để bảo đảm hoạt động trên *mọi* trang.

## Sử dụng

- **Lưu khi đọc:** chọn đoạn tiếng Anh → dấu **+** → nhập ghi chú → lưu. Checkbox AI mặc định bỏ chọn. Có thể xem ngữ cảnh trước khi gửi. Vùng nhập liệu/editor bị bỏ qua để tránh thu thập nội dung đang soạn.
- **Lưu nhanh:** `Alt+Shift+S`, không gọi AI. **Ôn tập:** `Alt+Shift+R`. Đổi phím trong `chrome://extensions/shortcuts` nếu tổ hợp bị hệ điều hành/trang web chiếm.
- **Phân tích sau:** trong Thư viện chọn các đoạn → **Phân tích đã chọn**. Xử lý từng đoạn; mỗi phút lấy thêm một job. Chưa nhập key thì hàng đợi giữ nguyên. Rate limit/lỗi mạng được retry có backoff, tối đa 4 lần. Job đang chạy bị gián đoạn được nhận lại sau khi lease 90 giây hết.
- **Duyệt bài:** AI trả nghĩa Việt, cấu trúc, cụm từ, ví dụ mới, bài viết và cloze. Kiểm tra rồi bấm **Duyệt & đưa vào lịch ôn**. Mục trùng hiện đề xuất ghép ví dụ và giữ tiến độ; có thể chọn tạo riêng nếu khác nghĩa.
- **Không dùng AI:** ghi nghĩa cho một đoạn ngắn dưới 500 ký tự rồi chọn **Tạo bài từ ghi chú**. Bài thủ công không có ví dụ mới do AI sinh.
- **Ôn:** tự viết trước, nhờ AI chấm hoặc tự đối chiếu. `Chưa nhớ / Khó / Nhớ / Dễ` cập nhật lịch FSRS. Dùng gợi ý hoặc xem trước đáp án được ghi là chưa tự nhớ. Nghe câu/từ bằng giọng đọc sẵn có của máy/trình duyệt, không gọi API trả phí.
- **Mục khó:** sau 5 lần quên, tạm dừng và đưa vào **Cần chăm sóc**. Đọc lại/nhờ AI giải thích cách khác rồi chủ động đưa trở lại lịch ôn.
- **Nhận diện khi đọc:** bật thử trong Cài đặt. Mặc định **tắt**. Highlight nhẹ bằng CSS Custom Highlight, hover nghĩa Việt; không bọc/sửa text node. Bản thử nghiệm chỉ khớp cụm nguyên dạng trong một text node, tối đa 3.000 cụm, 500 vùng đánh dấu, 20.000 element mỗi phiên trang. Không có lemmatization hay khớp qua nhiều thẻ ở tính năng highlight.
- **Backup:** mặc định mỗi 7 ngày khi Chrome đang chạy, giữ 5 snapshot và tải file vào `Downloads/MachDoc`. Nút **Sao lưu ngay** dùng cùng luồng. Đảm bảo file thực sự có trong Downloads; chuyển một bản ra nơi lưu độc lập trước khi gỡ extension.

Tab mới là điểm vào ôn tập thường xuyên, badge hiện tổng số mục đã đến hạn; phiên ôn giới hạn 30 mục và giới hạn kiến thức mới mỗi ngày. Mục cũ đến hạn không bị hạn mức kiến thức mới loại bỏ. Badge có thể nhiều hơn phiên đang mở. Bản không thay tab mới:

```powershell
$env:NO_NEW_TAB = '1'
npm run build
Remove-Item Env:NO_NEW_TAB
```

Tải lại extension sau khi build. Override tab mới là khai báo manifest, không thể bật/tắt bằng checkbox runtime thông thường.

## Phát triển & kiểm tra

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Node.js 22+. Nếu Chromium chưa có: `npx playwright install chromium`. E2E dùng profile riêng trong `test-results/`, chạy headless, không đụng profile Chrome cá nhân. Có thể đặt `CHROMIUM_PATH` tới bản Chromium hỗ trợ `--load-extension`; Chrome branded mới có thể không nhận flag đó. `npm run dev` bundle lại TS/CSS; sửa manifest/HTML cần chạy lại build rồi reload extension. Không có remote dev server hay HMR trong trang đang đọc.

Nếu npm trên Windows bị lỗi `EPERM` khi resolve đường dẫn cài đặt, trong môi trường này có thể dùng:

```powershell
node --preserve-symlinks-main 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' ci --cache .npm-cache
```

`tests/core.test.ts` kiểm tra grounding/schema, FSRS, lịch độc lập, dedup, lease/retry, chống ghi review hai lần, leech, backup và API lỗi. `scripts/e2e.mjs` kiểm tra extension thực trong Chromium: CSS bất thường, selection nhiều node, iframe, viewport, ôn thủ công, phản hồi AI **mock**, highlight, export/backup, kích thước nhỏ, worker restart. Kết quả/screenshot nằm trong `test-results/`. Không dùng key thật trong kiểm thử.

## Kiến trúc & dữ liệu

- [Thiết kế, lựa chọn thay thế và roadmap](docs/ARCHITECTURE.vi.md)
- [Schema, ví dụ và hợp đồng dữ liệu](docs/DATA.vi.md)
- [Ma trận nghiệm thu và giới hạn kiểm chứng](docs/VALIDATION.vi.md)
- [JSON Schema phân tích](docs/analysis.schema.json)

```text
src/domain/       Kiến thức, review, schema runtime, giao diện Scheduler + adapter FSRS
src/data/         IndexedDB, transaction, queue lease, export/import/snapshot
src/ai/           AIProvider + adapter Gemini, schema, hash cache, phân loại lỗi
src/background/   MV3 messages/alarms/badge/jobs, offscreen Blob cho backup
src/content/      Selection, Shadow DOM capture, matcher và highlight tùy chọn
src/shared/       Protocol có kiểm tra đầu vào, liên kết nguồn
src/ui/           Giao diện React tiếng Việt, thống kê từ review log
tests/            Kiểm thử logic và fixture AI
scripts/          Build, schema và Chromium E2E
```

Export JSON có version và chứa dữ liệu học đầy đủ, bao gồm câu trả lời và phản hồi AI. API key và cache có thể tái tạo được không xuất. Import kiểm tra toàn bộ trước khi ghi và ghép trong transaction: ID đã có giữ nguyên toàn bộ mục và lịch sử gắn với mục đó, tránh khôi phục bản cũ làm lùi tiến độ. Đây là **nhập bảo toàn**, chưa phải đồng bộ/giải quyết xung đột hai thiết bị. Khôi phục vào hồ sơ trống giữ nguyên dữ liệu học và cài đặt.

Khóa Gemini lưu trong `chrome.storage.local` chỉ cho trusted contexts; không mã hóa trước người có quyền đọc hồ sơ máy. Không gửi URL, tiêu đề trang, vị trí cuộn, API key cho mô hình: request phân tích chỉ chứa đoạn trích, ngữ cảnh, heading và ghi chú. Hãy lưu nội dung riêng tư ở chế độ không AI nếu không muốn gửi cho Google. Xem [tài liệu API key của Google](https://ai.google.dev/gemini-api/docs/api-key).

Đây là MVP cá nhân có kiểm thử; chưa phải tuyên bố đã kiểm chứng mọi website, chất lượng chấm bài với key thật, hiệu năng trên mọi máy hoặc sẵn sàng phát hành Chrome Web Store.
