# Nghiệm thu bản 0.3.0 — LumaRead

Kiểm tra ngày **08/09/2026** trên Windows, Node.js **22.13.1**, Chromium **149.0.7827.55** headless, profile riêng. TypeScript strict, build và kiểm tra UTF-8 đều đạt. **64/64 unit tests** đạt, gồm 7 kiểm thử nhóm/nhãn và nâng cấp thực tế DB v1/v2 lên v3. Bốn bộ E2E đều đạt; Gemini/YouTube dùng phản hồi/trang giả lập có kiểm soát, không dùng API key thật.

- [Luồng capture/ôn tập/backup](../test-results/e2e-report.json): multi-node selection, CSS/CSP bất thường, iframe, biên viewport, tạo bài/ôn/chấm, đánh dấu DOM, export/import, offscreen download, worker restart.
- [Luồng YouTube và học bổ sung](../test-results/enrichment-e2e-report.json): 26 kiểm tra, gồm sửa câu/từ, sửa/xoá ngữ cảnh/bài học, lịch ôn được giữ, snapshot khôi phục, nghe và chấm.
- [Tương thích Gemini](../test-results/gemini-e2e-report.json): 5 kiểm tra, gồm hai giai đoạn phân tích, schema fallback đúng model, lỗi có chi tiết/ẩn key, đếm quota và không còn cảnh báo fullscreen trùng.
- [Thư viện 0.3](../test-results/organization-e2e-report.json): 10 nhóm kiểm tra, gồm tạo/sửa/xoá danh mục, chuyển nhóm/gắn/gỡ nhãn hàng loạt, lọc/tìm không dấu, phân trang, bàn phím/focus/Escape, lưu qua reload, lịch FSRS không thay đổi, export đầy đủ, responsive và glyph tiếng Việt.

Phép đo với **5.000 câu, tối đa 24 thẻ DOM, CPU chậm 4×**: tải thư viện **1.963 ms**, tìm kiếm **341 ms**, mở chi tiết **309 ms**. Thời gian gồm thao tác Playwright; đây là đo trên máy kiểm thử, không phải cam kết mọi thiết bị. Khi chưa mở chi tiết có **0** card chi tiết và **0** iframe ẩn. Noto Sans Regular cung cấp cả **334 glyph** trong mẫu kiểm tra tiếng Việt NFC/NFD, không dùng font thay thế. [Ảnh kiểm tra dấu](../test-results/vietnamese-glyphs.png), [thư viện](../test-results/library-grid.png), [chi tiết màn hình hẹp](../test-results/library-mobile-detail.png).

`scripts/check-text.mjs` xác nhận UTF-8 của 54 file mã/giao diện, giới hạn tên/mô tả manifest, phiên bản thống nhất và PNG icon đúng kích thước. Bộ ảnh Store được tạo từ giao diện thật với dữ liệu minh hoạ; icon do imagegen tích hợp tạo, prompt trong `artifacts/store/BRAND.vi.md`. Chưa gửi bản này lên Chrome Web Store. Chrome tối thiểu khai báo 120; chưa chạy riêng trên Chrome 120.

---

## Lịch sử nghiệm thu 0.2.3

Kiểm tra ngày **07/09/2026** trên Windows, Node.js **22.13.1**, Chromium **149.0.7827.55** headless, profile kiểm thử riêng. Bản build khai báo Chrome tối thiểu 120; chưa thực nghiệm riêng trên Chrome 120.

## Sửa yêu cầu Gemini trong 0.2.3

Typecheck/build đạt; **56/56** kiểm thử unit đạt (11 kiểm thử mới cho schema gọn, JSON fallback có giới hạn, xác thực cục bộ, giữ model, đếm quota, lỗi theo tác vụ và ẩn key). Bộ E2E học bổ sung đạt **26** kiểm tra. Bộ E2E Gemini mới đạt **5** kiểm tra với extension/UI/service worker/IndexedDB thật: phục hồi phụ đề và phân tích đều nhận schema 400 rồi thành công ở JSON mode; bài chỉ được tạo sau khi duyệt; HTTP 400 do key được hiển thị đúng, ẩn key, không tự gọi lại; thử lại trên capture cũ; quyền fullscreen không còn khai báo trùng. Theo dõi CDP Log để bắt cả cảnh báo iframe.

[Report Gemini](../test-results/gemini-e2e-report.json), [ảnh lỗi chi tiết](../test-results/gemini-error-details.png). Gemini trả response giả lập có kiểm soát; chưa dùng API key thật của người dùng. Thông báo cũ đã bỏ mất response body nên không thể xác định chính xác lý do HTTP 400 của lần gọi cũ. Xác nhận trực tiếp từ người dùng: cảnh báo fullscreen không tái xuất hiện sau Clear all và tải lại tab.

