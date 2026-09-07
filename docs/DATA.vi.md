# Hợp đồng dữ liệu

Nguồn TypeScript + Zod: [`src/domain/models.ts`](../src/domain/models.ts). JSON Schema phát sinh bằng `node scripts/schema.mjs`; không sửa file generated bằng tay.

- [`analysis.schema.json`](analysis.schema.json): kết quả phân tích Gemini.
- [`analysis.example.json`](analysis.example.json): ví dụ điều kiện loại 3 và chunk “would have helped”, dùng trong kiểm thử.
- [`grade.schema.json`](grade.schema.json): phản hồi chấm bài viết.
- `BackupSchema` ở [`src/data/backup.ts`](../src/data/backup.ts): contract export/import.

## Từ nguồn đến đơn vị học

```text
Capture (một lần lưu một ngữ cảnh)
  id
  source: url, frameUrl, title, exact, prefix, suffix,
          context, heading, scrollY, capturedAt
  note
  status: saved | queued | processing | ready | error
  analysis?: AnalysisV1
  attempts, nextAttemptAt, leaseUntil, updatedAt, unitsCreated

AnalysisV1
  schemaVersion: 1
  meaningVi: nghĩa cả đoạn trong ngữ cảnh
  contextNoteVi: hàm ý / referent / thiếu ngữ cảnh cần lưu ý
  knowledge[]: 1–8 mục, thường yêu cầu 2–6 khi đủ thông tin

Knowledge
  key: canonical semantic identity
  kind: grammar | phrase
  group, name: tiếng Việt
  form: công thức hoặc chunk tiếng Anh
  meaningVi, explanationVi
  evidence: trích nguyên văn trong source
  examples[2..4]: { en, vi }, các câu mới
  production: { instructionVi, answerEn }
  cloze: { sentence, answer, hintVi }
```

Mỗi `Knowledge` được người học duyệt thành `Unit`; mỗi `Unit` có `captureIds[]` và một `schedule`. Cloze, production, transfer là dạng thể hiện cùng kiến thức, cùng lịch; không nhân ba bản schedule chỉ để đổi format. Hai kiến thức khác nhau trong một capture có hai schedule độc lập. Dữ liệu không gộp tất cả giải thích vào một thẻ.

`cloze.sentence` có **đúng một** `[[blank]]`. Ghép `answer` vào phải khôi phục một chuỗi trong đoạn chọn/ngữ cảnh sau chuẩn hóa whitespace/case. `evidence` cũng phải nằm trong nguồn. Backend-less không có nghĩa tin mọi JSON: shape đúng nhưng evidence sai bị chặn, không tạo đơn vị học, không cache semantic output sai. Tính đúng của nghĩa và độ phù hợp ví dụ vẫn cần người học duyệt.

### Định danh và chống trùng

`canonical = kind + ':' + normalize(key)`; chuẩn hóa NFKC/case/apostrophe/whitespace. `phrase` key phải có nghĩa, không chỉ surface word: ví dụ `set-up:configure` và `set-up:establish` có thể khác nhau. Tìm trùng thêm theo kind + form + name chuẩn hóa. Không tự hợp nhất hai cụm chỉ vì giống chữ. AI có thể đặt key không nhất quán: đây là duplicate gợi ý xác định, chưa phải semantic search đầy đủ.

Mặc định khi người dùng duyệt đề xuất trùng, chỉ thêm capture ID và ví dụ mới (giữ tối đa 4 ở unit), không reset schedule, failures hay review. Phân tích đầy đủ của mỗi capture vẫn còn nên ví dụ cũ không mất khi ngân hàng ví dụ unit đổi. Checkbox “Khác nghĩa / cấu trúc” tạo unit riêng. Duyệt lại cùng capture không sinh bản sao.

### Lịch và lịch sử

`Schedule` lưu số epoch millisecond cho due/last_review, cùng state/stability/difficulty/elapsed_days/scheduled_days/reps/lapses/learning_steps. Adapter chuyển Date cho `ts-fsrs` rồi serialize. Không tự tái tạo công thức FSRS rút gọn.

Mỗi `Review` có UUID, unitId, timestamp, rating 1–4, exercise mode, answer, grade tùy chọn, prior/next schedule, durationMs, assisted. Review log bất biến; unit snapshot và review được ghi transaction. UUID chống retry/click đôi; expected reps chặn phiên stale. Mọi lượt dùng hint hoặc xem đáp án trước khi viết đều quy về Again và `assisted=true`.

