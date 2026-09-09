# LumaRead — Tiếng Anh từ ngữ cảnh

Chrome Extension học tiếng Anh từ bài đọc và video YouTube, trước đây là Mạch Đọc. Bản **0.3.0** có thư viện thẻ gọn, nhóm và nhãn màu, tìm kiếm không dấu, lọc tiến độ, thao tác hàng loạt và phân trang 24 câu. Font Noto Sans tiếng Việt được đóng gói cùng icon mới; tên nhà phát hành **Blue**. TypeScript strict, MV3, React, IndexedDB, FSRS. Không có backend riêng; Gemini, từ điển và video gốc cần mạng.

- [Cách dùng và thiết kế thư viện 0.3](docs/LIBRARY-0.3.vi.md)
- [Bộ nội dung/ảnh Chrome Web Store](artifacts/store/LISTING.vi.md)
- [Icon, nhận diện và prompt](artifacts/store/BRAND.vi.md)
- [Chính sách riêng tư](public/privacy.html)


Bản 0.2.3 giảm độ phức tạp schema gửi Gemini, tách schema phục hồi phụ đề khỏi phân tích ngữ pháp. Nếu Google báo rõ lỗi schema, thử lại đúng một lần bằng JSON mode, giữ model đã chọn và vẫn kiểm tra đầy đủ bằng Zod trên máy trước khi tạo bài. Các lỗi HTTP 400 khác không tự thử lại; thông báo hiển thị tác vụ, model, mã lỗi và chi tiết từ Google, có ẩn API key. Mỗi lần thử được tính vào hạn mức cục bộ. Bấm **Nhờ AI phân tích** trên câu bị lỗi để thử lại; không cần lưu câu lần nữa. Số phiên bản của giao diện nằm ở cuối trang để kiểm tra tab đã tải mã mới.

Bản 0.2.2 bỏ khai báo toàn màn hình trùng trong iframe YouTube, sửa cảnh báo `Allow attribute will take precedence over 'allowfullscreen'.` Quyền fullscreen vẫn nằm trong `allow`. Sau khi tải lại extension và tab ứng dụng, có thể bấm **Clear all** trong trang Errors để xoá nhật ký cảnh báo cũ; thao tác này không xoá dữ liệu học.

## Cài bản hiện tại

Đã có thư mục **`dist/`** được build trong workspace này.

**Đang dùng bản cũ:** vào `chrome://extensions` → **Reload / Tải lại** extension đang trỏ tới cùng thư mục `dist`, rồi tải lại tab ứng dụng và trang đọc. Không cần gỡ extension. Dữ liệu được nâng từ IDB v1/v2 lên v3 tại chỗ; export JSON v1/v2 vẫn nhập được. Tên mới không đổi cơ sở dữ liệu hoặc key của bản đang cài.

1. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**.
2. Chọn **Tải tiện ích đã giải nén / Load unpacked**, trỏ tới `D:\project code\gg_ext_english\dist`.
3. Mở tab mới hoặc `Alt+Shift+R`. Vào **Cài đặt & dữ liệu** để nhập API key Gemini nếu muốn dùng AI. Trên YouTube, icon toolbar ưu tiên lưu câu đang nghe.
4. Tải lại những trang web đã mở trước khi cài extension.

Chrome 120 trở lên. Dùng Chromium/Chrome trên desktop. Extension không được chạy trên `chrome://`, Chrome Web Store, trang của extension khác và một số trình xem PDF. Không hỗ trợ chọn chữ trong ảnh/canvas, editor đặc biệt hoặc closed Shadow DOM. Không có cách hợp lệ để bảo đảm hoạt động trên *mọi* trang.

## Sử dụng

