# Kịch bản test thủ công: Family Day

Nhánh `dev` (Family Day, ADR-29, contract A-69; khách quá giờ và thống kê, A-70). Ngày soạn: 10/11/2026, bổ sung 13/11/2026. Mỗi bước có **Kết quả mong đợi**; đánh dấu `[x]` khi đúng, ghi lại bước nào sai.

## 0. Chuẩn bị

### 0.1. Cài và chạy (máy mới clone)

Cần cài **Git**, **Docker Desktop** (đang chạy) và **Node.js 22**. Không cần Java hay Maven: backend được build trong Docker.

```
git clone https://github.com/tisou47/CampusStay-FPT-v0.1.git
cd CampusStay-FPT-v0.1
git switch dev
docker compose -f infra/docker-compose.yml --profile app up -d --build
```

- Lần đầu mất vài phút. Xong khi http://localhost:8080/api/actuator/health trả về `{"status":"UP"}`.
- **Lỗi cổng 5432:** máy đã cài PostgreSQL trên Windows và nó đang chiếm cổng. Tắt dịch vụ `postgresql-x64-…` trong Services rồi chạy lại lệnh trên.

Chạy web trong một cửa sổ khác:

```
cd web
npm install
npm run dev
```

Sau đó mở http://localhost:5173.

### 0.2. Nạp dữ liệu demo (bắt buộc với database mới)

Database mới chỉ có tài khoản và các Block, chưa có sinh viên nào đang ở.

1. Đăng nhập `admin01@fpt.edu.vn` / `123`.
2. Vào **Hệ thống › Dữ liệu demo** (tiếng Anh: System › Demo data), chọn **giai đoạn A** và nạp.

Việc này xóa dữ liệu nghiệp vụ hiện có của database local và nạp lại dữ liệu demo.

### 0.3. Tài khoản

Mật khẩu của **mọi tài khoản** là `123`. Nên mở mỗi vai trò trong một cửa sổ ẩn danh riêng (hoặc một trình duyệt riêng) để không phải đăng xuất liên tục.

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Manager | `manager01@fpt.edu.vn` | Tạo, công bố, hủy, kết thúc |
| Staff Block A | `staffa01@fpt.edu.vn` | Quầy tiếp đón |
| Staff Block B | `staffb01@fpt.edu.vn` | Ngoài phạm vi: phải bị chặn |
| Admin | `admin01@fpt.edu.vn` | Xem Audit Log |
| SV Block A | `se200001@fpt.edu.vn` | Đăng ký chính |
| SV Block A | `se200005@fpt.edu.vn` | Thử khung giờ đầy |
| SV Block A | `se200007@fpt.edu.vn` | Hủy và đăng ký lại |
| SV Block A | `se210001@fpt.edu.vn` | Bị Manager hủy đăng ký |
| SV Block B | `se200008@fpt.edu.vn` | Không được thấy sự kiện của Block A |
| SV chưa có phòng | `se200006@fpt.edu.vn` | Không phải cư dân |

Phòng của các sinh viên trên lấy từ dữ liệu demo giai đoạn A trên một máy (ví dụ se200001 ở A-701). Nếu máy bạn khác phòng thì không sao, miễn sinh viên Block A thấy mục **Ngày gia đình** của Block A. Xem phòng ở trang **Phòng của tôi**.

### 0.4. Script hỗ trợ (chỉ dùng với database local)

Chạy trong PowerShell, ở thư mục gốc của repo:

```
powershell -ExecutionPolicy Bypass -File .\docs\tools\family-day-time.ps1 show
```

Script tự dùng database trong Docker (`campusstay-db-1`) nếu container đang chạy, nếu không thì dùng PostgreSQL cài trên Windows. Nó luôn tác động lên **Family Day mới nhất**:

- `show`: xem giờ của sự kiện.
- `slot-now`: tua cho khung giờ đang diễn ra.
- `slot-over`: tua cho khung giờ đã kết thúc.
- `passes`: in mã vào (nội dung QR) của từng khách.

