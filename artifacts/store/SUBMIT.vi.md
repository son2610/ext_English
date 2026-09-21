# Nộp LumaRead lên Chrome Web Store lần đầu

Nội dung để dán vào từng ô nằm ở [LISTING.vi.md](LISTING.vi.md). File này là thứ tự thao tác.

## 0. Chuẩn bị một lần

- Một tài khoản Google dùng lâu dài cho việc phát hành. **Email tài khoản nhà phát triển không đổi được sau khi tạo.**
- Bật **Xác minh 2 bước** cho tài khoản đó (bắt buộc trước khi phát hành hoặc cập nhật).
- Thẻ thanh toán quốc tế để trả **phí đăng ký 5 USD, trả một lần**.

## 1. Đăng ký tài khoản nhà phát triển

1. Mở [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) và đăng nhập.
2. Đồng ý thỏa thuận nhà phát triển và trả phí 5 USD.
3. Vào tab **Account**:
   - **Publisher name:** `Blue`.
   - **Contact email:** nhập email hỗ trợ rồi bấm link xác minh trong hộp thư (chưa xác minh thì không nộp được).
   - **Trader / Non-trader** (yêu cầu của luật EU DSA): cá nhân phát hành, không có doanh nghiệp đăng ký, không bán hàng thì chọn **Non-trader**. Nếu sau này thu tiền hoặc phát hành dưới tên công ty thì đổi sang Trader và điền thông tin doanh nghiệp.

## 2. Chính sách riêng tư và mã nguồn

Store bắt buộc có URL HTTPS công khai cho chính sách riêng tư. Trang này đặt trên **Lark Docs**, tách khỏi GitHub để link không dẫn ngược về mã nguồn:

- Link: `https://transform.sg.larksuite.com/docx/Vg0ZdsD9OoK5bux9JPslfcXYgye`
- Quyền chia sẻ: **mọi người trên Internet có link đều xem được**, chỉ đọc, không bình luận. Mở thử trong cửa sổ ẩn danh (không đăng nhập Lark) trước khi nộp.
- Nội dung trùng với `public/privacy.html` (bản đóng gói trong extension). Khi chính sách đổi, sửa cả hai nơi.

Giữ mã nguồn kín:

1. GitHub → repo `son2610/ext_English` → **Settings → General → Danger Zone → Change repository visibility → Private**. Repo từng công khai nên bản ai đó đã tải trước đây không thu hồi được.
2. Gói nộp Store không chứa source map (`scripts/package.ps1` bỏ `*.map`), nên người cài chỉ thấy JavaScript đã minify. Mã chạy trong trình duyệt vẫn đọc được về nguyên tắc; đây là giới hạn chung của mọi extension.

## 3. Tạo mục mới và tải gói

1. Dashboard → **Items → + New item**.
2. Tải `artifacts/lumaread-0.6.0.zip` (đã có `manifest.json` ở gốc zip, version 0.6.0). Dashboard báo lỗi manifest thì dừng lại, gửi lỗi để sửa trước khi điền tiếp.

## 4. Tab Store listing

- **Description:** dán phần "Mô tả đầy đủ".
- **Category:** Education. **Language:** Tiếng Việt (Vietnamese).
- **Store icon:** `icon-128.png`.
- **Screenshots:** 5 ảnh theo thứ tự `01` → `05` (1280 × 800).
- **Small promo tile:** `promo-440x280.png` (bắt buộc). **Marquee:** `marquee-1400x560.png` (tùy chọn).
- **YouTube video:** để trống nếu chưa có (không bắt buộc).
- **Homepage URL / Support URL:** để trống (repo sẽ để private). Người dùng liên hệ qua email hỗ trợ hiển thị trên trang Store và trong chính sách riêng tư.
- **Mature content:** không đánh dấu.

## 5. Tab Privacy practices

Dán theo [LISTING.vi.md](LISTING.vi.md#tab-privacy-practices-dán-tiếng-anh-cho-reviewer):

- Single purpose description.
- Giải trình từng quyền: `storage`, `unlimitedStorage`, `alarms`, `activeTab`, `offscreen`, `downloads` và host permissions.
- Remote code: **No**.
- Data usage: tick **Authentication information**, **Web history**, **Website content** và cả 3 ô cam kết.
- Privacy policy URL: link Lark ở bước 2.

## 6. Tab Distribution

- **Payments:** Free.
- **Visibility:** muốn thử trước với vài người thì chọn **Unlisted** (chỉ ai có link mới cài được), rồi chuyển sang **Public** sau. Muốn mở cho mọi người ngay thì chọn Public.
- **Regions:** tất cả khu vực. Tính năng Gemini có giới hạn khu vực của Google, nhưng lưu câu, ôn tập và Lab vẫn dùng được không cần AI.

## 7. Tab Test instructions

Dán đoạn "Test instructions" trong LISTING. Reviewer chạy được luồng chính mà không cần API key.

## 8. Gửi duyệt

1. Bấm **Submit for review**. Nếu muốn tự chọn thời điểm công bố, bỏ chọn *Publish automatically after review* (bản được duyệt sẽ chờ tối đa 30 ngày để bạn bấm Publish).
2. Thời gian duyệt thường vài ngày. Extension có content script trên mọi trang thường bị duyệt kỹ hơn, có thể lâu hơn. Kết quả gửi qua email liên hệ.
3. Nếu bị từ chối: email ghi mã vi phạm và lý do. Thường gặp: mô tả chưa khớp hành vi, giải trình quyền chưa đủ, link chính sách riêng tư không mở được khi chưa đăng nhập. Sửa đúng điểm được nêu rồi nộp lại.

## 9. Sau khi được duyệt

- Bản cài từ Store có **ID khác** bản đang Load unpacked, nên hai bản không dùng chung dữ liệu. Chuyển dữ liệu:
  1. Ở bản cũ: **Cài đặt & dữ liệu → Xuất toàn bộ JSON**.
  2. Ở bản Store: **Chọn file để nhập** → xác nhận.
  3. Nhập lại API key (file export không chứa khóa).
  4. Tắt hoặc gỡ bản Load unpacked, nếu không trang web sẽ có hai nút "+" và hai extension tranh tab mới.
- Kiểm tra link Store, ảnh và mô tả hiển thị đúng.

## 10. Cập nhật các lần sau

1. Tăng version trong `package.json`, `package-lock.json` và `public/manifest.json` (Store chỉ nhận version lớn hơn bản đang có).
2. `npm run build`, chạy kiểm thử, rồi `powershell -ExecutionPolicy Bypass -File scripts/package.ps1` để tạo `artifacts/lumaread-<ver>.zip`.
3. Dashboard → mục LumaRead → **Package → Upload new package** → cập nhật mô tả/ảnh/Privacy nếu hành vi đổi → **Submit for review**.
4. Có thay đổi về dữ liệu thì cập nhật `public/privacy.html` và doc Lark trước khi nộp.
