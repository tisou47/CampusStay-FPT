import 'dart:ui';

import 'package:flutter/material.dart';

// ---------------------------------------------------------------- language (spec §11.6)

/// The app follows the phone's language: Vietnamese, else English.
bool isVietnamese() => PlatformDispatcher.instance.locale.languageCode == 'vi';

/// The text in the phone's language.
String t(String en, String vi) => isVietnamese() ? vi : en;

/// Status and type labels of the API (English, contract "Statuses"), in Vietnamese when the phone is.
String label(String? text) {
  if (text == null || text.isEmpty) return '';
  if (!isVietnamese()) return text;
  return _labels[text] ?? text;
}

const _labels = {
  'Unpaid': 'Chưa thanh toán', 'Paid': 'Đã thanh toán', 'Overdue': 'Quá hạn',
  'Awaiting confirmation': 'Chờ xác nhận', 'Refunded': 'Đã hoàn tiền', 'Void': 'Đã huỷ', 'Upcoming': 'Sắp tới',
  'Assigned – unpaid': 'Đã xếp – chưa thanh toán', 'Paid – waiting for the door code': 'Đã thanh toán – chờ mã cửa',
  'Resident': 'Đang ở', 'Submitted': 'Đã gửi', 'Assigned': 'Đã giao', 'In progress': 'Đang xử lý',
  'Resolved': 'Đã xử lý', 'Closed': 'Đã đóng', 'Pending': 'Đang chờ', 'Approved': 'Đã duyệt',
  'Rejected': 'Bị từ chối', 'Cancelled': 'Đã huỷ', 'Continuing': 'Tiếp tục ở', 'Awaiting extension': 'Chờ gia hạn',
  'Not continuing': 'Không tiếp tục', 'Awaiting consent': 'Chờ đồng ý', 'Waiting for Staff': 'Chờ nhân viên',
  'Ready': 'Sẵn sàng', 'Not ready': 'Chưa sẵn sàng', 'Not set': 'Chưa đặt', 'In use': 'Đang dùng',
  'Broken': 'Hỏng', 'In repair': 'Đang sửa', 'Normal': 'Bình thường', 'Urgent': 'Khẩn cấp',
  'Deposit': 'Tiền cọc', 'Balance': 'Tiền phòng', 'Utility': 'Điện nước', 'Room fee': 'Phí phòng',
  'Damage': 'Bồi thường', 'Notice sent': 'Đã gửi thông báo', 'Checked out': 'Đã trả phòng',
};

// ---------------------------------------------------------------- formats

/// `1.200.000 ₫` (VI) or `1,200,000 VND` (EN).
String money(num? amount) {
  final value = (amount ?? 0).round();
  final digits = value.abs().toString();
  final separator = isVietnamese() ? '.' : ',';
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(separator);
    grouped.write(digits[i]);
  }
  final sign = value < 0 ? '-' : '';
  return isVietnamese() ? '$sign$grouped ₫' : '$sign$grouped VND';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _two(int n) => n.toString().padLeft(2, '0');

String _dayOf(DateTime d) =>
    isVietnamese() ? '${_two(d.day)}/${_two(d.month)}/${d.year}' : '${d.day} ${_months[d.month - 1]} ${d.year}';

/// A calendar day `YYYY-MM-DD` as the user reads it.
String day(String? value) {
  if (value == null || value.isEmpty) return '—';
  final parsed = DateTime.tryParse(value.length >= 10 ? value.substring(0, 10) : value);
  return parsed == null ? value : _dayOf(parsed);
}

/// An instant (fields ending in `At`) in campus time (Asia/Ho_Chi_Minh, UTC+7, no daylight saving) with the hour.
String moment(String? value) {
  if (value == null || value.isEmpty) return '—';
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return value;
  final local = parsed.toUtc().add(const Duration(hours: 7));
  return '${_dayOf(local)} ${_two(local.hour)}:${_two(local.minute)}';
}

typedef Json = Map<String, dynamic>;

/// Reading the API's JSON: blank strings and nulls read as null.
extension JsonRead on Json {
  String? str(String name) {
    final value = this[name];
    if (value == null) return null;
    final text = '$value';
    return text.isEmpty ? null : text;
  }

  String text(String name) => str(name) ?? '';

  Json? obj(String name) {
    final value = this[name];
    return value is Map<String, dynamic> ? value : null;
  }

  List<Json> objects(String name) {
    final value = this[name];
    return value is List ? value.whereType<Map<String, dynamic>>().toList() : const [];
  }

  List<String> strings(String name) {
    final value = this[name];
    return value is List ? value.map((e) => '$e').toList() : const [];
  }

  num? number(String name) {
    final value = this[name];
    return value is num ? value : null;
  }

  bool flag(String name) => this[name] == true;
}

// ---------------------------------------------------------------- loading

/// Loads [fetch] once and shows the loading state, the error with Retry, or [builder] with the data and a reload.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.fetch, required this.builder});

  final Future<T> Function() fetch;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  T? _data;
  Object? _error;
  bool _hasData = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _error = null);
    try {
      final data = await widget.fetch();
      if (mounted) {
        setState(() {
          _data = data;
          _hasData = true;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hasData) {
      return RefreshIndicator(onRefresh: _reload, child: widget.builder(context, _data as T, _reload));
    }
    if (_error != null) return ErrorBox(message: '$_error', retry: _reload);
    return const Center(child: CircularProgressIndicator());
  }
}

class ErrorBox extends StatelessWidget {
  const ErrorBox({super.key, required this.message, this.retry});

  final String message;
  final VoidCallback? retry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(message, style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center),
        if (retry != null) ...[
          const SizedBox(height: 12),
          FilledButton(onPressed: retry, child: Text(t('Retry', 'Thử lại'))),
        ],
      ]),
    );
  }
}

// ---------------------------------------------------------------- pieces

/// A list of cards with the screens' spacing.
class Cards extends StatelessWidget {
  const Cards({super.key, required this.children, this.bottom = 16});

  final List<Widget> children;
  final double bottom;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 16, 16, bottom),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, i) => children[i],
    );
  }
}

class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          for (final child in children) Padding(padding: const EdgeInsets.only(top: 8), child: child),
        ]),
      ),
    );
  }
}

class Line extends StatelessWidget {
  const Line(this.name, this.value, {super.key});

  final String name;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: Text(name, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
      const SizedBox(width: 12),
      Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w500))),
    ]);
  }
}

/// A status as a coloured chip: green when done or paid, amber when waiting, red when late or refused.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String? status;

  @override
  Widget build(BuildContext context) {
    final value = status;
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    final color = switch (value) {
      'Paid' || 'Resident' || 'Resolved' || 'Closed' || 'Approved' || 'Continuing' || 'Ready' || 'Checked out' =>
        const Color(0xFF1E8E3E),
      'Overdue' || 'Rejected' || 'Void' || 'Cancelled' || 'Not continuing' || 'Notice sent' => const Color(0xFFC5221F),
      _ => const Color(0xFFB06000),
    };
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
            border: Border.all(color: color.withValues(alpha: 0.5)), borderRadius: BorderRadius.circular(8)),
        child: Text(label(value), style: TextStyle(color: color, fontWeight: FontWeight.w500, fontSize: 13)),
      ),
    );
  }
}

/// A short message under an action, in the brand colour.
class Note extends StatelessWidget {
  const Note(this.text, {super.key, this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Text(text, style: TextStyle(color: error ? scheme.error : scheme.primary));
  }
}