Trong các bước bên dưới, `.\docs\tools\family-day-time.ps1 <lệnh>` nghĩa là chạy với `powershell -ExecutionPolicy Bypass -File` như trên.

**Vì sao cần script:**

- Trên giao diện chỉ chọn được giờ chẵn, và khách chỉ được vào trong khung giờ của mình, nên không tua thì phải chờ đồng hồ thật.
- Không có camera thì dán mã vào ô "Quét hoặc nhập mã vào"; máy quét cầm tay cũng hoạt động đúng như vậy (gõ mã rồi Enter). Muốn quét thật: bấm nút camera cạnh ô đó và đưa mã QR trên điện thoại của sinh viên trước webcam. Trình duyệt chỉ cho dùng camera trên `localhost` hoặc trang `https`, nên mở quầy qua `http://<IP máy>:5173` từ máy khác sẽ không bật được camera.

## 1. Manager tạo Family Day

Đăng nhập `manager01` → menu **Vận hành › Ngày gia đình** → **Tạo Ngày gia đình**.

- [ ] **1.1. Kiểm tra lỗi nhập liệu.** Để trống tiêu đề và nơi đón tiếp, đặt số khách mỗi SV = 0, chọn ngày đóng đăng ký trước ngày mở, rồi bấm **Lưu bản nháp**.
  - **Kết quả mong đợi:** form không lưu; mỗi ô sai hiện lỗi màu đỏ bằng tiếng Việt.
- [ ] **1.2. Khung giờ chồng nhau.** Thêm 2 khung giờ chồng lên nhau rồi lưu.
  - **Kết quả mong đợi:** lỗi "Các khung giờ không được trùng nhau" ở khung thứ hai.
- [ ] **1.3. Tạo đúng.** Nhập:
  - Block **A**, Số khách mỗi SV **3**, Tiêu đề "Ngày gia đình tháng 11", Nơi đón tiếp "Sảnh tầng trệt Block A".
  - Mở đăng ký: hôm nay, giờ hiện tại hoặc sớm hơn. Đóng đăng ký: ngày mai 08:00.
  - Khung 1: ngày mai 08:00–11:00, **3 khách**. Khung 2: ngày mai 13:00–16:00, **50 khách**.

  Bấm **Lưu bản nháp**.
  - **Kết quả mong đợi:** chuyển sang trang chi tiết, trạng thái **Bản nháp**; có nút Sửa, Hủy, Công bố; chưa có mục Đăng ký và chưa có nút Quầy tiếp đón.
- [ ] **1.4. Sửa bản nháp.** Bấm **Sửa**, đổi tiêu đề, lưu.
  - **Kết quả mong đợi:** tiêu đề mới hiện ngay.
- [ ] **1.5. Sinh viên chưa thấy bản nháp.** Đăng nhập `se200001` → **Ngày gia đình** trên thanh menu.
  - **Kết quả mong đợi:** danh sách trống ("Chưa có Ngày gia đình nào").

## 2. Phân quyền của Staff

- [ ] **2.1. Staff Block A chỉ được xem.** Đăng nhập `staffa01` → **Vận hành › Ngày gia đình**.
  - **Kết quả mong đợi:** thấy sự kiện; không có nút "Tạo Ngày gia đình". Mở sự kiện: không có nút Sửa, Hủy hay Công bố.
- [ ] **2.2. Staff Block khác bị chặn.** Đăng nhập `staffb01` → **Vận hành › Ngày gia đình**.
  - **Kết quả mong đợi:** không thấy sự kiện của Block A. Dán URL chi tiết của sự kiện (lấy từ cửa sổ Manager, đổi `/manager/` thành `/staff/`) thì bị báo không có quyền truy cập Block này.

## 3. Công bố

- [ ] **3.1.** Ở cửa sổ Manager, bấm **Công bố**.
  - **Kết quả mong đợi:** trạng thái **Đang mở đăng ký**; xuất hiện nút **Quầy tiếp đón** và mục **Đăng ký** (đang trống); nút Sửa biến mất.
