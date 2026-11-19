# Kịch bản demo: Bàn giao phòng, giai đoạn D "Tuần nhận phòng"

Nhánh `feat/room-handover`. Số liệu (tài khoản, phòng, công tơ, tiền) đọc từ lần nạp giai đoạn D ngày 19/11/2026. Nạp lại vào ngày khác thì ngày tháng dịch theo hôm nay, nhưng tài khoản, phòng và công tơ giữ nguyên. Nếu khác thì xem bảng tình huống D17–D21 trên trang Dữ liệu demo.

Mật khẩu mọi tài khoản: `123`. Tài khoản sinh viên là `<mã>@fpt.edu.vn`. Mỗi lần đổi vai thì đăng xuất, hoặc mở cửa sổ ẩn danh. Nên để giao diện **VI**.

## Timeline của giai đoạn D

| Mốc | Ngày |
|---|---|
| Fall 2026 kết thúc / hạn trả phòng | 13/11 / 14/11 |
| Staff kiểm tra phòng người mới sẽ nhận | 14–15/11 |
| Spring 2027 nhận phòng | 16/11 → 22/11 |
| Hôm nay | 19/11 (ngày thứ 4 của đợt nhận phòng) |

**Nguyên tắc cần nói khi demo:**
- Staff kiểm phòng trước, kết quả là **gốc của phòng** (sinh viên không bao giờ thấy).
- Sinh viên mới bấm **Bắt đầu kiểm kê** thì mới nhận **mã cửa**, có **48 giờ** để khai từng món và công tơ.
- Khai khớp gốc thì **chốt ngay**; lệch thì chờ Staff.
- Trả phòng: đồ cá nhân xấu đi so với lúc nhận bị tính **giá thật × phần giá trị mất**.

---

## Bước 0: Chuẩn bị và nạp dữ liệu

1. Backend chạy trên database có đủ migration V1–V80, rồi khởi động lại để chạy code mới nhất của nhánh:
   ```
   cd backend
   $env:DB_URL = "jdbc:postgresql://localhost:5433/campusstay_final"
   mvn spring-boot:run
   ```
   Web: `web/.env.local` có `VITE_API_PROXY_TARGET=http://localhost:8080`, rồi `npm run dev`.
2. Đăng nhập `admin01@fpt.edu.vn` › **Hệ thống › Dữ liệu demo**. Chọn thẻ **D – Tuần nhận phòng**, gõ `RESET`, bấm **Đặt lại về giai đoạn D** (khoảng 1 phút).
3. Kéo xuống bảng tình huống: D17–D21 hiện đúng tài khoản như bảng dưới.

| Vai | Tài khoản | Phòng · giường | Trạng thái lúc bắt đầu |
|---|---|---|---|
| D1 | `ss220055` | A-1003 · B | **Sẵn sàng** nhận phòng |
| D2 | `ss220217` | A-1007 · D | **Nháp**, hạn 20/11 09:36 (còn ~18 giờ) |
| D3 | `sa220014` | A-1010 · A | Đã nộp, **Lệch lớn** |
| D4 | `se220406` | A-104 · A | Đã nộp, **Lệch nhỏ** |
| D5 | `se220020` | A-105 · C | Đang xác minh, Staff hẹn xuống phòng **16:00 hôm nay** |
| D6 | `ss210124` | A-107 · B | Đã chốt (khớp) |
| D7 | `se220200` | A-110 · C | **Quá hạn**, hệ thống đã tự chốt (hạn 18/11 08:24) |
| D8 | `se210034` | A-111 · F | **Đang chờ**: phòng chưa có mã cửa |
| D9 | `se220141` | A-202 · A | Phòng **không kiểm được**, đã chốt theo bản sinh viên |
| — | `se220007` | A-706 · B | Đang chờ: chưa trả tiền phòng |
| — | `se210006` | A-603 · A | Ở tiếp nhưng **đổi phòng** → vẫn phải kiểm kê |
| Trả phòng | `se210003` | A-502 · A (Fall 2026) | **Quá hạn trả phòng** |
| Trả phòng | `se200004` | A-703 · A (Fall 2026) | **Quá hạn trả phòng** |

---

## Bước 1: Admin xem cấu hình giá và mức đền

Đăng nhập `admin01`.
1. **Hệ thống › Loại nội thất**:
   - Cột **Phạm vi dùng**: Giường, Tủ quần áo, Bàn học là **Cá nhân**; Quạt trần, Máy lạnh, Máy nước nóng, Tủ lạnh là **Dùng chung**.
   - Cột **Giá thực**: Giường 2.000.000 · Tủ 2.500.000 · Bàn 1.500.000 · Quạt 800.000 · Máy lạnh 8.000.000 · Máy nước nóng 3.500.000 · Tủ lạnh 5.000.000.
