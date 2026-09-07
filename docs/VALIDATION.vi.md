# Nghiệm thu MVP

Kiểm tra ngày **06/09/2026** trên Windows, Node.js **22.13.1**, Chromium **149.0.7827.55** headless, profile kiểm thử riêng. Bản build khai báo Chrome tối thiểu 120; chưa thực nghiệm riêng trên Chrome 120.

## Đã chạy

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| `npm run build` | PASS | TypeScript strict `tsc --noEmit` và esbuild, tạo `dist/` có manifest MV3. |
| `npm test` | **19/19 PASS** | Grounding/schema, anchor URL, capture duplicate, lease/retry, lịch độc lập, ghép không reset, review idempotency/stale, leech/hints, FSRS, encounter, export/import và API error/cache. |
| `npm run test:e2e` | **PASS** | Extension được nạp thật vào Chromium; không mock Chrome APIs. AI grading/network được mock. |
| Download backup | **complete** | File JSON được tải thực vào thư mục kiểm thử; đọc lại kiểm tra 3 units, 2 reviews, encounter và không chứa key giả. |
| Browser page errors | **0** | Trong các kịch bản E2E đã thực hiện. |

Các kết quả có thể tái lập bằng lệnh ở README; machine-readable report nằm trong [`test-results/e2e-report.json`](../test-results/e2e-report.json). Các file `test-results/` là artifact cục bộ, không thuộc source mặc định.

## Kịch bản Chromium đã đi qua

1. Nạp new tab UI, empty state không sinh dữ liệu/thống kê giả.
2. Chọn câu qua `strong`/`em`, icon và dialog vẫn hiển thị khi page CSS ép `button` và `dialog` thành `display:none!important` và có phần tử z-index lớn.
3. Ghi chú, lưu capture, tạo bài thủ công, tự gõ đáp án và lưu rating FSRS qua UI.
4. Chọn trong iframe khác origin (localhost so với 127.0.0.1), dialog mở ở trang cha thay vì bị cắt trong iframe cao 100 px.
5. Chọn gần đáy viewport, icon nằm trong viewport, Escape đóng dialog.
6. Phân tích fixture được duyệt thành nhiều unit; prompt production và AI grading giả lập hiển thị lỗi `have read → had read` với giải thích Việt.
7. Bật highlight, thêm nội dung mới vào DOM, cụm trong viewport được đánh dấu; text node không bị bọc/chia/sửa.
8. Export qua UI, download JSON thực; backup qua offscreen + `chrome.downloads` thực; dữ liệu download được đọc và kiểm tra.
9. Nhập file qua UI, xem preview, xác nhận; dữ liệu cùng ID được giữ theo quy tắc import.
10. Giao diện tại 1440×1000 và 760×900; đã xem screenshot để kiểm tra bố cục.
11. Dùng CDP `ServiceWorker.stopAllWorkers`, reload UI và gửi thao tác lưu settings để đánh thức lại worker.
12. Capture trên trang có CSP `default-src 'self'; script-src 'self'; style-src 'self'`.
13. Chọn cuối article có hơn 20.000 ký tự trước nó; context thu từ endpoint thực sự, chứa câu ngay trước và sau vùng chọn.

Ảnh: [Dashboard](../test-results/dashboard-empty.png), [Capture](../test-results/capture-dialog.png), [AI feedback giả lập](../test-results/ai-feedback.png), [Cài đặt kích thước nhỏ](../test-results/settings-narrow.png).

## Những gì chưa được chứng minh

- **Gemini key thật, quota thật, chất lượng ngữ pháp/chấm điểm thực:** chưa có key người dùng nên không gọi API tính phí. Tests xác minh header, wire schema, parsing, cache, 429/Retry-After, 403 và output bị cắt; chưa thay thế thử nghiệm model thật.
- **Không trễ trên mọi website/máy:** content bundle khoảng 14 KB minified, highlight tắt mặc định; chưa đo P95 CPU/long tasks trên tập website thực hoặc máy yếu. `requestIdleCallback` budget 4 ms chỉ áp dụng vòng khám phá DOM, không là chứng nhận toàn bộ pipeline luôn dưới 4 ms.
- **Vài nghìn mục nhiều năm:** thiết kế có IDB/index, cap/cache/transaction và export; chưa stress hàng triệu review, chưa benchmark file 150 MB. Dashboard hiện đọc logs để tổng hợp, phase sau cần aggregate/cursor.
- **Hotkey hệ điều hành, giọng đọc nghe được, trang cần đăng nhập, infinite scroll thật, full-screen/top-layer cạnh tranh, source Text Fragment thực sự cuộn đúng trên trang đã thay đổi:** cần nghiệm thu thủ công.
- **Lịch backup qua nhiều lần đóng Chrome/mất điện:** đã test luồng download và cơ chế khôi phục job; chưa chạy thử nhiều tuần. Alarm chỉ hoạt động khi Chrome chạy. Phải kiểm tra file ngoài extension trước khi xóa hồ sơ/gỡ extension.

## Bài kiểm tra nhanh sau khi bạn cài

1. Lưu một câu trên tài liệu bạn đọc thường xuyên, đóng tab và mở lại thư viện; kiểm tra câu/ghi chú/context.
2. Nhập API key trong Settings, chọn đúng một capture nhỏ để phân tích, duyệt nghĩa/công thức/ví dụ; nếu model không còn dùng được, đổi tên model theo Google AI Studio.
3. Viết một đáp án đúng tương đương và một đáp án sai cấu trúc; kiểm tra AI có chấp nhận/giải thích hợp lý. Không dựa duy nhất vào điểm số AI.
4. Xuất JSON và sao lưu ngay; xác nhận file tồn tại. Nhập thử vào hồ sơ Chrome thử nghiệm trống để kiểm chứng đường khôi phục trên máy bạn.
5. Thử bật highlight trên một trang nặng; nếu có độ trễ, tắt lại. Đừng bật mặc định rộng hơn trước khi đo.

Các điểm hoãn và phương án thay thế nằm trong [roadmap kiến trúc](ARCHITECTURE.vi.md); không coi một bài smoke test là bằng chứng hỗ trợ tất cả tình huống.