- [ ] **3.2.** Đăng nhập `se200001` → chuông thông báo.
  - **Kết quả mong đợi:** có thông báo "Ngày gia đình · …" kèm ngày và hạn đăng ký; bấm vào thì mở trang sự kiện.
- [ ] **3.3.** Đăng nhập `se200008` (Block B) → **Ngày gia đình**.
  - **Kết quả mong đợi:** không thấy sự kiện của Block A và không có thông báo.
- [ ] **3.4.** Đăng nhập `se200006` (chưa có phòng) → **Ngày gia đình**.
  - **Kết quả mong đợi:** hiện "Ngày gia đình dành cho sinh viên đang ở ký túc xá."

## 4. Sinh viên đăng ký khách

Đăng nhập `se200001` → **Ngày gia đình** → mở sự kiện. Khung 1 hiện "Còn 3 chỗ", khung 2 hiện "Còn 50 chỗ".

- [ ] **4.1. Trẻ em đi một mình.** Chọn khung 1, nhập 1 khách là Em trai, năm sinh 2016, bấm **Đăng ký khách**.
  - **Kết quả mong đợi:** lỗi "Khách dưới 18 tuổi phải đi cùng một khách là người lớn."
- [ ] **4.2. Khách trùng nhau.** Thêm 2 khách cùng tên và cùng năm sinh.
  - **Kết quả mong đợi:** lỗi "Khách này đã có trong danh sách" ở khách thứ hai.
- [ ] **4.3. Giới hạn số khách.** Nút **Thêm khách** bị mờ khi đã có 3 khách.
- [ ] **4.4. Đăng ký đúng.** Chọn khung 1, nhập 3 khách:
  - Nguyễn Văn Bố, Cha, 1972
  - Trần Thị Mẹ, Mẹ, 1975
  - Nguyễn Văn Em, Anh/em trai, 2014

  Bấm **Đăng ký khách**.
  - **Kết quả mong đợi:** thông báo thành công; mục **Khách của bạn** hiện 3 thẻ, **mỗi khách một mã QR khác nhau**, trạng thái **Chưa đến**; form đăng ký biến mất; có nút **Hủy đăng ký**; chuông có thông báo "Đã đăng ký khách".
- [ ] **4.5. Khung giờ đầy.** Đăng nhập `se200005` → mở sự kiện.
  - **Kết quả mong đợi:** khung 1 hiện **Đã đầy** và không chọn được; khung 2 vẫn chọn được.
- [ ] **4.6. Danh sách của Manager.** Ở cửa sổ Manager, tải lại trang chi tiết.
  - **Kết quả mong đợi:** khung 1 hiện "3 / 3" kèm nhãn **Đã đầy**; mục Đăng ký có Hoang Dinh Nhat (A-701) với 3 khách; ô tìm kiếm "Em" lọc ra đúng đăng ký đó.

## 5. Hủy đăng ký

- [ ] **5.1. Sinh viên tự hủy.** `se200007` đăng ký 1 khách (khung 2), sau đó bấm **Hủy đăng ký** → xác nhận.
  - **Kết quả mong đợi:** đăng ký chuyển sang **Đã hủy**, mã QR biến mất, form đăng ký hiện lại; phía Manager, khung 2 trả lại 1 chỗ.
- [ ] **5.2. Manager hủy đăng ký.** `se210001` đăng ký 2 khách (khung 2). Manager bấm **Hủy** ở dòng đó, nhập lý do "Danh sách khách chưa đúng".
  - **Kết quả mong đợi:** nút xác nhận chỉ bật khi đã nhập lý do. Sau khi hủy, `se210001` nhận thông báo kèm lý do; trang sự kiện của SV hiện **Đã hủy** kèm lý do, không còn QR.

## 6. Quầy tiếp đón: cho khách vào

Đăng nhập `staffa01` → mở sự kiện → **Quầy tiếp đón**. Trong PowerShell chạy `.\docs\tools\family-day-time.ps1 passes` để lấy mã vào của 3 khách của `se200001`.