2. Thẻ **Mức tình trạng › Sửa mức**:
   - Nguyên vẹn 100 % · Hư một phần 75 % · Hư hơn một nửa 50 % · Hư hoàn toàn 0 %.
   - Ghi chú bên dưới: Tốt = Nguyên vẹn, Hao mòn = Hư một phần, Hư hỏng = Hư hơn một nửa, Thiếu = Hư hoàn toàn.
   - ❌ Nút **xóa** của 4 mức này **bị khóa**, vì kiểm tra phòng, kiểm kê và trả phòng đều dùng chúng.
3. **Hệ thống › Tham số hệ thống**, mục *Room handover*:
   - Hạn nộp 48 giờ, ngưỡng công tơ (2 kWh, 0,2 m³), 3 món lệch là lệch lớn, 48 giờ để xác nhận hư hỏng đồ chung.
   - **Không còn** % đền: % đền đã nằm trong mức tình trạng ở trên.

> Ý nghĩa: hư hỏng 1 bàn học lúc trả phòng = 1.500.000 × (100 % − 50 %) = **750.000 ₫**.

## Bước 2: Staff xem đợt kiểm tra trước khi vào ở

Đăng nhập `staffa01@fpt.edu.vn`, ở thanh trên cùng chọn học kỳ **Spring 2027**.
1. **Vận hành › Kiểm tra phòng**: có đợt "Pre-arrival check Block A (demo)" **đã gửi**, làm ngày 14–15/11, trước ngày mở nhận phòng.
2. Mở phòng **A-1003**: mọi món **Tốt**, công tơ **điện 1660, nước 54** (ghi 15/11 13:40). Đây là gốc của D1.
3. Phòng **A-202** ghi **Không vào được**: trường hợp D9, phòng không có gốc.
4. Thêm vài phòng khác để thấy món **Hao mòn** (ví dụ bàn học A-104 của D4).

## Bước 3: Staff đặt mã cửa còn thiếu (D8)

1. Đăng nhập `se210034` › **Phòng của tôi**. Kết quả đúng: kiểm kê **Đang chờ**, điều kiện "Mã cửa của phòng đã được đặt" chưa đạt, nút Bắt đầu bị khóa.
2. Quay lại `staffa01` › **Phòng › Mã cửa**: phòng **A-111** còn việc "Đổi mã". Tạo mã mới rồi bấm **Xác nhận**.
3. Đăng nhập lại `se210034`. Kết quả đúng: chuyển sang **Sẵn sàng**. *(Giữ sinh viên này cho Bước 5.)*

## Bước 4: Sinh viên nhận phòng, trường hợp suôn sẻ (D1)

Đăng nhập `ss220055@fpt.edu.vn`.
1. **Phòng của tôi**: có thẻ "Bạn đã có thể nhận phòng"; **chưa thấy mã cửa**.
2. Mở **Kiểm kê nhận phòng**: 4 điều kiện **Đã xong** (đã trả tiền, đã đến ngày nhận phòng, phòng đã có mã cửa, chưa quá hạn).
3. Bấm **Bắt đầu kiểm kê**, xác nhận. Kết quả đúng:
   - **Phòng của tôi hiện mã cửa**.
   - Hạn nộp = bây giờ + 48 giờ.
   - Form có đúng **6 món**: Giường, Tủ quần áo, Bàn học **của giường B**; Máy lạnh, Máy nước nóng, Tủ lạnh dùng chung. Không có đồ của giường khác.
4. Khai 6 món **Tốt**, công tơ **điện 1661, nước 54.1**, rồi **Nộp biên bản**. Kết quả đúng: **Đã chốt** ngay, nguồn "Theo bản bạn đã nộp"; điện nước tính từ chỉ số này.
5. Kiểm tra quan trọng: sinh viên **không thấy** con số 1660 / 54 của Staff ở bất kỳ đâu.
6. ❌ Bấm Bắt đầu / Nộp lần nữa: bị chặn ("đã bắt đầu" / "đã nộp").

## Bước 5: Sinh viên khai lệch → chờ Staff (D8, sau Bước 3)

Đăng nhập `se210034` (A-111, gốc **điện 1585, nước 64**).
1. Bắt đầu kiểm kê. Khai **Tủ quần áo = Thiếu**, ghi chú "Không có tủ cạnh giường", các món khác Tốt. Công tơ **1586 / 64.1**. Nộp.
2. Kết quả đúng: **Đã nộp**, chờ Staff, nhãn **Lệch lớn** (có món Thiếu thì luôn là lệch lớn).
3. *(Muốn thử lệch do công tơ:* dùng `se210006`, A-603, gốc **1495 / 37**: khai mọi món Tốt nhưng điện **1600** → Lệch lớn "Electricity +105 kWh".)

