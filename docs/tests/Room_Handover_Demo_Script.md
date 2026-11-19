# Kịch bản demo: Bàn giao phòng (kiểm tra phòng → kiểm kê nhận phòng → trả phòng và tiền đền)

Nhánh `feat/room-handover`, dữ liệu **giai đoạn D "Tuần nhận phòng"**. Soạn ngày 19/11/2026. Kịch bản đi theo thứ tự một tuần nhận phòng thật: Admin cấu hình → Staff kiểm phòng và đặt mã cửa → sinh viên kiểm kê → Staff xử lý biên bản → trả phòng và tiền đền → Manager xem tồn kho. Mỗi màn có **trường hợp suôn sẻ (happy)** và **trường hợp có vấn đề (unhappy)**, ghi rõ hệ thống chặn gì và vì sao. Bản test chi tiết từng ô: `Room_Handover_Manual_Test.md`.

## 0. Chuẩn bị (5 phút)

1. Backend local chạy trên database đã có V1–V80 (ví dụ `campusstay_final`):
   ```
   cd backend
   $env:DB_URL = "jdbc:postgresql://localhost:5433/campusstay_final"
   mvn spring-boot:run
   ```
   Web: `web/.env.local` phải có `VITE_API_PROXY_TARGET=http://localhost:8080` (không phải production), rồi `npm run dev`.
2. `admin01@fpt.edu.vn` › Hệ thống › **Dữ liệu demo** › chọn **D – Tuần nhận phòng**, gõ `RESET`, bấm **Đặt lại về giai đoạn D** (~1 phút).
3. Mật khẩu mọi tài khoản: `123`. Tài khoản sinh viên là `<mã>@fpt.edu.vn` (ví dụ `ss220055@fpt.edu.vn`). Mã sinh viên ở các tình huống D17–D21 trên trang Dữ liệu demo; danh sách dưới đây là của lần nạp ngày 19/11/2026 (nạp lại có thể đổi, khi đó đọc lại trang).
4. **Học kỳ ở thanh trên cùng:** chọn **kỳ N+1 (Spring 2027)** để xem biên bản kiểm kê và người mới; chọn **kỳ N (Fall 2026)** để xem người trả phòng.
5. Mở sẵn 3 cửa sổ (hoặc 3 trình duyệt ẩn danh): Staff, sinh viên, Manager/Admin.
6. Muốn chạy lại từ đầu: nạp lại giai đoạn D.

| Vai | Tài khoản | Dùng ở |
|---|---|---|
| Admin | `admin01` | Màn 1 (cấu hình), Màn 7 |
| Manager | `manager01` | Màn 2 (lịch kiểm tra), Màn 6 (quyết định tiền đền), Màn 7 (tồn kho) |
| Staff Block A | `staffa01` | Màn 2, 4, 5, 6 |
| SV suôn sẻ | `ss220055` (A-1003), `ss220217` (A-1007, nháp), `ss210124` (A-107, đã chốt) | Màn 3 |
| SV Staff xử lý | `se220406` (A-104, lệch nhỏ), `sa220014` (A-1010, lệch lớn), `se220020` (A-105, hẹn xuống phòng 16:00) | Màn 4 |
| SV có vấn đề | `se220200` (A-110, quá hạn), `se210034` (A-111, chưa có mã cửa), `se220141` (A-202, phòng không kiểm được), `se220007` (chưa trả tiền), `se210006` (chuyển sang A-603) | Màn 3b, 5 |
| SV trả phòng | `se210003` (quá hạn trả phòng kỳ N) | Màn 6 |

## 1. Bức tranh nghiệp vụ (nói trước khi demo, 2 phút)

**Timeline (luật của trình tạo học kỳ):**
```
Kỳ N:   ... kết thúc n_end ─ hạn trả phòng n_end+1
        Staff kiểm tra phòng trước khi vào ở: n_end+1 … n_end+2 (gửi kết quả trước ngày mở nhận phòng)
Kỳ N+1: mở nhận phòng n_end+3 … n_end+9
Hôm nay (giai đoạn D) = ngày thứ 4 của đợt nhận phòng ⇒ đã có biên bản nháp, đã nộp, quá hạn 48 giờ…
```

