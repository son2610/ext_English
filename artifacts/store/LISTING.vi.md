# Nội dung Chrome Web Store — LumaRead 0.6.0

Dùng cùng [hướng dẫn nộp lần đầu](SUBMIT.vi.md). Mọi đoạn trong khung code bên dưới có thể dán thẳng vào Developer Dashboard.

**Tên tiện ích** (lấy từ manifest, ≤ 75 ký tự): LumaRead — Tiếng Anh từ ngữ cảnh
**Nhà phát hành:** Blue · **Email hỗ trợ:** phamhongson5151@gmail.com
**Ngôn ngữ listing:** Tiếng Việt · **Danh mục:** Education · **Khẩu hiệu:** Đọc. Hiểu. Nhớ.

## Mô tả ngắn

Lấy tự động từ trường `description` trong manifest (≤ 132 ký tự), không sửa trong Dashboard:

```text
Biến câu tiếng Anh trên web và YouTube thành bài học: giải thích AI bằng tiếng Việt, nhãn màu, luyện viết và ôn đúng hạn.
```

## Mô tả đầy đủ (dán vào ô "Description")

```text
Bạn đọc được một câu tiếng Anh, hiểu lờ mờ rồi lại quên?

LumaRead giúp bạn giữ lại câu ấy, hiểu nó trong đúng ngữ cảnh và luyện dùng lại khi đến hạn ôn. Nguồn học là bài viết, tài liệu và video YouTube bạn đang quan tâm — phù hợp dân văn phòng, học sinh, sinh viên dùng máy tính mỗi ngày.

MỚI TRONG 0.6.0
• Ôn 30 giây ngay trên thanh công cụ: bấm biểu tượng LumaRead để ôn một thẻ đến hạn trong lúc chờ build, chờ họp. Tự gõ câu trả lời, xem đáp án, chấm bằng phím 1–4. Dùng chung lịch FSRS với trang Ôn tập.
• Phòng Lab có thêm Ghép cặp (nối tiếng Anh với nghĩa tiếng Việt, có đồng hồ) và Trắc nghiệm (đáp án nhiễu lấy từ chính thư viện của bạn).

ĐỌC ĐẾN ĐÂU, GIỮ LẠI ĐẾN ĐÓ
• Bôi đen một câu hoặc cụm từ trên trang web để lưu cùng ghi chú và ngữ cảnh xung quanh.
• Lưu câu vừa nghe từ phụ đề YouTube, sửa câu/từ muốn học và quay lại mốc video gốc.
• Lưu nhanh bằng phím tắt, rồi phân tích sau để giữ mạch đọc.

HIỂU CÂU, HIỂU CẢ CÁCH DÙNG
• Dùng Gemini, DeepSeek, OpenAI hoặc GLM với API key của chính bạn để giải thích nghĩa và ngữ pháp bằng tiếng Việt.
• Sắp xếp model chính/dự phòng; tự chuyển khi AI lỗi hoặc trả dữ liệu không hợp lệ. Hỗ trợ thêm API tương thích OpenAI.
• Tách câu thành các đơn vị học độc lập: cấu trúc, cụm từ, câu điền khuyết.
• Đọc ví dụ mới, đối chiếu phụ đề tự động, duyệt nội dung trước khi đưa vào lịch ôn.

TỰ VIẾT RA ĐỂ NHỚ LÂU HƠN
• Ôn đúng hạn theo FSRS, xen kẽ viết lại, điền khuyết và vận dụng vào ví dụ mới.
• Nhờ AI chấm câu bạn viết, chỉ ra lỗi cụ thể và giải thích cách sửa.
• Luyện nghe chép chính tả và xem nhóm ngữ pháp mình còn yếu.

PHÒNG LAB — NĂM CÁCH GẶP LẠI ĐIỀU ĐÃ HỌC
• Lướt nhanh: tiếng Anh ở trên, nghĩa ở dưới; chọn tốc độ, ẩn nghĩa để tự đoán, lặp liên tục.
• Bong bóng: bảng thẻ nhiều màu tự lật từ tiếng Anh sang nghĩa.
• Điền khuyết: tự gõ phần còn thiếu trong câu gốc.
• Ghép cặp: bảng 4, 6 hoặc 8 cặp, đồng hồ tính giờ, cặp nhầm được đánh dấu để luyện lại.
• Trắc nghiệm: Anh → Việt, Việt → Anh hoặc trộn; chọn bằng phím 1–4.
• Dùng nội dung đã lưu, không gọi AI. Lab là luyện thêm và không tự thay đổi lịch FSRS.

THƯ VIỆN NGĂN NẮP, DÙ BẠN ĐÃ LƯU NHIỀU NĂM
• Thẻ ngữ cảnh gọn, bấm để mở chi tiết; có chế độ danh sách gọn.
• Chia nhóm theo chủ đề, gắn nhãn màu, tìm kiếm tiếng Việt có hoặc không dấu.
• Lọc câu có bài đến hạn, chờ tạo bài học hoặc cần chăm sóc; sắp xếp và phân trang.
• Chọn nhiều câu để chuyển nhóm, gắn/gỡ nhãn hoặc phân tích AI theo hàng đợi.
• Chỉnh sửa câu, ghi chú và bài học; xoá có xác nhận và bản sao lưu để khôi phục.

DỮ LIỆU HỌC DO BẠN GIỮ
• Ngữ cảnh, nhóm/nhãn và tiến độ được lưu cục bộ trong trình duyệt.
• Export/import JSON đầy đủ và sao lưu định kỳ khi Chrome đang chạy.
• Không cần tạo tài khoản LumaRead. Không có máy chủ riêng, quảng cáo hay analytics.

ĐIỀU CẦN BIẾT TRƯỚC KHI CÀI
• Tiện ích thay trang tab mới bằng góc học. Biểu tượng trên thanh công cụ mở popup Ôn 30 giây; trên YouTube, popup có thêm nút lưu câu vừa nghe.
• Lưu câu, quản lý thư viện, ôn tập và Phòng Lab không cần API key. Tính năng AI cần mạng và API key riêng của nhà cung cấp; hạn mức hoặc phí phụ thuộc tài khoản AI của bạn.
• Khi bạn yêu cầu AI, nội dung liên quan tới bài học (câu đã chọn, ngữ cảnh, ghi chú, câu trả lời cần chấm) được gửi trực tiếp đến nhà cung cấp bạn cấu hình, kể cả nhà cung cấp dự phòng nếu bật. URL trang không được gửi cho AI. Tra từ điển và phát video gốc dùng dịch vụ bên ngoài.
• Phần tích hợp Gemini tuân theo điều khoản của Google (từ 18 tuổi, khu vực được hỗ trợ).
• Chrome không cho tiện ích hoạt động trên một số trang được bảo vệ như chrome:// và Chrome Web Store. Khả năng lấy phụ đề phụ thuộc video và giao diện YouTube.
• Đánh dấu lại cụm từ khi duyệt web là tính năng tùy chọn, mặc định tắt.

Hỗ trợ: Blue — phamhongson5151@gmail.com
```