## Bước 6: Biên bản nháp (D2)

Đăng nhập `ss220217` (A-1007, gốc **điện 1415, nước 73**).
1. Mở biên bản: Giường, Tủ, Bàn **đã khai**; Máy lạnh, Tủ lạnh, Máy nước nóng **chưa khai**; còn khoảng 18 giờ.
2. ❌ Bấm **Nộp** khi còn thiếu: lỗi **"Hãy khai đủ mọi món trước khi nộp."**.
3. ❌ Khai đủ, nhập công tơ **1400**: lỗi **"Chỉ số thấp hơn lần trước (1415 kWh)."** (công tơ không đi lùi).
4. Nhập **1416 / 73.1**, Nộp. Kết quả đúng: **Đã chốt**.

## Bước 7: Bàn nhận phòng cũ phải chờ biên bản

Đăng nhập `staffa01` (Spring 2027) › **Quầy › Nhận phòng**.
1. ❌ Tìm `se210006` (Sẵn sàng, chưa kiểm kê), bấm Nhận phòng. Kết quả đúng: điều kiện **"Sinh viên đã nộp kiểm kê nhận phòng (Phòng của tôi)"** chưa đạt, không nhận phòng được.
2. ❌ Tìm `sa220014` (D3, đã nộp nhưng chưa chốt): điều kiện **"Biên bản kiểm kê nhận phòng đã chốt"** chưa đạt.
3. Tìm `ss220055` (D1, đã chốt ở Bước 4): **Đã nhận phòng**, vì biên bản chốt tự ghi nhận.

> Ý nghĩa: khi bật kiểm kê, không ai thành cư dân mà phòng chưa có biên bản; điện nước chỉ chia từ chỉ số trên biên bản.

## Bước 8: Staff xử lý biên bản lệch (D3, D4, D8)

`staffa01` (Spring 2027) › **Quầy › Biên bản kiểm kê nhận phòng**, tab **Cần xem**.
1. Biên bản **Lệch lớn** đứng đầu: `sa220014` A-1010 (D3) và `se210034` A-111 (vừa nộp ở Bước 5).
2. Mở **A-1010 (D3)**:
   - Hai cột "Gốc của phòng" và "Sinh viên" đặt cạnh nhau.
   - Dòng tủ quần áo tô màu: **Tốt → Thiếu**.
   - Ghi chú **"Wardrobe: Good → Missing"** và **"Electricity +45 kWh (allowed 6 kWh)"**: gốc 1733, sinh viên khai 1778.
3. ❌ Biên bản **lệch lớn** không có nút **Xác nhận biên bản** (gọi API: `409 MAJOR_NEEDS_VISIT`, "Biên bản lệch lớn phải được kiểm tra tại phòng cùng sinh viên"); khung đỏ giải thích lý do. Bấm **Kiểm tra phòng cùng sinh viên**: popup có **giờ gợi ý** và ô chọn giờ chỉ cho chọn **08:00–16:00**, từ hôm nay đến **3 ngày** sau (Tham số hệ thống › Room handover). Chọn một giờ gợi ý, bấm **Hẹn xuống phòng**. Kết quả đúng: **Đang xác minh**; khung **Báo cáo Final** vẫn trống; sinh viên nhận thông báo trên chuông "Nhân viên sẽ xuống kiểm tra phòng", bấm vào mở thẳng biên bản.
4. Mở **A-104 (D4)**:
   - Ghi chú **"Desk: Worn → Damaged"**, **Lệch nhỏ**; điện 1487 so với gốc 1485, trong ngưỡng.
   - Bấm **Xác nhận biên bản**. Kết quả đúng: **Đã chốt**, bàn học ghi **"có từ trước"** (không bao giờ tính tiền cho `se220406`), và có yêu cầu bảo trì **`MR-…`** mới cho bàn học.

## Bước 9: Xuống phòng xác minh (D5)

