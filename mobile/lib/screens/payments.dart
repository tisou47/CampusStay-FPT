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

//// Payments (web SCR-BIL-01 My Invoices, phone MOB-BIL-01), kept short for a phone: what to pay now with one button,
/// the Invoices to pay, then those paid; the refunds and the refund account are one row away.
/// `GET /students/me/invoices`, `GET /students/me/refunds` (A-39, A-66, R-24).
class PaymentsScreen extends StatelessWidget {
  const PaymentsScreen({super.key});

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

  static bool _open(Json inv) => const ['Unpaid', 'Overdue', 'Awaiting confirmation'].contains(inv.str('status'));

  @override
  Widget build(BuildContext context) {
    return Loader<(Json, Json?)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (d, refunds) = data;
        final summary = d.obj('summary');
        final warning = summary?.obj('warning');
        final items = d.objects('items');
        final toPay = items.where(_open).toList();
        final others = items.where((i) => !_open(i)).toList();
        final first = toPay.where((i) => i.str('status') != 'Awaiting confirmation').firstOrNull;
        final upcoming = summary?.obj('upcoming');
        final pending = refunds?.number('pendingAmount') ?? 0;

        Future<void> open(Widget page) async {
          await push(context, page);
          await reload();
        }

        Widget row(Json inv) => StatusRow(
          icon: Icons.receipt_long_outlined,
          title: label(inv.str('title') ?? inv.str('typeLabel')),
          note: inv.str('status') == 'Paid'
              ? t('Paid ', 'Đã trả ') + day(inv.str('paidAt'))
              : t('Due ', 'Hạn ') + day(inv.str('dueAt')),
          trailing: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: 4,
            children: [
              Text(money(inv.number('amount')), style: const TextStyle(fontWeight: FontWeight.w600)),
              StatusChip(inv.str('status')),
            ],
          ),
          onTap: () => open(InvoiceDetailScreen(id: inv.text('id'))),
        );

        return Cards(
          children: [
            if (warning != null)
              Alert(
                tone: warning.str('level') == 'Final warning' ? Tone.error : Tone.warning,
                title: warning.str('level') == 'Final warning'
                    ? t(
                        'Final warning: Utility debt ${money(warning.number('debt'))}',
                        'Cảnh báo cuối: nợ điện nước ${money(warning.number('debt'))}',
                      )
                    : t(
                        'Utility overdue: ${money(warning.number('debt'))}',
                        'Nợ điện nước: ${money(warning.number('debt'))}',
                      ),
                body: warning.str('level') == 'Final warning'
                    ? t(
                        'Pay before ${day(warning.str('terminateOn'))} or your stay ends.',
                        'Trả trước ${day(warning.str('terminateOn'))}, nếu không sẽ phải rời KTX.',
                      )
                    : t('Unpaid Utility can end your stay.', 'Nợ điện nước có thể khiến bạn phải rời KTX.'),
              ),
            if (summary != null)
              HeroCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 4,
                  children: [
                    Text(t('Outstanding', 'Cần thanh toán'), style: HeroCard.soft.copyWith(fontSize: 14)),
                    Text(money(summary.number('outstanding')), style: HeroCard.strong.copyWith(fontSize: 30)),
                    Text(
                      (summary.number('dueCount') ?? 0) > 0
                          ? t(
                              '${summary.number('dueCount')} Invoices · next due ${day(summary.str('nextDueAt'))}',
                              '${summary.number('dueCount')} hoá đơn · hạn gần nhất ${day(summary.str('nextDueAt'))}',
                            )
                          : t('Nothing to pay right now', 'Hiện không có khoản nào cần trả'),
                      style: HeroCard.soft.copyWith(fontSize: 14),
                    ),
                    if ((summary.number('awaitingCount') ?? 0) > 0)
                      Text(
                        t(
                          '${summary.number('awaitingCount')} transfers wait for a Manager; their deadlines are paused.',
                          '${summary.number('awaitingCount')} khoản chuyển đang chờ Quản lý xác nhận; hạn tạm dừng.',
                        ),
                        style: HeroCard.soft,
                      ),
                    if (first != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: FilledButton(
                          style: HeroCard.button,
                          onPressed: () => open(InvoiceScreen(id: first.text('id'))),
                          child: Text(
                            '${t('Pay', 'Thanh toán')} ${label(first.str('title') ?? first.str('typeLabel'))}',
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            if (items.isEmpty)
              EmptyState(
                icon: Icons.receipt_long_outlined,
                title: t('No invoices', 'Chưa có hoá đơn'),
                body: t(
                  'The deposit Invoice is issued when you submit an Application.',
                  'Hoá đơn tiền cọc được phát hành khi bạn gửi đơn.',
                ),
              ),
            if (toPay.isNotEmpty) ...[
              Heading(t('To pay', 'Cần trả')),
              StatusList(children: [for (final inv in toPay) row(inv)]),
            ],
            if (others.isNotEmpty) ...[
              Heading(
                t('History', 'Lịch sử'),
                trailing: Text(
                  '${t('Paid', 'Đã trả')} ${money(summary?.number('paidTotal'))}',
                  style: const TextStyle(color: Tokens.fgSecondary, fontSize: 13),
                ),
              ),
              StatusList(children: [for (final inv in others) row(inv)]),
            ],
            if (upcoming != null)
              Note(
                t(
                  'Next: ${label(upcoming.str('typeLabel'))} ${money(upcoming.number('amount'))} · ${label(upcoming.str('note'))}',
                  'Sắp tới: ${label(upcoming.str('typeLabel'))} ${money(upcoming.number('amount'))} · ${label(upcoming.str('note'))}',
                ),
              ),
            LinkBar(
              icon: Icons.undo,
              text: t('Refunds and refund account', 'Hoàn tiền và tài khoản nhận'),
              note: pending > 0 ? money(pending) : null,
              onTap: () => open(RefundsScreen(refunds: refunds)),
            ),
          ],
        );
      },
    );
  }
}

/// The refunds (not Invoices, R-24) and the bank account they are paid to (A-62).
class RefundsScreen extends StatelessWidget {
  const RefundsScreen({super.key, this.refunds});