**Ba bước của một người ở mới:**
1. **Gốc của phòng**: Staff kiểm phòng trước khi vào ở (tình trạng từng món + công tơ). Sinh viên **không bao giờ thấy** gốc này.
2. **Kiểm kê nhận phòng**: sinh viên bấm *Bắt đầu kiểm kê* thì mới nhận **mã cửa**; có **48 giờ** để khai từng món (Tốt / Hao mòn / Hư hỏng / Thiếu) và 2 công tơ, rồi nộp. Hệ thống so với gốc:
   - **Khớp** → chốt ngay. **Lệch nhỏ / Lệch lớn** → chờ Staff.
   - Tốt và Hao mòn được coi là như nhau.
   - **Lệch lớn** khi: có món khai *Thiếu*, hoặc ≥ 3 món khác gốc, hoặc công tơ vượt ngưỡng = max(2 kWh, 0,25 kWh × số giờ × số người ở). Nước tương tự: 0,2 m³ và 0,01 m³/người/giờ. Các ngưỡng nằm ở Tham số hệ thống › Room handover.
3. **Trả phòng**: đồ cá nhân (của giường mình) xấu đi so với biên bản nhận phòng bị tính **giá thật × (phần giá trị mất bây giờ − phần giá trị mất lúc nhận)**, không bao giờ âm. Đồ dùng chung chỉ tính khi sinh viên **tự xác nhận** đã làm hỏng.

**Biên bản đã chốt** quyết định 3 việc:
- điện nước bắt đầu chia từ chỉ số trên biên bản;
- bàn tiếp nhận ghi nhận đã nhận phòng;
- món Hư hỏng/Thiếu ghi trên biên bản là "có từ trước", **không bao giờ tính tiền** cho sinh viên đó; hư hỏng mới thì tạo yêu cầu bảo trì hoặc lệnh lấy đồ dự phòng trong kho.

**Trạng thái biên bản:** `Chưa cần / Đang chờ → Sẵn sàng → Nháp → (Đã nộp → Đang xác minh) → Đã chốt`. Quá 48 giờ mà chưa nộp: job (15 phút/lần) **chốt theo gốc của phòng**, nhắc trước hạn 24 giờ và 4 giờ.

## Màn 1. Admin cấu hình giá và mức tình trạng (3 phút)

`admin01` › Hệ thống › **Loại nội thất**

| # | Thao tác | Hệ thống phản hồi | Ý nghĩa nghiệp vụ |
|---|---|---|---|
| 1.1 | Xem cột **Phạm vi dùng** và **Giá thực** | Giường, tủ, bàn = Cá nhân; quạt, máy lạnh, bình nóng lạnh, tủ lạnh = Dùng chung; giá: Giường 2.000.000, Tủ 2.500.000, Bàn 1.500.000, Máy lạnh 8.000.000… | Đồ cá nhân gắn với một giường, tính cho người ở giường đó. Đồ chung là của cả phòng. |
| 1.2 | **Mức tình trạng › Sửa mức** | Nguyên vẹn 100 %, Hư một phần 75 %, Hư hơn một nửa 50 %, Hư hoàn toàn 0 %; ghi chú: Tốt = Nguyên vẹn, Hao mòn = Hư một phần, Hư hỏng = Hư hơn một nửa, Thiếu = Hư hoàn toàn | Giá trị còn lại của món ở mỗi mức. Tiền đền = phần mất đi. |
| 1.3 ❌ | Bấm xóa một trong 4 mức đầu | Nút xóa **bị khóa**; nếu gọi API thì lỗi *"Keep the first four levels…"* | Kiểm tra phòng, kiểm kê và trả phòng đều dùng 4 mức này. |
| 1.4 | Hệ thống › **Tham số hệ thống** › Room handover | Bật kiểm kê, 48 giờ, ngưỡng công tơ, 3 món lệch = lệch lớn, 48 giờ xác nhận đồ chung; **không còn** % đền | % đền đã chuyển sang mức tình trạng. |

> Không cần sửa gì ở màn này. Nếu đổi giá thì nói rõ: các lần trả phòng **từ lúc đó** dùng giá mới.

## Màn 2. Staff kiểm tra phòng trước khi vào ở và mã cửa (D17, 5 phút)

`staffa01`, học kỳ **kỳ N+1**