- [ ] **6.1. Đến sớm.** Dán mã của **Bố** vào ô mã, bấm Enter.
  - **Kết quả mong đợi:** hiện thẻ khách với tên, quan hệ, năm sinh và SV (SE200001, phòng A-701), cùng cảnh báo "Không thể cho vào: Khung giờ của khách là … Hãy cho khách vào từ 07:45."
- [ ] **6.2. Tua giờ.** Chạy `.\docs\tools\family-day-time.ps1 slot-now`, rồi bấm **Kiểm tra** lại với mã của Bố.
  - **Kết quả mong đợi:** có nút **Cho vào**.
- [ ] **6.3. Bắt buộc kiểm tra giấy tờ.** Bấm **Cho vào**.
  - **Kết quả mong đợi:** nút **Cho vào** trong hộp thoại bị mờ cho đến khi tick "Tôi đã đối chiếu giấy tờ tùy thân…". Tick rồi xác nhận: Bố có trạng thái **Đã vào**; ô "Đang ở trong" = 1; cột "Vào và ra" ghi giờ và tên Staff.
- [ ] **6.4. Quét lại cùng mã.** Dán lại mã của Bố.
  - **Kết quả mong đợi:** không có nút Cho vào; có cảnh báo "Khách này đã vào rồi" và nút **Ghi nhận ra**.
- [ ] **6.5. Mã giả.** Dán `abc123`.
  - **Kết quả mong đợi:** lỗi "Mã vào bị từ chối: Mã này không phải mã vào Ngày gia đình của CampusStay."
- [ ] **6.6. Staff khác Block.** Ở cửa sổ `staffb01`, mở `http://localhost:5173/staff/family-days/<id>/desk` rồi dán mã của Mẹ.
  - **Kết quả mong đợi:** bị từ chối vì không có quyền với Block A.
- [ ] **6.7. Cho Mẹ vào từ danh sách (không cần QR).** Ở dòng Mẹ bấm **Cho vào**, tick giấy tờ, xác nhận.
  - **Kết quả mong đợi:** Mẹ có trạng thái **Đã vào**.
- [ ] **6.8. Màn hình sinh viên.** `se200001` tải lại trang sự kiện.
  - **Kết quả mong đợi:** Bố và Mẹ hiện **Đã vào** kèm giờ vào, và mã QR của hai người biến mất; Em vẫn còn mã; nút **Hủy đăng ký** không còn.

## 7. Ghi nhận ra, quá giờ, vắng mặt, kết thúc

- [ ] **7.1. Bố ra về.** Bấm **Ghi nhận ra** ở dòng Bố → xác nhận.
  - **Kết quả mong đợi:** **Đã ra**. Dán lại mã của Bố: "Mã vào này đã được dùng: khách đã vào và ra."
- [ ] **7.2. Hủy sự kiện khi đã có khách vào.** Ở cửa sổ Manager, mở trang chi tiết.
  - **Kết quả mong đợi:** không có nút **Hủy Ngày gia đình** (đã có khách vào thì chỉ được kết thúc).
- [ ] **7.3. Tua tới sau khung giờ.** Chạy `.\docs\tools\family-day-time.ps1 slot-over`, rồi tải lại quầy.
  - **Kết quả mong đợi:**
    - Mẹ hiện **Quá giờ** (màu đỏ) và ô "Quá giờ" = 1.
    - Em hiện **Vắng mặt**.
    - Bộ lọc trạng thái "Quá giờ" chỉ còn Mẹ.
    - Trên quầy có khung cảnh báo vàng "1 khách vẫn còn ở trong sau khung giờ" với nút **Nhắc sinh viên**; ô "Quá giờ" ghi "1 khách chờ sinh viên xác nhận".
    - Ở dòng Mẹ **không có** nút Ghi nhận ra mà là chữ "Chờ sinh viên xác nhận", và cột "Vào và ra" ghi "Chưa nhắc sinh viên".
    - Trang Manager có cảnh báo "1 khách vẫn còn ở trong sau khung giờ".
