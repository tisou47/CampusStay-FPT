import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'refund.dart';

/// Payments (web SCR-BIL-01 `MyInvoices`, phone MOB-BIL-01): the Utility debt warning and the transfers waiting for a
/// Manager, three summary tiles (outstanding, paid this Term, next Invoice), the refund account, then two tabs like the
/// web's: Invoices & fees (each opens its detail, where it is paid) and Refund items (what comes back, by which rule).
/// `GET /students/me/invoices`, `GET /students/me/refunds` (A-39, A-66, R-24).
class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  String _tab = 'invoices';

  static Future<(Json, Json?)> _fetch() async {
    final invoices = await Api.get('/students/me/invoices?pageSize=100');
    Json? refunds;
    try {
      refunds = await Api.get('/students/me/refunds?pageSize=50');
    } on ApiException {
      refunds = null;
    }
    return (invoices, refunds);
  }

  // Approved and Paid both read as good news for the student (money is coming back), so both are green.
  static Tone _refundTone(String? status) => switch (status) {
    'Approved' || 'Paid' => Tone.success,
    'Rejected' => Tone.error,
    _ => Tone.warning,
  };

  @override
  Widget build(BuildContext context) {
    return Loader<(Json, Json?)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (d, refunds) = data;
        final summary = d.obj('summary');
        final warning = summary?.obj('warning');
        final items = d.objects('items');
        final refundItems = refunds?.objects('items') ?? const <Json>[];
        final pending = refunds?.number('pendingAmount') ?? 0;
        final due = (summary?.number('dueCount') ?? 0).toInt();
        final awaiting = (summary?.number('awaitingCount') ?? 0).toInt();

        Future<void> open(Widget page) async {
          await push(context, page);
          await reload();
        }

        return Cards(
          children: [
            _Hero(summary: summary, pending: pending),
            if (warning != null)
              Alert(
                tone: warning.str('level') == 'Final warning' ? Tone.error : Tone.warning,
                title: warning.str('level') == 'Final warning'
                    ? t('Final warning: Utility debt', 'Cảnh báo cuối: nợ tiền điện nước')
                    : t('Utility overdue', 'Tiền điện nước quá hạn'),
                body: warning.str('level') == 'Final warning'
                    ? t(
                        'You owe ${money(warning.number('debt'))} for Utility. Pay everything before ${day(warning.str('terminateOn'))}, or your stay will be terminated.',
                        'Bạn đang nợ ${money(warning.number('debt'))} tiền điện nước. Hãy thanh toán hết trước ${day(warning.str('terminateOn'))}, nếu không hợp đồng ở sẽ bị chấm dứt.',
                      )
                    : t(
                        'You owe ${money(warning.number('debt'))} for Utility. Pay it now: unpaid Utility can end your stay.',
                        'Bạn đang nợ ${money(warning.number('debt'))} tiền điện nước. Hãy thanh toán ngay: nợ tiền điện nước có thể chấm dứt hợp đồng ở.',
                      ),
              ),
            if (awaiting > 0)
              Alert(
                tone: Tone.info,
                title: t('Transfers waiting for a Manager', 'Khoản chuyển đang chờ Quản lý'),
                body: t(
                  '$awaiting of your transfers wait for confirmation. Their deadlines are paused.',
                  '$awaiting khoản chuyển của bạn đang chờ xác nhận. Hạn thanh toán của chúng được tạm dừng.',
                ),
              ),
            RefundAccountCard(pendingAmount: pending),
            TabStrip(
              value: _tab,
              onChanged: (v) => setState(() => _tab = v),
              items: [
                (
                  key: 'invoices',
                  text: t('Invoices & fees', 'Hóa đơn & Tiền phí'),
                  icon: Icons.receipt_long_outlined,
                  count: (d.number('total') ?? items.length).toInt(),
                  dot: due > 0,
                ),
                (
                  key: 'refunds',
                  text: t('Refund items', 'Mục hoàn tiền'),
                  icon: Icons.undo,
                  count: refunds == null ? null : refundItems.length,
                  dot: pending > 0,
                ),
              ],
            ),
            if (pending > 0 && _tab != 'refunds')
              Align(
                alignment: Alignment.centerLeft,
                child: ActionChip(
                  avatar: Icon(Icons.schedule, size: 16, color: Tone.warning.fg),
                  label: Text(
                    t('${money(pending)} on its way to you', '${money(pending)} đang được hoàn cho bạn'),
                    style: TextStyle(color: Tone.warning.fg, fontWeight: FontWeight.w500),
                  ),
                  backgroundColor: Tone.warning.bg,
                  side: BorderSide.none,
                  shape: const StadiumBorder(),
                  onPressed: () => setState(() => _tab = 'refunds'),
                ),
              ),
            if (_tab == 'invoices')
              _Part(
                children: [
                  if (items.isEmpty)
                    EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: t('No invoices', 'Chưa có hóa đơn'),
                      body: t(
                        'The deposit Invoice is issued when you submit an Application.',
                        'Hóa đơn tiền đặt cọc được phát hành khi bạn nộp đơn.',
                      ),
                    )
                  else
                    for (final inv in items)
                      _Row(
                        icon: _typeIcon(inv.str('type') ?? inv.str('typeLabel')),
                        title: label(inv.str('typeLabel') ?? inv.str('title')),
                        amount: money(inv.number('amount')),
                        paid: inv.str('status') == 'Paid',
                        note:
                            '${inv.text('id')} · ${inv.str('status') == 'Paid' ? t('paid ${day(inv.str('paidAt'))}', 'đã thanh toán ${day(inv.str('paidAt'))}') : t('due ${day(inv.str('dueAt'))}', 'hạn ${day(inv.str('dueAt'))}')}',
                        tag: inv.str('status') == 'Upcoming'
                            ? Tag(t('Upcoming', 'Sắp tới'))
                            : StatusChip(inv.str('status')),
                        onTap: () => open(InvoiceDetailScreen(id: inv.text('id'))),
                      ),
                ],
              )
            else
              _Part(
                icon: Icons.undo,
                title: t('Refund items', 'Mục hoàn tiền'),
                text: t(
                  'Money the dormitory returns to you, the rule behind it, and where each refund stands.',
                  'Khoản tiền ký túc xá hoàn lại cho bạn, quy định áp dụng và trạng thái của từng khoản.',
                ),
                aside: pending > 0
                    ? Tag(
                        t('${money(pending)} on its way to you', '${money(pending)} đang được hoàn cho bạn'),
                        tone: Tone.warning,
                      )
                    : null,
                children: [
                  if (refundItems.isEmpty)
                    EmptyState(
                      icon: Icons.undo,
                      title: t('No refunds yet', 'Chưa có khoản hoàn nào'),
                      body: t(
                        'Deposit and Utility settlements appear here when your stay ends or an Application is cancelled.',
                        'Các khoản hoàn cọc và quyết toán điện nước sẽ hiển thị tại đây khi kết thúc lưu trú hoặc hủy đơn.',
                      ),
                    )
                  else
                    for (final r in refundItems)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          spacing: 4,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 8,
                              children: [
                                Expanded(
                                  child: Text(
                                    label(r.str('reason')),
                                    style: const TextStyle(fontWeight: FontWeight.w500),
                                  ),
                                ),
                                StatusChip(r.str('status'), tone: _refundTone(r.str('status'))),
                              ],
                            ),
                            if (r.str('rule') != null)
                              Text(
                                label(r.str('rule')),
                                style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
                              ),
                            if (r.str('note') != null)
                              Text(
                                label(r.str('note')),
                                style: const TextStyle(fontSize: 13.5, color: Tokens.fgTertiary),
                              ),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Expanded(
                                  child: Text(
                                    '${t('Paid', 'Đã thanh toán')} ${money(r.number('paid'))} · '
                                    '${r.number('percent') != null ? '${r.number('percent')}%' : '—'}\n'
                                    '${t('Requested', 'Đã yêu cầu')} ${day(r.str('createdAt'))}',
                                    style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                                  ),
                                ),
                                Text(
                                  money(r.number('amount')),
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                ],
              ),
          ],
        );
      },
    );
  }
}