| # | Thao tác | Hệ thống phản hồi | Ý nghĩa |
|---|---|---|---|
| 2.1 | Vận hành › **Kiểm tra phòng** › đợt "Pre-arrival check Block A (demo)" | Đã gửi trước ngày mở nhận phòng; mỗi phòng có tình trạng từng món và công tơ; vài món Hao mòn/Hư hỏng | Đây là **gốc** để so với biên bản sinh viên. |
| 2.2 | Mở **A-1003**, ghi lại chỉ số điện, nước | Thấy công tơ Staff đã ghi | Dùng ở Màn 3 để sinh viên khai đúng thực tế. |
| 2.3 | Mở phòng **A-202** | **Không vào được** | Phòng này không có gốc (xem 3b.3). |
| 2.4 ❌ | (Đợt khác/phòng chưa kiểm) nhập công tơ **thấp hơn** lần trước | Lỗi *"The reading is lower than the last one (… kWh on …)"*; tick **Đã thay công tơ** thì lưu được | Công tơ chỉ đi lên, trừ khi thay công tơ. |
| 2.5 ❌ | Lưu phòng khi **chưa nhập công tơ** | Lưu được nhưng phòng **chưa Done** | Đợt "trước khi vào ở" bắt buộc có công tơ. |
| 2.6 | Một món chọn **Thiếu** + tick *Lấy đồ dự phòng trong kho Block* | Không tạo yêu cầu bảo trì; có lệnh chuyển PLANNED từ kho về phòng | Thiếu đồ thì lấy đồ trong kho trước, không cần sửa. |
| 2.7 | Vận hành › **Mã cửa** | Phòng **A-111** (của `se210034`) còn việc đổi mã. Đặt và xác nhận mã mới | Chưa có mã cửa thì người ở phòng đó chưa bắt đầu kiểm kê được (3b.2). |
| 2.8 | `manager01` › Vận hành › **Lịch kiểm tra** | Tạo lịch phạm vi **"Rooms new residents will receive"** được | Manager lên lịch kiểm "trước khi vào ở" trước ngày mở nhận phòng. |

## Màn 3. Sinh viên kiểm kê nhận phòng: happy case (D18, 5 phút)

| # | Ai | Thao tác | Hệ thống phản hồi |
|---|---|---|---|
| 3.1 | `ss220055` | **Phòng của tôi** | Thẻ "Bạn đã có thể nhận phòng"; **chưa thấy mã cửa** |
| 3.2 | | Mở **Kiểm kê nhận phòng** | 4 điều kiện đều đạt: đã trả tiền, đã đến ngày nhận phòng, phòng đã có mã cửa, chưa quá hạn |
| 3.3 | | **Bắt đầu kiểm kê**, xác nhận | Hiện form; hạn nộp = bây giờ + 48 giờ; **Phòng của tôi hiện mã cửa**. Form chỉ có đồ của **giường mình** (giường B) và đồ chung, **không có** gốc của Staff |
| 3.4 | | Khai mọi món Tốt; điện = chỉ số ở 2.2 + 1, nước = chỉ số ở 2.2; Nộp | **Đã chốt** ngay, nguồn "Theo bản bạn đã nộp"; điện nước tính từ chỉ số này |
| 3.5 ❌ | | Bấm Bắt đầu / Nộp lần nữa | *INVENTORY_STARTED* / *INVENTORY_SUBMITTED*: không làm lại được |
| 3.6 | `ss220217` | Mở biên bản nháp | Còn ~18 giờ (đã được nhắc 1 lần); một số món đã khai sẵn |
| 3.7 ❌ | | Nộp khi còn món chưa khai | *"Answer every item before you submit."* |
| 3.8 ❌ | | Nhập công tơ **thấp hơn** chỉ số của phòng | Bị từ chối (công tơ không đi lùi) |
| 3.9 | | Khai nốt, nộp | Khớp → Đã chốt; nếu lệch → "Đã nộp", chờ Staff |
| 3.10 | `ss210124` | Phòng của tôi › Kiểm kê | Đã chốt từ hai ngày trước, chỉ xem |

## Màn 3b. Sinh viên: unhappy case (D20, 5 phút)