1. `staffa01`, tab **Xuống phòng**, mở **A-105** (`se220020`, hẹn 16:00 hôm nay; gốc 1612, sinh viên khai **1650**: +38 kWh, ngưỡng 7,5).
2. Bấm **Ghi nhận thực tế**, sửa điện thành số thực đo được, ví dụ **1615**, rồi bấm **Gửi cho sinh viên**.
3. Đăng nhập `se220020` › **Phòng của tôi**: có thẻ "Đồng ý với biên bản đã kiểm"; cột **"Nhân viên ghi"** (1615) đặt cạnh số sinh viên khai (1650).
4. ❌ (Trước bước 2) sinh viên bấm Đồng ý: lỗi "Nhân viên chưa gửi biên bản đã kiểm cho bạn.".
5. Ghi ý kiến, ví dụ "Sáng nay em thấy 1650", bấm **Đồng ý kèm ý kiến**. Kết quả đúng: **Đã chốt – Đã kiểm cùng nhân viên**; ý kiến hiện ở chi tiết; **không có nút phản đối** nào.

## Bước 10: Các trường hợp có vấn đề

| # | Đăng nhập | Làm gì | Kết quả đúng |
|---|---|---|---|
| 10.1 | `se220200` (D7) | Phòng của tôi › Kiểm kê | **Đã chốt – Quá hạn** (hạn 18/11 08:24): hệ thống chốt theo gốc A-110, điện nước tính từ lúc nhận mã. Có ô **Báo cáo trễ**: gửi "Quạt trần đã hỏng từ trước" |
| 10.2 | `se220200` | Gửi báo cáo trễ lần 2 | ❌ "Bạn đã gửi báo cáo trễ rồi." (chỉ 1 lần) |
| 10.3 | `staffa01` | Biên bản kiểm kê › tab **Báo cáo trễ** › A-110 › chọn 1 món = **Hư hỏng**, Lưu | Món đó ghi **"có từ trước"**. Staff chỉ chấp nhận được mức Hư hỏng hoặc Thiếu |
| 10.4 | `staffa01` | Mở biên bản `se220141` (A-202, D9) | Cột Gốc ghi **Chưa có gốc** (phòng không vào được); bản sinh viên khai trở thành gốc của phòng |
| 10.5 | `se220007` | Phòng của tôi | **Đang chờ**: "Đã thanh toán tiền phòng" chưa đạt, dù đã được duyệt đến muộn. Nút Bắt đầu bị khóa |
| 10.6 | `se210006` | Phòng của tôi | Ở tiếp nhưng chuyển sang **A-603**, nên vẫn phải kiểm kê (**Sẵn sàng**) |
| 10.7 | Người ở tiếp **cùng giường** bất kỳ | Phòng của tôi | Có mã cửa tự động từ ngày mở nhận phòng, **không** phải kiểm kê |
| 10.8 | `staffa01` | Mở biên bản đã chốt (A-104 ở Bước 8) › Hủy | ❌ "Biên bản đã chốt không hủy được." |

## Bước 11: Trả phòng quá hạn và tiền đền

`staffa01`, ở thanh trên cùng chọn học kỳ **Fall 2026** › **Quầy › Trả phòng**.
1. Danh sách có **2 người quá hạn**: `se210003` (A-502 · A) và `se200004` (A-703 · A).
2. Mở **`se210003`**, kéo xuống mục **"Nội thất theo tình trạng"**:
   - Có Giường, Tủ quần áo, Bàn học **của giường A**, cùng Máy lạnh, Máy nước nóng dùng chung.
   - Cột "Lúc nhận" để trống: không có biên bản thì coi như Tốt.
3. Đặt **Bàn học = Hư hỏng**, tick **"Sinh viên có mặt"**, bấm **Ghi nhận nội thất**. Kết quả đúng:
   - Bàn học **1.500.000 × 50 % = 750.000 ₫**.
   - Footer: cọc điện nước đang giữ **600.000 ₫**, tiền đền 750.000 ₫, phần thiếu chuyển thành hóa đơn.
4. *(Tùy chọn)* Đổi **Tủ quần áo = Hao mòn**: thêm 2.500.000 × 25 % = 625.000 ₫. Đổi lại Tốt trước khi làm tiếp.
5. Nhập chỉ số công tơ cuối của A-502: chỉ số gần nhất là **1730 / 48** (31/10), nhập **1760 / 50** cho hợp lý. *(Đừng nhập số quá lớn, tiền điện nước chia theo chỉ số này.)*
6. ❌ Bấm **Xác nhận trả phòng** ngay: lỗi **"Sinh viên chưa đồng ý với khoản đền nội thất. Hãy nhờ sinh viên bấm đồng ý trên app."**.
7. Đăng nhập `se210003` › **Phòng của tôi** › **Đồng ý với khoản đền**.
8. Quay lại Staff, **Xác nhận trả phòng**: thành công. Tiền đền trừ vào cọc; phần thiếu thành **hóa đơn Bồi thường (DAMAGE)** của `se210003`.
9. **Đồ dùng chung** (vẫn ở `se210003` trước khi xác nhận, hoặc người khác): bấm "Sinh viên đã làm hỏng", chọn **Máy lạnh**.
   - Sinh viên nhận câu hỏi "Bạn có làm hỏng …?".
   - **Từ chối** → không ai bị tính. **Xác nhận** → cộng 8.000.000 × 50 % = **4.000.000 ₫**.
   - Không trả lời trong **48 giờ** → không ai bị tính.
   - ❌ Chọn đồ cá nhân: "Đồ riêng được tính khi trả phòng; hãy chọn một món đồ chung."