- **Lưu khi đọc:** chọn đoạn tiếng Anh → dấu **+** → nhập ghi chú → lưu. Checkbox AI mặc định bỏ chọn. Có thể xem ngữ cảnh trước khi gửi. Vùng nhập liệu/editor bị bỏ qua để tránh thu thập nội dung đang soạn.
- **Lưu nhanh:** `Alt+Shift+S`, không gọi AI. **Ôn tập:** `Alt+Shift+R`. Đổi phím trong `chrome://extensions/shortcuts` nếu tổ hợp bị hệ điều hành/trang web chiếm.
- **Lưu từ YouTube:** bật CC English, nhấn `Alt+Shift+Y` hoặc **Lưu câu**. Video dừng, bạn chọn trong các câu vừa nói. Mốc từ track giữ start/end; fallback hiển thị rõ mốc ước lượng. Checkbox AI chỉ đánh dấu phân tích sau, không gọi ngay lúc lưu. Cuối video có gợi ý chạy lô; cũng có thể chọn trong thư viện.
- **Sửa trước khi lưu:** trong hộp YouTube, bấm **Chỉnh sửa câu / từ muốn lưu**, nhập câu đã sửa hoặc chỉ một từ/cụm từ. Mỗi lựa chọn giữ bản nháp riêng; **Dùng lại câu gốc** khôi phục lựa chọn hiện tại. Giữ transcript gốc và start/end để nghe lại cả câu; AI tập trung vào phần bạn đã chỉnh.
- **Quản lý thư viện:** dùng **＋ Nhóm & nhãn** để tạo/sửa/xoá danh mục. Gắn nhãn hoặc chuyển nhóm cho từng câu trong chi tiết, hoặc chọn nhiều thẻ để thao tác hàng loạt. Bấm vào thẻ để mở cửa sổ chi tiết: mỗi ngữ cảnh có **Chỉnh sửa câu / ghi chú** và **Xoá ngữ cảnh**; mỗi bài đã tạo có **Chỉnh sửa bài học** và **Xoá bài học**. Sửa bài giữ ID, tiến độ và lịch FSRS. Khi sửa từ/công thức, kiểm tra cả ví dụ và đáp án trong phần mở rộng. Đổi câu nguồn bỏ phân tích cũ, cho phép phân tích lại khi cần, giữ các bài học độc lập đã tạo; đổi riêng ghi chú giữ phân tích.
- **Xoá và khôi phục:** xoá có bước xác nhận, tạo snapshot cùng giao dịch với thao tác xoá (giữ 5 bản gần nhất). Xoá ngữ cảnh giữ các bài còn dùng ở ngữ cảnh khác; bài chỉ thuộc ngữ cảnh này và lịch sử liên quan sẽ bị xoá. Xoá riêng bài học giữ ngữ cảnh gốc. Tải snapshot trong **Cài đặt & dữ liệu → bản chụp trên máy**, nhập lại để phục hồi các mục đã mất; quy tắc import vẫn giữ tiến độ của ID đang có. Snapshot nằm trên máy, không tự tải file chỉ vì thao tác xoá.
- **Note & luyện nghe:** mở lại video để thấy panel và marker, nhảy note trước/sau; **Luyện lại các đoạn** cho lặp/tốc độ/ẩn CC lần đầu. Thẻ có nguồn video có nút nghe clip gốc và mở nguồn nếu video chặn nhúng. Bản sửa ASR chưa chắc chắn phải được bạn xác nhận trước khi tạo bài học.
- **Phân tích sau:** trong Thư viện chọn các đoạn → **Phân tích (N)**. Xử lý từng đoạn; mỗi phút lấy thêm một job. Chưa nhập key thì hàng đợi giữ nguyên. Rate limit/lỗi mạng được retry có backoff, tối đa 4 lần. Job đang chạy bị gián đoạn được nhận lại sau khi lease 90 giây hết.
- **Duyệt bài:** AI trả nghĩa Việt, cấu trúc, cụm từ, ví dụ mới, bài viết và cloze. Kiểm tra rồi bấm **Duyệt & đưa vào lịch ôn**. Mục trùng hiện đề xuất ghép ví dụ và giữ tiến độ; có thể chọn tạo riêng nếu khác nghĩa.
- **Không dùng AI:** ghi nghĩa cho một đoạn ngắn dưới 500 ký tự rồi chọn **Tạo bài từ ghi chú**. Bài thủ công không có ví dụ mới do AI sinh.
- **Ôn:** tự viết trước, nhờ AI chấm hoặc tự đối chiếu. `Chưa nhớ / Khó / Nhớ / Dễ` cập nhật lịch FSRS. Dùng gợi ý hoặc xem trước đáp án được ghi là chưa tự nhớ. Nghe câu/từ bằng giọng đọc sẵn có của máy/trình duyệt, không gọi API trả phí.
- **Mục khó:** sau 5 lần quên, tạm dừng và đưa vào **Cần chăm sóc**. Đọc lại/nhờ AI giải thích cách khác rồi chủ động đưa trở lại lịch ôn.
- **Nghe chép chính tả:** tự xen vào lượt ôn thứ tư, hoặc chọn **Đổi sang nghe chép chính tả**. Gõ trước khi đối chiếu; chấm từng từ offline, lưu lỗi vào hồ sơ. Không hiện panel note trong player ôn tập. Video có chữ ghi sẵn trong hình vẫn có thể lộ lời nói.
- **Hồ sơ & lộ trình:** xem nhóm lỗi và ảnh hưởng tiếng Việt, luyện bài mới nhắm lỗi, bản đồ 17 chủ đề, phân bố độ khó ước lượng, lượng API dùng, hiệu chỉnh FSRS và đoạn tổng hợp tuần. Bài luyện theo lỗi tự chuẩn bị khi có ít nhất 3 lỗi cùng nhóm, tối đa một/ngày; có thể tắt. Tổng hợp tuần tự động cần bật riêng.
- **Kiểm tra thẻ:** mở **Kiểm tra nội dung & ưu tiên học** để tra định nghĩa/IPA có nguồn, giải thích lại, ghi báo sai và tạm dừng, hoặc ưu tiên/hạ ưu tiên mục mới.
- **Nhận diện khi đọc:** mặc định **tắt**. CSS Custom Highlight không bọc/sửa text node. Có tùy chọn thêm các dạng biến đổi thông dụng (`write/wrote/written`, `child/children`…), chưa phải lemmatization đầy đủ. Tối đa 3.000 cụm, 12.000 biến thể, 500 vùng, 20.000 element/phiên. Dựng matcher và quét DOM theo idle chunk; chưa khớp qua nhiều thẻ. Lần gặp tăng thống kê tiếp xúc, không tự chấm là nhớ đúng.
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

