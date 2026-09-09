# LumaRead 0.3 — Thư viện dành cho nhiều năm học

LumaRead là tên mới của Mạch Đọc. Định danh IndexedDB `mach-doc`, định dạng backup `mach-doc`, đường dẫn cài đặt và khóa cục bộ được giữ để nâng cấp tại chỗ. Bản này không thay nhà cung cấp AI hay thuật toán FSRS.

## Cách sắp xếp

- **Nhóm:** một câu thuộc tối đa một nhóm, chẳng hạn Công nghệ, Giao tiếp, Đọc mỗi ngày. Câu chưa xếp vào nhóm nằm trong **Chưa phân nhóm**.
- **Nhãn màu:** một câu có thể gắn nhiều nhãn, chẳng hạn Luyện viết, Cụm từ hay, Dùng khi họp. Mỗi nhãn có tên và một trong sáu màu; thông tin luôn có chữ, không buộc người dùng phân biệt chỉ bằng màu.
- **Trạng thái học:** tính từ các bài học liên kết và lịch FSRS. “Có bài đến hạn” là câu có ít nhất một bài chưa tạm dừng đến hạn. “Đã có lượt ôn” chỉ nói đã ôn ít nhất một bài; không suy ra rằng đã thuộc hoặc đã thành thạo cả cấu trúc.
- **Thẻ gọn:** câu trích hai dòng, nghĩa/ghi chú hai dòng, nhãn, nguồn và tiến độ. Bấm hoặc dùng Enter để mở chi tiết. Cửa sổ chi tiết giữ sửa/xoá, nghe câu gốc, duyệt phân tích, kiểm tra bài học và có nút câu trước/sau. Escape đóng, focus được trả về thẻ nếu thẻ vẫn hiện.
- **Tìm và lọc:** tìm câu, ghi chú, nghĩa, tên nguồn và kiến thức liên kết; nhập có hoặc không dấu đều được, nhiều từ tìm được kết hợp. Kết hợp nhóm, một nhãn, trạng thái và loại nguồn. Có sắp xếp mới nhất/cũ nhất/cập nhật/hạn ôn.
- **Hàng loạt:** chọn từng câu hoặc chọn 24 câu trên trang, rồi chuyển nhóm, thêm/gỡ nhãn hay xếp hàng AI. Lựa chọn có thể kéo dài qua nhiều trang; đổi bộ lọc sẽ bỏ lựa chọn để tránh tác động lên câu không còn thuộc bộ lọc.
- **Quản lý danh mục:** nút “＋ Nhóm & nhãn” tạo, đổi tên/màu, xoá. Xoá nhóm đưa câu về Chưa phân nhóm; xoá nhãn chỉ gỡ nhãn. Không xoá câu hay lịch học.

## Vì sao chọn cách này

