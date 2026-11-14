import 'package:flutter/material.dart';

export 'ui.dart';

// ---------------------------------------------------------------- language (spec §11.6)

/// The app follows the phone's language: Vietnamese, else English.
bool isVietnamese() => WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'vi';

/// The text in the phone's language.
String t(String en, String vi) => isVietnamese() ? vi : en;

/// Status and type labels of the API (English, contract "Statuses"), in Vietnamese when the phone is.
String label(String? text) {
  if (text == null || text.isEmpty) return '';
  if (!isVietnamese()) return text;
  return _labels[text] ?? text;
}

const _labels = {
  'Unpaid': 'Chưa thanh toán',
  'Paid': 'Đã thanh toán',
  'Overdue': 'Quá hạn',
  'Awaiting confirmation': 'Chờ xác nhận',
  'Refunded': 'Đã hoàn tiền',
  'Void': 'Đã huỷ',
  'Upcoming': 'Sắp tới',
  'Assigned – unpaid': 'Đã xếp – chưa thanh toán',
  'Paid – waiting for the door code': 'Đã thanh toán – chờ mã cửa',
  'Resident': 'Đang ở',
  'Submitted': 'Đã gửi',
  'Assigned': 'Đã giao',
  'In progress': 'Đang xử lý',
  'Resolved': 'Đã xử lý',
  'Closed': 'Đã đóng',
  'Pending': 'Đang chờ',
  'Approved': 'Đã duyệt',
  'Rejected': 'Bị từ chối',
  'Cancelled': 'Đã huỷ',
  'Continuing': 'Tiếp tục ở',
  'Awaiting extension': 'Chờ gia hạn',
  'Not continuing': 'Không tiếp tục',
  'Awaiting consent': 'Chờ đồng ý',
  'Waiting for Staff': 'Chờ nhân viên',
  'Ready': 'Sẵn sàng',
  'Not ready': 'Chưa sẵn sàng',
  'Not set': 'Chưa đặt',
  'In use': 'Đang dùng',
  'Broken': 'Hỏng',
  'In repair': 'Đang sửa',
  'Normal': 'Bình thường',
  'Urgent': 'Khẩn cấp',
  'Deposit': 'Tiền cọc',
  'Balance': 'Tiền phòng',
  'Utility': 'Điện nước',
  'Room fee': 'Phí phòng',
  'Damage': 'Bồi thường',
  'Notice sent': 'Đã gửi thông báo',
  'Checked out': 'Đã trả phòng',
  'Awaiting Deposit': 'Chờ đặt cọc',
  'Awaiting Roommate': 'Chờ bạn cùng phòng',
  'Under Review': 'Đang xét duyệt',
  'Waitlisted': 'Danh sách chờ',
  'Allocated': 'Đã xếp phòng',
  'Forfeited': 'Mất cọc',
  'Expired': 'Hết hạn',
  'Invited': 'Đã mời',
  'Accepted': 'Đã chấp nhận',
  'Declined': 'Đã từ chối',
  'Agreed': 'Đã đồng ý',
  'Opens soon': 'Sắp mở',
  'Open': 'Đang mở',
  'Verified': 'Đã xác minh',
  'Pending verification': 'Chờ xác minh',
  'Profile needed': 'Cần bổ sung hồ sơ',
  'Claimed': 'Đã báo chuyển khoản',
  'Warning': 'Cảnh báo',
  'Final warning': 'Cảnh báo cuối',
  'Terminated': 'Chấm dứt',
  'Registration': 'Đăng ký',
  'Finance': 'Tài chính',
  'Rules': 'Nội quy',
  'Operations': 'Vận hành',
  'Male': 'Nam',
  'Female': 'Nữ',
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
            textAlign: TextAlign.center,
          ),
          if (retry != null) ...[
            const SizedBox(height: 12),
            FilledButton(onPressed: retry, child: Text(t('Retry', 'Thử lại'))),
          ],
        ],
      ),
    );
  }
}
