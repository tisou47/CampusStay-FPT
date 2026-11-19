# Kịch bản test thủ công: Kiểm tra phòng, Kiểm kê nhận phòng, Tiền đền khi trả phòng

Nhánh `feat/room-handover` (contract A-73 trên giá và mức tình trạng của A-72, migration V76–V80). Ngày soạn: 19/11/2026. Mỗi bước có **Kết quả mong đợi**; đánh dấu `[x]` khi đúng, ghi lại bước nào sai.

## 0. Chuẩn bị

### 0.1. Lấy nhánh và chạy

```
git fetch origin
git switch feat/room-handover
docker compose -f infra/docker-compose.yml --profile app up -d --build
```

- Xong khi http://localhost:8080/api/actuator/health trả về `{"status":"UP"}`.
- Migration V76–V80 chạy vào database local. Nếu sau đó quay về `main`, Flyway bỏ qua các migration "tương lai" nên vẫn chạy được; muốn sạch hẳn thì xóa volume database rồi chạy lại.

Chạy web trong cửa sổ khác:

```
cd web
npm install
npm run dev
```

Mở http://localhost:5173. App Android: build như thường lệ (`mobile/README.md`), trỏ vào cùng API.

**Máy Windows chạy backend bằng Maven** (không qua Docker) mà gặp lỗi `Unable to establish loopback connection`: đặt trước khi chạy

```
$env:JAVA_TOOL_OPTIONS = "-Dsun.nio.ch.PipeImpl.noUnixDomainSockets=true -Djdk.net.unixdomain.tmpdir=C:\cstmp"
```

(tạo thư mục `C:\cstmp` trước). Đây là lỗi socket nội bộ của Java trên máy, không liên quan nhánh này.

### 0.2. Nạp dữ liệu demo

1. Đăng nhập `admin01@fpt.edu.vn` / `123`.
2. **Hệ thống › Dữ liệu demo**, nạp **giai đoạn A** (các tình huống D14–D16 có ở mọi giai đoạn).
3. Ở danh sách tình huống, xem **D15** và **D16**: cột tài khoản ghi mã của 6 sinh viên S40–S45 (ví dụ `se21xxxx`). Ghi lại; mật khẩu đều là `123`.

### 0.3. Tài khoản và phòng (Block A, tầng 9)

| Vai | Tài khoản | Tình trạng lúc bắt đầu |
|---|---|---|
| Staff | `staffa01@fpt.edu.vn` | Đợt "Pre-arrival check (demo)": A-902…A-905 đã kiểm, **A-901 chưa kiểm** |
| Manager | `manager01@fpt.edu.vn` | Duyệt khoản đền, xem đợt kiểm tra |
| Admin | `admin01@fpt.edu.vn` | Loại nội thất (dùng, giá thật, mức tình trạng), tham số |
| S40 | A-901 giường A | Đã trả tiền, được duyệt đến muộn: **có thể bắt đầu kiểm kê** |
| S41 | A-902 giường A | Đã bắt đầu, **đang nháp**, còn ~42 giờ |
| S42 | A-903 giường A | Đã nộp, **Lệch lớn** (thiếu tủ, điện +43,5 kWh) |
| S43 | A-903 giường B | Bạn cùng phòng của S42, biên bản **đã chốt** |
| S44 | A-904 giường A | Đã hẹn **xuống phòng hôm nay 16:00** |
| S45 | A-905 giường A | Đang ở từ đầu kỳ, có **hư hỏng đồ chung cần xác nhận** |

## 1. Luồng 1: Kiểm tra phòng trước khi vào ở (Staff, web)

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 1.1 | `staffa01` › Vận hành › **Kiểm tra phòng** | Thấy đợt "Pre-arrival check (demo)", 5 phòng, A-902…A-905 Done, A-901 To do | [ ] |
| 1.2 | Chọn A-901 | Mỗi món nội thất có ô chọn **Tốt / Hao mòn / Hư hỏng / Thiếu**; món riêng ghi "Giường A/B"; có ô điện, nước, "Đã thay công tơ" | [ ] |
| 1.3 | Chọn tất cả Tốt, **không nhập công tơ**, Lưu | Lưu được nhưng phòng **chưa Done** (nút ghi "còn thiếu công tơ") | [ ] |
| 1.4 | Nhập điện **nhỏ hơn** chỉ số cũ của phòng, Lưu | Báo lỗi "thấp hơn lần trước"; tick "Đã thay công tơ" thì lưu được | [ ] |
| 1.5 | Một món chọn **Hư hỏng**, ghi chú, nhập công tơ hợp lệ, Lưu | Phòng Done; thông báo tạo yêu cầu bảo trì `MR-…`; món đó có lịch sử sửa chữa | [ ] |
| 1.6 | (Phòng khác/đợt khác) chọn **Thiếu** cho máy lạnh/tủ lạnh + tick "Lấy đồ dự phòng trong kho Block" | Không tạo yêu cầu bảo trì; ở **Nội thất › Lệnh chuyển** có lệnh PLANNED từ kho về phòng | [ ] |
| 1.7 | `manager01` › Vận hành › **Lịch kiểm tra** | Thấy lịch, kết quả đợt; tạo lịch mới với phạm vi **"Rooms new residents will receive"** được | [ ] |