- [ ] **7.4. Kết thúc khi còn khách bên trong.** Manager tải lại trang chi tiết.
  - **Kết quả mong đợi:** **chưa có** nút **Kết thúc Ngày gia đình**, vì Mẹ vẫn còn bên trong. Nút chỉ hiện khi các khung giờ đã qua và không còn ai bên trong. Server cũng chặn trường hợp này: gọi API trực tiếp sẽ nhận lỗi "Còn 1 khách chưa ra…".
- [ ] **7.5. Nhắc hàng loạt.** Ở quầy (`staffa01`), bấm **Nhắc sinh viên** → **Gửi nhắc nhở**.
  - **Kết quả mong đợi:**
    - Thông báo "Đã thông báo cho 1 sinh viên về 1 khách."
    - Dòng Mẹ ghi "Đã nhắc 1 lần (gần nhất HH:mm), đang chờ sinh viên".
    - `se200001` có thông báo ở chuông: "Người thân của bạn vẫn còn trong ký túc xá · …", nội dung nêu tên Mẹ và giờ khung kết thúc. Bấm vào thông báo thì mở trang Ngày gia đình.
    - Bấm **Nhắc sinh viên** lần nữa vẫn gửi được (Mẹ vẫn ở lại); dòng Mẹ thành "Đã nhắc 2 lần".
- [ ] **7.6. Staff chưa được ghi nhận ra.** Dán mã của Mẹ (lệnh `passes`) vào ô quét.
  - **Kết quả mong đợi:** thẻ kết quả ghi "Đã nhắc … đang chờ sinh viên" và **không có** nút Ghi nhận ra.
  - Mở trang quầy bằng `manager01`: dòng Mẹ **có** nút Ghi nhận ra; hộp thoại báo "Sinh viên chưa xác nhận" và bắt nhập lý do. **Bấm Quay lại, chưa ghi nhận ra**, để làm tiếp 7.7.
- [ ] **7.7. Sinh viên xác nhận an toàn.** Đăng nhập `se200001`, mở Ngày gia đình.
  - **Kết quả mong đợi:** khung vàng "Người thân của bạn vẫn còn trong ký túc xá" nêu tên Mẹ, giờ khung kết thúc và giờ quầy đã nhắc; thẻ của Mẹ hiện **Quá giờ**.
  - Nhập lời nhắn "Mẹ đang ở cổng, đang về", bấm **Người thân của tôi an toàn**.
  - **Kết quả mong đợi:** khung đổi sang "Bạn đã xác nhận người thân an toàn", thẻ Mẹ có dòng "Đã xác nhận an toàn lúc HH:mm". Bấm xác nhận lần nữa không còn được (không còn nút).
- [ ] **7.8. Staff ghi nhận ra.** Ở quầy (`staffa01`), tải lại trang.
  - **Kết quả mong đợi:** khung cảnh báo vàng biến mất; dòng Mẹ ghi "SV đã xác nhận an toàn lúc HH:mm: “Mẹ đang ở cổng, đang về”" và **có lại** nút Ghi nhận ra.
  - Bấm **Ghi nhận ra**: hộp thoại có khung xanh "Sinh viên đã xác nhận khách an toàn" kèm lời nhắn → xác nhận. Mẹ **Đã ra**.
- [ ] **7.9. Kết thúc.** Manager bấm **Kết thúc Ngày gia đình**, nhập ghi chú báo cáo, xác nhận.
  - **Kết quả mong đợi:** trạng thái **Đã kết thúc**; ô số liệu: Đã ra = 2, Vắng mặt = 1; mục Chi tiết có dòng "Đã kết thúc" với giờ, người kết thúc và ghi chú.

## 8. Thống kê

- [ ] **8.1. Staff.** `staffa01` → menu **Vận hành › Thống kê Ngày gia đình**.
  - **Kết quả mong đợi:** bảng có sự kiện vừa kết thúc; 4 ô tổng: số Ngày gia đình, Đơn đăng ký, Khách thực tế đến (ví dụ 2 / 3, 67%), Ở lại quá giờ = 1 kèm số khách vắng mặt.