## Ảnh và file nộp

| Mục trong Dashboard | File | Quy cách |
| --- | --- | --- |
| Gói extension (Package → Upload new package) | `../lumaread-0.6.0.zip` | `manifest.json` nằm ở gốc zip, version 0.6.0, không kèm source map |
| Store icon | `icon-128.png` | 128 × 128, hình 96 × 96 + 16 px trong suốt mỗi cạnh |
| Screenshot 1 | `01-library-1280x800.png` | Thư viện, nhóm và nhãn màu |
| Screenshot 2 | `02-context-1280x800.png` | Chi tiết ngữ cảnh và phân tích |
| Screenshot 3 | `03-review-1280x800.png` | Ôn tập: tự viết trong ngữ cảnh mới |
| Screenshot 4 | `04-lab-match-1280x800.png` | Phòng Lab: Ghép cặp (mới 0.6.0) |
| Screenshot 5 | `05-quick-review-1280x800.png` | Popup Ôn 30 giây (mới 0.6.0) |
| Small promo tile (bắt buộc) | `promo-440x280.png` | 440 × 280 |
| Marquee promo tile (tùy chọn) | `marquee-1400x560.png` | 1400 × 560 |
| Privacy policy URL | Doc Lark `https://transform.sg.larksuite.com/docx/Vg0ZdsD9OoK5bux9JPslfcXYgye` (cùng nội dung `privacy.html`) | Công khai chỉ đọc; xem bước 2 trong [hướng dẫn](SUBMIT.vi.md) |