## 2. Luồng 2: Kiểm kê nhận phòng

### 2.1. Sinh viên bắt đầu (S40, web hoặc app)

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 2.1 | S40 › **Phòng của tôi** | Có thẻ "Bạn đã có thể nhận phòng", nút mở trang kiểm kê; các thẻ cũ vẫn còn | [ ] |
| 2.2 | Mở **Kiểm kê nhận phòng** | 4 điều kiện: đã trả tiền, đã đến ngày nhận, mã phòng đã đặt, chưa quá hạn: đều **Đã xong** | [ ] |
| 2.3 | Bấm **Bắt đầu kiểm kê**, xác nhận | Hiện form; Phòng của tôi xem được **mã cửa**; hạn nộp = bây giờ + 48 giờ | [ ] |
| 2.4 | Tải lại trang | **Không** thấy bất kỳ thông tin nào Staff đã ghi (không có "baseline", không có "Lệch") | [ ] |
| 2.5 | Khai mọi món Tốt, nhập công tơ **bằng** chỉ số Staff ghi ở 1.5, thêm 1 ảnh, Nộp | Trạng thái **Đã chốt** ngay ("Theo bản bạn đã nộp"); điện nước tính từ lúc nộp | [ ] |
| 2.6 | Nộp lại / bấm bắt đầu lần 2 | Bị chặn (đã nộp / đã bắt đầu) | [ ] |

### 2.2. Nháp và hạn 48 giờ (S41)

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 2.7 | S41 mở kiểm kê | Form nháp, một số món đã khai, bàn học chưa khai | [ ] |
| 2.8 | Nộp khi còn món chưa khai | Lỗi "Hãy khai đủ mọi món" | [ ] |
| 2.9 | Nhập công tơ âm hoặc thấp hơn chỉ số phòng | Bị từ chối | [ ] |
| 2.10 | (Kiểm hạn) trong DB đặt `due_at` của biên bản S41 về quá khứ, đợi ≤15 phút (job) | Biên bản **Đã chốt – Quá hạn**; S41 thấy ô **Báo cáo trễ**, gửi được đúng 1 lần | [ ] |
| 2.11 | `staffa01` › **Biên bản kiểm kê nhận phòng** › tab Báo cáo trễ | Thấy báo cáo của S41; chấp nhận 1 món là Hư hỏng → món đó ghi "có từ trước" | [ ] |

### 2.3. Lệch lớn và xuống phòng (S42, S44)

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 2.12 | `staffa01` › Biên bản kiểm kê › tab **Cần xem** | S42 ở đầu danh sách, nhãn **Lệch lớn** | [ ] |
| 2.13 | Mở S42 | Hai cột "Gốc của phòng" và "Sinh viên"; dòng lệch tô màu; ghi chú "Wardrobe: Good → Missing", "Electricity +43.5 kWh" | [ ] |
| 2.14 | Bấm **Xác nhận biên bản** | Bắt buộc nhập lý do (vì lệch lớn) | [ ] |
| 2.15 | Thay vào đó bấm **Chờ xác minh tại phòng**, chọn giờ | Trạng thái Verifying; S42 nhận thông báo "Nhân viên sẽ xuống kiểm tra phòng" | [ ] |
| 2.16 | S44: Staff mở, **Ghi nhận thực tế**, sửa bàn học / công tơ, **Gửi cho sinh viên** | S44 thấy "Đồng ý với biên bản đã kiểm" | [ ] |
| 2.17 | S44 nhập ý kiến, bấm **Đồng ý kèm ý kiến** | Đã chốt – "Đã kiểm cùng nhân viên"; ý kiến hiện ở chi tiết; **không có nút phản đối** | [ ] |
| 2.18 | Bàn học Hư hỏng ở 2.16 | Có yêu cầu bảo trì nội thất mới; món này **không** tính tiền cho S44 sau này | [ ] |
| 2.19 | S42 mở form (sau khi Staff hủy biên bản để S42 làm lại, nếu muốn) | Đồ chung có dòng "Bạn cùng phòng đã ghi là …" (từ biên bản của S43) | [ ] |