/// A section of Payments (web `SectionHeader` and its card): a glyph, the title and a line under it, then the rows
/// divided by hairlines.
class _Part extends StatelessWidget {
  const _Part({this.icon, this.title, this.text, required this.children, this.aside});

  final IconData? icon;
  final String? title;
  final String? text;
  final Widget? aside;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Row(
                    spacing: 12,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(10)),
                        child: Icon(icon ?? Icons.receipt_long_outlined, size: 20, color: Tokens.fgBrand),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          spacing: 2,
                          children: [
                            Text(title!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                            Text(text ?? '', style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  ?aside,
                ],
              ),
            ),
          for (final (n, child) in children.indexed) ...[if (title != null || n > 0) const Divider(height: 1), child],
        ],
      ),
    );
  }
}

/// The glyph of an Invoice type.
IconData _typeIcon(String? type) => switch ((type ?? '').toLowerCase()) {
  final x when x.contains('deposit') && x.contains('utility') => Icons.bolt_outlined,
  final x when x.contains('deposit') => Icons.savings_outlined,
  final x when x.contains('utility') => Icons.bolt_outlined,
  final x when x.contains('damage') => Icons.handyman_outlined,
  final x when x.contains('balance') || x.contains('fee') || x.contains('room') => Icons.bed_outlined,
  _ => Icons.receipt_long_outlined,
};