`npm test` có 64 kiểm thử dữ liệu, phụ đề/timing, lỗi/quota, nâng cấp DB v1/v2→v3, nhóm/nhãn và kiểm định tham số. `npm run test:e2e` chạy bốn bộ: luồng đọc, YouTube/hồ sơ, tương thích Gemini, thư viện 5.000 câu và font tiếng Việt. `npm run check:text` kiểm tra UTF-8, manifest và kích thước icon. YouTube được mô phỏng bằng native media/TextTrack; Gemini và từ điển có response giả lập. `node scripts/performance.mjs` kiểm tra riêng 3.000 unit đánh dấu trên trang dài với CPU throttle. Kết quả/screenshot nằm trong `test-results/`; không dùng key thật.

## Kiến trúc & dữ liệu

- [Thiết kế, lựa chọn thay thế và roadmap](docs/ARCHITECTURE.vi.md)
- [Thiết kế bản 0.2.0, trade-off và phạm vi phase 2–4](docs/EXTENSIONS.vi.md)
- [Schema, ví dụ và hợp đồng dữ liệu](docs/DATA.vi.md)
- [Ma trận nghiệm thu và giới hạn kiểm chứng](docs/VALIDATION.vi.md)
- [JSON Schema phân tích](docs/analysis.schema.json)

```text
src/domain/       Kiến thức, review, schema runtime, giao diện Scheduler + adapter FSRS
src/data/         IndexedDB, transaction, queue lease, export/import/snapshot
src/ai/           AIProvider + adapter Gemini, schema, hash cache, phân loại lỗi
src/background/   MV3 messages/alarms/badge/jobs, offscreen Blob cho backup
src/content/      Selection, Shadow DOM capture, matcher và highlight tùy chọn
src/video/        Caption adapters, timeline/note, editor và rewatch YouTube
src/learning/     Lỗi, dictation, tần suất, morphology, optimizer worker, tổng hợp
src/shared/       Protocol có kiểm tra đầu vào, liên kết nguồn
src/ui/           Giao diện React tiếng Việt, thống kê từ review log
tests/            Kiểm thử logic và fixture AI
scripts/          Build, schema và Chromium E2E
```

Export JSON có version và chứa dữ liệu học đầy đủ, bao gồm câu trả lời và phản hồi AI. API key và cache có thể tái tạo được không xuất. Import kiểm tra toàn bộ trước khi ghi và ghép trong transaction: ID đã có giữ nguyên toàn bộ mục và lịch sử gắn với mục đó, tránh khôi phục bản cũ làm lùi tiến độ. Đây là **nhập bảo toàn**, chưa phải đồng bộ/giải quyết xung đột hai thiết bị. Khôi phục vào hồ sơ trống giữ nguyên dữ liệu học và cài đặt.

Khóa Gemini lưu trong `chrome.storage.local` chỉ cho trusted contexts; không mã hóa trước người có quyền đọc hồ sơ máy. Không gửi URL, tiêu đề trang, vị trí cuộn, API key cho mô hình: request phân tích chỉ chứa đoạn trích, ngữ cảnh, heading và ghi chú. Hãy lưu nội dung riêng tư ở chế độ không AI nếu không muốn gửi cho Google. Xem [tài liệu API key của Google](https://ai.google.dev/gemini-api/docs/api-key).

Đây là bản cá nhân có kiểm thử. Timestamp phụ đề quan sát là ước lượng; bảng A1–C2 chưa được thẩm định CEFR; hiệu chỉnh FSRS hiện thử 6/21 tham số, có validation và hoàn tác. Chưa chứng minh chất lượng chấm với key thật, mọi biến thể YouTube hoặc hiệu năng trên mọi máy. Chi tiết các phần còn hoãn nằm trong thiết kế bản mở rộng.