Store cho tối đa 5 screenshot, kích thước 1280 × 800, góc vuông, không viền. Ảnh là giao diện thật với dữ liệu minh hoạ trong hồ sơ kiểm thử riêng, không chứa API key hay dữ liệu cá nhân. Ảnh 05 đặt popup thật lên nền thương hiệu kèm chú thích. Tạo lại: `node scripts/e2e-organization.mjs` (01–03), `node scripts/store-screenshots.mjs` (04–05), `node scripts/store-assets.mjs` (promo, marquee).

## Tab "Privacy practices" (dán tiếng Anh cho reviewer)

**Single purpose description**

```text
LumaRead helps Vietnamese speakers learn English from the web pages and YouTube videos they already read and watch: the user saves an English sentence with its context, optionally gets a Vietnamese explanation from an AI provider they configure with their own API key, and then practises it with spaced-repetition review and offline practice games.
```

**Permission justifications**

| Permission | Justification (paste) |
| --- | --- |
| `storage` | `Stores the user's settings and the AI API keys they enter. Keys are restricted to trusted extension contexts (not content scripts) and are never exported.` |
| `unlimitedStorage` | `The learning library (saved sentences, analyses, schedules and review history) lives in IndexedDB on the user's device and grows over years; it also keeps up to 5 local recovery snapshots.` |
| `alarms` | `Wakes the service worker every minute to process AI analyses the user queued, update the due-review badge and run the optional periodic backup.` |
| `activeTab` | `When the user clicks the toolbar icon, the popup checks whether the current tab is a YouTube video so it can offer "save the sentence you just heard". The address is not stored or sent anywhere.` |
| `offscreen` | `Creates the JSON Blob for the user's backup file, which the service worker cannot do by itself (offscreen reason: BLOBS). The document closes when the download finishes.` |
| `downloads` | `Saves the user's backup JSON file to the Downloads/MachDoc folder when they click "Back up now" or enable automatic backup.` |
| Host permissions | `Content scripts run on http/https pages (including iframes) only to show the save button next to the user's text selection and read that selection with its nearby context; an optional, off-by-default feature highlights phrases the user has already saved. On YouTube they read captions so the user can save the sentence they just heard. Fixed hosts: generativelanguage.googleapis.com (Google Gemini with the user's own key), api.dictionaryapi.dev (dictionary lookups the user requests), youtube.com/api/timedtext (caption tracks). optional_host_permissions https://*/* is requested at runtime only for the specific HTTPS origin of an AI provider the user adds (DeepSeek, OpenAI, Z.ai or an OpenAI-compatible endpoint). No browsing history is collected.` |

**Remote code:** chọn **No, I am not using remote code**. Toàn bộ JavaScript nằm trong gói; AI chỉ trả JSON dữ liệu, không trả mã để chạy.

**Data usage — tick các ô sau** (Chrome yêu cầu khai báo cả dữ liệu chỉ xử lý trên máy):