| # | Ai | Thao tác | Hệ thống phản hồi | Ràng buộc |
|---|---|---|---|---|
| 3b.1 | `se220007` | Phòng của tôi › Kiểm kê | **Đang chờ**: điều kiện "Đã trả tiền" chưa đạt; nút Bắt đầu bị khóa (gọi API: *CHECK_IN_NOT_READY*) | Được duyệt đến muộn nhưng phải trả tiền mới nhận phòng. |
| 3b.2 | `se210034` | Như trên | **Đang chờ**: "mã cửa của phòng chưa đặt". Làm 2.7 xong thì chuyển sang **Sẵn sàng** | Không có mã thì không giao phòng. |
| 3b.3 | `se220141` | Kiểm kê, nộp | Nộp được. Staff xem: cột "Gốc của phòng" ghi **Chưa có gốc**, bản sinh viên khai trở thành gốc | Phòng không kiểm được thì tin bản của sinh viên. |
| 3b.4 | `se210006` | Phòng của tôi | Ở tiếp nhưng chuyển sang **A-603** nên **vẫn phải kiểm kê** (Sẵn sàng) | Chỉ người ở tiếp **cùng giường** mới được miễn. |
| 3b.5 | (bất kỳ người ở tiếp cùng giường) | Phòng của tôi | Có mã cửa tự động từ ngày mở nhận phòng, **không** phải kiểm kê | |
| 3b.6 | `se220200` | Mở biên bản | **Đã chốt – Quá hạn**: hệ thống chốt theo gốc của phòng, điện nước tính từ lúc nhận mã. Có ô **Báo cáo trễ** | Quá 48 giờ thì mặc định phòng như gốc. |
| 3b.7 | | Gửi báo cáo trễ (ví dụ "bàn học gãy chân"), gửi lần 2 | Lần 2: *LATE_ALREADY_SENT* | Báo cáo trễ chỉ **1 lần**. |
| 3b.8 | `staffa01` | Biên bản kiểm kê › tab **Báo cáo trễ** › chấp nhận bàn học là Hư hỏng | Món đó ghi "có từ trước" → sau này không tính tiền | Staff chỉ chấp nhận được mức **Hư hỏng/Thiếu** (*"Accept items as Damaged or Missing."*). |

## Màn 4. Staff xử lý biên bản (D19, 5 phút)

`staffa01`, kỳ N+1 › Bàn tiếp nhận › **Biên bản kiểm kê nhận phòng** › tab **Cần xem**

| # | Thao tác | Hệ thống phản hồi | Ràng buộc |
|---|---|---|---|
| 4.1 | Xem danh sách | `sa220014` (A-1010) **Lệch lớn** ở đầu; `se220406` (A-104) **Lệch nhỏ** | Sắp theo mức độ. |
| 4.2 | Mở `se220406` | Hai cột "Gốc của phòng" và "Sinh viên"; dòng lệch tô màu; ghi chú "Desk: Good/Worn → Damaged" | Staff thấy đúng chỗ lệch. |
| 4.3 | **Xác nhận biên bản** | Đã chốt; bàn học ghi "có từ trước"; có **yêu cầu bảo trì** mới cho bàn học | Hư hỏng mới phát hiện thì đi sửa, không tính cho sinh viên. |
| 4.4 ❌ | Mở `sa220014` (thiếu tủ, điện +45 kWh), bấm Xác nhận không ghi lý do | *"Write why you confirm an inventory with a major difference."* | Lệch lớn phải có lý do, hoặc xuống phòng xác minh. |
| 4.5 | Bấm **Chờ xác minh tại phòng**, chọn giờ | Trạng thái **Đang xác minh**; sinh viên nhận thông báo "Nhân viên sẽ xuống kiểm tra phòng" | |
| 4.6 ❌ | (biên bản đã chốt) bấm Hủy | *INVENTORY_FINAL*: biên bản đã chốt không hủy được | |
| 4.7 | Tab **Xuống phòng** › `se220020` (hẹn 16:00 hôm nay) › **Ghi nhận thực tế**: sửa công tơ/món theo thực tế › **Gửi cho sinh viên** | Sinh viên thấy "Đồng ý với biên bản đã kiểm" | Bản Staff kiểm tại phòng là bản cuối. |
| 4.8 | `se220020` › Phòng của tôi › nhập ý kiến › **Đồng ý kèm ý kiến** | **Đã chốt** – "Đã kiểm cùng nhân viên"; ý kiến hiện ở chi tiết; **không có nút phản đối** | Không có tranh chấp sau khi đã kiểm cùng nhau. |
| 4.9 ❌ | Sinh viên bấm Đồng ý khi Staff chưa gửi | *NOTHING_TO_AGREE* | |

## Màn 5. Bàn nhận phòng cũ phải chờ biên bản (2 phút)

`staffa01`, kỳ N+1 › Bàn tiếp nhận › **Nhận phòng**