Schema gửi đi chỉ giữ kiểu, trường, required, enum và mô tả; bounds vẫn được kiểm tra đầy đủ trong Zod. `const` được đổi thành enum một giá trị; các giới hạn độ dài/số phần tử chuyển thành hướng dẫn để giảm độ phức tạp của bộ giải mã. Schema ngữ pháp không yêu cầu lặp lại bản phục hồi transcript. JSON mode là phương án tương thích khi API xác định lỗi schema, có thể không tuân thủ cấu trúc nên kết quả vẫn phải qua Zod và kiểm tra trích dẫn. Không đổi model hoặc dùng key khác. Cả hai bước YouTube có tổng deadline 80 giây trong lease 90 giây. Nguồn: [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en), [GenerateContent API](https://ai.google.dev/api/generate-content), [xử lý lỗi và retry](https://ai.google.dev/gemini-api/docs/troubleshooting?authuser=01).

## Sửa cảnh báo iframe trong 0.2.2

TypeScript strict và build đã đạt. Kiểm tra trực tiếp trên Chromium bằng extension thật, trang video nhúng giả lập: mở player, phát lại, đóng và mở lại. Trước sửa (0.2.1), Chrome ghi đúng cảnh báo `Allow attribute will take precedence over 'allowfullscreen'.`; sau sửa (0.2.2), không có cảnh báo fullscreen hoặc page error, `featurePolicy.allowsFeature('fullscreen')` vẫn true. Theo dõi cả CDP `Log.entryAdded` và sự kiện console vì cảnh báo này không phát ra `pageerror`.

Report: [trước sửa](../test-results/embed-permissions-0.2.1.json), [sau sửa](../test-results/embed-permissions-0.2.2.json). Không gọi YouTube/Gemini thật trong phép kiểm tra này. Thay đổi chỉ bỏ thuộc tính iframe trùng, không đổi dữ liệu hoặc scheduling; không chạy lại bộ unit/E2E rộng bên dưới.

## Các bộ kiểm thử đã chạy ở 0.2.1

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| `npm run build` | PASS | TypeScript strict `tsc --noEmit` và esbuild, tạo `dist/` có manifest MV3. |
| `npm test` | **45/45 PASS** | Gồm 37 kiểm thử trước và 8 kiểm thử sửa nguồn/AI focus, giữ tiến độ, xung đột tab, cascade xoá, snapshot/khôi phục, kết quả AI tới muộn. |
| `node scripts/e2e.mjs` | **PASS** | Extension được nạp thật, giữ kiểm thử capture/CSS/CSP/iframe/review/backup và worker restart. Gemini giả lập. |
| `node scripts/e2e-enrichment.mjs` | **26 kiểm tra PASS** | 21 kiểm tra trước cùng sửa từ từ transcript, draft riêng từng lựa chọn, reset/chặn trống, sửa ngữ cảnh/bài học, huỷ/xác nhận xoá và snapshot. |
| `node scripts/performance.mjs` | **PASS trong phạm vi đo ở 0.2.0** | Matcher không đổi trong 0.2.1, không chạy lại phép đo: 3.000 unit, tối đa 12.000 biến thể, 10.000 đoạn và 300 đoạn thêm động, CPU throttle 4×. Không chứng nhận zero lag. |
| Download backup | **complete** | File JSON được tải thực vào thư mục kiểm thử; đọc lại kiểm tra 3 units, 2 reviews, encounter và không chứa key giả. |
| Browser page errors | **0** | Trong các kịch bản E2E đã thực hiện. |

Các kết quả có thể tái lập bằng lệnh ở README; machine-readable report nằm trong [`test-results/e2e-report.json`](../test-results/e2e-report.json). Các file `test-results/` là artifact cục bộ, không thuộc source mặc định.

Report mới: [YouTube và học theo lỗi](../test-results/enrichment-e2e-report.json), [hiệu năng fixture](../test-results/performance-report.json). E2E mới dùng phụ đề/audio tổng hợp và response Gemini/Dictionary giả lập; metadata track được trả giả trong worker. Riêng kiểm tra nút mở nguồn phải mở tab đầu tiên là `about:blank`, xác minh URL mà code yêu cầu, rồi điều hướng qua route fixture, vì Playwright không chặn được request đầu tiên của tab tạo qua `chrome.tabs.create`. Thao tác tạo tab, session message, player, IndexedDB và dừng clip vẫn chạy trong extension thật.

Kiểm tra YouTube gồm chọn câu đã kết thúc trước lúc bấm (start 5,25s/end 9,8s), pause, giữ deferred không gọi AI; quay lại thấy note/marker không mở modal; rewatch lặp và trả CC; gợi ý cuối video chỉ chạy lô sau click; xác nhận transcript chưa chắc; player ôn không gắn panel làm lộ đáp án; diff dictation lưu trước FSRS rating; mở nguồn và dừng clip; đổi watch→Shorts trong SPA; fallback có mốc ước lượng và ngôn ngữ không English; MAIN bridge lấy signed track; command tới iframe khác origin mở dialog ở trang cha; bài luyện nhắm lỗi/giải thích L1/tổng hợp có coverage; từ điển có nguồn; báo sai làm unit tạm dừng.

Ảnh mới: [Capture YouTube](../test-results/youtube-capture.png), [Panel note](../test-results/youtube-notes.png), [Video trong iframe](../test-results/youtube-iframe-capture.png), [Dictation](../test-results/dictation.png), [Hồ sơ & bản đồ](../test-results/insights.png).

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
- **Không trễ trên mọi website/máy:** content bundle khoảng 16 KB minified, module video khoảng 21 KB chỉ trên YouTube, editor tải khi mở. Fixture CPU 4× cho P95 từ keydown đến frame tiếp theo khoảng **15,5 ms** với 51 mẫu; có **long task 50–189 ms** trong giai đoạn DOM/layout thay đổi. Không gán toàn bộ long task cho extension hay coi chỉ số gõ là bằng chứng toàn trang không trễ. Matcher/discovery/matching/IO được chia idle chunk, nhưng GC/layout và trang thực vẫn cần đánh giá thêm. Highlight và biến thể tiếp tục **tắt mặc định**.
- **Vài nghìn mục nhiều năm:** đã chạy fixture 3.000 unit và kiểm tra DOM không bị bọc/chia. Chưa stress hàng triệu review, chưa benchmark file 150 MB. Dashboard hiện đọc logs để tổng hợp, phase sau cần aggregate/cursor.
- **Chất lượng và độ bền YouTube thật:** fixture không chứng minh mọi layout tài khoản/Shorts/archived live. Native track/caption endpoint có thể không có hoặc bị chặn. Mốc observed không phải forced alignment theo audio; video có chữ gắn sẵn trong hình không thể tự ẩn. Chưa nghe thủ công audio thật từ tất cả nguồn.
- **Cá nhân hóa FSRS:** test xác minh replay, chặn ít dữ liệu, giữ validation khỏi vòng chọn tham số. Chưa có 1.000 lượt người dùng thật để chứng minh cải thiện retention thực tế; hiện fit 6/21 weights, không phải full optimizer chính thức.
- **Hotkey hệ điều hành, giọng đọc nghe được, trang cần đăng nhập, infinite scroll thật, full-screen/top-layer cạnh tranh, source Text Fragment thực sự cuộn đúng trên trang đã thay đổi:** cần nghiệm thu thủ công.
- **Lịch backup qua nhiều lần đóng Chrome/mất điện:** đã test luồng download và cơ chế khôi phục job; chưa chạy thử nhiều tuần. Alarm chỉ hoạt động khi Chrome chạy. Phải kiểm tra file ngoài extension trước khi xóa hồ sơ/gỡ extension.

## Bài kiểm tra nhanh sau khi bạn cài

1. Lưu một câu trên tài liệu bạn đọc thường xuyên, đóng tab và mở lại thư viện; kiểm tra câu/ghi chú/context.
2. Nhập API key trong Settings, chọn đúng một capture nhỏ để phân tích, duyệt nghĩa/công thức/ví dụ; nếu model không còn dùng được, đổi tên model theo Google AI Studio.
3. Viết một đáp án đúng tương đương và một đáp án sai cấu trúc; kiểm tra AI có chấp nhận/giải thích hợp lý. Không dựa duy nhất vào điểm số AI.
4. Xuất JSON và sao lưu ngay; xác nhận file tồn tại. Nhập thử vào hồ sơ Chrome thử nghiệm trống để kiểm chứng đường khôi phục trên máy bạn.
5. Thử bật highlight trên một trang nặng; nếu có độ trễ, tắt lại. Đừng bật mặc định rộng hơn trước khi đo.

Các điểm hoãn và phương án thay thế nằm trong [thiết kế mở rộng](EXTENSIONS.vi.md); không coi một bài smoke test là bằng chứng hỗ trợ tất cả tình huống.
