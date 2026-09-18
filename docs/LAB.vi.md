# Phòng Lab — LumaRead 0.5.1

Mở **Phòng Lab** ở thanh điều hướng. Chọn cách luyện, nguồn nội dung, số mục và nhịp hiển thị rồi bấm **Bắt đầu lượt luyện**. Lab dùng thư viện hiện có, không gọi AI để tạo hay chấm bài.

## Ba cách luyện

| Cách luyện | Cách hoạt động | Thiết lập |
| --- | --- | --- |
| Lướt nhanh | Hiện tiếng Anh ở trên, nghĩa tiếng Việt ở dưới; tự chuyển sang mục tiếp theo. | 0,6–10 giây/mục. Bật **Ẩn nghĩa để tự đoán** để nghĩa chỉ xuất hiện ở nửa sau thời gian hiển thị. |
| Bong bóng | Bảng ô màu vuông. Các thẻ xuất hiện lệch nhịp ở vị trí được xáo trộn, hiện tiếng Anh, xoay 180° sang nghĩa, mờ đi rồi nhường chỗ cho thẻ khác. | Bảng 2 × 2, 3 × 3 hoặc 4 × 4; 0,6–10 giây/mặt, thêm 0,24 giây cho pha biến mất. |
| Điền khuyết | Tự gõ từ/cụm còn thiếu trong câu đã lưu, xem đáp án và chuyển câu bằng nút hoặc Enter. | Không giới hạn thời gian; chỉ dùng bài đã có một chỗ trống và đáp án khớp ngữ cảnh gốc. |

Lướt nhanh và bong bóng giúp gặp lại nội dung, nhưng việc vừa nhìn đã thấy quen chưa chứng minh rằng bạn tự nhớ được. Vì vậy Lab không tự cập nhật FSRS, tỉ lệ nhớ, chuỗi ngày học hoặc lịch sử ôn. Dùng **Ôn đúng hạn** để luyện có đánh giá và cập nhật lịch. Không có cam kết rằng tốc độ càng nhanh thì học càng tốt; bắt đầu khoảng 2 giây với cụm ngắn, tăng thời gian khi dùng câu dài.

Điền khuyết đối chiếu với đáp án đã lưu: bỏ qua hoa/thường, khoảng trắng và một số dấu câu ở hai đầu; vẫn phân biệt dấu câu bên trong từ. Câu trả lời đồng nghĩa khác đáp án có thể bị đánh dấu cần xem lại. Đây là đối chiếu cục bộ, không chấm ngữ nghĩa bằng AI.

## Chọn nội dung và điều khiển

- **Nguồn:** câu đã lưu, từ/cụm từ, cấu trúc ngữ pháp hoặc tất cả. Câu và đơn vị học tách từ câu là các mục riêng; chọn một nguồn nếu muốn tập trung vào một loại.
- **Tiến độ:** tất cả, đến hạn hoặc cần luyện thêm. “Cần luyện thêm” gồm bài leech, sai ít nhất 3 lần hoặc có độ khó FSRS từ 8 trở lên. Câu lấy trạng thái từ các bài liên quan còn dùng được.
- **Nhóm/nhãn:** dùng đúng tổ chức thư viện sẵn có; khi chọn cả hai, nội dung phải thỏa cả hai điều kiện.
- **Số mục:** mặc định 20; nhập 0 để dùng tất cả mục phù hợp. Không lặp cùng ID trong một vòng. Có thể trộn ngẫu nhiên hoặc lấy mục mới trước.
- **Lặp lại liên tục:** bật cho Lướt nhanh hoặc Bong bóng để hết bộ từ tự chạy lại, kể cả khi chỉ có một từ. Số mục là số mục mỗi vòng, thứ tự được giữ giữa các vòng. Bấm nút **■ Dừng** để kết thúc và xem kết quả. Tạm dừng/chuyển tab vẫn giữ nguyên nhịp; quay lại cần bấm Tiếp tục. Tùy chọn được nhớ qua reload và có trong export/import; tắt để dùng lượt hữu hạn như trước.
- **Tạm dừng/Tiếp tục:** dùng nút hoặc Space khi không gõ trong ô nhập và không đứng ở một nút/liên kết. Esc tạm dừng. Chuyển tab tự tạm dừng, quay lại cần bấm tiếp tục.
- **Bong bóng:** bấm hoặc chuyển bàn phím tới một thẻ để dừng và xem toàn bộ nội dung. Thẻ thu nhỏ có giới hạn dòng; thẻ chi tiết hiển thị đầy đủ.
- **Muốn gặp lại:** đánh dấu mục trong lượt; bài điền khuyết sai tự được đánh dấu. Cuối lượt có nút luyện lại cả lượt hoặc chỉ các mục đã đánh dấu. Dấu này chỉ tồn tại trong phiên hiện tại.
- **Toàn màn hình**, nút nghe tiếng Anh bằng giọng trình duyệt, hỗ trợ màn hình hẹp. Nhấn nghe sẽ dừng nhịp để không chồng âm thanh với lượt chuyển thẻ.

