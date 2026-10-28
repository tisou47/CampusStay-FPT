import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../common.dart';

/// My Room (spec §6.8, §6.10, §11.4): the Room and roommates, the check-in pass as a QR code (A-11), the door code
/// behind a "show" button (every view is audited), the furniture, the Stay and the next Term with its requests.
class RoomScreen extends StatefulWidget {
  const RoomScreen({super.key});

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  String? _code;
  String? _message;

  static Future<Json?> _optional(String path) async {
    try {
      return await Api.get(path);
    } on ApiException {
      return null;
    }
  }

  static Future<(Json, Json?, Json?)> _fetch() async {
    final allocation = await Api.get('/students/me/allocation');
    if (allocation.obj('allocation') == null) return (allocation, null, null);
    final more = await Future.wait([_optional('/students/me/door-code'), _optional('/students/me/furniture')]);
    return (allocation, more[0], more[1]);
  }

  Future<void> _act(String path, Json body, Future<void> Function() reload) async {
    String message;
    try {
      final result = await Api.post(path, body);
      await reload();
      message = result.str('note') ?? t('Request sent.', 'Đã gửi yêu cầu.');
    } on ApiException catch (e) {
      message = e.message;
    }
    if (mounted) setState(() => _message = message);
  }

  Future<void> _reveal() async {
    try {
      final code = (await Api.post('/students/me/door-code/reveal')).text('code');
      setState(() => _code = code);
    } on ApiException catch (e) {
      setState(() => _message = e.message);
    }
  }

  Future<void> _confirm(bool extend, Future<void> Function() reload) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(extend ? t('Extend your stay?', 'Gia hạn lưu trú?') : t('End your stay?', 'Kết thúc lưu trú?')),
        content: Text(extend
            ? t('You stay one more Term; its fee is issued with the next-Term fees.',
                'Bạn ở thêm một kỳ; phí được phát hành cùng phí kỳ sau.')
            : t('Your Bed of the next Term is released; check out at the desk by the check-out date.',
                'Giường kỳ sau sẽ được trả lại; hãy trả phòng tại quầy trước hạn trả phòng.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t('Cancel', 'Huỷ'))),
          TextButton(onPressed: () => Navigator.pop(context, true), child: Text(t('Confirm', 'Xác nhận'))),
        ],
      ),
    );
    if (ok != true) return;
    if (extend) {
      await _act('/students/me/stay/extension', {'terms': 1}, reload);
    } else {
      await _act('/students/me/stay/end', {}, reload);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Loader<(Json, Json?, Json?)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (allocation, door, furniture) = data;
        final a = allocation.obj('allocation');
        final message = _message;
        if (a == null) {
          return Cards(children: [
            if (message != null) Note(message),
            Section(title: t('No Room this Term', 'Chưa có phòng trong kỳ này'), children: [
              Text(t('Apply for a Bed on the web when a registration period is open.',
                  'Hãy đăng ký giường trên bản web khi đợt đăng ký mở.')),
            ]),
          ]);
        }
        final roommates = allocation.objects('roommates');
        final pass = a.str('status') != 'Resident' ? a.str('pass') : null;
        final items = furniture?.objects('items') ?? const <Json>[];
        final stay = allocation.obj('stay');
        final next = allocation.obj('nextTerm');
        final code = _code;
        return Cards(children: [
          if (message != null) Note(message),
          Section(title: '${t('Room ', 'Phòng ')}${a.text('room')} · ${t('Bed ', 'Giường ')}${a.text('bed')}', children: [
            StatusChip(a.str('status')),
            Line(t('Block', 'Block'), a.str('blockLabel') ?? a.text('block')),
            Line(t('Room Type', 'Loại phòng'), label(a.str('roomTypeName'))),
            Line(t('Room Class', 'Hạng phòng'), label(a.str('roomClassName'))),
            if (a.str('residentSince') != null) Line(t('Resident since', 'Ở từ'), moment(a.str('residentSince'))),
            if (roommates.isNotEmpty) ...[
              Text(t('Roommates', 'Bạn cùng phòng'), style: const TextStyle(fontWeight: FontWeight.w500)),
              for (final r in roommates) Text('• ${r.text('name')} · ${t('Bed ', 'Giường ')}${r.text('bed')}'),
            ],
          ]),
          if (door != null)
            Section(title: t('Door code', 'Mã cửa'), children: [
              StatusChip(door.str('status')),
              if (door.str('note') != null) Text(door.text('note')),
              if (code != null) ...[
                Text(code, style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold, letterSpacing: 8)),
                Text(t('Do not share it. Every view is recorded.', 'Không chia sẻ mã. Mỗi lần xem đều được ghi lại.'),
                    style: theme.textTheme.bodySmall),
              ] else if (door.str('status') == 'Ready')
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton(onPressed: _reveal, child: Text(t('Show the code', 'Hiện mã'))),
                ),
            ]),
          if (pass != null)
            Section(title: t('Check-in pass', 'Thẻ nhận phòng'), children: [
              Text(t('Show this code at the desk of your Block.', 'Đưa mã này tại quầy của Block.')),
              Center(
                child: Semantics(
                  label: t('Check-in pass', 'Thẻ nhận phòng'),
                  child: QrImageView(data: pass, size: 220, backgroundColor: Colors.white),
                ),
              ),
            ]),
          if (items.isNotEmpty)
            Section(title: t('Furniture', 'Nội thất'), children: [
              for (final f in items)
                Row(children: [
                  Expanded(child: Text((isVietnamese() ? f.str('typeVi') : null) ?? f.text('type'))),
                  Text('${f.text('assetCode')} · ${label(f.str('status'))}',
                      style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                ]),
            ]),
          if (stay != null)
            Section(title: t('My Stay', 'Thời gian lưu trú'), children: [
              Line(t('Terms committed', 'Số kỳ đăng ký'), '${stay.number('committedTerms') ?? 0}'),
              Line(t('Terms used', 'Số kỳ đã ở'), '${stay.number('termsUsed') ?? 0}'),
              Line(t('Terms left', 'Số kỳ còn lại'), '${stay.number('termsLeft') ?? 0}'),
            ]),
          if (next != null) _nextTerm(next, reload),
        ]);
      },
    );
  }

  Widget _nextTerm(Json next, Future<void> Function() reload) {
    final window = next.obj('window');
    final fee = next.obj('fee');
    return Section(title: '${t('Next Term', 'Kỳ sau')} · ${next.obj('term')?.text('name') ?? ''}', children: [
      StatusChip(next.str('state')),
      if (next.str('room') != null)
        Line(t('Room', 'Phòng'), '${next.text('room')} · ${t('Bed ', 'Giường ')}${next.text('bed')}'),
      if (next.number('termPrice') != null) Line(t('Price', 'Giá'), money(next.number('termPrice'))),
      if (fee != null)
        Line(t('Next-Term fee', 'Phí kỳ sau'), '${money(fee.number('amount'))} · ${label(fee.str('status'))}'),
      if (window != null) ...[
        Line(t('Requests until', 'Gửi yêu cầu trước'), moment(window.str('closesAt'))),
        Line(t('Check out by', 'Trả phòng trước'), day(window.str('checkOutBy'))),
      ],
      if (window?.flag('filing') == true)
        Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton(
              onPressed: () => _confirm(true, reload), child: Text(t('Extend by 1 Term', 'Gia hạn 1 kỳ'))),
          OutlinedButton(
              onPressed: () => _confirm(false, reload), child: Text(t('End my stay', 'Kết thúc lưu trú'))),
        ]),
    ]);
  }
}
