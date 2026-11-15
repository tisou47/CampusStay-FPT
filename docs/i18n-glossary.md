# CampusStay — I18n glossary and style (VI / EN)

The one reference for wording on the web app (all four portals), the mobile app and the API's messages and emails.
Mechanism: ADR-25 (`web/src/i18n/index.jsx`). English texts in the code are their own keys; Vietnamese is in
`web/src/i18n/vi.js` (shell) and `vi-pages.js` (screens); English singular forms in `web/src/i18n/en-plurals.js`;
the API's Vietnamese in `backend/src/main/resources/i18n/messages_vi.txt`. Check with `npm run i18n:check` in `web/`.

## 1. Terms

| English (UI) | Tiếng Việt | Notes |
|---|---|---|
| Application | Đơn đăng ký | "đơn" alone when the context is clear ("Mở đơn để xem tiến độ") |
| Application ID | Mã đơn | Column of application lists, e.g. APP-FA26-024993 |
| Term | Học kỳ | A billing month is a period ("Kỳ 11/2026"), never a term |
| Block | Tòa | "Block A" → "Tòa A"; lowercase inside a sentence: "các tòa" |
| Floor | Tầng | |
| Room | Phòng | |
| Bed | Giường | |
| Room type | Loại phòng | Number of beds |
| Room tier | Hạng phòng | Basic / Standard / Premium. The API and database keep the name `roomClass` |
| Deposit | Tiền đặt cọc | Utility deposit = Tiền đặt cọc điện nước |
| Balance | Tiền phòng còn lại | |
| Invoice | Hóa đơn | |
| Allocated (status) | Đã xếp phòng | |
| Assigned (status) | Đã giao | |
| Unassigned | Chưa có người nhận | A request nobody has taken |
| Assign to me | Nhận việc | Button |
| Overdue | Quá hạn | "1 overdue" / "1 quá hạn" |
| Check-in | Nhận phòng | |
| Check-out | Trả phòng | |
| Meter reading(s) | Chốt chỉ số điện nước | Menu and screen; "chỉ số điện nước" inside a sentence |
| Family Day | Ngày thăm thân | A named event: capitalised in both languages |
| Maintenance | Bảo trì | Maintenance request = Yêu cầu bảo trì |
| Inspection | Kiểm tra phòng | |
| Door code | Mã cửa | |
| Room changes and swaps | Đổi/hoán đổi phòng | swap = hoán đổi |
| Submitted on (column) | Ngày nộp | |

Term names ("Fall 2026", "Spring 2027") come from the data and are shown as they are in both languages.

## 2. English style

- **Sentence case** for every title, menu item, column, button, label and message: "Room type", "My room",
  "Where the term stands", "Open an application to see its progress".
- Domain nouns are **not** capitalised inside a sentence: term, bed, room, block, application, invoice, deposit,
  manager, staff, admin, student.
- Names keep their capitals: "Block A", "Room {label}", "Floor 3", "Round 2", "Fall 2026", "Family Day", and the
  menu paths "Admin › Utility", "Decisions › Swaps".
- Buttons start with a verb: "Assign to me", "Select a block first", "Pay invoice".
- Plurals use the English plural rules (ICU "one"/"other"), never "1 requests": write the plural text in the code
  (`t('{n} requests', { n })`) and add its singular form to `en-plurals.js`.

## 3. Vietnamese style

- No English words inside Vietnamese texts except names (CampusStay, VietQR, Fall 2026) and units.
- Sentence case as in English; "Tòa A", "Học kỳ này", "Ngày thăm thân".

## 4. Dates, times, numbers and money (`web/src/lib/format.js`)

Components never call `toLocale*` or `Intl.*` themselves; `npm run i18n:check` fails if they do.

| Preset | Tiếng Việt (vi-VN) | English (en-GB) |
|---|---|---|
| `formatDate` | 15/11/2026 | 15 Nov 2026 |
| `formatDateTime` | 15/11/2026, 08:00 | 15 Nov 2026, 08:00 |
| `formatTime` | 08:00 | 08:00 |
| `formatWeekdayDate` | Thứ Hai, 16/11/2026 | Mon, 16 Nov 2026 |
| `formatDateShort` | 15/11 | 15 Nov |
| `formatMonthYear` | Tháng 11/2026 | November 2026 |
| `formatDateRange` (same year) | 26/06 – 11/07/2026 | 26 Jun – 11 Jul 2026 |
| `formatDateTimeRange` (same day) | 16/11/2026, 08:00 – 10:00 | 16 Nov 2026, 08:00 – 10:00 |
| `formatRelative` | Hôm nay 08:00 · Hôm qua 14:30 · 3 ngày trước | Today 08:00 · Yesterday 14:30 · 3 days ago |
| `formatTimeLeft` | Còn 30 ngày · Quá hạn 2 ngày 3 giờ | 30 days left · 2d 3h overdue |
| `formatPeriod` | Kỳ 11/2026 | Period 11/2026 |
| `formatCurrency` / `formatVnd` | 2.588.000 ₫ | 2,588,000 ₫ |
| `formatNumber` | 1.234 | 1,234 |

- Always 24-hour; a spaced en dash " – " between the ends of a range; weeks start on Monday (T2…CN / Mo…Su).
- Every instant is shown on the campus clock, **Asia/Ho_Chi_Minh (UTC+7)**, whatever the device's time zone.
  The API stores and sends instants in UTC (ISO-8601 with `Z`) and calendar days as `2026-11-15`, never shifted.
- "Today", deadlines and "days left" are counted in campus calendar days (`campusToday`, `daysFromToday`).
- Greeting by the campus hour: 05:00–11:59 Chào buổi sáng / Good morning; 12:00–17:59 Chào buổi chiều /
  Good afternoon; from 18:00 Chào buổi tối / Good evening.
- Money is always "₫" after the amount; only the separators change with the language. Field units read "(₫)".
