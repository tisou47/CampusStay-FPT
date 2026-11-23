| ID | Kind | Code | English | Vietnamese | Raised by |
|---|---|---|---|---|---|
| MSG001 | forbidden | ACCOUNT_DISABLED | This account is disabled. Contact the dormitory office. | Tài khoản này đã bị khóa. Hãy liên hệ văn phòng ký túc xá. | PasswordService |
| MSG002 | conflict | ACCOUNT_ENTERED | The student already entered their bank account. | Sinh viên đã nhập tài khoản ngân hàng. | FinanceService |
| MSG003 | unauthorized | ACCOUNT_LOCKED | Too many failed attempts. Try again after  |  | SignInService |
| MSG004 | forbidden | ACCOUNT_REJECTED | Your student account was not verified:  |  | SignInService |
| MSG005 | conflict | ALLOCATION_ENDED | This student no longer holds the Bed. | Sinh viên này không còn giữ giường. | JdbcMoves |
| MSG006 | conflict | ALLOCATION_ENDED | One of you no longer holds the Bed. | Một trong hai bạn không còn giữ giường. | SwapService |
| MSG007 | badRequest | ALREADY_ACTIVE | An active account cannot go back to Invited. | Tài khoản đang hoạt động không thể quay lại trạng thái Đã mời. | AdminUserService |
| MSG008 | conflict | ALREADY_CHECKED_IN | You have already checked in. | Bạn đã nhận phòng rồi. | LateCheckInService |
| MSG009 | conflict | ALREADY_CHECKED_OUT | This student has already checked out. | Sinh viên này đã trả phòng. | CheckOutFurnitureService |
| MSG010 | conflict | ALREADY_DECIDED | Application  |  | ApplicationReviewService |
| MSG011 | conflict | ALREADY_DECIDED | This late check-in was already decided. | Yêu cầu nhận phòng muộn này đã được quyết định. | LateCheckInService |
| MSG012 | conflict | ALREADY_DECIDED | This refund was already decided. | Khoản hoàn tiền này đã được quyết định. | FinanceService |
| MSG013 | conflict | ALREADY_DECIDED | This request was already decided. | Yêu cầu này đã được quyết định. | RoomChangeService |
| MSG014 | conflict | ALREADY_DECIDED | This swap is not waiting for a decision. | Yêu cầu hoán đổi này không chờ quyết định. | SwapService |
| MSG015 | conflict | ALREADY_LOCKED | This account is already locked. | Tài khoản này đã bị khóa. | StudentAccountService |
| MSG016 | conflict | ALREADY_PAID | This Invoice is already paid. | Hóa đơn này đã được thanh toán. | PaymentClaimService |
| MSG017 | conflict | ALREADY_REMINDED | The student was reminded less than a day ago. | Sinh viên vừa được nhắc chưa đến một ngày trước. | FinanceService |
| MSG018 | conflict | ALREADY_RESOLVED | This item is already resolved. | Mục này đã được xử lý. | ReconciliationService |
| MSG019 | conflict | ALREADY_TERMINATED | This stay is already terminated. | Hợp đồng ở này đã bị chấm dứt. | TerminationService |
| MSG020 | conflict | ALREADY_VERIFIED | Your account is already verified. Ask a Manager to correct your details. | Tài khoản của bạn đã được xác minh. Hãy nhờ Quản lý sửa thông tin của bạn. | StudentVerificationService |
| MSG021 | conflict | ASSIGNED_TO_SOMEONE_ELSE | This request is assigned to  |  | MaintenanceDeskService |
| MSG022 | conflict | ASSIGNMENT_IN_REVIEW | A Round-1 proposal of this Term is still in review. Commit or discard it before Round 2. | Đề xuất vòng 1 của học kỳ này vẫn đang được xem xét. Hãy chốt hoặc hủy trước khi chạy vòng 2. | AssignmentService |
| MSG023 | tooManyRequests | ASSISTANT_LIMIT | You have asked many questions in the last hour. Try again later. | Bạn đã hỏi nhiều câu trong một giờ qua. Hãy thử lại sau. | AssistantService |
| MSG024 | unavailable | ASSISTANT_NO_ANSWER | The assistant could not answer. Ask in other words. | Trợ lý chưa trả lời được. Hãy hỏi bằng cách khác. | AssistantService |
| MSG025 | badRequest | ASSISTANT_NO_QUESTION | End the conversation with your question. | Hãy kết thúc cuộc trò chuyện bằng câu hỏi của bạn. | AssistantService |
| MSG026 | unavailable | ASSISTANT_OFFLINE | The assistant is offline right now. Try again later. | Trợ lý đang offline. Hãy thử lại sau. | OllamaAssistantModel |
| MSG027 | badRequest | BAD_PAGE | Page must be 1 or more and page size between 1 and  |  | PageQuery |
| MSG028 | badRequest | BAD_PARAMETER | Choose 24h or 7d. | Hãy chọn 24 giờ hoặc 7 ngày. | ApplicationReviewService |
| MSG029 | badRequest | BAD_PARAMETER | Unknown status  |  | ApplicationReviewService |
| MSG030 | badRequest | BAD_PARAMETER | Choose a date range: 7d, 30d, 90d or all. | Hãy chọn khoảng thời gian: 7 ngày, 30 ngày, 90 ngày hoặc tất cả. | AuditTrailService |
| MSG031 | badRequest | BAD_PARAMETER | Choose a role: Student, Staff, Manager, Admin or System. |  | AuditTrailService |
| MSG032 | badRequest | BAD_PARAMETER | Block  |  | StaffAccountService |
| MSG033 | badRequest | BAD_PARAMETER | Choose a status from the list. | Hãy chọn trạng thái trong danh sách. | StaffAccountService |
| MSG034 | badRequest | BAD_PARAMETER | Choose yes or no. | Hãy chọn có hoặc không. | StudentAccountService |
| MSG035 | badRequest | BAD_PARAMETER | Choose a verification status from the list. | Hãy chọn trạng thái xác minh trong danh sách. | StudentAccountService |
| MSG036 | badRequest | BAD_PARAMETER | Choose an enrollment status from the list. | Hãy chọn tình trạng học tập trong danh sách. | StudentAccountService |
| MSG037 | badRequest | BAD_PARAMETER | Choose Male or Female. | Hãy chọn Nam hoặc Nữ. | StudentAccountService |
| MSG038 | badRequest | BAD_PARAMETER | Choose a cohort from the list. | Hãy chọn khóa trong danh sách. | StudentAccountService |
| MSG039 | badRequest | BAD_PARAMETER | Choose New, Update, Unchanged or Error. | Hãy chọn Mới, Cập nhật, Không đổi hoặc Lỗi. | StudentImportService |
| MSG040 | badRequest | BAD_PARAMETER | Choose a Block. | Hãy chọn tòa. | InventoryService |
| MSG041 | badRequest | BAD_PARAMETER | Limit must be between 1 and  |  | NotificationService |
| MSG042 | conflict | BED_NOT_AVAILABLE | This Bed is not free any more. Choose another one. | Giường này không còn trống. Hãy chọn giường khác. | OperationalMoveService |
| MSG043 | conflict | BED_NOT_AVAILABLE | No matching Bed is free for this request. | Không còn giường phù hợp còn trống cho yêu cầu này. | NextTermRequestsService |
| MSG044 | conflict | BED_NOT_AVAILABLE | This Bed is not free for this request any more. Choose another one. | Giường này không còn trống cho yêu cầu này. Hãy chọn giường khác. | RoomChangeService |
| MSG045 | conflict | BED_TAKEN | This Bed was just taken. Choose another one. | Giường này vừa có người nhận. Hãy chọn giường khác. | JdbcMoves |
| MSG046 | conflict | BED_TAKEN | This Bed is no longer free. Ask Staff for another option. | Giường này không còn trống. Hãy nhờ nhân viên chọn phương án khác. | JdbcRound2Placements |
| MSG047 | conflict | BED_UNAVAILABLE | This Bed is no longer available. Ask Staff for another option. | Giường này không còn trống. Hãy hỏi nhân viên để chọn phương án khác. | JdbcRound2Placements |
| MSG048 | conflict | BLOCK_IN_USE | Students live in or are placed in Block  |  | AdminBuildingService |
| MSG049 | forbidden | BLOCK_OUT_OF_SCOPE | You do not have access to Block  |  | BlockScope |
| MSG050 | forbidden | BLOCK_OUT_OF_SCOPE | You do not have access to this Block. | Bạn không có quyền truy cập tòa này. | BlockScope |
| MSG051 | forbidden | BLOCK_OUT_OF_SCOPE | This Application belongs to a Block you do not manage. | Đơn này thuộc tòa bạn không phụ trách. | ApplicationReviewService |
| MSG052 | conflict | BLOCK_SUBMITTED | This Block is with the Manager; it cannot change now. | Tòa này đang chờ Quản lý duyệt nên chưa thể thay đổi. | AssignmentService |
| MSG053 | conflict | BLOCK_SUBMITTED | The only free Bed of that kind is in a Block  |  | AssignmentService |
| MSG054 | conflict | BLOCK_SUBMITTED | Block  |  | AssignmentService |
| MSG055 | conflict | CANNOT_CANCEL | This Application can no longer be cancelled here.  |  | ApplicationService |
| MSG056 | conflict | CHECK_IN_BLOCKED | Check-in is blocked:  |  | DeskService |
| MSG057 | conflict | CHECK_IN_NOT_READY | You cannot receive the Room yet:  |  | StudentHandoverService |
| MSG058 | conflict | CHECK_IN_NOT_READY | The door code cannot be released yet. Try again later. | Chưa thể cấp mã cửa. Hãy thử lại sau. | StudentHandoverService |
| MSG059 | conflict | CHECKLIST_ARCHIVED | This checklist is archived. | Danh mục kiểm tra này đã lưu trữ. | ChecklistService |
| MSG060 | conflict | CHECKLIST_ARCHIVED | This checklist is already archived. | Danh mục kiểm tra này đã được lưu trữ. | ChecklistService |
| MSG061 | conflict | CHECKLIST_IN_USE | This checklist has already been used in inspection schedules or runs and cannot be deleted. Archive it instead to preserve history. |  | ChecklistService |
| MSG062 | conflict | CHECKLIST_NOT_PUBLISHED | The checklist of this schedule is not published. | Danh mục kiểm tra của lịch này chưa được công bố. | InspectionScheduleService |
| MSG063 | conflict | CLAIM_WAITING | A Manager is checking your transfer. Cancel once it is confirmed or rejected. | Quản lý đang kiểm tra khoản chuyển của bạn. Hãy hủy sau khi khoản chuyển được xác nhận hoặc từ chối. | ApplicationService |
| MSG064 | conflict | CLAIM_WAITING | The student said they paid the next-Term fee. Confirm or |  | OperationalMoveService |
| MSG065 | conflict | CLAIM_WAITING | You already said you transferred this Invoice. A Manager is checking it. | Bạn đã báo chuyển khoản cho hóa đơn này. Quản lý đang kiểm tra. | PaymentClaimService |
| MSG066 | conflict | CONFLICTS_LEFT | Resolve the  |  | AssignmentService |
| MSG067 | forbidden | CROSS_BLOCK | A move to another Block is decided by a Manager. | Việc chuyển sang tòa khác do Quản lý quyết định. | OperationalMoveService |
| MSG068 | forbidden | CROSS_BLOCK | Only a Manager moves furniture to another Block. | Chỉ Quản lý mới được chuyển nội thất sang tòa khác. | FurnitureService |
| MSG069 | conflict | DEADLINE_PASSED | The deadline of this Invoice has passed. | Hóa đơn này đã quá hạn thanh toán. | PaymentClaimService |
| MSG070 | conflict | DEMO_BASE_DATA_MISSING | The demo accounts of the base data are missing. Load the base data (db/seed) first. | Thiếu các tài khoản demo của dữ liệu nền. Hãy nạp dữ liệu nền (db/seed) trước. | DemoResetService |
| MSG071 | conflict | DEMO_STAGE_NEEDED | Load stage A, B or C first: this file lists the people of the next Term. | Hãy nạp giai đoạn A, B hoặc C trước: tệp này liệt kê những người của học kỳ sau. | DemoResetService |
| MSG072 | conflict | DEMO_STAGE_NEEDED | Load stage A, B or C first: Block A has no open meter period. | Hãy nạp giai đoạn A, B hoặc C trước: Tòa A chưa có kỳ ghi chỉ số nào đang mở. | DemoResetService |
| MSG073 | conflict | DEMO_STAGE_NEEDED | Load stage A, B or C first: no door code of Block A must change. | Hãy nạp giai đoạn A, B hoặc C trước: Tòa A không có mã cửa nào cần đổi. | DemoResetService |
| MSG074 | conflict | DEMO_TOOLS_OFF | The demo tools are off on this server. | Công cụ demo đang tắt trên máy chủ này. | DemoResetService |
| MSG075 | conflict | DOOR_CODE_NOT_READY | Your door code is not ready yet. | Mã cửa của bạn chưa sẵn sàng. | DoorCodeService |
| MSG076 | unavailable | DOOR_CODES_DISABLED | Door codes are not set up on this server yet. | Máy chủ này chưa được thiết lập mã cửa. | DoorCodeCipher |
| MSG077 | conflict | DRY_RUN | A dry run is a preview: it cannot be changed or submitted. | Lượt chạy thử chỉ để xem trước: không thể sửa hoặc chốt. | AssignmentService |
| MSG078 | badRequest | EMERGENCY_CONTACTS_FULL | You already have the most emergency contacts allowed. Edit or remove one first. | Bạn đã có số người liên hệ khẩn cấp tối đa. Hãy sửa hoặc xóa bớt một người trước. | StudentContactService |
| MSG079 | conflict | ESCALATION_HANDLED | This escalation was already handled. | Yêu cầu quá hạn này đã được xử lý. | EscalationService |
| MSG080 | conflict | EXTEND_FIRST | This is the last Term of your stay: ask for an extension first. | Đây là học kỳ cuối trong hợp đồng ở của bạn: hãy gửi yêu cầu gia hạn trước. | RoomChangeService |
| MSG081 | conflict | FAMILY_DAY_ALREADY_REGISTERED | You have already registered guests for this Family Day. | Bạn đã đăng ký khách cho Ngày thăm thân này. | StudentFamilyDayService |
| MSG082 | conflict | FAMILY_DAY_CANCELLED_NO_STATS | This Family Day was cancelled, so it has no statistics. | Ngày thăm thân này đã bị hủy nên không có số liệu thống kê. | FamilyDayStatsService |
| MSG083 | conflict | FAMILY_DAY_ENDED | This Family Day is already cancelled or completed. | Ngày thăm thân này đã bị hủy hoặc đã kết thúc. | FamilyDayService |
| MSG084 | conflict | FAMILY_DAY_IN_THE_PAST | Registration must close and the first time slot must start in the future. Edit the dates first. | Thời điểm đóng đăng ký và khung giờ đầu tiên phải ở tương lai. Hãy sửa lại thời gian trước. | FamilyDayService |
| MSG085 | conflict | FAMILY_DAY_NO_OVERDUE_GUESTS | No guest is waiting for a reminder: nobody is inside after their time slot without a confirmation. | Không có khách nào cần nhắc: không ai còn ở lại quá giờ mà chưa được xác nhận. | VisitorDeskService |
| MSG086 | conflict | FAMILY_DAY_NOT_DRAFT | Only a Draft can be edited. Cancel this Family Day and create a new one instead. | Chỉ bản nháp mới sửa được. Hãy hủy Ngày thăm thân này và tạo một sự kiện mới. | FamilyDayService |
| MSG087 | conflict | FAMILY_DAY_NOT_DRAFT | This Family Day is already published. | Ngày thăm thân này đã được công bố. | FamilyDayService |
| MSG088 | conflict | FAMILY_DAY_NOT_OVER | The last time slot ends at  |  | FamilyDayService |
| MSG089 | conflict | FAMILY_DAY_NOT_PUBLISHED | Only a published Family Day can be closed. | Chỉ Ngày thăm thân đã công bố mới kết thúc được. | FamilyDayService |
| MSG090 | conflict | FAMILY_DAY_NOT_PUBLISHED | Only a published Family Day has guests inside. | Chỉ Ngày thăm thân đã công bố mới có khách bên trong. | VisitorDeskService |
| MSG091 | conflict | FAMILY_DAY_NOTHING_TO_CONFIRM | None of your guests is inside after their time slot, so there is nothing to confirm. | Không có người thân nào của bạn còn ở lại quá giờ nên không cần xác nhận. | StudentFamilyDayService |
| MSG092 | conflict | FAMILY_DAY_SLOT_STARTED | This time slot has already started. Choose a later one. | Khung giờ này đã bắt đầu. Hãy chọn khung giờ sau. | StudentFamilyDayService |
| MSG093 | conflict | FAMILY_DAY_SLOT_STARTED | Your time slot has already started, so the registration can no longer be cancelled. | Khung giờ của bạn đã bắt đầu nên không thể hủy đăng ký nữa. | StudentFamilyDayService |
| MSG094 | conflict | FAMILY_DAY_STARTED | Guests have already come in. Close the Family Day instead of cancelling it. | Đã có khách vào. Hãy kết thúc Ngày thăm thân thay vì hủy. | FamilyDayService |
| MSG095 | conflict | FEES_ISSUED | The next-Term fees are issued, so next-Term Beds are fixed. |  | NextTermContext |
| MSG096 | badRequest | FILE_TOO_LARGE | The workbook is too large once unpacked. Keep only the list in it and upload it again. | Tệp quá lớn khi giải nén. Chỉ giữ lại danh sách trong tệp và tải lên lại. | SheetFile |
| MSG097 | forbidden | FORBIDDEN | You do not have permission to do this. | Bạn không có quyền thực hiện thao tác này. | BlockScope |
| MSG098 | conflict | FURNITURE_MISSING | The store of Block  |  | JdbcRoomClassChanges |
| MSG099 | conflict | GENDER_LOCKED | The gender cannot change while the student holds a Bed or a live Application. | Không thể đổi giới tính khi sinh viên đang giữ giường hoặc có đơn đăng ký đang xử lý. | StudentAccountService |
| MSG100 | forbidden | GOOGLE_ACCOUNT_MISMATCH | This account is linked to a different Google account. Contact the dormitory office. | Tài khoản này đã liên kết với một tài khoản Google khác. Hãy liên hệ văn phòng ký túc xá. | SignInService |
| MSG101 | forbidden | GOOGLE_DOMAIN_NOT_ALLOWED | Sign in with your @ |  | GoogleIdTokenVerifier |
| MSG102 | forbidden | GOOGLE_NOT_FOR_DEMO | This demo account signs in with its password, not with Google. | Tài khoản demo này đăng nhập bằng mật khẩu, không dùng Google. | SignInService |
| MSG103 | unavailable | GOOGLE_SIGN_IN_DISABLED | Google sign-in is not available right now. | Hiện chưa thể đăng nhập bằng Google. | GoogleCodeExchanger |
| MSG104 | unauthorized | GOOGLE_TOKEN_INVALID | Google sign-in failed. Try again. | Đăng nhập Google thất bại. Hãy thử lại. | GoogleCodeExchanger |
| MSG105 | unavailable | GOOGLE_UNAVAILABLE | Google sign-in is not working right now. Try again in a few minutes or use your email and password. | Đăng nhập Google đang gặp sự cố. Hãy thử lại sau vài phút hoặc dùng email và mật khẩu. | GoogleCodeExchanger |
| MSG106 | conflict | IMPORT_APPLIED | This file was already imported. | Tệp này đã được nhập. | StudentImportService |
| MSG107 | forbidden | INSPECTION_NOT_ASSIGNED | This inspection run is assigned to another staff member. |  | InspectionRunService |
| MSG108 | conflict | INVENTORY_FINAL | A final inventory cannot be cancelled. | Biên bản đã chốt không hủy được. | HandoverDeskService |
| MSG109 | conflict | INVENTORY_NOT_STARTED | Start the check-in inventory first. | Hãy bắt đầu kiểm kê nhận phòng trước. | StudentHandoverService |
| MSG110 | conflict | INVENTORY_STARTED | Your check-in inventory is already started. | Bạn đã bắt đầu kiểm kê nhận phòng rồi. | StudentHandoverService |
| MSG111 | conflict | INVENTORY_SUBMITTED | Your check-in inventory is already submitted. | Biên bản kiểm kê của bạn đã được nộp. | StudentHandoverService |
| MSG112 | conflict | INVITATION_CLOSED | This invitation is no longer open. | Lời mời này không còn hiệu lực. | ApplicationService |
| MSG113 | conflict | INVITATION_CLOSED | This swap invitation is no longer open. | Lời mời hoán đổi này không còn hiệu lực. | SwapService |
| MSG114 | badRequest | INVITE_PENDING | This user has not accepted the invitation yet. The account becomes Active when they set a password. | Người dùng chưa nhận lời mời. Tài khoản sẽ hoạt động khi họ đặt mật khẩu. | AdminUserService |
| MSG115 | conflict | INVOICE_NOT_PAYABLE | This Invoice cannot be paid: it is  |  | PaymentClaimService |
| MSG116 | conflict | ITEM_CLOSED | Some of this work was closed or moved meanwhile. Reload the list and try again. | Một số công việc vừa được đóng hoặc chuyển đi. Hãy tải lại danh sách rồi thử lại. | BlockStaffService |
| MSG117 | conflict | ITEM_CLOSED | This work is no longer open. | Công việc này không còn mở. | MaintenanceStaffWork |
| MSG118 | conflict | ITEM_DISPOSED | Item  |  | FurnitureService |
| MSG119 | conflict | LAST_ADMIN | At least one active Admin must remain. | Phải còn ít nhất một Quản trị viên đang hoạt động. | AdminUserService |
| MSG120 | conflict | LATE_ALREADY_SENT | You already sent a late report. | Bạn đã gửi báo cáo trễ rồi. | StudentHandoverService |
| MSG121 | conflict | LATE_NOT_ALLOWED | Only an inventory closed by its deadline takes a late report. | Chỉ biên bản đã chốt do quá hạn mới nhận báo cáo trễ. | StudentHandoverService |
| MSG122 | conflict | LATE_REQUEST_CLOSED | The check-in period has ended. Ask the dormitory desk about a late check-in. | Thời gian nhận phòng đã kết thúc. Hãy hỏi quầy ký túc xá về việc nhận phòng muộn. | LateCheckInService |
| MSG123 | conflict | LATE_REQUEST_EXISTS | This student already has a late check-in for this Term: one request per Term. | Sinh viên này đã có yêu cầu nhận phòng muộn trong học kỳ này: mỗi học kỳ chỉ một yêu cầu. | LateCheckInService |
| MSG124 | conflict | LATE_REQUEST_EXISTS | This student already has a late check-in waiting. | Sinh viên này đã có một yêu cầu nhận phòng muộn đang chờ. | LateCheckInService |
| MSG125 | conflict | LATE_REQUEST_EXISTS | You already asked for a late check-in this Term: one request per Term. | Bạn đã gửi yêu cầu nhận phòng muộn trong học kỳ này: mỗi học kỳ chỉ một yêu cầu. | LateCheckInService |
| MSG126 | badRequest | LINK_INVALID | This link is invalid or has expired. Request a new one. | Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới. | PasswordService |
| MSG127 | conflict | MAJOR_NEEDS_VISIT | An inventory with a major difference is checked in the Room with the student: set a visit. | Biên bản lệch lớn phải được kiểm tra tại phòng cùng sinh viên: hãy hẹn giờ xuống phòng. | HandoverDeskService |
| MSG128 | forbidden | MANAGER_DECIDES | The next-Term fees are issued: only a Manager moves a student for the next Term now. | Tiền phòng học kỳ sau đã được phát hành: giờ chỉ Quản lý mới chuyển sinh viên cho học kỳ sau. | OperationalMoveService |
| MSG129 | forbidden | MANAGER_DECIDES | A swap between Blocks is decided by a Manager. | Việc hoán đổi giữa các tòa do Quản lý quyết định. | SwapService |
| MSG130 | conflict | MOVE_CLOSED | This move is already  |  | FurnitureService |
| MSG131 | conflict | MOVE_PLANNED | Item  |  | FurnitureService |
| MSG132 | conflict | NO_BANK_ACCOUNT | No bank account is configured for transfers yet. | Chưa cấu hình tài khoản ngân hàng nhận chuyển khoản. | StudentInvoiceService |
| MSG133 | conflict | NO_BED_LEFT | No free Bed of that kind is left. Choose another option or the waitlist. | Không còn giường trống loại này. Hãy chọn phương án khác hoặc đưa vào danh sách chờ. | AssignmentService |
| MSG134 | forbidden | NO_BLOCK | No Block is assigned to your account. Contact the administrator. | Tài khoản của bạn chưa được gán tòa nào. Hãy liên hệ quản trị viên. | BlockScope |
| MSG135 | conflict | NO_CLAIM_WAITING | No payment claim is waiting for this Invoice. | Hóa đơn này không có báo chuyển khoản nào đang chờ. | PaymentClaimService |
| MSG136 | conflict | NO_INVENTORY_NEEDED | You have no Room to receive with a check-in inventory. | Bạn không có phòng nào cần kiểm kê khi nhận. | StudentHandoverService |
| MSG137 | conflict | NO_LATE_REPORT | The student sent no late report. | Sinh viên chưa gửi báo cáo trễ. | HandoverDeskService |
| MSG138 | conflict | NO_NEXT_TERM_BED | This student has no Bed for the next Term. | Sinh viên này không có giường cho học kỳ sau. | JdbcStays |
| MSG139 | conflict | NO_NEXT_TERM_BED | Next-Term requests open when your Bed is kept for the next Term (the requests window). | Yêu cầu cho học kỳ sau mở khi giường của bạn được giữ cho học kỳ sau (thời gian gửi yêu cầu). | NextTermContext |
| MSG140 | conflict | NO_PRICE | Room  |  | OperationalMoveService |
| MSG141 | conflict | NO_PROFILE | This student has not sent their details yet. | Sinh viên này chưa gửi thông tin. | StudentAccountService |
| MSG142 | conflict | NO_PROPOSED_CODE | Room  |  | DoorCodeService |
| MSG143 | conflict | NO_ROOM_CLASS | Create an active Room Class first. | Hãy tạo một hạng phòng đang dùng trước. | AdminBuildingService |
| MSG144 | conflict | NO_ROOM_TYPE | Create an active Room Type first. | Hãy tạo một loại phòng đang dùng trước. | AdminBuildingService |
| MSG145 | forbidden | NO_STUDENT_RECORD | Your student record was not found. Contact the dormitory office. | Không tìm thấy hồ sơ sinh viên của bạn. Hãy liên hệ văn phòng ký túc xá. | EligibilityService |
| MSG146 | conflict | NO_WINDOW | This request is not part of a requests window. | Yêu cầu này không thuộc thời gian gửi yêu cầu nào. | NextTermContext |
| MSG147 | conflict | NOT_A_MATCH | Your Bed is not what this student is looking for. | Giường của bạn không đúng với điều sinh viên này cần. | SwapService |
| MSG148 | conflict | NOT_ARCHIVED | Only an archived checklist can be restored. |  | ChecklistService |
| MSG149 | badRequest | NOT_CHECKED_IN | This student has not checked in yet and cannot check out. |  | DeskService |
| MSG150 | conflict | NOT_CHECKED_IN | You can report a problem once you have checked in to your Room. | Bạn có thể báo sự cố sau khi đã nhận phòng. | MaintenanceService |
| MSG151 | conflict | NOT_ELIGIBLE | You cannot apply for  |  | ApplicationService |
| MSG152 | conflict | NOT_LOCKED | This account is not locked. | Tài khoản này không bị khóa. | StudentAccountService |
| MSG153 | conflict | NOT_PAID | A receipt is available once the Invoice is paid. | Biên lai có sau khi hóa đơn được thanh toán. | StudentInvoiceService |
| MSG154 | conflict | NOT_PENDING | This account is not waiting for verification. | Tài khoản này không chờ xác minh. | StudentAccountService |
| MSG155 | forbidden | NOT_REFUND_APPROVER | This refund is decided by  |  | FinanceService |
| MSG156 | forbidden | NOT_REQUESTER | Only the Manager who sent this request can change it. | Chỉ Quản lý đã gửi đề nghị này mới sửa được. | TermRequestService |
| MSG157 | conflict | NOT_RESOLVED | Mark the request resolved before you close it. | Hãy đánh dấu yêu cầu đã xử lý xong trước khi đóng. | MaintenanceDeskService |
| MSG158 | conflict | NOT_RESOLVED | You can confirm the fix once the request is resolved. | Bạn có thể xác nhận đã sửa xong khi yêu cầu được xử lý. | MaintenanceService |
| MSG159 | conflict | NOT_STARTED | Assign the request before you mark it resolved. | Hãy giao việc trước khi đánh dấu đã xử lý. | MaintenanceDeskService |
| MSG160 | conflict | NOT_SUBMITTED | Block  |  | AssignmentService |
| MSG161 | conflict | NOT_TO_REVIEW | Only a submitted inventory can be confirmed. | Chỉ biên bản đã nộp mới xác nhận được. | HandoverDeskService |
| MSG162 | conflict | NOT_TO_REVIEW | Only a submitted inventory can be checked in the Room. | Chỉ biên bản đã nộp mới hẹn kiểm tra tại phòng được. | HandoverDeskService |
| MSG163 | conflict | NOT_VERIFYING | Ask for a visit before recording what you find. | Hãy hẹn xuống phòng trước khi ghi nhận thực tế. | HandoverDeskService |
| MSG164 | conflict | NOT_WAITLISTED | Only an Application on the waitlist can be withdrawn. | Chỉ rút được đơn đang trong danh sách chờ. | Round2Service |
| MSG165 | conflict | NOTHING_TO_AGREE | Staff have not recorded your check-out yet. | Nhân viên chưa ghi nhận việc trả phòng của bạn. | CheckOutFurnitureService |
| MSG166 | conflict | NOTHING_TO_AGREE | Staff have not sent you the checked inventory yet. | Nhân viên chưa gửi biên bản đã kiểm cho bạn. | StudentHandoverService |
| MSG167 | conflict | NOTHING_TO_REVIEW | This item is not waiting for a Manager. | Món này không chờ Manager quyết định. | CheckOutFurnitureService |
| MSG168 | badRequest |  | FILE_TYPE_NOT_ALLOWED |  | FileStore |
| MSG169 | notFound |  | This link has expired. Reload the page to get a new one. | Liên kết đã hết hạn. Hãy tải lại trang để lấy liên kết mới. | FileLinkController |
| MSG170 | notFound |  | This file does not exist. | Tệp này không tồn tại. | FileLinkController |
| MSG171 | badRequest |  | VALIDATION_FAILED |  | FieldErrors |
| MSG172 | notFound |  | Block  |  | BlockScope |
| MSG173 | notFound |  | This Application does not exist. | Đơn đăng ký này không tồn tại. | ApplicationReviewService |
| MSG174 | notFound |  | This Term does not exist. | Học kỳ này không tồn tại. | ApplicationReviewService |
| MSG175 | notFound |  | No Term is published yet. | Chưa có học kỳ nào được công bố. | ApplicationReviewService |
| MSG176 | notFound |  | This invitation does not exist or was already answered. | Lời mời này không tồn tại hoặc đã được trả lời. | ApplicationService |
| MSG177 | notFound |  | This offer does not exist. | Đề nghị này không tồn tại. | Round2Service |
| MSG178 | notFound |  | Your student record was not found. | Không tìm thấy hồ sơ sinh viên của bạn. | StudentApplicationQueries |
| MSG179 | notFound |  | This run does not exist. | Lượt xếp phòng này không tồn tại. | AssignmentQueries |
| MSG180 | notFound |  | This Application is not in the run. | Đơn này không có trong lượt xếp phòng. | AssignmentQueries |
| MSG181 | conflict |  | RENEWAL_REQUESTS_OPEN |  | AssignmentService |
| MSG182 | conflict |  | CONFLICTS_LEFT |  | AssignmentService |
| MSG183 | notFound |  | No check-out to review. | Không có lần trả phòng nào cần xem. | CheckOutFurnitureService |
| MSG184 | notFound |  | This damage record does not exist. | Ghi nhận hư hỏng này không tồn tại. | CheckOutFurnitureService |
| MSG185 | notFound |  | This damage record does not exist or can no longer be answered. | Ghi nhận hư hỏng này không tồn tại hoặc đã hết hạn trả lời. | CheckOutFurnitureService |
| MSG186 | notFound |  | This Allocation does not exist. | Chỗ ở này không tồn tại. | CheckOutFurnitureService |
| MSG187 | notFound |  | No Bed is allocated to this student. | Sinh viên này chưa được xếp giường. | DeskService |
| MSG188 | conflict |  | ALREADY_CHECKED_IN |  | DeskService |
| MSG189 | conflict |  | MANY_MATCHES |  | DeskService |
| MSG190 | notFound |  | This student does not live in the Room. | Sinh viên này không ở trong phòng. | DeskService |
| MSG191 | notFound |  | This check-in inventory does not exist. | Biên bản kiểm kê này không tồn tại. | HandoverDeskService |
| MSG192 | notFound |  | This student has no Bed waiting for check-in. | Sinh viên này không có giường nào đang chờ nhận. | LateCheckInService |
| MSG193 | notFound |  | You do not hold a Bed waiting for check-in. | Bạn không có chỗ ở nào đang chờ nhận phòng. | LateCheckInService |
| MSG194 | notFound |  | This late check-in does not exist. | Yêu cầu nhận phòng muộn này không tồn tại. | LateCheckInService |
| MSG195 | conflict |  | FEES_BLOCKED |  | NextTermFeeService |
| MSG196 | notFound |  | This Term has no requests window: it has no renewal milestones. | Học kỳ này không có thời gian gửi yêu cầu: học kỳ không có các mốc gia hạn. | NextTermFeeService |
| MSG197 | notFound |  | No student has this code. | Không có sinh viên nào có mã này. | OperationalMoveService |
| MSG198 | notFound |  | This student holds no Bed. | Sinh viên này không giữ giường nào. | OperationalMoveService |
| MSG199 | notFound |  | No Term has a requests window yet. | Chưa có học kỳ nào có thời gian gửi yêu cầu. | RenewalService |
| MSG200 | notFound |  | This photo does not exist. | Ảnh này không tồn tại. | StudentHandoverService |
| MSG201 | notFound |  | You have no inventory. | Bạn không có biên bản kiểm kê nào. | StudentHandoverService |
| MSG202 | notFound |  | This student does not live in the dormitory. | Sinh viên này không ở ký túc xá. | TerminationService |
| MSG203 | notFound |  | This termination does not exist. | Việc chấm dứt hợp đồng ở này không tồn tại. | TerminationService |
| MSG204 | notFound |  | This user does not exist. | Người dùng này không tồn tại. | AdminUserService |
| MSG205 | badRequest |  | BAD_PARAMETER |  | AdminUserService |
| MSG206 | notFound |  | This staff member does not exist. | Nhân viên này không tồn tại. | BlockStaffService |
| MSG207 | badRequest |  | WEAK_PASSWORD |  | PasswordPolicy |
| MSG208 | notFound |  | This reconciliation does not exist. | Lần đối soát này không tồn tại. | ReconciliationService |
| MSG209 | unauthorized |  | INVALID_CREDENTIALS |  | SignInService |
| MSG210 | conflict |  | NOT_INVITED |  | StaffAccountService |
| MSG211 | notFound |  | This student does not exist. | Sinh viên này không tồn tại. | StudentAccountService |
| MSG212 | notFound |  | This emergency contact does not exist. | Người liên hệ khẩn cấp này không tồn tại. | StudentContactService |
| MSG213 | notFound |  | This import does not exist. | Lần nhập này không tồn tại. | StudentImportService |
| MSG214 | notFound |  | This refund does not exist. | Khoản hoàn tiền này không tồn tại. | FinanceService |
| MSG215 | conflict |  | READINGS_MISSING |  | MeterService |
| MSG216 | notFound |  | Room  |  | MeterService |
| MSG217 | notFound |  | This period does not exist. | Kỳ chỉ số này không tồn tại. | MeterService |
| MSG218 | notFound |  | This Invoice does not exist. | Hóa đơn này không tồn tại. | PaymentClaimService |
| MSG219 | notFound |  | No receipt is attached to this Payment. | Khoản thanh toán này không có biên lai. | PaymentDeskService |
| MSG220 | notFound |  | This Block does not exist. | Tòa này không tồn tại. | AdminBuildingService |
| MSG221 | notFound |  | Floor  |  | AdminBuildingService |
| MSG222 | notFound |  | This furniture type does not exist. | Loại nội thất này không tồn tại. | AdminFurnitureService |
| MSG223 | notFound |  | This Room Class does not exist. | Hạng phòng này không tồn tại. | AdminFurnitureService |
| MSG224 | notFound |  | You do not hold a Bed this Term. | Bạn chưa có giường trong học kỳ này. | DoorCodeService |
| MSG225 | notFound |  | This furniture item does not exist. | Món nội thất này không tồn tại. | FurnitureService |
| MSG226 | notFound |  | This move does not exist. | Lần chuyển này không tồn tại. | FurnitureService |
| MSG227 | notFound |  | This Room does not exist. | Phòng này không tồn tại. | JdbcRoomClassChanges |
| MSG228 | notFound |  | This checklist does not exist. | Danh mục kiểm tra này không tồn tại. | ChecklistService |
| MSG229 | notFound |  | This inspection run does not exist. | Lượt kiểm tra này không tồn tại. | InspectionRunService |
| MSG230 | notFound |  | This inspection schedule does not exist. | Lịch kiểm tra này không tồn tại. | InspectionScheduleService |
| MSG231 | notFound |  | This Maintenance Request does not exist. | Yêu cầu bảo trì này không tồn tại. | JdbcMaintenanceRequests |
| MSG232 | notFound |  | This notification does not exist. | Thông báo này không tồn tại. | AnnouncementService |
| MSG233 | notFound |  | This announcement does not exist. | Thông báo này không tồn tại. | AnnouncementService |
| MSG234 | notFound |  | This notification template does not exist. | Mẫu thông báo này không tồn tại. | NotificationTemplateService |
| MSG235 | notFound |  | There is no export called  |  | ExportService |
| MSG236 | notFound |  | This escalation does not exist. | Yêu cầu quá hạn này không tồn tại. | EscalationService |
| MSG237 | notFound |  | No requests window is open. | Không có thời gian gửi yêu cầu nào đang mở. | NextTermRequestsService |
| MSG238 | notFound |  | This Room-Change Request does not exist. | Yêu cầu đổi phòng này không tồn tại. | RoomChangeService |
| MSG239 | conflict |  | ALLOCATION_ENDED |  | RoomChangeService |
| MSG240 | notFound |  | This routing rule does not exist. | Quy tắc phân công này không tồn tại. | RoutingService |
| MSG241 | notFound |  | This request does not exist. | Yêu cầu này không tồn tại. | StayRequestService |
| MSG242 | notFound |  | This post is no longer on the board. | Bài đăng này không còn trên bảng hoán đổi. | SwapService |
| MSG243 | notFound |  | This swap does not exist. | Yêu cầu hoán đổi này không tồn tại. | SwapService |
| MSG244 | notFound |  | This Room Type does not exist. | Loại phòng này không tồn tại. | AdminCatalogService |
| MSG245 | notFound |  | This settings group does not exist. | Nhóm thiết lập này không tồn tại. | AdminSettingsService |
| MSG246 | notFound |  | This demo file does not exist. | Không có tệp demo này. | DemoResetService |
| MSG247 | conflict |  | REQUEST_LOCKED |  | TermRequestService |
| MSG248 | conflict |  | REQUEST_NOT_BUILDABLE |  | TermRequestService |
| MSG249 | conflict |  | TERM_REQUEST_OPEN |  | TermRequestService |
| MSG250 | notFound |  | This registration-period request does not exist. | Đề nghị mở đợt đăng ký này không tồn tại. | TermRequestService |
| MSG251 | notFound |  | This wizard step does not exist. | Bước này không tồn tại. | TermWizardService |
| MSG252 | notFound |  | This registration does not exist. | Đăng ký này không tồn tại. | FamilyDayService |
| MSG253 | notFound |  | This Family Day does not exist. | Ngày thăm thân này không tồn tại. | FamilyDays |
| MSG254 | notFound |  | This  |  | FamilyDays |
| MSG255 | notFound |  | You have no registration for this Family Day. | Bạn chưa đăng ký khách cho Ngày thăm thân này. | StudentFamilyDayService |
| MSG256 | notFound |  | This guest does not exist. | Khách này không tồn tại. | VisitorDeskService |
| MSG257 | conflict | OFFER_CLOSED | This offer is no longer open. | Đề nghị này không còn hiệu lực. | Round2Service |
| MSG258 | conflict | OPEN_REQUEST | You already have an open Room-Change Request for this Term. | Bạn đã có một yêu cầu đổi phòng đang mở trong học kỳ này. | RoomChangeService |
| MSG259 | conflict | OPEN_REQUEST | You already have an extension waiting for Staff. | Bạn đã có một yêu cầu gia hạn đang chờ Nhân viên. | StayRequestService |
| MSG260 | conflict | OPEN_SWAP | You already have a swap waiting. Wait for it or let it expire. | Bạn đã có một yêu cầu hoán đổi đang chờ. Hãy chờ kết quả hoặc để nó hết hạn. | SwapService |
| MSG261 | conflict | OVERDUE_INVOICE | Pay your overdue Invoice before you ask for a room change. | Hãy thanh toán hóa đơn quá hạn trước khi yêu cầu đổi phòng. | RoomChangeService |
| MSG262 | conflict | OVERDUE_INVOICE | Pay your overdue Invoice before you ask for a swap. | Hãy thanh toán hóa đơn quá hạn trước khi yêu cầu hoán đổi. | SwapService |
| MSG263 | badRequest | OWN_ACCOUNT | You cannot remove your own Admin access or disable your own account. | Bạn không thể tự gỡ quyền Quản trị viên hoặc khóa tài khoản của chính mình. | AdminUserService |
| MSG264 | conflict | PASSWORD_ALREADY_SET | This account already has a password. Use Change password instead. | Tài khoản này đã có mật khẩu. Hãy dùng Đổi mật khẩu. | PasswordService |
| MSG265 | forbidden | PASSWORD_REQUIRED | Set a CampusStay password before you continue. | Hãy đặt mật khẩu CampusStay trước khi tiếp tục. | AccountSetupGate |
| MSG266 | conflict | PERIOD_CLOSED | This period is closed: its Invoices are issued. | Kỳ chỉ số đã đóng: hóa đơn đã được phát hành. | MeterService |
| MSG267 | conflict | PERIOD_NOT_ENDED | This month has not ended yet. Close it from the first day of next month. | Tháng này chưa kết thúc. Hãy đóng kỳ từ ngày đầu tiên của tháng sau. | MeterService |
| MSG268 | conflict | PRICE_DIFFERS | The next-Term fee is paid: move this student only to a |  | OperationalMoveService |
| MSG269 | conflict | PRICES_LOCKED | Invoices of this Term exist, so its prices, Deposit and Utility Deposit can no longer change. | Học kỳ này đã có hóa đơn nên không thể đổi giá, tiền đặt cọc và tiền đặt cọc điện nước nữa. | TermWizardService |
| MSG270 | forbidden | PROFILE_REQUIRED | Send your student details before you continue. | Hãy gửi thông tin sinh viên của bạn trước khi tiếp tục. | AccountSetupGate |
| MSG271 | conflict | READING_MISSING | Enter the reading before you confirm it. | Hãy nhập chỉ số trước khi xác nhận. | MeterService |
| MSG272 | conflict | READINGS_TO_CHECK | Confirm the  |  | MeterService |
| MSG273 | conflict | REFUND_CLOSED | This refund no longer waits for a transfer. | Khoản hoàn tiền này không còn chờ chuyển khoản. | FinanceService |
| MSG274 | conflict | REFUND_NOT_APPROVED | Only an approved refund can be marked paid. | Chỉ khoản hoàn tiền đã được duyệt mới có thể đánh dấu đã chuyển. | FinanceService |
| MSG275 | conflict | REGISTRATION_CANCELLED | This registration is already cancelled. | Đăng ký này đã bị hủy. | Registrations |
| MSG276 | conflict | REGISTRATION_CLOSED | No Term is open for registration now. | Hiện không có học kỳ nào đang mở đăng ký. | ApplicationService |
| MSG277 | conflict | REGISTRATION_CLOSED | Registration for  |  | ApplicationService |
| MSG278 | conflict | REGISTRATION_IN_USE | A guest of this registration has already come in, so it cannot be cancelled. | Đã có khách của đăng ký này vào nên không thể hủy. | Registrations |
| MSG279 | conflict | RENEWAL_FILING | Continuing residents can still file next-Term requests |  | AssignmentService |
| MSG280 | conflict | REQUEST_CLOSED | This request is no longer open. | Yêu cầu này không còn mở. | JdbcMaintenanceRequests |
| MSG281 | conflict | REQUEST_CLOSED | This request is closed and cannot change. | Yêu cầu đã đóng và không thể thay đổi. | MaintenanceDeskService |
| MSG282 | conflict | REQUEST_CLOSED | This request is closed. | Đề nghị này đã đóng. | TermRequestService |
| MSG283 | conflict | REQUEST_NOT_SUBMITTED | Only a submitted request can be taken in progress. | Chỉ đề nghị đã gửi mới có thể chuyển sang đang xử lý. | TermRequestService |
| MSG284 | conflict | REQUESTS_CLOSED | Next-Term requests for  |  | NextTermContext |
| MSG285 | conflict | RESERVED_FOR_NEW_STUDENTS | The free Beds of this kind are kept for new students. | Các giường trống loại này được giữ cho sinh viên mới. | RoomChangeService |
| MSG286 | conflict | ROOM_ALREADY_OUT_OF_SERVICE | Room  |  | InventoryService |
| MSG287 | conflict | ROOM_CLASS_LOCKED | Beds of Room  |  | RoomClassService |
| MSG288 | conflict | ROOM_DONE | This Room is already  |  | InspectionRunService |
| MSG289 | conflict | ROOM_DONE | This Room is already inspected. | Phòng này đã được kiểm tra. | InspectionRunService |
| MSG290 | conflict | ROOM_IN_SERVICE | Room  |  | InventoryService |
| MSG291 | conflict | ROOM_OCCUPIED | Move the  |  | InventoryService |
| MSG292 | conflict | ROOM_PROMISED | Beds of Room  |  | InventoryService |
| MSG293 | conflict | ROOM_TYPE_IN_USE | Rooms of this type have active Allocations, so the number of Beds cannot change. | Phòng loại này đang có người ở nên không thể đổi số giường. | AdminCatalogService |
| MSG294 | tooManyRequests | ROOMMATE_CHECKS_EXHAUSTED | You have used all roommate code checks for this Term. Choose Match me automatically. | Bạn đã dùng hết lượt kiểm tra mã bạn cùng phòng của học kỳ này. Hãy chọn Tự động ghép. | ApplicationService |
| MSG295 | badRequest | RULE_REQUIRED | The refund of a rejected Application cannot be switched off. Change its percent instead. | Không thể tắt quy định hoàn tiền khi đơn đăng ký bị từ chối. Hãy đổi tỷ lệ hoàn tiền thay vì tắt. | AdminPolicyService |
| MSG296 | conflict | RULES_FIXED | A published Term keeps the rules it opened with. | Học kỳ đã công bố giữ nguyên các quy định lúc mở. | TermWizardService |
| MSG297 | conflict | RUN_CLOSED | This run is  |  | AssignmentService |
| MSG298 | conflict | RUN_PARTLY_COMMITTED | Blocks of  |  | AssignmentService |
| MSG299 | conflict | RUN_SUBMITTED | This inspection run is already submitted. | Lượt kiểm tra này đã được nộp. | InspectionRunService |
| MSG300 | conflict | SAME_LOCATION | Item  |  | FurnitureService |
| MSG301 | conflict | STAY_TOO_LONG | A stay can be at most  |  | JdbcStays |
| MSG302 | conflict | STUDENT_NOT_AGREED | The student has not agreed with the furniture charges yet. Ask them to agree on the app. | Sinh viên chưa đồng ý với khoản đền nội thất. Hãy nhờ sinh viên bấm đồng ý trên app. | DeskService |
| MSG303 | conflict | SWAP_CHECKS_FAILED | The swap does not pass the rule check any more. | Yêu cầu hoán đổi không còn đáp ứng điều kiện. | SwapService |
| MSG304 | conflict | TERM_ALREADY_PUBLISHED | This Term is already published. | Học kỳ này đã được công bố. | TermWizardService |
| MSG305 | conflict | TERM_CLOSED | This Term has ended and can no longer be changed. | Học kỳ này đã kết thúc và không thể thay đổi. | TermWizardService |
| MSG306 | conflict | TERM_EXISTS | A Term named  |  | TermRequestService |
| MSG307 | conflict | TERM_OVERLAP | The stay dates overlap  |  | TermWizardService |
| MSG308 | conflict | TERM_STARTED | The stay of  |  | RoomClassService |
| MSG309 | conflict | TERMINATION_CLOSED | This termination is already closed. | Việc chấm dứt hợp đồng ở này đã kết thúc. | TerminationService |
| MSG310 | conflict | TERMINATION_OPEN | This stay is being terminated. Cancel the termination before moving the student. | Chỗ ở này đang bị chấm dứt. Hãy hủy việc chấm dứt trước khi chuyển sinh viên. | JdbcMoves |
| MSG311 | conflict | TERMINATION_OVERDUE | This termination is overdue: the next-Term Bed was  |  | TerminationService |
| MSG312 | tooManyRequests | TOO_MANY_ATTEMPTS | Too many attempts from this device. Wait a few minutes and try again. | Thiết bị này đã thử quá nhiều lần. Hãy đợi vài phút rồi thử lại. | AuthRateLimiter |
| MSG313 | conflict | TYPE_REQUIRED | A Room Class requires  |  | AdminFurnitureService |
| MSG314 | unauthorized | UNAUTHENTICATED | Your session has ended. Sign in again. | Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại. | CurrentUser |
| MSG315 | conflict | UTILITY_OVERDUE | Pay your overdue Utility Invoice first, then the next-Term fee. | Hãy thanh toán hóa đơn điện nước quá hạn trước, sau đó mới đến tiền phòng học kỳ sau. | PaymentClaimService |
| MSG316 | badRequest | VALIDATION_FAILED | Google sign-in could not start. Try again. | Không thể bắt đầu đăng nhập Google. Hãy thử lại. | AuthController |
| MSG317 | badRequest | VALIDATION_FAILED | Some fields are not valid. Check the highlighted fields. | Một số trường chưa hợp lệ. Hãy kiểm tra các trường được đánh dấu. | FieldErrors |
| MSG318 | conflict | VISITOR_ALREADY_IN | This guest is already checked in. | Khách này đã vào rồi. | VisitorDeskService |
| MSG319 | conflict | VISITOR_NOT_INSIDE | This guest is not checked in. | Khách này chưa vào. | VisitorDeskService |
| MSG320 | conflict | VISITOR_SAFETY_NOT_CONFIRMED | The student has not confirmed yet that this guest is safe. Send a reminder and check the guest |  | VisitorDeskService |
| MSG321 | badRequest | WEAK_PASSWORD | The password must not contain your email name. | Mật khẩu không được chứa tên email của bạn. | PasswordPolicy |
| MSG322 | conflict | WINDOW_NOT_OPEN | The requests window of  |  | NextTermFeeService |
| MSG323 | badRequest | WRONG_PASSWORD | The current password is incorrect. | Mật khẩu hiện tại không đúng. | PasswordService |