Chỉ câu có bản nghĩa hoặc ghi chú mới được đưa vào Lab. Nếu dùng ghi chú thủ công, giao diện ghi rõ **Ghi chú của bạn**. Bài tạm ngưng, bài đã báo lỗi và phụ đề AI còn chưa chắc chắn/chưa được xác nhận bị loại khỏi nguồn tương ứng. Câu chưa có bài điền khuyết hợp lệ không xuất hiện ở chế độ Điền khuyết. Lab không tự gọi AI để bù nội dung thiếu.

## Dữ liệu, hiệu năng và lựa chọn kỹ thuật

`src/domain/lab.ts` chuẩn hóa nội dung, lọc và chọn bộ thẻ một lần. `src/domain/lab-timeline.ts` là lịch hiển thị thuần, độc lập với React; `src/ui/lab.tsx` quản lý lượt luyện; `src/ui/lab.css` quản lý chuyển động. `saveLabPreferences` trong repository lưu riêng thiết lập, dùng transaction để giữ cấu hình AI và các cài đặt khác mới nhất.

Thiết lập nằm trong `Settings.lab` (IndexedDB meta). Bản export v3 chứa thiết lập này; không cần đổi phiên bản DB. Backup cũ không có Lab vẫn nhập được. Nội dung lượt, câu trả lời điền khuyết và dấu luyện lại nằm trong bộ nhớ, mất khi rời trang/tải lại; chúng không được thêm vào lịch sử ôn chính.

| Lựa chọn | Phương án khác và đánh đổi |
| --- | --- |
| Chỉ dựng 1 thẻ lướt hoặc tối đa 16 ô; snapshot bộ thẻ trước khi chạy. | Dựng cả thư viện rồi ẩn bằng CSS dễ làm DOM phình lớn. Snapshot không tự nhận thay đổi thư viện từ tab khác giữa lượt. |
| Đồng hồ `performance.now()`, lịch hiển thị tính từ thời gian đã chạy; dừng khi tài liệu ẩn. | Cộng dồn từng tick dễ trôi khi trình duyệt làm chậm timer. Thiết bị bận vẫn có thể bỏ qua khung hình; không hứa độ trễ bằng không. |
| CSS transform cho hiệu ứng 180°, ô cố định với nhịp xuất hiện xen kẽ. | Bubble vật lý/canvas có thể vui hơn nhưng khó chọn chữ, dùng bàn phím và đọc câu dài; hoãn lại. |
| Tôn trọng `prefers-reduced-motion`: thay mặt tĩnh, không xoay/phóng/thu. | Ép chuyển động cho mọi người không phù hợp; vẫn giữ nút tạm dừng vì nội dung tự thay đổi. |
| Thêm điền khuyết cục bộ, có phản hồi ngay. | Minigame chấm AI hoặc sinh câu mới tiêu quota và khó bảo đảm nhịp; dùng luồng ôn chính hiện có cho việc đó. |

Tham khảo triển khai: [Page Visibility API của MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) giải thích việc tab nền bị giảm tần suất timer; [WCAG Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) hướng dẫn cho nội dung tự cập nhật. Thiết kế bảng ô màu dựa trên ảnh tham khảo của người dùng, đồng bộ với nhận diện LumaRead.

Xem kết quả chạy kiểm thử tại [nghiệm thu](VALIDATION.vi.md). Lab không yêu cầu quyền extension mới, không thêm dịch vụ ngoài hoặc thư viện animation.