`Grade` có `correct`, `score`, `feedbackVi`, `correctedEn`, `errors[]` với `original`, `correction`, `reasonVi`. Không dùng exact string equality để phán câu viết tự do; model được nhắc chấp nhận đáp án tương đương. Người học quyết định rating để có thể sửa phán đoán AI. Exact comparison cloze chỉ là thông báo đối chiếu câu nguồn, không tự kết luận mọi biến thể là sai ngữ pháp.

### Queue và ngừng worker

Capture lưu bền trước AI. Worker claim job nguyên tử, tăng attempt và đặt lease 90 giây; fetch timeout 23 giây. Khi completion về, chỉ áp dụng nếu lease trùng. Job processing cũ được claim lại khi hết lease. 429/5xx/network retry có `nextAttemptAt`, exponential backoff, jitter, `Retry-After`; hết 4 lần hoặc lỗi key/model không retry tự động. Alarm chạy mỗi phút, không có timer RAM quyết định tiến độ.

Hàng đợi chưa có key sẽ chờ, không tiêu hao attempt. Bản MVP không gửi nhiều capture trong một Gemini Batch job. Cache SHA-256 theo model + prompt version + task + context + note, không chứa key. Grade và giải thích lại không cache để tránh phản hồi cũ không phù hợp.

## Export và khôi phục

```json
{
  "format": "mach-doc",
  "version": 1,
  "exportedAt": 1788656400000,
  "settings": {
    "model": "gemini-3.5-flash",
    "retention": 0.9,
    "highlighting": false,
    "backupDays": 7,
    "autoBackup": true,
    "dailyNewLimit": 10
  },
  "captures": [],
  "units": [],
  "reviews": [],
  "encounters": []
}
```

Đây là ví dụ file rỗng hợp lệ. File thật gồm tất cả dữ liệu học; secrets/cache/snapshot lồng nhau không xuất. Dữ liệu độc lập nhà cung cấp: nghĩa/ví dụ là text, lịch/grade là JSON, không cần tài khoản Mạch Đọc để đọc file.

Nhập tối đa 150 MB, schema version phải hỗ trợ; từ chối ID lặp, thiếu source reference, thiếu unit reference, URL không phải HTTP(S), rating/state không hợp lệ. Parse/validate trước khi ghi. Tạo snapshot hiện tại rồi transaction merge. ID mới thêm; ID đã có giữ nguyên. Nếu unit đã tồn tại, không nhập chồng review/encounter của unit đó để tránh log và schedule lệch nhau. Muốn thay toàn bộ bằng backup khác, dùng hồ sơ extension trống; UI hiện chưa có nút xóa/replace toàn bộ.

**Chưa phải cơ chế sync đa thiết bị**. Nếu hai máy có tiến độ khác nhau trên cùng ID, merge bảo toàn bỏ qua nhánh nhập của mục đó; cần phase riêng giải conflict theo review event và reschedule. Không âm thầm ghép hai timeline rồi tuyên bố lịch đúng.

Snapshot dùng cùng export format. Downloads/MachDoc là file ngoài vùng extension; snapshot trong IndexedDB chỉ hữu ích cho lỗi nhập/đổi dữ liệu, không chống gỡ extension. Chỉ đặt `lastBackupDownload` khi download complete. Hỏng file/unknown version không được “cố nhập” vì có thể làm mất khả năng ôn về sau.

## Nâng cấp nhiều năm

IDB hiện version 1. Thêm store/index dùng `upgrade` tăng database version; thay schema domain tăng export/analysis version tương ứng và có migrator thuần để test fixture cũ. Giữ raw capture, full analysis và review history để có thể tái lập unit/scheduler khi thay thư viện. Khóa thư viện bằng package-lock; xem lịch sử npm lock trước khi nâng scheduler.

Tại vài nghìn capture, giới hạn output AI và ngân hàng ví dụ giúp dữ liệu có trần theo mục. Bộ sưu tập nhiều năm có thể lớn ở review log và 5 snapshots; cần aggregate/cursor và backup streaming ở phase sau. Giới hạn import 150 MB là giới hạn MVP minh bạch, không là giới hạn IndexedDB của Chrome.
