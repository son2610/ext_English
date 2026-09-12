# AI nhiều nhà cung cấp — LumaRead 0.4.0

## Cách thiết lập Gemini + DeepSeek

1. Tải lại extension tại `chrome://extensions`, sau đó tải lại tab LumaRead đang mở.
2. Vào **Cài đặt & dữ liệu → Nhà cung cấp AI & dự phòng**. Gemini đang dùng được giữ nguyên khóa, model phân tích và model chấm viết.
3. Chọn **DeepSeek → + Thêm kết nối**, nhập khóa API DeepSeek. Nhập đúng tên model tài khoản hỗ trợ; tên có thể sửa tự do. `deepseek-flash` là gợi ý từ tài liệu JSON Output tại thời điểm kiểm tra, không phải cam kết model luôn sẵn có.
4. Dùng **↑ Lên / ↓ Xuống** để đặt thứ tự. Bật **Tự chuyển sang AI dự phòng khi gặp lỗi**, rồi **Lưu cấu hình AI**. Chrome có thể hỏi quyền kết nối tới máy chủ mới.
5. Bấm **Kiểm tra JSON** trên từng kết nối đã lưu. Model chấm viết có nút kiểm tra riêng. Kiểm tra gửi một yêu cầu nhỏ, không gửi thư viện và không dùng AI khác để che lỗi của kết nối đang kiểm tra.

Tối đa 6 kết nối, có thể thêm nhiều model của cùng nhà cung cấp với các khóa riêng hoặc cùng khóa. Nếu để trống model chấm viết, mọi tác vụ của kết nối dùng model phân tích. Model chấm viết được dùng cho chấm bài, giải thích lại và bài luyện lỗi; tổng hợp tuần dùng model phân tích. Kết nối tắt bị bỏ qua. Nếu tắt tự dự phòng, chỉ dùng kết nối đầu tiên đang bật, kể cả khi kết nối đó thiếu khóa.

OpenAI dùng khóa API riêng; gói đăng nhập ChatGPT không được dùng để xác thực API trong extension. “GLM” được hỗ trợ qua Z.ai API thông thường. Không mặc định dùng endpoint Coding Plan cho ứng dụng học ngoại ngữ. **API tương thích OpenAI** cho phép thêm nhà cung cấp mới nếu họ hỗ trợ HTTPS Chat Completions, `response_format: {type: "json_object"}` và đầu ra trong `choices[0].message.content`. URL gốc có thể là `https://api.example.com/v1`; không thêm `/chat/completions`, khóa trong URL, query hoặc fragment. API chỉ hỗ trợ Responses, Anthropic Messages hoặc mô hình trả riêng công cụ cần adapter mới.

## Khi xảy ra lỗi

| Trường hợp | Hành vi |
| --- | --- |
| Mạng/timeout, HTTP 408/429/5xx | Chuyển sang kết nối kế tiếp, tạm nghỉ kết nối lỗi ít nhất 60 giây; tôn trọng `Retry-After` đến tối đa 24 giờ. |
| Khóa sai, thiếu số dư, tên model sai hoặc API từ chối tham số | Thử kết nối kế tiếp. Lỗi được ghi theo tác vụ/model, không tự sửa khóa hoặc tên model. |
| Gemini/OpenAI báo rõ không hỗ trợ schema | Thử JSON mode một lần trong cùng khoảng thời gian cho kết nối; vẫn kiểm tra Zod. Sau đó mới chuyển nhà cung cấp nếu cần. |
| JSON rỗng/hỏng, sai kiểu, vượt giới hạn, thiếu trường, câu bị cắt, trích dẫn/cloze/coverage sai | Loại kết quả và thử kết nối kế tiếp; không cache hoặc lưu thành bài học. |
| Thiếu khóa hoặc chưa cấp quyền host | Bỏ qua khi bật dự phòng; không tính lượt API. |
| Đạt hạn mức ngày/tháng **cục bộ** | Dừng cả chuỗi. Dự phòng không vượt hạn mức bạn đặt. |
| Từ chối nội dung rõ ràng từ nhà cung cấp | Dừng yêu cầu, không chuyển để né bộ lọc của nhà cung cấp. |
| Lỗi dữ liệu đầu vào hoặc lỗi lưu trữ trên máy | Dừng, không trả phí cho nhà cung cấp khác để thử lại thao tác cục bộ. |
| Tất cả AI đều lỗi | Hiển thị lỗi theo kết nối. Hàng đợi nền giữ capture, backoff nếu có lỗi tạm thời, tối đa 4 lần xử lý; có thể yêu cầu phân tích lại trên chính câu đã lưu. |

Lịch sử ở **Hồ sơ & lộ trình → Sử dụng AI → Các lần gọi gần đây** ghi provider, model thực tế, tác vụ, thành công/thất bại và dấu **Dự phòng**. Mọi lần gửi, kể cả schema retry và kiểm tra kết nối, được tính chung vào hạn mức; kết quả cache không tính thêm. Token ghi theo số API báo, không suy ra chi phí.

## Cùng hợp đồng dữ liệu, không phụ thuộc provider

```text
UI / service worker / tác vụ học tự động
  → getProvider() → LearningProvider (prompt + hợp đồng tác vụ)
  → StructuredClient (thứ tự, deadline, quota, cooldown, cache)
  → adapter Gemini hoặc Chat Completions
  → JSON.parse → Zod + kiểm tra ngữ cảnh → kết quả kiểu TypeScript
  → người học duyệt → bài học và lịch FSRS
```