| # | Thao tác | Hệ thống phản hồi | Ràng buộc |
|---|---|---|---|
| 5.1 ❌ | Tìm `se220007` hoặc `ss220217` (nháp), bấm Nhận phòng | Điều kiện **"Sinh viên đã nộp kiểm kê nhận phòng"** / **"Biên bản kiểm kê nhận phòng đã chốt"** chưa đạt; *CHECK_IN_BLOCKED* | Khi bật kiểm kê, không ai thành cư dân mà phòng chưa có biên bản. |
| 5.2 | Tìm `ss220055` (đã chốt ở 3.4) | **Đã nhận phòng**: biên bản chốt tự ghi nhận | |
| 5.3 | (Tùy chọn) Admin tắt tham số *"New residents file a check-in inventory…"* | Trả tiền xong là có mã, bàn nhận phòng hoạt động như cũ. **Bật lại sau khi demo.** | Công tắc cho Ban quản lý. |

## Màn 6. Trả phòng và tiền đền (D21, 8 phút)

`staffa01`, chọn học kỳ **kỳ N** › Bàn tiếp nhận › **Trả phòng** › `se210003` (quá hạn)

| # | Thao tác | Hệ thống phản hồi | Ràng buộc / công thức |
|---|---|---|---|
| 6.1 | Mở trả phòng của `se210003` | Mục **"Nội thất theo tình trạng"**: đồ của giường A (giường, tủ, bàn) và đồ chung; cột "Lúc nhận"; bảng nhập tiền tay cũ vẫn còn | So với biên bản nhận phòng của **chính sinh viên này**. |
| 6.2 | Bàn học = **Hư hỏng**, tick **Sinh viên có mặt**, **Ghi nhận nội thất** | Bàn học: 1.500.000 × 50 % = **750.000 ₫**; footer trừ vào cọc điện nước | Lúc nhận Tốt (0 % mất) → bây giờ Hư hơn một nửa (50 % mất). |
| 6.3 | Đổi tủ = **Hao mòn** | Tủ: 2.500.000 × 25 % = 625.000 ₫ | Hao mòn = Hư một phần (25 %). Muốn miễn Hao mòn thì Admin đặt mức này 100 %. |
| 6.4 | (Nếu lúc nhận bàn đã Hao mòn) | Chỉ tính phần **xấu đi**: 1.500.000 × (50 % − 25 %) | Không bao giờ âm; món "có từ trước" = 0. |
| 6.5 ❌ | Bấm **Xác nhận trả phòng** ngay | *STUDENT_NOT_AGREED*: "Sinh viên chưa đồng ý với khoản đền" | Sinh viên có mặt thì phải tự đồng ý trên app. |
| 6.6 | `se210003` › Phòng của tôi › **Đồng ý với khoản đền** | | |
| 6.7 | Staff xác nhận lại (chỉ số công tơ hợp lý) | Trả phòng thành công. Tiền đền trừ vào cọc điện nước; phần thiếu thành **hóa đơn DAMAGE**; phần dư được hoàn | |
| 6.8 ❌ | Lần khác: tick **"Sinh viên không đồng ý: Manager quyết định"** cho 1 món | Món đó **chưa tính**; `manager01` › Quyết định › **Tiền đền khi trả phòng** thấy món; Giữ/Bỏ **bắt buộc lý do** (*"Write the reason of your decision…"*) | Giữ sau khi đã trả phòng → hóa đơn DAMAGE riêng. |
| 6.9 ❌ | **Đồ chung**: "Sinh viên đã làm hỏng" › chọn máy lạnh | Sinh viên nhận "Bạn có làm hỏng …?" | Đồ cá nhân không chọn được ở đây (*"Personal items are charged at check-out; choose a shared item."*). |
| 6.10 | Sinh viên **Từ chối** → không bị tính. Tạo lại, sinh viên **Xác nhận** → cộng 8.000.000 × 50 % = 4.000.000 ₫ | Không trả lời trong **48 giờ** → **không ai** bị tính | Đồ chung chỉ tính khi sinh viên thừa nhận. |

## Màn 7. Manager xem tồn kho và đồ cá nhân theo giường (3 phút)

