import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../common.dart';

/// Payments: what is outstanding, every Invoice (`GET /students/me/invoices`, A-39) and the refunds, which are not
/// Invoices (`GET /students/me/refunds`, A-66).
class PaymentsScreen extends StatelessWidget {
  const PaymentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Loader<Json>(
      fetch: () async {
        final d = await Api.get('/students/me/invoices?pageSize=100');
        d['refunds'] = await Api.get('/students/me/refunds?pageSize=50');
        return d;
      },
      builder: (context, d, reload) {
        final summary = d.obj('summary');
        final warning = summary?.obj('warning');
        return Cards(children: [
          if (summary != null)
            Section(title: t('To pay', 'Cần thanh toán'), children: [
              Text(money(summary.number('outstanding')),
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
              if (summary.str('nextDueAt') != null)
                Line(t('Next deadline', 'Hạn gần nhất'), moment(summary.str('nextDueAt'))),
              if (warning != null)
                Note(
                    t('Utility warning: ', 'Cảnh báo điện nước: ') +
                        money(warning.number('debt')) +
                        (warning.str('terminateOn') != null
                            ? t(' · terminated on ', ' · chấm dứt ngày ') + day(warning.str('terminateOn'))
                            : ''),
                    error: true),
            ]),
          for (final invoice in d.objects('items'))
            Card(
              margin: EdgeInsets.zero,
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () async {
                  await Navigator.push(context,
                      MaterialPageRoute<void>(builder: (_) => InvoiceScreen(id: invoice.text('id'))));
                  await reload();
                },
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(spacing: 6, children: [
                    Row(children: [
                      Expanded(
                          child: Text(invoice.text('title'), style: const TextStyle(fontWeight: FontWeight.w500))),
                      Text(money(invoice.number('amount')), style: const TextStyle(fontWeight: FontWeight.w600)),
                    ]),
                    Row(children: [
                      Expanded(
                        child: Text(t('Due ', 'Hạn ') + moment(invoice.str('dueAt')),
                            style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                      ),
                      StatusChip(invoice.str('status')),
                    ]),
                  ]),
                ),
              ),
            ),
          if (d.obj('refunds')?.objects('items').isNotEmpty ?? false)
            Section(title: t('Refunds', 'Hoàn tiền'), children: [
              for (final refund in d.obj('refunds')!.objects('items'))
                Column(crossAxisAlignment: CrossAxisAlignment.start, spacing: 4, children: [
                  Row(children: [
                    Expanded(child: Text(refund.text('reason'), style: const TextStyle(fontWeight: FontWeight.w500))),
                    Text(money(refund.number('amount')), style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                  if (refund.number('percent') != null)
                    Line(t('Rule', 'Quy định'), '${refund.text('rule')} · ${refund.number('percent')}%'),
                  Row(children: [
                    Expanded(
                      child: Text(t('Requested ', 'Yêu cầu ') + moment(refund.str('createdAt')),
                          style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                    ),
                    StatusChip(refund.str('status')),
                  ]),
                ]),
            ]),
        ]);
      },
    );
  }
}

/// Paying an Invoice (spec §6.7): the VietQR image when the account is configured, the transfer content, and
/// "I have transferred" (`POST /invoices/{id}/claim`); while the claim waits, the page asks again every 15 seconds.
class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.id});

  final String id;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  Json? _data;
  Object? _error;
  String? _message;
  Uint8List? _image;
  String? _imageUrl;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  bool get _waiting =>
      _data?.obj('claim')?.str('status') == 'Claimed' ||
      _data?.obj('invoice')?.str('status') == 'Awaiting confirmation';

  Future<void> _load() async {
    try {
      final data = await Api.get('/invoices/${widget.id}/payment');
      if (!mounted) return;
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

  Future<void> _claim() async {
    String message;
    try {
      await Api.post('/invoices/${widget.id}/claim');
      await _load();
      message = t('Thanks! A Manager confirms your transfer; the deadline stops meanwhile.',
          'Cảm ơn bạn! Quản lý sẽ xác nhận khoản chuyển; hạn thanh toán tạm dừng trong lúc chờ.');
    } on ApiException catch (e) {
      message = e.message;
    }
    if (mounted) setState(() => _message = message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CampusStay')),
      body: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    final d = _data;
    if (d == null) {
      return _error != null
          ? Center(child: ErrorBox(message: '$_error', retry: _load))
          : const Center(child: CircularProgressIndicator());
    }
    final theme = Theme.of(context);
    final invoice = d.obj('invoice') ?? {};
    final bank = d.obj('bank');
    final content = d.text('transferContent');
    final rejection = d.obj('claim')?.obj('lastRejection');
    final image = _image;
    final message = _message;
    return RefreshIndicator(
      onRefresh: _load,
      child: Cards(children: [
        Section(title: invoice.text('title'), children: [
          Text(money(invoice.number('amount')),
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          StatusChip(invoice.str('status')),
          Line(t('Due', 'Hạn'), moment(invoice.str('dueAt'))),
          if (invoice.str('paidAt') != null) Line(t('Paid', 'Đã trả'), moment(invoice.str('paidAt'))),
        ]),
        if (invoice.str('status') != 'Paid')
          Section(title: t('Bank transfer', 'Chuyển khoản'), children: [
            if (image != null) Center(child: Image.memory(image, width: 240, height: 240, semanticLabel: 'VietQR')),
            if (bank != null) ...[
              Line(t('Bank', 'Ngân hàng'), bank.text('name')),
              Line(t('Account', 'Số tài khoản'), bank.text('accountNumber')),
              Line(t('Account name', 'Chủ tài khoản'), bank.text('accountName')),
            ],
            Line(t('Transfer content', 'Nội dung chuyển khoản'), content),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: content));
                  setState(() => _message = t('Transfer content copied.', 'Đã sao chép nội dung chuyển khoản.'));
                },
                child: Text(t('Copy the content', 'Sao chép nội dung')),
              ),
            ),
            if (rejection != null)
              Note(t('Last claim rejected: ', 'Lần báo trước bị từ chối: ') + rejection.text('reason'), error: true),
            if (d.flag('canClaim'))
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: _claim, child: Text(t('I have transferred', 'Tôi đã chuyển khoản'))),
              )
            else if (_waiting)
              Text(t('Waiting for a Manager to confirm your transfer.', 'Đang chờ Quản lý xác nhận khoản chuyển.')),
          ]),
        if (message != null) Note(message),
      ]),
    );
  }
}
