# LumaRead — Đọc. Hiểu. Nhớ.

Nhà phát hành: **Blue** · phamhongson5151@gmail.com

Tên ghép ý niệm ánh sáng/hiểu rõ với hành động đọc. Logo là một trang sách gấp thành nét L, chấm sáng vàng tượng trưng cho lúc hiểu ra. Màu ngọc lục bảo tạo điểm nhận diện; màu ngà giữ cảm giác gần trang sách và vàng tạo điểm nhấn. UI dùng Noto Sans cho tiếng Việt và serif cho trích đoạn tiếng Anh.

## Các file

- `lumaread-icon-original.png`: ảnh gốc do công cụ **imagegen tích hợp** tạo, nền ngoài trong suốt. Đã sao chép vào workspace, không phụ thuộc thư mục nội bộ của Codex.
- `../../public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`, `icon-256.png`: xuất kích thước từ ảnh gốc bằng canvas, giữ alpha. Cỡ 128 có vùng hình 96 px và khoảng trong suốt 16 px mỗi bên; cỡ toolbar nhỏ tăng phần diện tích hình để rõ khi nhìn ở 16 px.
- `icon-128.png`: bản riêng để tải lên Store.
- `promo-440x280.png`, `marquee-1400x560.png`: bố cục thương hiệu bằng HTML/CSS với icon đã tạo và font Noto; xuất bằng Chromium. `brand-preview.html` là bản xem độc lập có nhúng font/icon.
- `01-library-1280x800.png`, `02-context-1280x800.png`, `03-review-1280x800.png`: ảnh chụp ứng dụng thật với dữ liệu minh hoạ trong profile kiểm thử riêng.
- `FONT-LICENSE.txt`: giấy phép SIL Open Font License của Noto Sans.

Tạo lại các kích thước icon: `node scripts/prepare-brand.mjs`. Tạo lại ảnh quảng bá: `node scripts/store-assets.mjs`. Ảnh screenshot tạo bởi `node scripts/e2e-organization.mjs`. Các script này không gọi API sinh ảnh hoặc cần API key. Ảnh gốc được tạo một lần bằng imagegen tích hợp, không dùng CLI/API fallback.

## Prompt tạo icon (nguyên văn)

```text
Use case: logo-brand. Asset type: final Chrome extension icon for LumaRead, an English learning tool that turns real reading into long-term understanding.
Create one crisp, beautiful, front-facing app icon, square composition, a bold folded bookmark forming an open book and subtle L monogram, with one small warm golden glint signaling understanding. Deep emerald green rounded-square tile, warm ivory book mark, small golden yellow accent. Simple strong silhouette readable at 16px. Flat vector-like precision, premium quiet editorial personality, smooth clean geometry, no 3D, no mockup, no text, no letters printed, no watermark, no intricate thin lines, no heavy shadow. Tile centered and occupies 75 percent of the image width/height, generous equal transparent padding on all sides. Actual transparent background outside tile, preserve alpha. 1024x1024 PNG.
```