10. Mở **`se200004`** (A-703): Bàn học = Hư hỏng, tick **"Sinh viên không đồng ý: Manager quyết định"** cho món đó, rồi Ghi nhận. Kết quả đúng: món đó **chưa tính tiền**.
11. Đăng nhập `manager01` › **Phê duyệt › Tiền đền khi trả phòng**: thấy món của `se200004`.
    - ❌ Bấm **Giữ** hoặc **Bỏ** mà không ghi lý do: "Hãy ghi lý do quyết định (tối đa 300 ký tự)."
    - Ghi lý do rồi bấm: Giữ → tính tiền (đã trả phòng thì thành hóa đơn DAMAGE riêng); Bỏ → không ai trả.

## Bước 12: Manager xem tồn kho nội thất

Đăng nhập `manager01` › **Nội thất** › tab **Tồn kho theo tòa**.
1. 4 ô tổng: **Trong kho 80** · Trong phòng · Hỏng hoặc đang sửa · **Giá trị trong kho 289.600.000 ₫** (8 tòa).
2. Dòng Block A: Quạt trần 4 trong kho = **3.200.000 ₫**; Máy lạnh 2 = **16.000.000 ₫**; Máy nước nóng 2 = **7.000.000 ₫**; Tủ lạnh 2 = **10.000.000 ₫**. Giường, Tủ, Bàn: 0 trong kho, 460 trong phòng.
3. Bàn học bị ghi Hư hỏng ở Bước 11 hiện ở cột **Hỏng hoặc đang sửa** (Block A: 1).
4. Đăng nhập `staffa01`, cùng tab: chỉ thấy **Block A**.
5. *(Tùy chọn)* **Đồ cá nhân theo giường**: `manager01` › Nội thất › Món nội thất, chuyển `WRD-A502A` về **kho Block A** (món mất giường), rồi chuyển lại **A-502** (món gắn lại vào giường A còn trống).

---

## Nói gì khi bị hỏi "hệ thống chặn những gì?"

| Ràng buộc | Thấy ở bước |
|---|---|
| Phải trả tiền, đến ngày nhận phòng, phòng có mã cửa, chưa quá hạn mới bắt đầu kiểm kê | 3, 10.5 |
| Mã cửa chỉ cấp khi bắt đầu kiểm kê; người ở tiếp cùng giường nhận tự động | 4, 10.6, 10.7 |
| Sinh viên không thấy gốc của Staff | 4.5 |
| Khai đủ mọi món; công tơ không đi lùi | 6 |
| Lệch lớn: có món Thiếu, ≥ 3 món lệch, hoặc công tơ vượt ngưỡng | 5, 8 |
| Lệch lớn: không xác nhận tại quầy, bắt buộc hẹn xuống phòng trong giờ làm việc | 8.3 |
| Sau khi kiểm cùng nhân viên chỉ còn nút Đồng ý | 9 |
| Quá 48 giờ tự chốt theo gốc; báo cáo trễ đúng 1 lần | 10.1–10.3 |
| Bàn nhận phòng chờ biên bản chốt | 7 |
| Hư hỏng có từ trước không bao giờ tính tiền | 8.4, 10.3 |
| Tiền đền = giá thật × phần giá trị mất từ lúc nhận; đồ chung chỉ khi sinh viên thừa nhận | 11 |
| Sinh viên có mặt phải đồng ý trước khi trả phòng xong; không đồng ý thì Manager quyết, bắt buộc lý do | 11.6, 11.10–11.11 |
| 4 mức tình trạng đầu không xóa được | 1.2 |

**Chạy lại từ đầu:** Admin › Dữ liệu demo › **Đặt lại về giai đoạn D**. Reset xóa mọi dữ liệu nghiệp vụ, đưa các món bị ghi Hỏng trong lúc demo về tình trạng ban đầu, và giữ nguyên tài khoản, tòa, nội thất, giá.

Bản test chi tiết có ô đánh dấu: `Room_Handover_Manual_Test.md`.