### 2.4. Cấp mã cửa không còn tự động

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 2.20 | Một sinh viên mới (Round 2 / trả tiền phòng) ở phòng đã có mã | **Không** tự có mã; nhận thông báo "Bạn đã có thể nhận phòng" | [ ] |
| 2.21 | Sinh viên ở tiếp **cùng giường** sang kỳ sau (giai đoạn C) | Vẫn có mã **tự động**, không phải kiểm kê | [ ] |
| 2.22 | Admin tắt tham số **"New residents file a check-in inventory…"** (Tham số hệ thống › Room handover) | Quay về hành vi cũ: trả tiền xong là có mã | [ ] |

## 3. Luồng 3: Trả phòng và tiền đền

| # | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|
| 3.1 | `admin01` › **Loại nội thất** | Cột "Dùng": đồ nội thất = Cá nhân, thiết bị và đồ cố định = Dùng chung; cột Giá thật (Giường 2.000.000, Tủ 2.500.000, Bàn 1.500.000…); sửa được | [ ] |
| 3.2 | **Mức tình trạng** › Sửa | Nguyên vẹn 100, Hư một phần 75, Hư hơn một nửa 50, Hư hoàn toàn 0; có ghi chú bàn giao phòng dùng 4 mức đầu; nút xóa của 4 mức này bị khóa | [ ] |
| 3.3 | Tham số hệ thống › Room handover | Hạn 48 giờ, ngưỡng công tơ, hạn xác nhận đồ chung; **không còn** % đền (đã chuyển sang mức tình trạng) | [ ] |
| 3.4 | S45 › Phòng của tôi | Thẻ "Khoản đền nội thất cần trả lời"; trang kiểm kê có câu hỏi "Bạn có làm hỏng …?" | [ ] |
| 3.5 | S45 bấm **Từ chối** | Không bị tính; Staff thấy trạng thái Declined | [ ] |
| 3.6 | Staff tạo lại ghi nhận hư hỏng đồ chung (màn Trả phòng › "Sinh viên đã làm hỏng"), S45 **Xác nhận** | Khoản tiền = giá thật × 50% (Hư hơn một nửa) được cộng vào tiền đền khi trả phòng | [ ] |
| 3.7 | `staffa01` › **Trả phòng**, chọn S45 (giai đoạn C, hoặc lý do trả phòng sớm) | Mục mới **"Nội thất theo tình trạng"**; bảng nhập tiền tay cũ vẫn còn | [ ] |
| 3.8 | Đặt bàn học của S45 = Hư hỏng, tick "Sinh viên có mặt", **Ghi nhận nội thất** | Hiện tiền = giá thật của bàn (1.500.000) × 50% = 750.000; footer trừ cọc theo tổng này | [ ] |
| 3.9 | Bấm **Xác nhận trả phòng** ngay | Lỗi "Sinh viên chưa đồng ý với khoản đền" | [ ] |
| 3.10 | S45 bấm **Đồng ý với khoản đền**, Staff xác nhận lại | Trả phòng thành công; nếu tổng > cọc → hóa đơn DAMAGE cho phần thiếu | [ ] |
| 3.11 | Lần khác: tick **"Sinh viên không đồng ý: Manager quyết định"** cho 1 món | Món đó chưa tính; `manager01` › Quyết định › **Tiền đền khi trả phòng** thấy món, Giữ/Bỏ (bắt buộc lý do) | [ ] |
| 3.12 | Món bàn học ở 2.18 (hỏng có từ trước) khi trả phòng | Tiền = 0, ghi "có từ trước" | [ ] |
| 3.13 | `manager01` › Vận hành › **Nội thất** › tab **Tồn kho theo tòa** | Mỗi tòa × loại: trong kho, trong phòng, hỏng/đang sửa, lệnh chuyển; giá thật (của Loại nội thất) và **giá trị trong kho** = giá × số trong kho; 4 ô tổng ở trên; loại chưa có giá có ghi chú cảnh báo. `staffa01` chỉ thấy Block A | [ ] |
| 3.14 | `staffa01` › Bàn tiếp nhận › **Nhận phòng**, tìm S40 (chưa kiểm kê) | Điều kiện "Sinh viên đã nộp kiểm kê nhận phòng" chưa đạt, không check-in được; sau khi S40 nộp và chốt (2.5) thì hiện đã nhận phòng | [ ] |
| 3.15 | `manager01` › Nội thất › chuyển một **tủ** (đồ cá nhân) của A-901 về kho Block A rồi chuyển lại | Về kho: món mất giường; về lại phòng: món gắn lại giường còn trống, kiểm kê / trả phòng của giường đó thấy món | [ ] |