Thiết kế áp dụng việc chỉ hiện thông tin thường dùng, mở thêm khi cần: giúp bớt nội dung phải quét mắt, trong khi hành động xem chi tiết vẫn rõ ràng. Tham khảo nguyên tắc [progressive disclosure của Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/). Tìm kiếm đi cùng bộ lọc để thu hẹp tập dữ liệu lớn; các bộ lọc nằm cố định ở đầu thư viện, không kéo trang về nơi khác sau mỗi lần chọn. Tham khảo [thiết kế áp dụng bộ lọc](https://www.nngroup.com/articles/applying-filters/).

| Lựa chọn | Phương án khác | Đánh đổi |
| --- | --- | --- |
| Nhóm theo chủ đề + nhiều nhãn | Bảng Kanban “Chưa học / Đang học / Đã thuộc” kéo thả | Kanban quen thuộc nhưng trạng thái do người kéo có thể mâu thuẫn lịch ôn. Trạng thái FSRS được tính tự động; nhóm phục vụ tổ chức tài liệu. |
| Phân trang 24 thẻ, hai chế độ thẻ/danh sách gọn | Cuộn vô hạn hoặc virtualized list | Phân trang giữ số DOM thấp, có thể nhảy thẳng đến trang. Virtualization xử lý cuộn dài tốt nhưng phức tạp hơn về chiều cao, focus và khả năng truy cập. |
| Chỉ mount một phần chi tiết | Giữ tất cả rồi ẩn bằng CSS | Tránh tạo hàng nghìn form, ví dụ và player ẩn. Đổi lại cần thêm một lần bấm để xem giải thích. |
| Native `dialog.showModal()` | Drawer tự tạo bằng div/z-index | Dialog có top layer, focus trap và Escape do trình duyệt hỗ trợ; ít lỗi tương tác hơn. UI được kiểm tra riêng ở màn hình hẹp. |
| Chỉ mục tìm kiếm cục bộ, tạo một lần mỗi lần dữ liệu thay đổi | Web Worker/FTS/SQL toàn văn | Đơn giản và đủ cho vài nghìn câu; không dựng lại chỉ mục theo mỗi ký tự. Nếu dữ liệu tăng đến hàng chục nghìn câu rất dài, cần đưa truy vấn/index sang worker thay vì tăng số thẻ DOM. |

Chưa thêm kéo thả giữa các cột hoặc tự gắn nhãn bằng AI: tăng số tương tác phức tạp hoặc quota mà chưa giúp bằng tìm kiếm, lọc và thao tác hàng loạt.

## Dữ liệu và tính nhất quán

- IndexedDB nâng từ v1/v2 lên v3, thêm store `organizers`; dữ liệu cũ không cần viết lại.
- `Organizer = { id, kind: 'group' | 'label', name, color, updatedAt }`.
- `Capture.organization? = { groupId?, labelIds: string[] }`. Không có trường này là câu cũ chưa phân nhóm. Tối đa 1.000 danh mục, 60 ký tự/tên và 30 nhãn/câu.
- Thao tác hàng loạt đọc bản hiện tại trong cùng transaction với danh mục; kiểm tra cả lô trước khi ghi. Hai tab đồng thời thêm nhãn/chuyển nhóm không ghi đè phần của nhau. Câu đã xoá không bị tạo lại.
- Đổi tên/xoá danh mục kiểm tra phiên bản `updatedAt`; dữ liệu mới ở tab khác không bị ghi đè âm thầm.
- Export JSON v3 chứa toàn bộ danh mục và liên kết; vẫn nhập v1/v2. Kiểm tra ID trùng, liên kết thiếu, nhóm/nhãn sai loại trước khi nhập. Nhập giữ các ID đã có và lịch học hiện tại. Snapshot trước khi xoá câu cũng chứa nhóm/nhãn để có thể khôi phục đầy đủ.
- Các giới hạn này là giới hạn ứng dụng; ảnh/font không được ghi vào từng capture. Nhãn và màu không tham gia prompt AI, matching hay thuật toán scheduling.

## Tiếng Việt

Noto Sans Regular và SemiBold có đầy đủ glyph tiếng Việt được đóng gói cùng extension, kèm giấy phép SIL OFL. Không tải font từ CDN. Chrome có font mặc định riêng cho body trang extension; vì vậy `body` và `dialog` được đặt font rõ ràng cùng với `:root`. Các tiêu đề tiếng Việt bỏ font Georgia và giảm letter spacing âm. Câu tiếng Anh giữ serif để dễ đọc.

Các hộp thoại chèn vào trang dùng font hệ thống hỗ trợ tiếng Việt cho tiêu đề; không yêu cầu thêm quyền truy cập font trên mọi website và không phụ thuộc CSP font của trang. Nguồn font: [Noto project](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans).

Tên nhóm/nhãn mới chuẩn hoá NFC. Tìm kiếm hỗ trợ cả dấu tổ hợp NFD và chữ không dấu, nhưng không sửa câu nguồn hoặc Text Fragment. `scripts/check-text.mjs` kiểm tra UTF-8 và các dấu hiệu lỗi mã hoá trong mã giao diện. Kiểm thử Chromium kiểm tra glyph provider thực tế của chuỗi tiếng Việt, thay vì chỉ đọc tên font trong CSS.

Văn bản đã bị hỏng mã hoá từ website/file nhập không được tự đoán và thay đổi, vì điều đó có thể sửa sai nội dung đã lưu. Có thể sửa trực tiếp bằng chức năng chỉnh sửa ngữ cảnh.

## Kiểm thử

`npm run test`, `npm run typecheck`, `npm run test:e2e` và `npm run check:text`. Báo cáo riêng thư viện: `test-results/organization-e2e-report.json`, gồm 5.000 câu, tối đa 24 thẻ DOM, tìm kiếm/mở chi tiết với CPU bị làm chậm 4 lần. Các số đo chỉ phản ánh máy kiểm thử; không phải cam kết độ trễ trên mọi máy.