  final Json? refunds;

  @override
  Widget build(BuildContext context) {
    final items = refunds?.objects('items') ?? const <Json>[];
    return SubPage(
      title: t('Refunds', 'Hoàn tiền'),
      body: Cards(
        children: [
          const RefundAccountCard(),
          if (items.isEmpty)
            EmptyState(icon: Icons.undo, title: t('No refunds', 'Chưa có khoản hoàn tiền'))
          else ...[
            if ((refunds?.number('pendingAmount') ?? 0) > 0)
              Text(
                t(
                  '${money(refunds!.number('pendingAmount'))} on its way to you',
                  '${money(refunds!.number('pendingAmount'))} đang được chuyển cho bạn',
                ),
                style: const TextStyle(color: Tokens.fgSecondary),
              ),
            StatusList(
              children: [
                for (final r in items)
                  StatusRow(
                    icon: Icons.undo,
                    title:
                        '${money(r.number('amount'))}${r.number('percent') != null ? ' · ${r.number('percent')}%' : ''}',
                    note: joinDot([label(r.str('reason')), day(r.str('createdAt')), r.str('note')]),
                    trailing: StatusChip(
                      r.str('status'),
                      tone: switch (r.str('status')) {
                        'Approved' => Tone.info,
                        'Paid' => Tone.success,
                        'Rejected' => Tone.error,
                        _ => Tone.warning,
                      },
                    ),
                  ),
              ],
            ),
          ],
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
    return SubPage(title: t('Pay Invoice', 'Thanh toán hoá đơn'), body: _body());
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
    return RefreshIndicator(
      onRefresh: _load,
      child: Cards(
        children: [
          Panel(
            child: Column(
              spacing: 10,
              children: [
                Text(
                  paid
                      ? t('Payment confirmed', 'Đã xác nhận thanh toán')
                      : waiting
                      ? t('Transfer reported', 'Đã báo chuyển khoản')
                      : qr != null
                      ? t('Scan with any banking app', 'Quét bằng ứng dụng ngân hàng bất kỳ')
                      : t('Transfer to the dormitory', 'Chuyển khoản cho KTX'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
                if (paid || waiting)
                  Column(
                    spacing: 6,
                    children: [
                      Icon(
                        paid ? Icons.check_circle : Icons.hourglass_top,
                        size: 48,
                        color: paid ? Tone.success.mark : Tone.info.mark,
                      ),
                      Text(
                        paid
                            ? t('Paid ', 'Đã trả ') + day(invoice.str('paidAt'))
                            : t('Waiting for confirmation', 'Đang chờ xác nhận'),
                        style: TextStyle(color: paid ? Tone.success.fg : Tone.info.fg, fontWeight: FontWeight.w500),
                      ),
                    ],
                  )
                else if (image != null && !expired)
                  Image.memory(image, width: 240, height: 240, semanticLabel: 'VietQR')
                else if (qr == null)
                  Text(
                    bank != null
                        ? t('QR code unavailable', 'Không có mã QR')
                        : t(
                            'Ask the dormitory office for the bank account to transfer to.',
                            'Hãy hỏi văn phòng KTX số tài khoản để chuyển khoản.',
                          ),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Tokens.fgSecondary),
                  ),
                Text(
                  money(invoice.number('amount')),
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
                ),
                if (qr != null && !paid && !waiting)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    spacing: 8,
                    children: [
                      const Tag('VietQR', tone: Tone.info, dot: false),
                      Text(
                        t('Bank transfer · NAPAS 247', 'Chuyển khoản · NAPAS 247'),
                        style: const TextStyle(color: Tokens.fgSecondary),
                      ),
                    ],
                  ),
                if (!paid && !waiting && expiresAt != null)
                  Text(
                    mmss != null
                        ? t('QR expires in $mmss', 'Mã QR hết hạn sau $mmss')
                        : t('QR expired', 'Mã QR đã hết hạn'),
                    style: TextStyle(color: mmss != null ? Tokens.fgSecondary : Tone.error.fg),
                  ),
              ],
            ),
          ),
          if (!paid && !waiting) ...[
            if (expired)
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
            else if (image != null)
              BusyButton(
                label: t('Open the QR image', 'Mở ảnh mã QR'),
                icon: Icons.download,
                outlined: true,
                onPressed: _openQr,
              ),
            if (content.isNotEmpty)
              BusyButton(
                label: t('Copy transfer content', 'Sao chép nội dung chuyển khoản'),
                icon: Icons.copy,
                outlined: true,
                onPressed: () => _copy(content),
              ),
          ],
          if (paid)
            Alert(
              tone: Tone.success,
              title: t('Payment received', 'Đã nhận thanh toán'),
              body: t(
                'This payment was confirmed on ${moment(invoice.str('paidAt'))}. The receipt is on the Invoice.',
                'Khoản thanh toán được xác nhận lúc ${moment(invoice.str('paidAt'))}. Biên lai có trong hoá đơn.',
              ),
            )
          else if (waiting)
            Alert(
              tone: Tone.info,
              title: t('Waiting for a Manager', 'Đang chờ Quản lý'),
              body: t(
                'You reported the transfer on ${moment(claim?.str('claimedAt'))}. The deadline is paused until a Manager confirms or rejects it; you will be notified.',
                'Bạn đã báo chuyển khoản lúc ${moment(claim?.str('claimedAt'))}. Hạn thanh toán tạm dừng cho tới khi Quản lý xác nhận hoặc từ chối; bạn sẽ được thông báo.',
              ),
            )
          else ...[
            if (rejection != null)
              Alert(
                tone: Tone.warning,
                title: t('Transfer not confirmed', 'Khoản chuyển chưa được xác nhận'),
                body: t(
                  'A Manager could not confirm your transfer: ${rejection.text('reason')}. Check the transfer content and report it again before the deadline.',
                  'Quản lý chưa xác nhận được khoản chuyển: ${rejection.text('reason')}. Hãy kiểm tra nội dung chuyển khoản và báo lại trước hạn.',
                ),
              ),
            Section(
              title: t('Paid already? Tell the dormitory', 'Đã chuyển khoản? Báo cho KTX'),
              children: [
                Text(
                  t(
                    'After the transfer, press the button; a Manager confirms it.',
                    'Chuyển khoản xong, bấm nút dưới đây; Quản lý sẽ xác nhận.',
                  ),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
                if (d.flag('canClaim')) ...[
                  Input(
                    controller: _reference,
                    label: t('Bank reference (optional)', 'Mã giao dịch (không bắt buộc)'),
                    hint: 'FT26300012345',
                    maxLength: 60,
                  ),
                  BusyButton(
                    label: t('I have transferred', 'Tôi đã chuyển khoản'),
                    icon: Icons.send,
                    busy: _busy,
                    onPressed: () => _run(() async {
                      final reference = _reference.text.trim();
                      await Api.post('$_path/claim', reference.isEmpty ? {} : {'reference': reference});
                      toast(
                        t(
                          'Transfer reported. A Manager will check it; the deadline is paused until then.',
                          'Đã báo chuyển khoản. Quản lý sẽ kiểm tra; hạn thanh toán tạm dừng trong lúc chờ.',
                        ),
                      );
                      await _load();
                    }),
                  ),
                ] else
                  Alert(
                    tone: Tone.error,
                    title: t('The deadline has passed', 'Đã quá hạn'),
                    body: t(
                      'This Invoice can no longer be paid by transfer. Contact the dormitory office.',
                      'Hoá đơn này không còn trả bằng chuyển khoản được. Hãy liên hệ văn phòng KTX.',
                    ),
                  ),
                if ((claim?.number('rejected') ?? 0) > 0)
                  Note(
                    t(
                      'Transfers rejected so far: ${claim!.number('rejected')}. Two rejections cancel a Deposit or a Balance.',
                      'Số lần bị từ chối: ${claim.number('rejected')}. Hai lần bị từ chối sẽ huỷ khoản cọc hoặc tiền phòng.',
                    ),
                  ),
              ],
            ),
          ],
          if (!paid && !waiting && bank != null)
            Section(
              title: t('Or transfer manually', 'Hoặc chuyển khoản thủ công'),
              children: [
                Line(t('Bank', 'Ngân hàng'), bank.text('name')),
                _CopyLine(t('Account name', 'Chủ tài khoản'), bank.text('accountName'), _copy),
                _CopyLine(t('Account number', 'Số tài khoản'), bank.text('accountNumber'), _copy),
                _CopyLine(
                  t('Amount', 'Số tiền'),
                  '${invoice.number('amount')?.round() ?? 0}',
                  _copy,
                  display: money(invoice.number('amount')),
                ),
                _CopyLine(t('Transfer content', 'Nội dung chuyển khoản'), content, _copy),
                Note(
                  t(
                    'Enter the transfer content exactly. It links your payment to this Invoice.',
                    'Hãy nhập đúng nội dung chuyển khoản: nó gắn khoản chuyển với hoá đơn này.',
                  ),
                ),
              ],
            ),
          Section(
            title: t('Invoice', 'Hoá đơn'),
            children: [
              Line(
                t('Invoice', 'Hoá đơn'),
                joinDot([invoice.str('id'), label(invoice.str('typeLabel') ?? invoice.str('title'))]),
              ),
              if (invoice.str('reference') != null) Line(t('For', 'Cho'), label(invoice.str('reference'))),
              Line(
                t('Due', 'Hạn'),
                '${moment(invoice.str('dueAt'))}${!paid && !waiting ? _leftText(invoice.str('dueAt')) : ''}',
              ),
              Line(t('Total', 'Tổng'), money(invoice.number('amount')), strong: true),
              if (claim?.str('reference') != null) Line(t('Bank reference', 'Mã giao dịch'), claim!.text('reference')),
            ],
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

class _CopyLine extends StatelessWidget {
  const _CopyLine(this.name, this.value, this.copy, {this.display});

  final String name;
  final String value;
  final String? display;
  final Future<void> Function(String) copy;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(name, style: const TextStyle(color: Tokens.fgTertiary)),
        ),
        Flexible(
          flex: 2,
          child: Text(
            display ?? value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          tooltip: t('Copy', 'Sao chép'),
          onPressed: () => copy(value),
          icon: const Icon(Icons.copy, size: 18, color: Tokens.link),
        ),
      ],
    );
  }
}
