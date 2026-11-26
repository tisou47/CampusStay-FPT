// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';

/// The privacy notice in short (Decree 13/2023/NĐ-CP, D3): what CampusStay keeps, why, and the student's rights.
class PrivacyNotice extends StatelessWidget {
  const PrivacyNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Note(
      t(
        'Privacy notice: CampusStay keeps your name, student code, date of birth, phone, emergency contact and refund '
            'account to run your stay (applications, Rooms, payments, refunds). Only the dormitory office sees them. You '
            'can download your data and ask for it to be erased in Account › My data.',
        'Thông báo bảo mật: CampusStay lưu họ tên, mã sinh viên, ngày sinh, số điện thoại, người liên hệ khẩn cấp và tài '
            'khoản hoàn tiền để phục vụ việc lưu trú (đơn, phòng, thanh toán, hoàn tiền). Chỉ văn phòng KTX xem được. Bạn '
            'có thể tải dữ liệu của mình và yêu cầu xoá trong Tài khoản › Dữ liệu của tôi.',
      ),
    );
  }
}

/// My data (D3): the privacy notice and its acceptance, downloading everything CampusStay holds about the student, and
/// a request to erase it (a Manager decides; refused while the student still holds a Bed or owes an Invoice).
/// `GET /students/me/privacy`, `POST …/privacy/consent`, `GET …/privacy/export`, `POST …/privacy/erasure`.
class MyDataScreen extends StatelessWidget {
  const MyDataScreen({super.key});

  Future<void> _erase(BuildContext context, Future<void> Function() reload) async {
    final reason = TextEditingController();
    final ok = await confirm(
      context,
      title: t('Ask to erase my data?', 'Yêu cầu xoá dữ liệu?'),
      body: t(
        'A Manager decides. Once approved your account is anonymised and you can no longer sign in. It is refused while '
            'you hold a Bed or have an open Invoice or refund.',
        'Quản lý sẽ quyết định. Khi được duyệt, tài khoản bị ẩn danh và bạn không đăng nhập được nữa. Yêu cầu bị từ chối '
            'nếu bạn còn giường hoặc còn hoá đơn, khoản hoàn tiền chưa xong.',
      ),
      yes: t('Send request', 'Gửi yêu cầu'),
      danger: true,
      content: Input(
        controller: reason,
        label: t('Reason (optional)', 'Lý do (không bắt buộc)'),
        lines: 2,
        maxLength: 500,
      ),
    );
    final text = reason.text.trim();
    reason.dispose();
    if (!ok) return;
    final done = await attempt(
      () => Api.post('/students/me/privacy/erasure', {if (text.isNotEmpty) 'reason': text}),
      success: t('Request sent. A Manager will decide it.', 'Đã gửi yêu cầu. Quản lý sẽ quyết định.'),
    );
    if (done != null) await reload();
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('My data', 'Dữ liệu của tôi'),
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/privacy'),
        builder: (context, d, reload) {
          final consent = d.obj('consent');
          final erasure = d.obj('erasure');
          final pending = erasure?.str('status') == 'Pending';
          return Cards(
            children: [
              Section(
                title: t('Privacy notice', 'Thông báo bảo mật'),
                trailing: d.str('noticeVersion') == null ? null : Tag(d.text('noticeVersion'), dot: false),
                children: [
                  const PrivacyNotice(),
                  if (d.flag('consentCurrent') && consent != null)
                    Text(
                      t(
                        'Accepted on ${moment(consent.str('acceptedAt'))}.',
                        'Đã đồng ý lúc ${moment(consent.str('acceptedAt'))}.',
                      ),
                      style: const TextStyle(color: Tokens.fgSecondary),
                    )
                  else
                    BusyButton(
                      label: t('I accept the privacy notice', 'Tôi đồng ý với thông báo bảo mật'),
                      onPressed: () async {
                        final done = await attempt(
                          () => Api.post('/students/me/privacy/consent', {'version': d.str('noticeVersion')}),
                        );
                        if (done != null) await reload();
                      },
                    ),
                ],
              ),
              Section(
                title: t('Download my data', 'Tải dữ liệu của tôi'),
                children: [
                  Text(
                    t(
                      'Everything CampusStay holds about you, as a JSON file.',
                      'Toàn bộ dữ liệu CampusStay lưu về bạn, dạng tệp JSON.',
                    ),
                    style: const TextStyle(color: Tokens.fgSecondary),
                  ),
                  BusyButton(
                    label: t('Download', 'Tải xuống'),
                    icon: Icons.download,
                    outlined: true,
                    onPressed: openMyData,
                  ),
                ],
              ),
              Section(
                title: t('Erase my data', 'Xoá dữ liệu của tôi'),
                trailing: erasure == null ? null : StatusChip(erasure.str('status')),
                children: [
                  if (erasure != null) ...[
                    Line(t('Requested', 'Ngày gửi'), moment(erasure.str('requestedAt'))),
                    if (erasure.str('decidedAt') != null)
                      Line(t('Decided', 'Ngày quyết định'), moment(erasure.str('decidedAt'))),
                    if (erasure.str('note') != null) Note(erasure.text('note')),
                  ],
                  if (!pending)
                    BusyButton(
                      label: t('Ask to erase my data', 'Yêu cầu xoá dữ liệu'),
                      outlined: true,
                      danger: true,
                      onPressed: () => _erase(context, reload),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
