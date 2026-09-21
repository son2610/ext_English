# LumaRead (trước đây Mạch Đọc) — Chrome Extension MV3 học tiếng Anh từ ngữ cảnh

Bản đồ đầy đủ (kiến trúc, dữ liệu, luồng tính năng, lỗi đã biết, ý tưởng): **[docs/PROJECT-CONTEXT.vi.md](docs/PROJECT-CONTEXT.vi.md)**. Đọc file đó trước khi sửa code và cập nhật nó khi thay đổi hành vi.

## Lệnh

- `npm run typecheck` · `npm test` (Vitest + fake-indexeddb) · `npm run build` (→ `dist/`) · `npm run check:text` · `npm run test:e2e` (cần build trước)
- Nạp extension: `chrome://extensions` → Load unpacked → `dist/`, Reload sau mỗi build.

## Quy tắc không được phá

- Giữ định danh `mach-doc` (IndexedDB, backup `format`, lock, `data-mach-doc`, namespace `mach-doc-youtube`, `Downloads/MachDoc`).
- Zod là nguồn schema; dữ liệu từ AI/message/import luôn parse + kiểm tra trích dẫn/cloze trước khi ghi.
- Ghi nhiều store trong một transaction; chống ghi đè bằng `updatedAt`, `expectedReps`, lease, UUID idempotent.
- Chỉ `recordReview` được đổi lịch FSRS. Lab/encounter/weekly/targeted không tạo Review.
- Mọi lời gọi AI qua `StructuredClient` (quota, cache, dự phòng, ẩn khóa). Khóa API không vào IDB/export/prompt/log.
- Field Settings/schema mới phải optional/default; đổi IDB thì tăng version + migration + test.
- UI tiếng Việt có dấu (UTF-8); code/identifier tiếng Anh; hiển thị nội dung trang/AI bằng text, không `innerHTML` động.
- Chữ serif tiếng Anh trong app dùng `var(--english-serif)`, không đặt `Georgia` trực tiếp: Georgia thiếu chữ Việt dựng sẵn, Chrome tách dấu thành "viê´t".
- Phát hành: version ở `package.json` và `public/manifest.json` phải khớp.

## Phong cách

Code rất gọn, nhiều lệnh trên một dòng, JSX một dòng; 2 space, nháy đơn, có `;`; `void promise` cho bắn-và-quên; UI dùng mẫu `run(action, successMessage)`; lỗi người dùng là `Error` tiếng Việt; comment chỉ giải thích "vì sao".