| Ô | Tick? | Lý do |
| --- | --- | --- |
| Personally identifiable information | Không | Không thu tên, email, địa chỉ. |
| Health information | Không | |
| Financial and payment information | Không | |
| **Authentication information** | **Có** | API key người dùng tự nhập; lưu trên máy, chỉ gửi tới đúng nhà cung cấp AI để xác thực. |
| Personal communications | Không | |
| Location | Không | |
| **Web history** | **Có** | URL, tiêu đề và thời điểm của trang mà người dùng chủ động lưu câu; nhật ký "gặp lại" (nếu bật) lưu hash URL theo ngày. Chỉ trên máy, không gửi đi. |
| User activity | Không | Không ghi phím, click, cuộn. |
| **Website content** | **Có** | Câu người dùng chọn và ngữ cảnh gần đó, phụ đề YouTube; gửi tới nhà cung cấp AI khi người dùng yêu cầu phân tích/chấm. |

Tick cả 3 ô cam kết (certifications): không bán/chuyển dữ liệu ngoài mục đích đã nêu; không dùng dữ liệu cho mục đích không liên quan; không dùng để xét tín dụng/cho vay.

**Privacy policy URL:** `https://transform.sg.larksuite.com/docx/Vg0ZdsD9OoK5bux9JPslfcXYgye` (Lark Docs, công khai chỉ đọc; xem bước 2 trong [hướng dẫn](SUBMIT.vi.md)).

## Tab "Test instructions" (tùy chọn, nên điền)

```text
No account or API key is needed to test the core flow.
1. Open any English article (e.g. a Wikipedia page), select a sentence, click the green "+" button, type a Vietnamese note and save (leave "Nhờ AI phân tích" unchecked).
2. Open a new tab: the LumaRead dashboard appears. Go to "Thư viện ngữ cảnh", open the saved sentence and click "Tạo bài từ ghi chú" to create a lesson without AI.
3. "Ôn tập" (review page) shows the lesson; type an answer, click "Tự đối chiếu", then rate it.
4. Click the LumaRead toolbar icon: the "Ôn 30 giây" popup reviews one due card (type, Ctrl+Enter, keys 1–4).
5. "Phòng Lab" offers five offline practice modes (Ghép cặp and Trắc nghiệm need at least 2 saved items).
AI features (Gemini/DeepSeek/OpenAI/GLM) require the tester's own API key under "Cài đặt & dữ liệu → Nhà cung cấp AI & dự phòng"; they are optional. The UI is in Vietnamese.
```

## Ghi chú rủi ro khi duyệt

- **Quyền rộng** (content script trên mọi trang http/https) thường khiến lượt duyệt đầu lâu hơn (vài ngày tới vài tuần). Giải trình ở trên nói rõ lý do; không nên thu hẹp vì nút lưu phải có mặt ở mọi trang đọc.
- **Thay tab mới**: đã nêu rõ trong mô tả. Người dùng không muốn có thể dùng bản build `NO_NEW_TAB=1`, nhưng bản Store nên giữ nguyên để khớp mô tả.
- **Điều khoản Gemini API** ([hiệu lực 23/03/2026](https://ai.google.dev/gemini-api/terms)): yêu cầu 18+, mục đích chuyên môn/kinh doanh, khu vực được hỗ trợ, Paid Services tại EEA/Thuỵ Sĩ/Anh. Đây là điều kiện của nhà cung cấp; Blue cần xác nhận đối tượng phát hành phù hợp. Nếu hướng tới học sinh dưới 18 tuổi, nên nói rõ AI là tùy chọn và cân nhắc nhà cung cấp khác.
- **Chính sách CWS từ 01/08/2026**: dữ liệu thu phải thật sự cần cho mục đích duy nhất và được công bố nổi bật; mô tả và popup lưu câu đã nói rõ việc gửi nội dung cho AI người dùng chọn. Chính sách riêng tư đã có cam kết Limited Use.
- Tên "LumaRead" chưa được tra cứu nhãn hiệu; tra cứu trên Store không thay thế đăng ký nhãn hiệu.

Quy cách tham khảo: [ảnh/icon/screenshot](https://developer.chrome.com/docs/webstore/images), [trường Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [tab Privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [câu hỏi về dữ liệu người dùng](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