/// One Invoice in [_Part]: its type with a glyph, the amount on the right, the code and date, and its status.
class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    required this.amount,
    required this.paid,
    required this.note,
    required this.tag,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String amount;
  final bool paid;
  final String note;
  final Widget tag;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Row(
          spacing: 12,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: paid ? Tone.success.bg : Tokens.brandSubtle,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: paid ? Tone.success.fg : Tokens.fgBrand),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 3,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(note, style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              spacing: 4,
              children: [
                Text(
                  amount,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: paid ? Tokens.fgSecondary : Tokens.fg,
                  ),
                ),
                tag,
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The top of Payments: what is left to pay, large, on the brand colour (green when everything is paid), with what
/// was paid and the next Invoice under it, and money on its way back.
class _Hero extends StatelessWidget {
  const _Hero({required this.summary, required this.pending});

  final Json? summary;
  final num pending;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    final outstanding = s?.number('outstanding') ?? 0;
    final due = (s?.number('dueCount') ?? 0).toInt();
    final paid = s?.number('paidTotal') ?? 0;
    final payments = (s?.number('paidCount') ?? 0).toInt();
    final upcoming = s?.obj('upcoming');
    final clear = outstanding <= 0;
    final colors = clear ? const [Color(0xFF15803D), Color(0xFF16A34A)] : const [Color(0xFFC2410C), Color(0xFFEA580C)];
    const white70 = Color(0xB3FFFFFF);

    Widget stat(String name, String value, String note) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Text(name, style: const TextStyle(fontSize: 12, color: white70)),
          Text(
            value,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white),
          ),
          Text(
            note,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11.5, color: white70),
          ),
        ],
      ),
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 6,
        children: [
          Row(
            spacing: 8,
            children: [
              Icon(clear ? Icons.verified_outlined : Icons.payments_outlined, size: 18, color: Colors.white),
              Text(
                clear ? t('All paid', 'Đã thanh toán đủ') : t('Left to pay', 'Còn phải trả'),
                style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white),
              ),
            ],
          ),
          Text(
            money(outstanding),
            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Colors.white),
          ),
          Text(
            clear
                ? (pending > 0
                      ? t('${money(pending)} is on its way back to you.', '${money(pending)} đang được hoàn cho bạn.')
                      : t('Nothing to pay right now.', 'Hiện chưa có khoản cần trả.'))
                : t(
                    '$due Invoices to pay · next due ${day(s?.str('nextDueAt'))}. Transfer, then press I have transferred.',
                    '$due hóa đơn cần trả · hạn gần nhất ${day(s?.str('nextDueAt'))}. Chuyển khoản rồi bấm Tôi đã chuyển khoản.',
                  ),
            style: const TextStyle(fontSize: 13, color: white70),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              spacing: 12,
              children: [
                stat(
                  t('Paid', 'Đã trả'),
                  money(paid),
                  payments > 0 ? t('$payments payments', '$payments lần thanh toán') : t('No payments yet', 'Chưa có'),
                ),
                Container(width: 1, height: 36, color: Colors.white24),
                stat(
                  t('Next invoice', 'Hóa đơn tiếp theo'),
                  upcoming == null ? '—' : money(upcoming.number('amount')),
                  upcoming == null
                      ? t('None this Term', 'Kỳ này chưa có')
                      : joinDot([label(upcoming.str('typeLabel')), label(upcoming.str('note'))]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// An Invoice (web SCR-BIL-03, R-26): the amount card, its lines or the Utility breakdown, and once paid the receipt
/// with its PDF; paying starts here. `GET /invoices/{id}`.
class InvoiceDetailScreen extends StatelessWidget {
  const InvoiceDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: id,
      body: Loader<Json>(
        fetch: () => Api.get('/invoices/${Uri.encodeComponent(id)}'),
        builder: (context, inv, reload) {
          final status = inv.str('status');
          final payable = status == 'Unpaid' || status == 'Overdue';
          final breakdown = inv.obj('breakdown');
          return Cards(
            children: [
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 8,
                  children: [
                    Text(label(inv.str('title')), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                    StatusChip(status),
                    Text(
                      money(inv.number('amount')),
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Tokens.fg),
                    ),
                    Line(t('Issued', 'Phát hành'), day(inv.str('issuedAt'))),
                    Line(t('Due', 'Hạn'), moment(inv.str('dueAt'))),
                    if (status == 'Paid')
                      BusyButton(label: t('Paid on ', 'Đã trả ngày ') + day(inv.str('paidAt')), onPressed: null)
                    else if (payable || status == 'Awaiting confirmation')
                      BusyButton(
                        label: payable
                            ? t('Pay with VietQR', 'Thanh toán bằng VietQR')
                            : t('View payment', 'Xem thanh toán'),
                        icon: Icons.qr_code_2,
                        onPressed: () async {
                          await push(context, InvoiceScreen(id: id));
                          await reload();
                        },
                      ),
                    if (inv.str('type') == 'utility' && inv.number('utilityDeposit') != null)
                      Note(
                        t(
                          'Your Utility Deposit (${money(inv.number('utilityDeposit'))}) is not used for monthly bills. It is settled at check-out.',
                          'Tiền cọc điện nước (${money(inv.number('utilityDeposit'))}) không dùng để trả hoá đơn hằng tháng; được quyết toán khi trả phòng.',
                        ),
                      ),
                  ],
                ),
              ),
              if (breakdown != null) _breakdown(inv, breakdown) else _lines(inv),
              if (status == 'Paid' || status == 'Refunded')
                Section(
                  title: t('Receipt', 'Biên lai'),
                  children: [
                    Line(t('Invoice', 'Hoá đơn'), inv.text('id')),
                    Line(t('Term', 'Kỳ'), inv.str('termName') ?? '—'),
                    Line(t('Paid on', 'Ngày trả'), moment(inv.str('paidAt'))),
                    Line(
                      t('Method', 'Hình thức'),
                      label(inv.str('paymentMethod')).isEmpty ? '—' : label(inv.str('paymentMethod')),
                    ),
                    Line(t('Transfer content', 'Nội dung chuyển khoản'), inv.str('transferContent') ?? '—'),
                    Line(t('Amount', 'Số tiền'), money(inv.number('amount')), strong: true),
                    _ReceiptButton(id: id),
                  ],
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _lines(Json inv) {
    return Section(
      title: label(inv.str('typeLabel')).isEmpty ? t('Invoice', 'Hoá đơn') : label(inv.str('typeLabel')),
      children: [
        for (final l in inv.objects('lines')) Line(label(l.str('label')), money(l.number('amount'))),
        Line(t('Total', 'Tổng'), money(inv.number('amount')), strong: true),
      ],
    );
  }

  Widget _breakdown(Json inv, Json b) {
    final period = inv.obj('period');
    return Section(
      title: t('How your share is calculated', 'Cách tính phần của bạn'),
      subtitle: period == null
          ? null
          : period.number('months') != null
          ? t(
              '${label(period.str('label'))} · month ${period.number('month')} of ${period.number('months')} (${range(period.str('from'), period.str('to'))})',
              '${label(period.str('label'))} · tháng ${period.number('month')}/${period.number('months')} (${range(period.str('from'), period.str('to'))})',
            )
          : '${label(period.str('label'))} (${range(period.str('from'), period.str('to'))})',
      children: [
        Text(
          (inv.str('room') != null
                  ? t(
                      '${inv.text('room')} has one shared meter. ',
                      'Phòng ${inv.text('room')} dùng chung một công tơ. ',
                    )
                  : '') +
              t(
                'Each segment is split equally among the residents in it.',
                'Mỗi giai đoạn được chia đều cho số người ở trong giai đoạn đó.',
              ),
          style: const TextStyle(color: Tokens.fgSecondary),
        ),
        for (final s in b.objects('segments'))
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Tokens.line)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Text(
                  joinDot([
                    range(s.str('from'), s.str('to')),
                    t('${s.number('residents')} residents', '${s.number('residents')} người'),
                    label(s.str('note')),
                  ]),
                  style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${s.number('kwh') ?? 0} kWh (${money(s.number('electricityCost'))}) · '
                        '${s.number('m3') ?? 0} m³ (${money(s.number('waterCost'))})',
                      ),
                    ),
                    Text(money(s.number('share')), style: const TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
              ],
            ),
          ),
        const Divider(),
        Line(t('Subtotal', 'Tạm tính'), money(b.number('subtotal'))),
        Line(
          label(b.str('roundingNote')).isEmpty ? t('Total', 'Tổng') : label(b.str('roundingNote')),
          money(inv.number('amount')),
          strong: true,
        ),
        if (b.number('priceKwh') != null || b.number('priceM3') != null)
          Note(
            t(
              'Prices: ${b.number('priceKwh')} VND/kWh and ${b.number('priceM3')} VND/m³. Readings are entered by Staff each month and at every move-in or move-out.',
              'Đơn giá: ${b.number('priceKwh')} đ/kWh và ${b.number('priceM3')} đ/m³. Nhân viên ghi chỉ số mỗi tháng và mỗi lần có người chuyển vào hoặc ra.',
            ),
          ),
      ],
    );
  }
}

class _ReceiptButton extends StatefulWidget {
  const _ReceiptButton({required this.id});

  final String id;

  @override
  State<_ReceiptButton> createState() => _ReceiptButtonState();
}

class _ReceiptButtonState extends State<_ReceiptButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return BusyButton(
      label: t('Download PDF', 'Tải PDF'),
      icon: Icons.download,
      outlined: true,
      busy: _busy,
      onPressed: () async {
        setState(() => _busy = true);
        await openReceipt(widget.id);
        if (mounted) setState(() => _busy = false);
      },
    );
  }
}

/// Paying an Invoice (web SCR-BIL-02, phone MOB-BIL-02, ADR-22): the VietQR image with its expiry and a refresh, the
/// bank details to copy, "I have transferred" with an optional bank reference, and the Invoice. While the claim waits,
/// the page asks again every 15 seconds. `GET /invoices/{id}/payment`, `POST …/payment/refresh`, `POST …/claim`.
class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.id});

  final String id;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  final _reference = TextEditingController();
  Json? _data;
  Object? _error;
  Uint8List? _image;
  String? _imageUrl;
  Timer? _poll;
  Timer? _tick;
  bool _busy = false;
  bool? _wasPaid;

  String get _path => '/invoices/${Uri.encodeComponent(widget.id)}';

  @override
  void initState() {
    super.initState();
    _load();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _data?.obj('qr')?.str('expiresAt') != null) setState(() {});
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    _reference.dispose();
    super.dispose();
  }

  bool get _waiting => _data?.obj('invoice')?.str('status') == 'Awaiting confirmation';

  Future<void> _load() async {
    try {
      final data = await Api.get('$_path/payment');
      if (!mounted) return;
      final paid = data.obj('invoice')?.str('status') == 'Paid';
      if (_wasPaid == false && paid) {
        toast(
          t(
            'Payment received: ${money(data.obj('invoice')?.number('amount'))} was confirmed.',
            'Đã nhận thanh toán: ${money(data.obj('invoice')?.number('amount'))} đã được xác nhận.',
          ),
        );
      }
      _wasPaid = paid;
      setState(() {
        _data = data;
        _error = null;
      });
      _loadImage(data.obj('qr')?.str('image'));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
    _poll?.cancel();
    if (mounted && _waiting) _poll = Timer(const Duration(seconds: 15), _load);
  }

  Future<void> _loadImage(String? url) async {
    if (url == null || url == _imageUrl) return;
    _imageUrl = url;
    try {
      final bytes = await Api.bytes(url);
      if (mounted) setState(() => _image = bytes);
    } catch (_) {
      // the bank details below are enough to pay
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      toast(e.message, error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    toast(t('Copied.', 'Đã sao chép.'));
  }

  /// Opens the QR image in the phone's viewer, where it can be saved to the gallery.
  Future<void> _openQr() async {
    final image = _image;
    if (image == null) return;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/vietqr-${widget.id}.png');
    await file.writeAsBytes(image, flush: true);
    final result = await OpenFilex.open(file.path, type: 'image/png');
    if (result.type != ResultType.done) {
      toast(t('Take a screenshot to keep the QR code.', 'Hãy chụp màn hình để lưu mã QR.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = label(_data?.obj('invoice')?.str('title'));
    return SubPage(title: title.isNotEmpty ? title : t('Pay invoice', 'Thanh toán hóa đơn'), body: _body());
  }

  /// Asks the student to check the amount and the transfer content before reporting the transfer (web modal
  /// "Confirm transfer submission"); then sends the claim.
  Future<void> _claim(Json invoice, String content) async {
    final reference = _reference.text.trim();
    final ok = await confirm(
      context,
      title: t('Confirm transfer submission', 'Xác nhận đã chuyển khoản'),
      yes: t('Yes, I have transferred', 'Đúng, tôi đã chuyển khoản'),
      no: t('Check again', 'Kiểm tra lại'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Text(
            t(
              'Did you transfer exactly this amount and transfer content?',
              'Bạn đã chuyển khoản chính xác số tiền và nội dung chuyển khoản dưới đây chưa?',
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(10)),
            child: Column(
              spacing: 6,
              children: [
                Line(t('Amount', 'Số tiền'), money(invoice.number('amount')), strong: true),
                Line(t('Transfer content', 'Nội dung chuyển khoản'), content, strong: true),
                if (reference.isNotEmpty) Line(t('Bank reference', 'Mã giao dịch ngân hàng'), reference),
              ],
            ),
          ),
          Alert(
            tone: Tone.warning,
            title: t('Important note', 'Lưu ý quan trọng'),
            body: t(
              'Reporting a transfer before paying or with incorrect content may lead to rejection and losing your Bed reservation. A report rejected twice cancels a Deposit or a Balance.',
              'Khai báo đã chuyển khoản khi chưa thực hiện hoặc sai nội dung có thể khiến yêu cầu bị từ chối và mất giữ chỗ phòng. Bị từ chối hai lần sẽ huỷ tiền cọc hoặc tiền phòng.',
            ),
          ),
        ],
      ),
    );
    if (!ok) return;
    await _run(() async {
      await Api.post('$_path/claim', reference.isEmpty ? {} : {'reference': reference});
      toast(
        t(
          'Transfer reported. A Manager will check it; the deadline is paused until then.',
          'Đã báo chuyển khoản. Quản lý sẽ kiểm tra; hạn thanh toán tạm dừng trong lúc chờ.',
        ),
      );
      await _load();
    });
  }

  Widget _body() {
    final d = _data;
    if (d == null) {
      return _error != null
          ? Center(
              child: ErrorBox(message: '$_error', retry: _load),
            )
          : const Center(child: CircularProgressIndicator());
    }
    final invoice = d.obj('invoice') ?? {};
    final qr = d.obj('qr');
    final bank = d.obj('bank');
    final claim = d.obj('claim');
    final content = d.text('transferContent');
    final paid = invoice.str('status') == 'Paid';
    final waiting = _waiting;
    final expiresAt = DateTime.tryParse(qr?.text('expiresAt') ?? '');
    final left = expiresAt?.difference(DateTime.now()).inSeconds;
    final expired = !paid && qr != null && left != null && left <= 0;
    final mmss = left == null || left <= 0
        ? null
        : '${(left ~/ 60).toString().padLeft(2, '0')}:${(left % 60).toString().padLeft(2, '0')}';
    final rejection = !paid && !waiting && claim?.str('status') == 'Rejected' ? claim?.obj('lastRejection') : null;
    final image = _image;
    final open = !paid && !waiting;

    Widget chip(IconData icon, {Color bg = Tokens.brandSubtle, Color fg = Tokens.fgBrand, double size = 32}) =>
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(size / 4)),
          child: Icon(icon, size: size * 0.53, color: fg),
        );

    return RefreshIndicator(
      onRefresh: _load,
      child: Cards(
        children: [
          // The VietQR card: what to scan, the amount, and the bank details to type by hand.
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 14,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 10,
                  children: [
                    Row(
                      spacing: 8,
                      children: [
                        chip(Icons.qr_code_2),
                        Expanded(
                          child: Text(
                            paid
                                ? t('Payment confirmed', 'Đã xác nhận thanh toán')
                                : waiting
                                ? t('Transfer reported', 'Đã báo chuyển khoản')
                                : qr != null
                                ? t('Scan with any banking app', 'Quét bằng ứng dụng ngân hàng bất kỳ')
                                : t('Transfer to the dormitory', 'Chuyển khoản cho ký túc xá'),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                    if (open && expiresAt != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: mmss != null && left! > 60 ? Tokens.brandSubtle : Tone.error.bg,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          spacing: 5,
                          children: [
                            Icon(
                              Icons.schedule,
                              size: 14,
                              color: mmss != null && left! > 60 ? Tokens.fgBrand : Tone.error.fg,
                            ),
                            Text(
                              mmss != null
                                  ? t('QR expires in $mmss', 'Mã QR hết hạn sau $mmss')
                                  : t('QR expired', 'Mã QR đã hết hạn'),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: mmss != null && left! > 60 ? Tokens.fgBrand : Tone.error.fg,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Tokens.subtle.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    spacing: 10,
                    children: [
                      Container(
                        width: 208,
                        height: 208,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Tokens.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Tokens.line),
                        ),
                        alignment: Alignment.center,
                        child: paid || waiting
                            ? Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                spacing: 8,
                                children: [
                                  Icon(
                                    paid ? Icons.check_circle_outline : Icons.hourglass_top,
                                    size: 48,
                                    color: paid ? Tone.success.mark : Tone.info.mark,
                                  ),
                                  Text(
                                    paid
                                        ? t(
                                            'Paid ${day(invoice.str('paidAt'))}',
                                            'Đã thanh toán ${day(invoice.str('paidAt'))}',
                                          )
                                        : t('Waiting for confirmation', 'Chờ xác nhận'),
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: paid ? Tone.success.fg : Tone.info.fg,
                                    ),
                                  ),
                                ],
                              )
                            : image != null && !expired
                            ? Image.memory(image, semanticLabel: 'VietQR')
                            : Text(
                                expired
                                    ? t('QR expired', 'Mã QR đã hết hạn')
                                    : bank != null
                                    ? t('QR code unavailable', 'Không có mã QR')
                                    : t(
                                        'Ask the dormitory office for the bank account to transfer to.',
                                        'Hãy hỏi văn phòng ký túc xá tài khoản ngân hàng để chuyển khoản.',
                                      ),
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                              ),
                      ),
                      InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => _copy('${invoice.number('amount')?.round() ?? 0}'),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          spacing: 6,
                          children: [
                            Flexible(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  money(invoice.number('amount')),
                                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ),
                            const Icon(Icons.copy, size: 16, color: Tokens.fgSecondary),
                          ],
                        ),
                      ),
                      if (qr != null)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          spacing: 8,
                          children: [
                            const Tag('VietQR', tone: Tone.info, dot: false),
                            Text(
                              t('Bank transfer · NAPAS 247', 'Chuyển khoản · NAPAS 247'),
                              style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                            ),
                          ],
                        ),
                      if (open && expired)
                        BusyButton(
                          label: t('Refresh QR', 'Làm mới mã QR'),
                          icon: Icons.refresh,
                          busy: _busy,
                          onPressed: () => _run(() async {
                            await Api.post('$_path/payment/refresh');
                            _imageUrl = null;
                            _image = null;
                            await _load();
                          }),
                        )
                      else if (open && image != null)
                        OutlinedButton.icon(
                          onPressed: _openQr,
                          icon: const Icon(Icons.download, size: 18),
                          label: Text(t('Download QR', 'Tải mã QR')),
                        ),
                    ],
                  ),
                ),
                if (open && bank != null) ...[
                  Row(
                    spacing: 6,
                    children: [
                      const Icon(Icons.apartment_outlined, size: 15, color: Tokens.fgTertiary),
                      Text(
                        t('Or transfer manually', 'Hoặc chuyển khoản thủ công').toUpperCase(),
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                          color: Tokens.fgTertiary,
                        ),
                      ),
                    ],
                  ),
                  Column(
                    children: [
                      _CopyLine(t('Bank', 'Ngân hàng'), bank.text('name'), null),
                      const Divider(height: 1),
                      _CopyLine(t('Account number', 'Số tài khoản'), bank.text('accountNumber'), _copy, mono: true),
                      const Divider(height: 1),
                      _CopyLine(t('Account name', 'Tên tài khoản'), bank.text('accountName'), _copy),
                    ],
                  ),
                  if (content.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                      decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(12)),
                      child: Row(
                        spacing: 8,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 2,
                              children: [
                                Text(
                                  t('Transfer content', 'Nội dung chuyển khoản'),
                                  style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary),
                                ),
                                Text(
                                  content,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    fontFeatures: [FontFeature.tabularFigures()],
                                    letterSpacing: 0.5,
                                    color: Tokens.fgBrand,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _copy(content),
                            style: OutlinedButton.styleFrom(backgroundColor: Tokens.surface),
                            icon: const Icon(Icons.copy, size: 16),
                            label: Text(t('Copy', 'Sao chép')),
                          ),
                        ],
                      ),
                    ),
                  Note(
                    t(
                      'Enter the transfer content exactly. It links your payment to this Invoice.',
                      'Hãy nhập đúng nội dung chuyển khoản. Nội dung này gắn khoản tiền với hóa đơn.',
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (paid)
            Alert(
              tone: Tone.success,
              title: t('Payment received', 'Đã nhận thanh toán'),
              body: t(
                'This payment was confirmed on ${moment(invoice.str('paidAt'))}. A receipt is available under Payments.',
                'Khoản thanh toán đã được xác nhận lúc ${moment(invoice.str('paidAt'))}. Biên lai có trong mục Thanh toán.',
              ),
            )
          else if (waiting)
            Alert(
              tone: Tone.info,
              title: t('Waiting for a Manager', 'Đang chờ Quản lý'),
              body: t(
                'You reported the transfer on ${moment(claim?.str('claimedAt'))}. The deadline is paused until a Manager confirms or rejects it; you will be notified.',
                'Bạn đã báo chuyển khoản lúc ${moment(claim?.str('claimedAt'))}. Hạn thanh toán được tạm dừng cho đến khi Quản lý xác nhận hoặc từ chối; bạn sẽ được thông báo.',
              ),
            )
          else ...[
            if (rejection != null)
              Alert(
                tone: Tone.warning,
                title: t('Transfer not confirmed', 'Chưa xác nhận chuyển khoản'),
                body: t(
                  'A Manager could not confirm your transfer: ${rejection.text('reason')}. Check the transfer content and report it again before the deadline.',
                  'Quản lý chưa xác nhận được khoản chuyển của bạn: ${rejection.text('reason')}. Hãy kiểm tra nội dung chuyển khoản và báo lại trước hạn.',
                ),
              ),
            Panel(
              border: Tokens.primary.withValues(alpha: 0.35),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 12,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 12,
                    children: [
                      chip(Icons.verified_user_outlined, size: 40),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          spacing: 4,
                          children: [
                            Text(
                              t('Paid already? Tell the dormitory', 'Đã chuyển khoản? Hãy báo cho ký túc xá'),
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                            ),
                            Text(
                              t(
                                'Transfer exactly ${money(invoice.number('amount'))} with the transfer content $content, then press I have transferred. A Manager checks the bank account and confirms it.',
                                'Hãy chuyển đúng ${money(invoice.number('amount'))} với nội dung $content, rồi bấm Tôi đã chuyển khoản. Quản lý sẽ kiểm tra tài khoản ngân hàng và xác nhận.',
                              ),
                              style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (d.flag('canClaim'))
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Tokens.subtle.withValues(alpha: 0.6),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 10,
                        children: [
                          Input(
                            controller: _reference,
                            label: t('Bank reference (optional)', 'Mã giao dịch ngân hàng (không bắt buộc)'),
                            hint: 'FT26300012345',
                            maxLength: 60,
                          ),
                          BusyButton(
                            label: t('I have transferred', 'Tôi đã chuyển khoản'),
                            icon: Icons.send,
                            busy: _busy,
                            onPressed: () => _claim(invoice, content),
                          ),
                        ],
                      ),
                    )
                  else
                    Alert(
                      tone: Tone.error,
                      title: t('The deadline has passed', 'Đã quá hạn'),
                      body: t(
                        'This Invoice can no longer be paid by transfer. Contact the dormitory office.',
                        'Hóa đơn này không còn thanh toán bằng chuyển khoản được. Hãy liên hệ văn phòng ký túc xá.',
                      ),
                    ),
                  if ((claim?.number('rejected') ?? 0) > 0)
                    Note(
                      t(
                        'Transfers rejected so far: ${claim!.number('rejected')}. Two rejections cancel a Deposit or a Balance.',
                        'Số lần chuyển khoản bị từ chối: ${claim.number('rejected')}. Hai lần từ chối sẽ hủy tiền đặt cọc hoặc tiền phòng còn lại.',
                      ),
                    ),
                ],
              ),
            ),
          ],
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                Row(
                  spacing: 8,
                  children: [
                    chip(Icons.credit_card, bg: Tokens.subtle, fg: Tokens.fgSecondary),
                    Expanded(
                      child: Text(
                        t('Invoice', 'Hóa đơn'),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                    StatusChip(invoice.str('status')),
                  ],
                ),
                Line(
                  t('Invoice', 'Hóa đơn'),
                  joinDot([invoice.str('id'), label(invoice.str('typeLabel') ?? invoice.str('title'))]),
                ),
                if (invoice.str('reference') != null) Line(t('For', 'Cho'), label(invoice.str('reference'))),
                Line(t('Due', 'Hạn'), '${moment(invoice.str('dueAt'))}${open ? _leftText(invoice.str('dueAt')) : ''}'),
                Line(t('Total', 'Tổng'), money(invoice.number('amount')), strong: true),
                if (claim?.str('reference') != null)
                  Line(t('Bank reference', 'Mã giao dịch ngân hàng'), claim!.text('reference')),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// " · 2 days left" or " · overdue" after a deadline.
  static String _leftText(String? iso) {
    final at = DateTime.tryParse(iso ?? '');
    if (at == null) return '';
    final ms = at.difference(DateTime.now()).inMilliseconds;
    if (ms <= 0) return t(' · overdue', ' · quá hạn');
    final hours = ms ~/ 3600000;
    return hours >= 48
        ? t(' · ${hours ~/ 24} days left', ' · còn ${hours ~/ 24} ngày')
        : t(' · ${hours < 1 ? 1 : hours} h left', ' · còn ${hours < 1 ? 1 : hours} giờ');
  }
}

/// A name and its value in a row of the manual transfer details, with a copy button when [copy] is given.
class _CopyLine extends StatelessWidget {
  const _CopyLine(this.name, this.value, this.copy, {this.mono = false});

  final String name;
  final String value;
  final bool mono;
  final Future<void> Function(String)? copy;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: copy == null ? 12 : 2),
      child: Row(
        children: [
          Expanded(
            child: Text(name, style: const TextStyle(color: Tokens.fgSecondary)),
          ),
          Flexible(
            flex: 2,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight: mono ? FontWeight.w600 : FontWeight.w500,
                fontFeatures: const [FontFeature.tabularFigures()],
                letterSpacing: mono ? 0.5 : null,
              ),
            ),
          ),
          if (copy != null)
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: t('Copy', 'Sao chép'),
              onPressed: () => copy!(value),
              icon: const Icon(Icons.copy, size: 17, color: Tokens.fgSecondary),
            ),
        ],
      ),
    );
  }
}