- [ ] **8.2. Chi tiết.** Bấm vào dòng sự kiện. (Manager cũng mở được từ nút **Thống kê** ở trang chi tiết sự kiện.)
  - **Kết quả mong đợi:**
    - Không có khung "Số liệu chưa chốt" (sự kiện đã kết thúc).
    - Ô: Đơn đăng ký (kèm số đơn đã hủy ở bước 5), Khách đăng ký (kèm số chỗ đã đặt / tổng chỗ), Khách thực tế đến, Vắng mặt.
    - Bảng **Khung giờ**: mỗi khung có chỗ đã đặt / sức chứa, số đơn, khách đến / đăng ký, vắng mặt, ở quá giờ, thời gian ở trung bình.
    - **Thời điểm gia đình đến** theo giờ; **Ai đến thăm** theo quan hệ (Bố, Mẹ, Anh/em trai…), số người lớn và chưa đủ tuổi.
    - **Đơn đăng ký**: còn hiệu lực / SV tự hủy / Quản lý hủy.
    - **Khách ở lại quá giờ**: Ở quá giờ = 1, Đã nhắc = 1 (đã báo 1 sinh viên), SV xác nhận an toàn = 1, Quản lý ghi nhận ra khi chưa có xác nhận = 0.
- [ ] **8.3. Admin.** `admin01` → **Báo cáo › Thống kê Ngày gia đình**.
  - **Kết quả mong đợi:** thấy sự kiện của mọi Block và mở được trang chi tiết.
- [ ] **8.4. Phạm vi Block.** `staffb01` mở **Thống kê Ngày gia đình**.
  - **Kết quả mong đợi:** không thấy sự kiện của Block A. Mở thẳng `/staff/family-day-stats/<id>` của sự kiện Block A thì báo không có quyền.

## 9. Hủy cả sự kiện

- [ ] **9.1.** Manager tạo một Family Day mới cho Block A (giống bước 1.3) và công bố. `se200005` đăng ký 1 khách. Manager bấm **Hủy Ngày gia đình**, nhập lý do "Dự báo mưa bão".
  - **Kết quả mong đợi:** sự kiện **Đã hủy** và lý do hiện ở đầu trang; `se200005` nhận thông báo hủy kèm lý do; trang của SV hiện đăng ký **Đã hủy** và không còn QR. Sự kiện đã hủy **không** xuất hiện ở Thống kê.
- [ ] **9.2.** Chạy `.\docs\tools\family-day-time.ps1 passes`, rồi dán mã của khách đó ở quầy (`staffa01`).
  - **Kết quả mong đợi:** "Mã vào này đã bị hủy và không còn hiệu lực."

## 10. Kiểm tra chung

- [ ] **10.1. Audit Log.** Đăng nhập `admin01` → **Audit Log**.
  - **Kết quả mong đợi:** có các dòng Family Day created / published / guest checked in / guest checked out / overdue reminded / safety confirmed / pass refused (mã giả) / registration cancelled / cancelled / closed, mỗi dòng ghi người thực hiện.
- [ ] **10.2. Ngôn ngữ.** Đổi sang English (nút ngôn ngữ ở góc trên).
  - **Kết quả mong đợi:** các màn hình Family Day, Thống kê và thông báo lỗi hiện tiếng Anh; đổi lại thì về tiếng Việt.
- [ ] **10.3. Màn hình điện thoại.** Thu nhỏ cửa sổ sinh viên xuống bề rộng điện thoại.
  - **Kết quả mong đợi:** trang Ngày gia đình nằm dưới tab **Hoạt động**; thẻ QR và khung xác nhận an toàn xếp một cột; không bị cuộn ngang.

## Ghi lỗi

| Bước | Thấy gì | Mong đợi gì | Ảnh chụp |
|---|---|---|---|
| | | | |