## 3b. Giai đoạn D "Tuần nhận phòng" (dữ liệu mẫu theo đúng timeline)

Nạp **giai đoạn D** ở Admin › Hệ thống › Dữ liệu demo. Timeline của mọi giai đoạn tuân theo luật của trình tạo học kỳ:

```
Kỳ N:   nhận phòng n_start … n_start+6 ─ kết thúc n_end ─ hạn trả phòng n_end+1
        Staff kiểm tra phòng trước khi vào ở: n_end+1 … n_end+2 (gửi kết quả trước ngày mở nhận phòng)
Kỳ N+1: mở nhận phòng n_end+3 (= ngày bắt đầu ở) … n_end+9
D = ngày thứ 4 của đợt nhận phòng kỳ N+1 (hạn nộp biên bản 48 giờ nên đã có biên bản quá hạn)
```

Mỗi Block có một đợt "Pre-arrival check Block X (demo)" đã gửi; khoảng 300 sinh viên mới ở đủ trạng thái (≈40 % đã chốt khớp, 15 % nháp, 10 % lệch nhỏ, 5 % lệch lớn, 5 % chờ xuống phòng, 15 % sẵn sàng, 10 % quá hạn). Tài khoản D1–D9 hiện ở cột tài khoản của D17–D20 trên trang Dữ liệu demo (Block A, mật khẩu `123`). Staff chọn học kỳ **kỳ N+1** ở thanh trên cùng để xem biên bản, chọn **kỳ N** để xem người trả phòng quá hạn.

| # | Ai | Bước | Kết quả mong đợi | ✓ |
|---|---|---|---|---|
| D.1 | `staffa01` | Kiểm tra phòng › đợt Block A | Đã gửi; một phòng "Không vào được" (phòng của D9); mỗi phòng có tình trạng và công tơ | [ ] |
| D.2 | `staffa01` | Mã cửa | Phòng của D8 còn việc đổi mã; đặt và xác nhận mã → sinh viên phòng đó chuyển sang **Sẵn sàng** | [ ] |
| D.3 | D1 | Phòng của tôi › Bắt đầu kiểm kê | 4 điều kiện đạt; nhận mã cửa; khai đúng thực tế + công tơ (lấy chỉ số trong gợi ý của Staff: xem D.1) → **Đã chốt** ngay | [ ] |
| D.4 | D2 | Mở biên bản nháp | Còn ~18 giờ; khai nốt, nộp | [ ] |
| D.5 | `staffa01` | Biên bản kiểm kê › Cần xem | D3 **Lệch lớn** (thiếu tủ, +45 kWh) ở đầu; D4 **Lệch nhỏ** (bàn học) | [ ] |
| D.6 | `staffa01` | D4 › Xác nhận biên bản | Đã chốt; bàn học ghi "có từ trước"; có yêu cầu bảo trì mới | [ ] |
| D.7 | `staffa01` | D3 › Xác nhận | Bắt buộc lý do → chọn **Chờ xác minh tại phòng** | [ ] |
| D.8 | `staffa01` → D5 | Tab Xuống phòng › D5 (hẹn 16:00 hôm nay) › Ghi nhận thực tế › Gửi | D5 bấm **Đồng ý kèm ý kiến** → Đã chốt, không có nút phản đối | [ ] |
| D.9 | D7 | Mở biên bản | **Đã chốt – Quá hạn**; gửi **báo cáo trễ** một lần; Staff tab Báo cáo trễ chấp nhận một món | [ ] |
| D.10 | D8 | Phòng của tôi | **Đang chờ**: "mã cửa của phòng chưa đặt" (đến khi làm D.2) | [ ] |
| D.11 | D9 | Biên bản đã chốt | Staff xem: cột "Gốc của phòng" ghi **Chưa có gốc** | [ ] |
| D.12 | `se220007` | Phòng của tôi | **Đang chờ**: chưa trả tiền phòng (dù đã được duyệt đến muộn) | [ ] |
| D.13 | `se210006` | Phòng của tôi | Ở tiếp nhưng chuyển sang A-603 nên vẫn phải kiểm kê (**Sẵn sàng**) | [ ] |
| D.14 | Người ở tiếp cùng giường (bất kỳ) | Phòng của tôi | Có mã cửa tự động từ ngày mở nhận phòng, **không** phải kiểm kê | [ ] |
| D.15 | `staffa01` (chọn kỳ N) | Trả phòng | `se210003` **quá hạn**; trả phòng với nội thất theo tình trạng như mục 3 | [ ] |