| # | Ai | Thao tác | Hệ thống phản hồi |
|---|---|---|---|
| 7.1 | `manager01` | Vận hành › **Nội thất** › tab **Tồn kho theo tòa** | 4 ô tổng (Trong kho, Trong phòng, Hỏng/đang sửa, Giá trị trong kho); mỗi tòa × loại: phạm vi dùng, giá thật, số trong kho/phòng/hỏng, lệnh chuyển, giá trị kho = giá × số trong kho. Bàn học hỏng ở 6.2 nằm ở cột Hỏng |
| 7.2 | `staffa01` | Cùng tab | Chỉ thấy **Block A** |
| 7.3 | `admin01` | Loại nội thất › xóa giá thật của một loại | Tồn kho hiện cảnh báo "… loại nội thất chưa có giá thực": giá trị kho tính 0 và **món hỏng loại đó không bị tính tiền** khi trả phòng. Nhập lại giá sau khi demo |
| 7.4 | `manager01` | Nội thất › Món nội thất › chuyển một **tủ** (đồ cá nhân) của A-1003 về kho Block A | Món mất giường |
| 7.5 | | Chuyển lại về A-1003 | Món gắn lại vào giường còn trống; kiểm kê và trả phòng của giường đó thấy món |

## 8. Bảng ràng buộc (để trả lời câu hỏi)

| Nhóm | Ràng buộc | Mã lỗi / biểu hiện |
|---|---|---|
| Bắt đầu kiểm kê | Đủ 4 điều kiện: đã trả tiền (Balance hoặc phí kỳ sau), đã đến ngày nhận phòng (hoặc được duyệt đến muộn), phòng có mã cửa, chưa quá hạn | `CHECK_IN_NOT_READY` (nêu điều kiện thiếu) |
| | Chỉ bắt đầu 1 lần; nộp 1 lần | `INVENTORY_STARTED`, `INVENTORY_SUBMITTED` |
| Nộp biên bản | Khai đủ mọi món của giường mình và đồ chung; đủ 2 công tơ, không thấp hơn chỉ số cuối của phòng; ảnh nếu bật "bắt buộc ảnh" (tối đa 3 ảnh/món, JPEG/PNG) | `Answer every item…`, lỗi ở ô công tơ, ảnh |
| So sánh | Tốt ≈ Hao mòn; Lệch lớn = có món Thiếu / ≥ 3 món lệch / công tơ vượt ngưỡng | Khớp → chốt ngay; lệch → chờ Staff |
| Staff | Lệch lớn phải ghi lý do khi xác nhận; chỉ biên bản đã nộp mới xác nhận/xuống phòng được; biên bản đã chốt không hủy được | `NOT_TO_REVIEW`, `INVENTORY_FINAL` |
| Hạn 48 giờ | Job 15 phút/lần chốt theo gốc; nhắc 24 h và 4 h trước hạn; báo cáo trễ 1 lần, Staff chấp nhận từng món Hư hỏng/Thiếu | `LATE_ALREADY_SENT`, `LATE_NOT_ALLOWED` |
| Mã cửa | Người mới (hoặc đổi sang phòng khác) nhận mã khi bắt đầu kiểm kê; người ở tiếp cùng giường nhận tự động | — |
| Bàn nhận phòng | Khi bật kiểm kê: chờ biên bản chốt | `CHECK_IN_BLOCKED` |
| Trả phòng | Đồ cá nhân: giá thật × (mất bây giờ − mất lúc nhận), lấy tình trạng tệ nhất mà các lần kiểm tra trong kỳ ghi được; đồ chung: chỉ khi sinh viên xác nhận trong 48 giờ; sinh viên có mặt phải đồng ý | `STUDENT_NOT_AGREED`, `NOTHING_TO_AGREE` |
| Manager | Giữ/Bỏ khoản đền bắt buộc lý do | `NOTHING_TO_REVIEW` |
| Admin | Không xóa 4 mức tình trạng đầu; giá 0–1.000.000.000; loại chưa có giá → đền 0 | 400 ở `items` |

## 9. Mẹo khi demo

- **Thứ tự nên đi:** Màn 1 (nói nhanh) → 2 → 3 → 3b → 4 → 5 → 6 → 7. Tổng khoảng 35–40 phút; bản rút gọn 15 phút: 3.1–3.4, 4.4–4.5, 5.1, 6.2–6.7, 7.1.
- Mở **tiếng Việt** (VI ở thanh trên): thông báo lỗi hiện bằng tiếng Việt, bảng trên ghi mã/tiếng Anh để tra cứu.
- Thông báo trong app (chuông) hiện ngay cho sinh viên: "Bạn đã có thể nhận phòng", "Nhân viên sẽ xuống kiểm tra phòng", "Bạn có làm hỏng …?".
- Muốn chạy lại một tình huống đã làm: nạp lại giai đoạn D (khoảng 1 phút).
- Đừng nhập công tơ quá lớn khi trả phòng: tiền điện nước chia theo chỉ số đó và có thể sinh hóa đơn rất lớn.
