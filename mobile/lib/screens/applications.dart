import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import 'apply.dart';
import 'payments.dart';
import 'refund.dart';
import 'requests.dart';

/// My Applications (web SCR-APP-02, phone Activity › Applications): one row per Application, and a new one when no
/// Application of the Term is active. `GET /students/me/applications`.
class ApplicationsList extends StatelessWidget {
  const ApplicationsList({super.key});

  @override
  Widget build(BuildContext context) {
    return Loader<Json>(
      fetch: () => Api.get('/students/me/applications?pageSize=50'),
      builder: (context, d, reload) {
        final items = d.objects('items');
        final active = d.str('activeTermName');
        Future<void> open(Widget page) async {
          await push(context, page);
          await reload();
        }

        return WithCreate(
          button: active == null
              ? CreateButton(label: t('New application', 'Đơn mới'), onPressed: () => open(const ApplyScreen()))
              : null,
          child: Cards(
            bottom: 96,
            children: [
              if (items.isEmpty)
                EmptyState(
                  icon: Icons.description_outlined,
                  title: t('No applications yet', 'Chưa có đơn nào'),
                  body: t('Start an application when registration is open.', 'Hãy tạo đơn khi đợt đăng ký mở.'),
                )
              else
                StatusList(
                  children: [
                    // The Term reads first (a code like APP-SP27-000123 is hard to scan), the code is the small line.
                    for (final r in items)
                      StatusRow(
                        icon: Icons.description_outlined,
                        title: r.str('termName') ?? r.text('id'),
                        note: joinDot([label(r.str('roomTypeName')), label(r.str('roomClassName')), r.str('id')]),
                        trailing: StatusChip(r.str('status')),
                        onTap: () => open(ApplicationScreen(id: r.text('id'))),
                      ),
                  ],
                ),
              if (active != null)
                Note(
                  t(
                    'One Application per Term: you already have one for $active.',
                    'Mỗi kỳ chỉ một đơn: bạn đã có đơn cho kỳ $active.',
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// An Application (web SCR-APP-03): what to do now, its progress, the Room preference, the Invoices, the waitlist
/// choices (Round 2 or withdraw, A-61) and cancelling. `GET /applications/{id}`, `POST …/cancel`, `POST …/withdraw`.
class ApplicationScreen extends StatelessWidget {
  const ApplicationScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: id,
      body: Loader<Json>(
        fetch: () => Api.get('/applications/${Uri.encodeComponent(id)}'),
        builder: (context, app, reload) => _Detail(app: app, reload: reload),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.app, required this.reload});

  final Json app;
  final Future<void> Function() reload;

  (Tone, String, String?) _alert() {
    final invoices = app.objects('invoices');
    final deposit = invoices.where((i) => i.str('type') == 'deposit').firstOrNull;
    final balance = invoices.where((i) => i.str('type') == 'balance').firstOrNull;
    final allocation = app.obj('allocation');
    switch (app.str('status')) {
      case 'Awaiting Deposit':
        return (
          Tone.warning,
          t('Pay the deposit to send your Application', 'Hãy đặt cọc để gửi đơn'),
          t(
                'Your Application reaches the dormitory office only after the deposit is paid.',
                'Đơn chỉ tới văn phòng KTX sau khi bạn đặt cọc.',
              ) +
              (deposit?.str('dueAt') != null
                  ? t(
                      ' It expires on ${moment(deposit!.str('dueAt'))}.',
                      ' Đơn hết hạn lúc ${moment(deposit.str('dueAt'))}.',
                    )
                  : ''),
        );
      case 'Awaiting Roommate':
        return (
          Tone.warning,
          t('Waiting for your roommate', 'Đang chờ bạn cùng phòng'),
          t(
            'Your roommate has not answered the invitation yet. Both Applications reach the dormitory office together.',
            'Bạn cùng phòng chưa trả lời lời mời. Hai đơn sẽ cùng tới văn phòng KTX.',
          ),
        );
      case 'Submitted':
        return (
          Tone.success,
          t('Deposit received', 'Đã nhận tiền cọc'),
          t(
            'Your Application is now with the dormitory office. We will notify you when it is reviewed.',
            'Đơn đã tới văn phòng KTX. Bạn sẽ được thông báo khi đơn được xét.',
          ),
        );
      case 'Under Review':
        return (
          Tone.info,
          t('Under review', 'Đang xét duyệt'),
          t(
            'The dormitory office is checking your Application. No action is needed from you.',
            'Văn phòng KTX đang xét đơn. Bạn không cần làm gì thêm.',
          ),
        );
      case 'Approved':
        return (
          Tone.info,
          t('Approved', 'Đã duyệt'),
          app.str('resultsPublishedAt') != null
              ? t(
                  'Your Room and Bed are assigned in the assignment run; results are published on ${day(app.str('resultsPublishedAt'))}.',
                  'Phòng và giường được xếp trong đợt xếp phòng; kết quả công bố ngày ${day(app.str('resultsPublishedAt'))}.',
                )
              : t(
                  'Your Room and Bed are assigned in the assignment run.',
                  'Phòng và giường được xếp trong đợt xếp phòng.',
                ),
        );
      case 'Waitlisted':
        final w = app.obj('waitlist');
        final offer = w?.obj('offer');
        if (offer != null) {
          return (
            Tone.warning,
            t('You have Round 2 options', 'Bạn có lựa chọn Vòng 2'),
            t(
              'No Bed of your kind was free in Round 1, so ${offer.number('options')} Beds of other kinds are held for you until ${moment(offer.str('expiresAt'))}. Choose one, or withdraw and get your Deposit back in full.',
              'Vòng 1 không còn giường loại bạn chọn, nên ${offer.number('options')} giường loại khác được giữ cho bạn tới ${moment(offer.str('expiresAt'))}. Hãy chọn một, hoặc rút đơn và nhận lại toàn bộ tiền cọc.',
            ),
          );
        }
        return (
          Tone.warning,
          t('Waitlisted', 'Danh sách chờ'),
          w?.str('until') != null
              ? t(
                  'No Bed of your kind is free yet. You get Round 2 options as soon as one frees up. If none is found by ${day(w!.str('until'))}, the Application is cancelled and your Deposit of ${money(w.number('refund'))} is refunded in full.',
                  'Chưa có giường loại bạn chọn. Bạn sẽ nhận lựa chọn Vòng 2 ngay khi có giường trống. Nếu tới ${day(w.str('until'))} vẫn không có, đơn bị huỷ và tiền cọc ${money(w.number('refund'))} được hoàn đủ.',
                )
              : t(
                  'No Bed of your kind is free yet. You get Round 2 options as soon as one frees up.',
                  'Chưa có giường loại bạn chọn. Bạn sẽ nhận lựa chọn Vòng 2 ngay khi có giường trống.',
                ),
        );
      case 'Allocated':
        final due = balance != null && balance.str('status') != 'Paid' && balance.str('dueAt') != null
            ? t(
                ' Pay the balance by ${moment(balance.str('dueAt'))} to keep it.',
                ' Hãy trả tiền phòng trước ${moment(balance.str('dueAt'))} để giữ giường.',
              )
            : '';
        return (
          Tone.success,
          t('Room and Bed assigned', 'Đã xếp phòng và giường'),
          '${roomBed(allocation?.str('room'), allocation?.str('bed'))}, ${label(allocation?.str('block'))}.$due',
        );
      case 'Rejected':
        return (
          Tone.error,
          t('Not approved', 'Không được duyệt'),
          app.str('decisionNote') ??
              t('The dormitory office did not approve this Application.', 'Văn phòng KTX không duyệt đơn này.'),
        );
      case 'Forfeited':
        return (
          Tone.error,
          t('Bed released', 'Đã mất giường'),
          t(
            'The Balance was not paid in time, so the Bed was released and the Deposit is kept.',
            'Tiền phòng không được trả đúng hạn nên giường bị thu hồi và tiền cọc không được hoàn.',
          ),
        );
      case 'Cancelled' || 'Expired':
        return (
          Tone.info,
          app.str('status') == 'Expired'
              ? t('This Application has expired', 'Đơn đã hết hạn')
              : t('This Application is cancelled', 'Đơn đã bị huỷ'),
          app.str('decisionNote') ?? t('Nothing more is needed from you.', 'Bạn không cần làm gì thêm.'),
        );
      default:
        return (Tone.info, label(app.str('status')), null);
    }
  }

  String _roommate() {
    if (!app.flag('twoBed')) return t('Matched automatically by gender', 'Ghép tự động theo giới tính');
    final r = app.obj('roommate');
    if (r == null || r.str('mode') == 'auto') {
      return r?['preferences'] != null
          ? t('Matched automatically · by preferences', 'Ghép tự động · theo sở thích')
          : t('Matched automatically', 'Ghép tự động');
    }
    return joinDot([r.str('studentCode'), label(r.str('status'))]);
  }

  @override
  Widget build(BuildContext context) {
    final (tone, title, body) = _alert();
    final invoices = app.objects('invoices');
    final unpaid = invoices.where((i) => i.str('status') == 'Unpaid' || i.str('status') == 'Overdue').firstOrNull;
    final waitlist = app.str('status') == 'Waitlisted' ? app.obj('waitlist') : null;
    final offer = waitlist?.obj('offer');
    final allocated = app.str('status') == 'Allocated';
    final refundable = invoices.any((i) => i.str('status') == 'Paid');
    final allocation = app.obj('allocation');
    final events = app.objects('events');
    final description = joinDot([app.str('id'), label(app.str('roomTypeName')), label(app.str('roomClassName'))]);

    Future<void> open(Widget page) async {
      await push(context, page);
      await reload();
    }

    return Cards(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(app.text('termName'), style: const TextStyle(color: Tokens.fgSecondary)),
            ),
            StatusChip(app.str('status')),
          ],
        ),
        Alert(
          tone: tone,
          title: title,
          body: body,
          action: offer != null
              ? FilledButton(
                  onPressed: () => open(const Round2OfferScreen()),
                  child: Text(t('See the options', 'Xem các lựa chọn')),
                )
              : unpaid != null
              ? FilledButton(
                  onPressed: () => open(InvoiceScreen(id: unpaid.text('id'))),
                  child: Text(
                    unpaid.str('type') == 'deposit' ? t('Pay deposit', 'Đặt cọc') : t('Pay now', 'Thanh toán'),
                  ),
                )
              : null,
        ),
        Section(
          title: t('Progress', 'Tiến trình'),
          children: [
            if (events.isEmpty)
              Text(t('No events yet.', 'Chưa có sự kiện.'), style: const TextStyle(color: Tokens.fgSecondary))
            else
              Timeline(
                items: [
                  for (final e in events)
                    (
                      label(e.str('title')),
                      e.str('note') ?? (e.str('at') != null ? moment(e.str('at')) : null),
                      e.text('state'),
                    ),
                ],
              ),
          ],
        ),
        Section(
          title: t('Room preference', 'Nguyện vọng phòng'),
          children: [
            Line(
              t('Room Type', 'Loại phòng'),
              label(app.str('roomTypeName')).isEmpty ? '—' : label(app.str('roomTypeName')),
            ),
            Line(
              t('Room Class', 'Hạng phòng'),
              app.str('roomClassName') == null
                  ? '—'
                  : '${label(app.str('roomClassName'))}${app.number('surchargeRate') != null ? ' (${surcharge(app.number('surchargeRate'))})' : ''}',
            ),
            Line(t('Roommate', 'Bạn cùng phòng'), _roommate()),
            Line(t('Stay length', 'Thời gian ở'), terms(app.number('stayTerms'))),
            Line(
              t('Room and Bed', 'Phòng và giường'),
              allocation != null
                  ? '${roomBed(allocation.str('room'), allocation.str('bed'))} · ${label(allocation.str('block'))}'
                  : t('Assigned after review', 'Xếp sau khi xét duyệt'),
            ),
          ],
        ),
        Section(
          title: t('Payments', 'Thanh toán'),
          children: [
            if (invoices.isEmpty)
              Text(t('No Invoices yet.', 'Chưa có hoá đơn.'), style: const TextStyle(color: Tokens.fgSecondary)),
            for (final inv in invoices)
              InkWell(
                onTap: inv.str('status') == null ? null : () => open(InvoiceDetailScreen(id: inv.text('id'))),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 2,
                        children: [
                          Text(label(inv.str('title')), style: const TextStyle(fontWeight: FontWeight.w500)),
                          Text(
                            joinDot([
                              inv.str('id'),
                              inv.str('paidAt') != null
                                  ? t('paid ', 'đã trả ') + day(inv.str('paidAt'))
                                  : inv.str('dueAt') != null
                                  ? t('due ', 'hạn ') + moment(inv.str('dueAt'))
                                  : null,
                            ]),
                            style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      spacing: 4,
                      children: [
                        Text(money(inv.number('amount')), style: const TextStyle(fontWeight: FontWeight.w500)),
                        inv.str('status') == null
                            ? Tag(t('Not issued', 'Chưa phát hành'))
                            : StatusChip(inv.str('status')),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
        if (waitlist != null)
          Section(
            title: t('What would you like to do?', 'Bạn muốn làm gì?'),
            children: [
              Panel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 6,
                  children: [
                    Text(
                      offer != null ? t('Take a Round 2 Bed', 'Nhận giường Vòng 2') : t('Keep waiting', 'Tiếp tục chờ'),
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    Text(
                      offer != null
                          ? t(
                              'Choose one of the held Beds before ${moment(offer.str('expiresAt'))}. The price difference is added to or taken from your Balance.',
                              'Chọn một giường được giữ trước ${moment(offer.str('expiresAt'))}. Chênh lệch giá được cộng hoặc trừ vào tiền phòng.',
                            )
                          : t(
                              'Nothing to do: we notify you when a Bed is held for you.',
                              'Không cần làm gì: bạn sẽ được báo khi có giường được giữ cho bạn.',
                            ),
                      style: const TextStyle(color: Tokens.fgSecondary, fontSize: 13),
                    ),
                    if (offer != null)
                      FilledButton(
                        onPressed: () => open(const Round2OfferScreen()),
                        child: Text(t('Choose a Room', 'Chọn phòng')),
                      ),
                  ],
                ),
              ),
              Panel(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 6,
                  children: [
                    Text(
                      t('Withdraw and get the Deposit back', 'Rút đơn và nhận lại tiền cọc'),
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    Text(
                      t(
                        '${money(waitlist.number('refund'))} is refunded in full to your bank account after a Manager approves.',
                        '${money(waitlist.number('refund'))} được hoàn đủ vào tài khoản của bạn sau khi Quản lý duyệt.',
                      ),
                      style: const TextStyle(color: Tokens.fgSecondary, fontSize: 13),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(foregroundColor: Tone.error.mark),
                      onPressed: () async {
                        final refund = waitlist.number('refund') ?? 0;
                        final ok = await confirmWithRefundAccount(
                          context,
                          title: t('Withdraw from the waitlist?', 'Rút khỏi danh sách chờ?'),
                          body: t(
                            'The Application is cancelled${offer != null ? ', the held Beds are released' : ''} and your Deposit of ${money(refund)} is refunded in full after a Manager approves. This cannot be undone.',
                            'Đơn bị huỷ${offer != null ? ', các giường đang giữ được trả lại' : ''} và tiền cọc ${money(refund)} được hoàn đủ sau khi Quản lý duyệt. Không thể hoàn tác.',
                          ),
                          yes: t('Withdraw and request the refund', 'Rút đơn và yêu cầu hoàn tiền'),
                          no: t('Keep waiting', 'Tiếp tục chờ'),
                          needsAccount: refund > 0,
                          action: () async {
                            final r = await Api.post('/applications/${Uri.encodeComponent(app.text('id'))}/withdraw');
                            toast(
                              t(
                                'You left the waitlist. ${money(r.number('refund') ?? refund)} is refunded after a Manager approves.',
                                'Bạn đã rời danh sách chờ. ${money(r.number('refund') ?? refund)} được hoàn sau khi Quản lý duyệt.',
                              ),
                            );
                          },
                        );
                        if (ok && context.mounted) Navigator.pop(context);
                      },
                      child: Text(t('Withdraw', 'Rút đơn')),
                    ),
                  ],
                ),
              ),
            ],
          ),
        if (allocated)
          Section(
            title: t('Need a different Room?', 'Cần phòng khác?'),
            children: [
              Text(
                t(
                  'Room Type and Room Class are locked for this Term. After check-in you can ask for a room change or swap with another Student.',
                  'Loại phòng và hạng phòng đã khoá trong kỳ này. Sau khi nhận phòng bạn có thể yêu cầu đổi phòng hoặc đổi chỗ với sinh viên khác.',
                ),
                style: const TextStyle(color: Tokens.fgSecondary),
              ),
              BusyButton(
                label: t('New room-change request', 'Yêu cầu đổi phòng'),
                outlined: true,
                onPressed: () => open(const NewRoomChangeScreen()),
              ),
            ],
          )
        else if (app.flag('canCancel'))
          Column(
            spacing: 6,
            children: [
              Note(
                t(
                  'To change the Room Type or Class, cancel and apply again.',
                  'Muốn đổi loại hoặc hạng phòng, hãy huỷ đơn và đăng ký lại.',
                ),
              ),
              BusyButton(
                label: t('Cancel application', 'Huỷ đơn'),
                outlined: true,
                danger: true,
                onPressed: () async {
                  final reason = TextEditingController();
                  final ok = await confirmWithRefundAccount(
                    context,
                    title: t('Cancel this Application?', 'Huỷ đơn này?'),
                    body: [
                      description,
                      if (app.str('cancelPolicy') != null) label(app.str('cancelPolicy')),
                    ].join('\n\n'),
                    extra: Input(controller: reason, label: t('Reason (optional)', 'Lý do (không bắt buộc)'), lines: 2),
                    yes: t('Cancel application', 'Huỷ đơn'),
                    no: t('Keep application', 'Giữ đơn'),
                    needsAccount: refundable,
                    action: () async {
                      final text = reason.text.trim();
                      await Api.post('/applications/${Uri.encodeComponent(app.text('id'))}/cancel', {
                        if (text.isNotEmpty) 'reason': text,
                      });
                      toast(
                        t(
                          'Application cancelled. Any deposit refund follows the dormitory refund rules.',
                          'Đã huỷ đơn. Việc hoàn cọc (nếu có) theo quy định hoàn tiền của KTX.',
                        ),
                      );
                    },
                  );
                  reason.dispose();
                  if (ok && context.mounted) Navigator.pop(context);
                },
              ),
            ],
          ),
      ],
    );
  }
}

/// A Roommate invitation (web SCR-APP-04): who invites, until when, the Room and its price, and Accept or Decline.
/// `GET /students/me/roommate-invitation`, `POST /roommate-invitations/{id}/respond { accept }`.
class RoommateInvitationScreen extends StatelessWidget {
  const RoommateInvitationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Roommate invitation', 'Lời mời ở cùng phòng'),
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/roommate-invitation'),
        builder: (context, d, reload) {
          final inv = d.obj('invitation');
          if (inv == null) {
            return Cards(
              children: [
                EmptyState(
                  icon: Icons.group_outlined,
                  title: t('No roommate invitation', 'Không có lời mời'),
                  body: t(
                    'When another Student invites you to share a 2-bed Room, the invitation appears here.',
                    'Khi có sinh viên mời bạn ở chung phòng 2 giường, lời mời sẽ hiện ở đây.',
                  ),
                ),
              ],
            );
          }
          return _Invitation(inv: inv);
        },
      ),
    );
  }
}

class _Invitation extends StatefulWidget {
  const _Invitation({required this.inv});

  final Json inv;

  @override
  State<_Invitation> createState() => _InvitationState();
}

class _InvitationState extends State<_Invitation> {
  bool _busy = false;

  Future<void> _respond(bool accept) async {
    setState(() => _busy = true);
    try {
      final r = await Api.post('/roommate-invitations/${Uri.encodeComponent(widget.inv.text('id'))}/respond', {
        'accept': accept,
      });
      if (!mounted) return;
      if (accept) {
        toast(
          t(
            'Invitation accepted. Pay your deposit so both Applications reach the dormitory office.',
            'Đã nhận lời mời. Hãy đặt cọc để hai đơn cùng tới văn phòng KTX.',
          ),
        );
        final invoice = r.str('depositInvoiceId');
        if (invoice != null) {
          await Navigator.pushReplacement(context, MaterialPageRoute<void>(builder: (_) => InvoiceScreen(id: invoice)));
          return;
        }
      } else {
        toast(
          t(
            'Invitation declined. They only see that it was not accepted.',
            'Đã từ chối. Người mời chỉ thấy lời mời không được chấp nhận.',
          ),
        );
      }
      Navigator.pop(context);
    } on ApiException catch (e) {
      toast(e.message, error: true);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inv = widget.inv;
    final left = timeLeft(inv.str('expiresAt'));
    final from = inv.text('fromName');
    final first = from.trim().split(RegExp(r'\s+')).last;
    return Cards(
      children: [
        Panel(
          color: Tokens.brandSubtle,
          border: Tokens.brandLine,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 6,
            children: [
              Text(t('Roommate invitation', 'Lời mời ở cùng phòng'), style: const TextStyle(color: Tokens.fgBrand)),
              Text(
                t(
                  '$from invited you to share a ${label(inv.str('roomTypeName'))} Room',
                  '$from mời bạn ở chung phòng ${label(inv.str('roomTypeName'))}',
                ),
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              Text(
                left == null
                    ? t('This invitation has expired', 'Lời mời đã hết hạn')
                    : t(
                        'Answer within $left · expires ${moment(inv.str('expiresAt'))}',
                        'Trả lời trong $left · hết hạn ${moment(inv.str('expiresAt'))}',
                      ),
                style: TextStyle(color: left == null ? Tone.error.fg : Tone.warning.fg, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
        Section(
          title: t('Details', 'Chi tiết'),
          children: [
            Line(
              t('Term', 'Kỳ'),
              joinDot([
                inv.str('termName'),
                if (inv.str('stayStart') != null) range(inv.str('stayStart'), inv.str('stayEnd')),
              ]),
            ),
            Line(
              t('Room Type', 'Loại phòng'),
              t(
                '${label(inv.str('roomTypeName'))} (shared with $from)',
                '${label(inv.str('roomTypeName'))} (ở cùng $from)',
              ),
            ),
            Line(
              t('Room Class', 'Hạng phòng'),
              '${label(inv.str('roomClassName'))}${inv.number('surchargeRate') != null ? ' (${surcharge(inv.number('surchargeRate'))})' : ''}',
            ),
            Line(t('Your Term price per Bed', 'Giá kỳ mỗi giường của bạn'), money(inv.number('termPrice'))),
            Line(
              t('Your deposit', 'Tiền cọc của bạn'),
              money(inv.number('deposit')) +
                  (inv.number('depositWindowHours') != null
                      ? t(
                          ' · within ${inv.number('depositWindowHours')} hours after you accept',
                          ' · trong ${inv.number('depositWindowHours')} giờ sau khi nhận lời',
                        )
                      : ''),
            ),
          ],
        ),
        Section(
          title: t('If you accept', 'Nếu bạn nhận lời'),
          children: [
            Timeline(
              items: [
                (
                  t(
                    'Confirm your contact details and matching consent',
                    'Xác nhận thông tin liên hệ và đồng ý ghép phòng',
                  ),
                  null,
                  'upcoming',
                ),
                (t('Pay your own deposit with VietQR', 'Tự đặt cọc bằng VietQR'), null, 'upcoming'),
                (
                  t(
                    'When both deposits are paid, both Applications go to the dormitory office together',
                    'Khi cả hai đã đặt cọc, hai đơn cùng tới văn phòng KTX',
                  ),
                  null,
                  'upcoming',
                ),
              ],
            ),
          ],
        ),
        Note(
          inv.str('registrationClosesAt') != null
              ? t(
                  'Declining is private: $first only sees that the invitation was not accepted. You can still apply on your own before ${moment(inv.str('registrationClosesAt'))}.',
                  'Từ chối là riêng tư: $first chỉ thấy lời mời không được chấp nhận. Bạn vẫn có thể tự đăng ký trước ${moment(inv.str('registrationClosesAt'))}.',
                )
              : t(
                  'Declining is private: $first only sees that the invitation was not accepted. You can still apply on your own.',
                  'Từ chối là riêng tư: $first chỉ thấy lời mời không được chấp nhận. Bạn vẫn có thể tự đăng ký.',
                ),
        ),
        BusyButton(
          label: t('Accept invitation', 'Nhận lời mời'),
          icon: Icons.check,
          busy: _busy,
          onPressed: left == null ? null : () => _respond(true),
        ),
        BusyButton(
          label: t('Decline', 'Từ chối'),
          icon: Icons.close,
          outlined: true,
          onPressed: left == null || _busy ? null : () => _respond(false),
        ),
      ],
    );
  }
}

/// A Round 2 offer (web SCR-ASG-02): free Beds of other kinds for a student not placed in Round 1; accept one or
/// decline and ask for the refund. `GET /students/me/round2-offer`, `POST /round2-offers/{id}/respond`.
class Round2OfferScreen extends StatelessWidget {
  const Round2OfferScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Round 2 offer', 'Đề nghị Vòng 2'),
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/round2-offer'),
        builder: (context, d, reload) {
          final offer = d.obj('offer');
          if (offer == null) {
            return Cards(
              children: [
                EmptyState(
                  icon: Icons.bed_outlined,
                  title: t('No Round 2 offer', 'Không có đề nghị Vòng 2'),
                  body: t(
                    'Round 2 offers go to Students who were not placed in Round 1.',
                    'Đề nghị Vòng 2 dành cho sinh viên chưa được xếp ở Vòng 1.',
                  ),
                ),
              ],
            );
          }
          return _Offer(offer: offer);
        },
      ),
    );
  }
}

class _Offer extends StatefulWidget {
  const _Offer({required this.offer});

  final Json offer;

  @override
  State<_Offer> createState() => _OfferState();
}

class _OfferState extends State<_Offer> {
  String? _selected;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _selected = widget.offer.objects('options').firstOrNull?.str('id');
  }

  String get _path => '/round2-offers/${Uri.encodeComponent(widget.offer.text('id'))}/respond';

  static String _signed(num? n) => n == null || n == 0 ? money(0) : '${n > 0 ? '+' : '−'} ${money(n.abs())}';

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    final app = offer.obj('application') ?? {};
    final options = offer.objects('options');
    final deposit = app.number('depositPaid') ?? 0;
    return Cards(
      children: [
        Alert(
          tone: Tone.info,
          title: t('You were not placed in Round 1', 'Bạn chưa được xếp ở Vòng 1'),
          body: t(
            'No ${label(app.str('roomTypeName'))} ${label(app.str('roomClassName'))} Room could be filled with matching roommates. Your deposit stays with this Application.',
            'Không ghép được phòng ${label(app.str('roomTypeName'))} ${label(app.str('roomClassName'))} phù hợp. Tiền cọc vẫn giữ cho đơn này.',
          ),
        ),
        Section(
          title: app.text('id'),
          children: [
            Line(
              t('Applied for', 'Đã đăng ký'),
              '${label(app.str('roomTypeName'))} · ${label(app.str('roomClassName'))}',
            ),
            Line(t('Deposit paid', 'Đã đặt cọc'), money(deposit)),
          ],
        ),
        Section(
          title: t('Pick a free Bed in a partly filled Room', 'Chọn một giường trống trong phòng còn chỗ'),
          subtitle: t(
            'Offers are held until ${moment(offer.str('expiresAt'))}. You choose a Room Type and Class; the system picks the Bed.',
            'Đề nghị được giữ tới ${moment(offer.str('expiresAt'))}. Bạn chọn loại và hạng phòng; hệ thống chọn giường.',
          ),
          children: [
            for (final o in options)
              OptionTile(
                selected: _selected == o.str('id'),
                title: '${label(o.str('roomTypeName'))} · ${label(o.str('roomClassName'))}',
                trailing: money(o.number('termPrice')),
                lines: [
                  joinDot([
                    if (o.str('block') != null) t('Block ${o.text('block')}', 'Block ${o.text('block')}'),
                    label(o.str('note')),
                  ]),
                  joinDot([label(o.str('fill')), t('Difference ', 'Chênh lệch ') + _signed(o.number('difference'))]),
                ].where((l) => l.isNotEmpty).toList(),
                onTap: () => setState(() => _selected = o.str('id')),
              ),
            Note(
              t(
                'The difference is added to or taken from your balance. If you decline or do not reply, the Application is cancelled and your deposit is refunded after Manager approval.',
                'Chênh lệch được cộng hoặc trừ vào tiền phòng. Nếu từ chối hoặc không trả lời, đơn bị huỷ và tiền cọc được hoàn sau khi Quản lý duyệt.',
              ),
            ),
          ],
        ),
        BusyButton(
          label: t('Accept offer', 'Nhận đề nghị'),
          busy: _busy,
          onPressed: _selected == null
              ? null
              : () async {
                  setState(() => _busy = true);
                  try {
                    final r = await Api.post(_path, {'accept': true, 'optionId': _selected});
                    if (!context.mounted) return;
                    toast(
                      t(
                        'Offer accepted. Pay the balance to keep it.',
                        'Đã nhận đề nghị. Hãy trả tiền phòng để giữ giường.',
                      ),
                    );
                    final invoice = r.str('balanceInvoiceId');
                    if (invoice != null) {
                      await Navigator.pushReplacement(
                        context,
                        MaterialPageRoute<void>(builder: (_) => InvoiceScreen(id: invoice)),
                      );
                    } else {
                      Navigator.pop(context);
                    }
                  } on ApiException catch (e) {
                    toast(e.message, error: true);
                    if (mounted) setState(() => _busy = false);
                  }
                },
        ),
        BusyButton(
          label: t('Decline and request refund', 'Từ chối và yêu cầu hoàn tiền'),
          outlined: true,
          danger: true,
          onPressed: _busy
              ? null
              : () async {
                  final ok = await confirmWithRefundAccount(
                    context,
                    title: t('Decline the Round 2 offer?', 'Từ chối đề nghị Vòng 2?'),
                    body: t(
                      '${app.text('id')} will be cancelled. Your deposit of ${money(deposit)} is refunded in full to the account below after a Manager approves. You cannot apply again for ${offer.str('termName') ?? 'this Term'}.',
                      '${app.text('id')} sẽ bị huỷ. Tiền cọc ${money(deposit)} được hoàn đủ vào tài khoản dưới đây sau khi Quản lý duyệt. Bạn không thể đăng ký lại cho ${offer.str('termName') ?? 'kỳ này'}.',
                    ),
                    yes: t('Decline and request refund', 'Từ chối và yêu cầu hoàn tiền'),
                    no: t('Keep offer', 'Giữ đề nghị'),
                    needsAccount: deposit > 0,
                    action: () async {
                      await Api.post(_path, {'accept': false});
                      toast(
                        t(
                          'Refund requested. The deposit is refunded after Manager approval.',
                          'Đã yêu cầu hoàn tiền. Tiền cọc được hoàn sau khi Quản lý duyệt.',
                        ),
                      );
                    },
                  );
                  if (ok && context.mounted) Navigator.pop(context);
                },
        ),
      ],
    );
  }
}