Các tác vụ dùng chung `AnalysisSchema`, `TranscriptRepairSchema`, `GradeSchema`, `DrillSchema`, `WeeklyTextSchema` và schema giải thích ngắn. Phân tích kiểm tra evidence trích trong nguồn, đúng một `[[blank]]` và đáp án khôi phục câu gốc. Bài tổng hợp phải có đúng mỗi ID được yêu cầu một lần và trích dẫn tồn tại trong đoạn sinh ra. OpenAI strict schema chuyển trường tùy chọn thành nullable trên đường truyền; chỉ loại `null` ở đúng trường tùy chọn trước khi kiểm tra bằng schema gốc. Không ép kiểu chuỗi thành số, không tự điền trường bắt buộc, không dùng regex để nhặt JSON từ Markdown.

Gemini vẫn dùng schema gọn để tránh lỗi bộ giải mã quá phức tạp. OpenAI dùng strict JSON Schema; DeepSeek/GLM/custom dùng JSON mode kèm cùng cấu trúc trong system prompt. Đây là khác biệt về giao thức. Tất cả phản hồi phải qua cùng kiểm tra cục bộ trước khi chạm dữ liệu học. Hợp đồng cấu trúc không chứng minh nghĩa/ngữ pháp luôn chính xác: bước duyệt nội dung, báo lỗi và giải thích lại vẫn cần thiết.

**Thay thế và trade-off:** có thể dùng SDK từng hãng, nhưng HTTP adapter nhỏ giảm kích thước extension và dễ kiểm soát envelope/headers/redirect. Có thể yêu cầu strict schema ở mọi hãng, nhưng không phải API/model nào cũng hỗ trợ cùng tập JSON Schema. Có thể gọi song song để giảm độ trễ, nhưng sẽ gửi dữ liệu và trả phí cho nhiều nơi dù model đầu thành công; bản này dùng chuỗi tuần tự.

## Thời gian, cache và MV3

Mỗi kết nối có tối đa 23 giây (chia nhỏ khi cần để dành thời gian cho những kết nối còn lại), bao gồm schema retry. Hai giai đoạn YouTube dùng tổng deadline 80 giây trong lease nền 90 giây; phục hồi phụ đề dành tối đa 38 giây. Các yêu cầu UI khác có deadline 65 giây. Không ngủ chờ `Retry-After` trong worker: mốc nghỉ lưu trên máy, alarm/hàng đợi thử sau. Cấu hình ít model thường dành được nhiều thời gian hơn cho mỗi model.

Cache SHA-256 gồm phiên bản giao thức, provider, endpoint, model, system prompt, schema và input; chỉ ghi sau khi kiểm tra, đọc lại cũng kiểm tra. Giữ giới hạn 300 kết quả như trước. Phụ đề đã phục hồi có cache riêng, nên chuyển provider ở bước phân tích không phải gọi lại bước phục hồi trong cùng yêu cầu. Cooldown dùng ID/endpoint/model và dấu vân tay khóa để khóa mới không bị trạng thái lỗi khóa cũ cản trở; không xuất cooldown ra backup. Lưu cấu hình AI xóa các cooldown cũ.

## Khóa, quyền và dữ liệu di chuyển

- `Settings.ai` chứa cấu hình không có khóa, thứ tự và nút bật dự phòng; được export/import cùng backup v3. Không đổi DB v3, ID extension, câu đã lưu hoặc lịch FSRS.
- `chrome.storage.local.aiKeys` chứa khóa, giới hạn `TRUSTED_CONTEXTS`. Khóa gắn với ID kết nối + provider + endpoint. Đổi endpoint yêu cầu nhập lại khóa; import không thể lấy một khóa đã lưu để gửi tới endpoint khác.
- Khóa Gemini kiểu cũ tự chuyển khi lưu cấu hình AI lần đầu. Khóa không ở IndexedDB/export, prompt, thông báo content script hoặc nhật ký sử dụng. Lỗi từ máy chủ được ẩn mọi khóa trong chuỗi kết nối.
- Dùng `optional_host_permissions: ["https://*/*"]` để có thể thêm API mới, nhưng chỉ yêu cầu các origin đã chọn khi lưu. Router kiểm tra quyền trước khi gọi. CSP cho phép kết nối HTTPS để hỗ trợ URL tùy chọn; script vẫn chỉ từ extension, không có remote code/eval. Phương án allowlist cố định có phạm vi hẹp hơn nhưng mỗi hãng mới phải phát hành bản extension mới.
- Request không mang cookie/referrer, không theo redirect. Khóa chỉ gửi trong header tới đúng endpoint. URL nguồn không được thêm vào prompt; văn bản/ghi chú do người dùng chọn vẫn có thể tự chứa dữ liệu riêng tư.
- Bật dự phòng đồng nghĩa cho phép gửi cùng dữ liệu tác vụ đến các nhà cung cấp trong danh sách khi cần. Đã cập nhật thông báo capture và chính sách riêng tư. Blue không nhận các request hoặc API key này.

## Tài liệu chính thức đã đối chiếu ngày 12/09/2026

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): strict schema, trường tùy chọn nullable và phản hồi từ chối.
- [OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): model gợi ý, có thể đổi trong cài đặt.
- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/), [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/): JSON mode cần chỉ dẫn JSON và có thể trả rỗng/cắt ngắn.
- [Z.ai Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion), [API endpoint](https://docs.z.ai/api-reference/introduction): JSON mode, trạng thái hoàn tất và endpoint thông thường.
- [Chrome permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions): quyền tùy chọn cấp khi cần.

Kiểm thử dùng API giả lập để chủ động tạo lỗi/JSON hỏng, không dùng khóa thật của bạn. Nút kiểm tra trong Cài đặt dùng khóa tài khoản bạn nhập trên máy để kiểm tra model thực tế.