## 4. Kiểm tra chéo toàn hệ thống

- [ ] Hóa đơn điện nước tháng: sinh viên mới chỉ chia tiền từ lúc biên bản chốt, không từ lúc nhận mã.
- [ ] Bàn tiếp nhận › **Nhận phòng** (màn cũ): sinh viên có biên bản đã chốt hiện "đã nhận phòng".
- [ ] Sơ đồ phòng: sinh viên đã bấm bắt đầu kiểm kê hiện là cư dân (màu cam).
- [ ] Đổi ngôn ngữ sang tiếng Việt: không còn chữ tiếng Anh ở các màn mới.
- [ ] Trợ lý AI: hỏi "kiểm kê nhận phòng là gì" trả lời đúng quy trình, không lộ mã cửa.
- [ ] Reset demo giai đoạn B, C: không lỗi, D14–D16 vẫn có.

## 5. Điểm còn hở cần xem lại (biết trước)

1. ~~Đồ riêng mới đăng ký không gắn giường~~ — **đã xử lý**: đăng ký, chuyển, thanh lý món hoặc đổi "Dùng" của loại thì món cá nhân tự gắn vào giường còn trống của phòng (theo nhãn giường) và tự bỏ gắn khi rời phòng. Phòng có nhiều món cùng loại hơn số giường thì món dư được coi như đồ chung.
2. ~~Bàn tiếp nhận cũ vẫn check-in được~~ — **đã xử lý**: khi bật kiểm kê, màn Nhận phòng cũ hiện điều kiện "Sinh viên đã nộp kiểm kê nhận phòng" / "Biên bản kiểm kê nhận phòng đã chốt" và chặn (`CHECK_IN_BLOCKED`) cho tới khi biên bản chốt (biên bản chốt tự ghi nhận phòng).
3. **Loại nội thất chưa có giá thật thì tiền đền = 0.** Giá lấy từ cột Giá thật của loại (một giá cho mọi hạng phòng và mọi kỳ); loại tạo mới để trống giá thì món hư không bị tính cho tới khi Admin nhập giá. Hao mòn (= Hư một phần) bị tính 25 % theo mức mặc định; muốn miễn thì Admin đặt mức này 100 %.
4. **Lịch "trước khi vào ở"** chỉ lấy phòng có sinh viên **chưa** nhận mã lúc đợt bắt đầu; lịch này là một lần (ONCE). Chưa tự đề xuất theo timeline kỳ; Manager phải tạo trước `check_in_start`.
5. **Ảnh iPhone HEIC** bị từ chối (chỉ nhận JPEG/PNG); web dùng camera thường ra JPEG, nhưng chọn từ thư viện có thể ra HEIC.
6. **Báo cáo trễ** chỉ 1 lần, Staff chỉ chấp nhận được từng món là Hư hỏng/Thiếu; không có ảnh kèm.
7. Ngưỡng công tơ dùng **số người đang ở** tại lúc nộp; phòng nhiều người vào cùng ngày có thể cho ngưỡng lớn hơn thực tế.

## 6. Test tự động

```
cd backend
mvn -o verify
```

Gồm `HandoverComparisonTest` (TC-ASG-047…052), `HandoverIT` (TC-ASG-053…060) và `FurnitureIT` (TC-INV-028: tồn kho, đồ cá nhân theo giường). Web: `npm run build`, `npm run i18n:check`. App: `flutter analyze`, `flutter test`.
