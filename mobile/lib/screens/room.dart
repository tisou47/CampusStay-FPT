import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'applications.dart';
import 'apply.dart';
import 'family_day.dart';
import 'payments.dart';
import 'requests.dart';

/// My Room (web SCR-ASG-01, spec §6.8–§6.10, §11.4): the stay's alerts (termination, unpaid Balance), the Room and its
/// details, roommates, furniture, the next Term with its requests, the door code (shown 30 seconds, every view
/// audited), the check-in pass as a QR code (A-11), late check-in, the check-in window and the Balance.
/// `GET /students/me/allocation`, `/students/me/door-code` (+ `/reveal`), `/students/me/furniture`,
/// `/students/me/late-check-in`, `POST /students/me/stay/extension|end`.
class RoomScreen extends StatelessWidget {
  const RoomScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Loader<Json>(
      fetch: () => Api.get('/students/me/allocation'),
      builder: (context, data, reload) {
        final a = data.obj('allocation');
        final term = data.obj('term');
        if (a == null) {
          final app = data.obj('application');
          return Cards(
            children: [
              EmptyState(
                icon: Icons.bed_outlined,
                title: t('No Room assigned yet', 'Chưa được xếp phòng'),
                body:
                    t(
                      'The dormitory assigns your Room and Bed after review.',
                      'KTX xếp phòng và giường sau khi xét duyệt.',
                    ) +
                    (term?.str('resultsPublishedAt') != null
                        ? t(
                            ' Assignment results are published on ${day(term!.str('resultsPublishedAt'))}.',
                            ' Kết quả xếp phòng công bố ngày ${day(term.str('resultsPublishedAt'))}.',
                          )
                        : ''),
                action: FilledButton(
                  onPressed: () async {
                    await push(context, app != null ? ApplicationScreen(id: app.text('id')) : const ApplyScreen());
                    await reload();
                  },
                  child: Text(
                    app != null ? t('View application', 'Xem đơn') : t('Start application', 'Bắt đầu đăng ký'),
                  ),
                ),
              ),
            ],
          );
        }
        return _Room(data: data, reload: reload);
      },
    );
  }
}

class _Room extends StatelessWidget {
  const _Room({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  Widget build(BuildContext context) {
    final a = data.obj('allocation')!;
    final term = data.obj('term');
    final termination = data.obj('termination');
    final balance = data.obj('balance');
    final checkIn = data.obj('checkIn');
    final stay = data.obj('stay');
    final roommates = data.objects('roommates');
    final resident = a.str('status') == 'Resident';
    final pass = !resident ? a.str('pass') : null;
    final unpaid = balance != null && balance.str('status') != 'Paid';
    final waitingCheckIn = checkIn != null && checkIn.str('checkedInAt') == null;

    Future<void> open(Widget page) async {
      await push(context, page);
      await reload();
    }

    // A phone shows what matters now (alerts, the Room, what to pay or do); the rest folds into "Room information".
    return Cards(
      children: [
        if (termination != null)
          Alert(
            tone: Tone.error,
            title: termination.str('status') == 'Checked out'
                ? t('Stay ended', 'Đã kết thúc lưu trú')
                : t('Your stay is terminated', 'Hợp đồng lưu trú bị chấm dứt'),
            body: [
              t('Reason: ${label(termination.str('reason'))}.', 'Lý do: ${label(termination.str('reason'))}.'),
              ?termination.str('note'),
              if (termination.str('status') != 'Checked out')
                t(
                  'Check out by ${day(termination.str('moveOutBy'))}.',
                  'Trả phòng trước ${day(termination.str('moveOutBy'))}.',
                ),
            ].join(' '),
          ),
        HeroCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Row(
                children: [
                  Expanded(child: Text(term?.str('name') ?? '', style: HeroCard.soft)),
                  StatusChip(a.str('status') ?? 'Allocated'),
                ],
              ),
              Text(roomBed(a.str('room'), a.str('bed')), style: HeroCard.strong.copyWith(fontSize: 26)),
              Text(
                joinDot([a.str('blockLabel') ?? a.str('block'), a.str('floor')].map(label)),
                style: HeroCard.soft.copyWith(fontSize: 14),
              ),
              const SizedBox(height: 6),
              const _DoorCode(),
            ],
          ),
        ),
        if (unpaid)
          NextAction(
            icon: Icons.credit_card,
            title: '${t('Balance', 'Tiền phòng')} · ${money(balance.number('amount'))}',
            deadline: t('Due ', 'Hạn ') + moment(balance.str('dueAt')),
            body: t('Unpaid by then, the Bed is released.', 'Quá hạn chưa trả, giường sẽ bị thu hồi.'),
            action: balance.str('invoiceId') == null
                ? null
                : FilledButton(
                    onPressed: () => open(InvoiceScreen(id: balance.text('invoiceId'))),
                    child: Text(t('Pay balance', 'Trả tiền phòng')),
                  ),
          ),
        if (pass != null)
          Section(
            title: t('Check-in pass', 'Thẻ nhận phòng'),
            subtitle: waitingCheckIn
                ? joinDot([
                    range(checkIn.str('start'), checkIn.str('end')),
                    checkIn.str('deskHours'),
                    checkIn.str('location'),
                  ])
                : t('Show it at the desk of your Block.', 'Đưa mã này tại quầy của Block.'),
            children: [
              Center(
                child: Semantics(
                  label: t('Check-in pass', 'Thẻ nhận phòng'),
                  child: QrImageView(data: pass, size: 200, backgroundColor: Colors.white),
                ),
              ),
            ],
          )
        else if (waitingCheckIn)
          Section(
            title: t('Check-in', 'Nhận phòng'),
            children: [
              Text(
                joinDot([
                  range(checkIn.str('start'), checkIn.str('end')),
                  checkIn.str('deskHours'),
                  checkIn.str('location'),
                ]),
                style: const TextStyle(color: Tokens.fgSecondary),
              ),
            ],
          ),
        if (checkIn?.str('checkedInAt') == null && !resident) const _LateCheckInCard(),
        _NextTermCard(data: data, reload: reload),
        if (roommates.isNotEmpty || data.number('roommateCapacity') != null)
          Section(
            title: t('Roommates', 'Bạn cùng phòng'),
            trailing: data.number('roommateCapacity') != null
                ? Text(
                    '${roommates.length}/${data.number('roommateCapacity')}',
                    style: const TextStyle(color: Tokens.fgTertiary),
                  )
                : null,
            children: [
              if (roommates.isEmpty)
                Text(
                  t('No roommates assigned yet.', 'Chưa có bạn cùng phòng.'),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final r in roommates)
                    Chip(
                      avatar: CircleAvatar(
                        backgroundColor: Tokens.brandSubtle,
                        child: Text(
                          r.text('name').trim().split(RegExp(r'\s+')).last.characters.firstOrNull ?? '?',
                          style: const TextStyle(fontSize: 12, color: Tokens.fgBrand, fontWeight: FontWeight.w600),
                        ),
                      ),
                      label: Text('${r.text('name')} · ${r.text('bed')}'),
                      backgroundColor: Tokens.surface,
                      side: const BorderSide(color: Tokens.line),
                    ),
                ],
              ),
            ],
          ),
        Panel(
          padding: EdgeInsets.zero,
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              title: Text(
                t('Room information', 'Thông tin phòng'),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              leading: const Icon(Icons.info_outline, color: Tokens.fgSecondary),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  spacing: 8,
                  children: [
                    if (term?.str('stayStart') != null)
                      Line(t('Stay', 'Thời gian ở'), range(term!.str('stayStart'), term.str('stayEnd'))),
                    Line(
                      t('Room Type', 'Loại phòng'),
                      label(a.str('roomTypeName')).isEmpty ? '—' : label(a.str('roomTypeName')),
                    ),
                    Line(
                      t('Room Class', 'Hạng phòng'),
                      label(a.str('roomClassName')).isEmpty ? '—' : label(a.str('roomClassName')),
                    ),
                    Line(t('Allocated on', 'Ngày xếp'), day(a.str('allocatedAt'))),
                    if (checkIn?.str('checkedInAt') != null)
                      Line(t('Checked in', 'Đã nhận phòng'), day(checkIn!.str('checkedInAt'))),
                    if (a.str('residentSince') != null) Line(t('Resident since', 'Ở từ'), day(a.str('residentSince'))),
                    if (stay != null) ...[
                      Line(t('Stay length', 'Thời gian đăng ký'), terms(stay.number('committedTerms'))),
                      Line(t('Terms used', 'Số kỳ đã ở'), '${stay.number('termsUsed') ?? 0}'),
                    ] else if (data.number('stayTerms') != null)
                      Line(t('Stay length', 'Thời gian đăng ký'), terms(data.number('stayTerms'))),
                    if (balance != null && !unpaid)
                      Line(t('Balance', 'Tiền phòng'), '${money(balance.number('amount'))} · ${label('Paid')}'),
                  ],
                ),
                const SizedBox(height: 12),
                const _Furniture(),
              ],
            ),
          ),
        ),
        StatusList(
          children: [
            if (data.str('rulesUrl') != null)
              StatusRow(
                icon: Icons.menu_book_outlined,
                title: t('Dormitory rules', 'Nội quy KTX'),
                trailing: const Icon(Icons.open_in_new, size: 18, color: Tokens.fgSecondary),
                onTap: () => openUrl(data.text('rulesUrl')),
              ),
            StatusRow(
              icon: Icons.family_restroom,
              title: t('Family Days', 'Ngày gia đình'),
              onTap: () => open(const FamilyDaysScreen()),
            ),
          ],
        ),
      ],
    );
  }
}

// The next Term (spec §6.10): the Bed, its fee, the requests window, extension and end of stay, and the requests
/// that change the Bed while the window is open.
class _NextTermCard extends StatelessWidget {
  const _NextTermCard({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  Future<void> _extend(BuildContext context, int max) async {
    var count = 1;
    final reason = TextEditingController();
    final ok = await confirm(
      context,
      title: t('Extend my stay', 'Gia hạn lưu trú'),
      yes: t('Extend', 'Gia hạn'),
      content: StatefulBuilder(
        builder: (context, setState) => Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 12,
          children: [
            Choice<int>(
              name: t('Terms to add', 'Số kỳ thêm'),
              values: [for (var i = 1; i <= max; i++) i],
              text: terms,
              value: count,
              onChanged: (v) => setState(() => count = v ?? 1),
            ),
            Input(
              controller: reason,
              label: t('Reason (optional)', 'Lý do (không bắt buộc)'),
              lines: 2,
              maxLength: 500,
            ),
            Note(
              t(
                'Approved at once when you are enrolled and owe nothing overdue; otherwise Staff decide. Each Term is still billed on its own.',
                'Duyệt ngay khi bạn đang học và không nợ quá hạn; nếu không, nhân viên quyết định. Mỗi kỳ vẫn được lập hoá đơn riêng.',
              ),
            ),
          ],
        ),
      ),
    );
    if (ok) {
      final text = reason.text.trim();
      await _send('/students/me/stay/extension', {'terms': count, if (text.isNotEmpty) 'reason': text});
    }
    reason.dispose();
  }

  Future<void> _end(BuildContext context, Json n) async {
    final reason = TextEditingController();
    final w = n.obj('window');
    final ok = await confirm(
      context,
      title: t('End my stay after this Term', 'Kết thúc lưu trú sau kỳ này'),
      body: t(
        'Your Bed for ${n.obj('term')?.text('name')} is released at once. You check out at the desk by ${day(w?.str('checkOutBy') ?? n.str('checkOutBy'))}; the Utility Deposit is settled then. Nothing is charged for ending now.',
        'Giường của bạn cho ${n.obj('term')?.text('name')} được trả lại ngay. Bạn trả phòng tại quầy trước ${day(w?.str('checkOutBy') ?? n.str('checkOutBy'))}; cọc điện nước được quyết toán lúc đó. Kết thúc lúc này không mất phí.',
      ),
      yes: t('End my stay', 'Kết thúc lưu trú'),
      no: t('Keep my Bed', 'Giữ giường'),
      danger: true,
      content: Input(
        controller: reason,
        label: t('Reason (optional)', 'Lý do (không bắt buộc)'),
        lines: 2,
        maxLength: 500,
      ),
    );
    if (ok) {
      final text = reason.text.trim();
      await _send('/students/me/stay/end', {if (text.isNotEmpty) 'reason': text});
    }
    reason.dispose();
  }

  Future<void> _send(String path, Json body) async {
    try {
      final r = await Api.post(path, body);
      toast(
        label(r.str('note')).isNotEmpty
            ? label(r.str('note'))
            : (r.flag('automatic')
                  ? t('Request approved.', 'Yêu cầu đã được duyệt.')
                  : t('Request sent.', 'Đã gửi yêu cầu.')),
      );
      await reload();
    } on ApiException catch (e) {
      toast(e.fields['terms'] ?? e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = data.obj('nextTerm');
    if (n == null) return const SizedBox.shrink();
    final w = n.obj('window');
    final filing = w?.flag('filing') == true;
    final fee = n.obj('fee');
    final stay = data.obj('stay');
    final left = stay != null ? (9 - (stay.number('committedTerms') ?? 1)).clamp(1, 8).toInt() : 8;
    final state = n.str('state');

    Future<void> open(Widget page) async {
      await push(context, page);
      await reload();
    }

    // The requests of the window open in a sheet, so the card stays two lines and a button.
    Future<void> requests() => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) {
        void go(VoidCallback action) {
          Navigator.pop(sheet);
          action();
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  t(
                    'Requests for ${n.obj('term')?.text('name')} · until ${moment(w?.str('closesAt'))}',
                    'Yêu cầu cho ${n.obj('term')?.text('name')} · đến ${moment(w?.str('closesAt'))}',
                  ),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
              ),
              _action(
                Icons.event_repeat,
                t('Extend my stay', 'Gia hạn lưu trú'),
                () => go(() => _extend(context, left)),
              ),
              if (state == 'Continuing') ...[
                _action(
                  Icons.swap_horiz,
                  t('Change Room next Term', 'Đổi phòng kỳ sau'),
                  () => go(() => open(const NewRoomChangeScreen())),
                ),
                _action(
                  Icons.people_outline,
                  t('Swap Beds for next Term', 'Đổi chỗ kỳ sau'),
                  () => go(() => open(const SwapScreen())),
                ),
                _action(
                  Icons.layers_outlined,
                  t('Change the Room Class', 'Đổi hạng phòng'),
                  () => go(() => open(const NewRoomClassChangeScreen())),
                ),
              ],
              _action(
                Icons.logout,
                t('End my stay after this Term', 'Kết thúc lưu trú sau kỳ này'),
                () => go(() => _end(context, n)),
                danger: true,
              ),
            ],
          ),
        );
      },
    );

    return Section(
      title: t('Next Term · ${n.obj('term')?.text('name')}', 'Kỳ sau · ${n.obj('term')?.text('name')}'),
      trailing: StatusChip(state),
      children: [
        if (state == 'Not continuing')
          Text(
            [
              t('No Bed: ${label(n.str('endReason'))}.', 'Không có giường: ${label(n.str('endReason'))}.'),
              if (n.str('checkOutBy') != null)
                t('Check out by ${day(n.str('checkOutBy'))}.', 'Trả phòng trước ${day(n.str('checkOutBy'))}.'),
            ].join(' '),
            style: TextStyle(color: Tone.warning.fg),
          )
        else ...[
          Text(
            joinDot([
              roomBed(n.str('room'), n.str('bed')),
              if (n.number('termPrice') != null) '${money(n.number('termPrice'))} / ${t('Term', 'kỳ')}',
            ]),
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
          Text(
            state == 'Awaiting extension'
                ? t(
                    'Last Term of your stay: extend before ${moment(w?.str('closesAt'))} to keep your Bed.',
                    'Kỳ cuối: gia hạn trước ${moment(w?.str('closesAt'))} để giữ giường.',
                  )
                : t(
                    '${n.number('termsLeft') ?? 0} Terms left after this one',
                    'Còn ${n.number('termsLeft') ?? 0} kỳ sau kỳ này',
                  ),
            style: TextStyle(
              color: state == 'Awaiting extension' ? Tone.warning.fg : Tokens.fgSecondary,
              fontSize: 13.5,
            ),
          ),
          if (fee != null && fee.str('status') != 'Unpaid')
            Row(
              spacing: 8,
              children: [
                Text(
                  t('Next-Term fee ', 'Phí kỳ sau ') + money(fee.number('amount')),
                  style: const TextStyle(fontSize: 13.5),
                ),
                StatusChip(fee.str('status')),
              ],
            ),
          if (fee != null && fee.str('status') == 'Unpaid' && fee.str('invoiceId') != null)
            BusyButton(
              label: '${t('Pay next-Term fee', 'Trả phí kỳ sau')} · ${money(fee.number('amount'))}',
              onPressed: () => open(InvoiceScreen(id: fee.text('invoiceId'))),
            ),
        ],
        if (filing && state != 'Not continuing')
          BusyButton(
            label: state == 'Awaiting extension'
                ? t('Extend or end my stay', 'Gia hạn hoặc kết thúc')
                : t('Requests for next Term', 'Yêu cầu cho kỳ sau'),
            icon: Icons.tune,
            outlined: state != 'Awaiting extension',
            onPressed: requests,
          )
        else if (w != null)
          Note(
            t('Requests closed on ${day(w.str('closesAt'))}.', 'Đã đóng nhận yêu cầu ngày ${day(w.str('closesAt'))}.'),
          ),
      ],
    );
  }

  Widget _action(IconData icon, String text, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? Tone.error.mark : Tokens.fg;
    return ListTile(
      leading: Icon(icon, color: danger ? color : Tokens.fgSecondary),
      title: Text(
        text,
        style: TextStyle(fontWeight: FontWeight.w500, color: color),
      ),
      trailing: Icon(Icons.chevron_right, color: danger ? color : Tokens.fgTertiary),
      onTap: onTap,
    );
  }
}

/// The Room's door code (ADR-23), one line in the Room card: shown on request for 30 seconds; every view is written to
/// the Audit Log.
class _DoorCode extends StatefulWidget {
  const _DoorCode();

  @override
  State<_DoorCode> createState() => _DoorCodeState();
}

class _DoorCodeState extends State<_DoorCode> {
  Json? _door;
  String? _code;
  bool _busy = false;
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    Api.get('/students/me/door-code').then((d) {
      if (mounted) setState(() => _door = d);
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  Future<void> _reveal() async {
    setState(() => _busy = true);
    try {
      final code = (await Api.post('/students/me/door-code/reveal')).text('code');
      _hide?.cancel();
      _hide = Timer(const Duration(seconds: 30), () {
        if (mounted) setState(() => _code = null);
      });
      setState(() => _code = code);
    } on ApiException catch (e) {
      toast(e.message, error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final d = _door;
    if (d == null) return const SizedBox.shrink();
    final code = _code;
    final ready = d.str('status') == 'Ready';
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
      decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 10,
            children: [
              const Icon(Icons.key_outlined, color: Tokens.fgBrand),
              Expanded(
                child: ready
                    ? Text(
                        code ?? '• • • •',
                        style: TextStyle(
                          fontSize: code != null ? 26 : 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: code != null ? 6 : 2,
                        ),
                      )
                    : Text(
                        joinDot([t('Door code', 'Mã cửa'), label(d.str('status')), label(d.str('note'))]),
                        style: const TextStyle(color: Tokens.fgSecondary),
                      ),
              ),
              if (ready)
                _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : TextButton(
                        onPressed: code == null ? _reveal : () => setState(() => _code = null),
                        child: Text(code == null ? t('Show door code', 'Hiện mã cửa') : t('Hide', 'Ẩn')),
                      ),
            ],
          ),
          if (code != null)
            Text(
              t('Never share it. Every view is recorded.', 'Không chia sẻ mã. Mỗi lần xem đều được ghi lại.'),
              style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
            ),
        ],
      ),
    );
  }
}

// Late check-in (spec §6.9, A-36): a student who cannot arrive in the check-in window asks with the day and a
/// document; a Manager decides. An approved day also moves the Balance deadline.
class _LateCheckInCard extends StatefulWidget {
  const _LateCheckInCard();

  @override
  State<_LateCheckInCard> createState() => _LateCheckInCardState();
}

class _LateCheckInCardState extends State<_LateCheckInCard> {
  Json? _data;
  bool _open = false;
  final _reason = TextEditingController();
  DateTime? _day;
  Picked? _file;
  bool _busy = false;
  Map<String, String> _errors = const {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await Api.get('/students/me/late-check-in');
      if (mounted) setState(() => _data = d);
    } on ApiException {
      // the card stays hidden
    }
  }

  static String _iso(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
      _errors = const {};
    });
    try {
      await Api.multipart(
        '/students/me/late-check-in',
        {'reason': _reason.text.trim(), 'requestedFor': _iso(_day!)},
        [if (_file != null) ('evidence', _file!.path)],
      );
      toast(
        t(
          'Late check-in requested. A Manager will decide it; you will be notified.',
          'Đã gửi yêu cầu nhận phòng muộn. Quản lý sẽ quyết định; bạn sẽ được thông báo.',
        ),
      );
      setState(() => _open = false);
      await _load();
    } on ApiException catch (e) {
      setState(() {
        _errors = e.fields;
        _error = e.fields.isEmpty ? e.message : null;
      });
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) return const SizedBox.shrink();
    final r = d.obj('request');
    if (r == null && !d.flag('canRequest')) return const SizedBox.shrink();
    final latest = DateTime.tryParse(d.text('latestDay'));
    return Section(
      title: t('Late check-in', 'Nhận phòng muộn'),
      trailing: r == null ? null : StatusChip(r.str('status')),
      children: [
        if (r != null) ...[
          Line(t('Arrival asked for', 'Ngày xin đến'), day(r.str('requestedFor'))),
          if (r.str('status') == 'Approved') ...[
            Line(t('Approved until', 'Được duyệt tới'), day(r.str('deadline'))),
            Note(
              t(
                'Your Balance deadline and your arrival move to the end of that day.',
                'Hạn trả tiền phòng và ngày đến của bạn được dời tới cuối ngày đó.',
              ),
            ),
          ],
          if (r.str('status') == 'Rejected' && r.str('decisionReason') != null)
            Alert(tone: Tone.warning, title: t('Not approved', 'Không được duyệt'), body: r.text('decisionReason')),
        ],
        if (d.flag('canRequest'))
          if (_open) ...[
            if (_error != null) Note(_error!, error: true),
            Input(
              controller: _reason,
              label: t('Why do you arrive late?', 'Vì sao bạn đến muộn?'),
              lines: 3,
              maxLength: 500,
              error: _errors['reason'],
              onChanged: (_) => setState(() {}),
            ),
            InkWell(
              onTap: () async {
                final now = DateTime.now();
                final first = DateTime(now.year, now.month, now.day);
                final last = latest != null && latest.isAfter(first) ? latest : first.add(const Duration(days: 60));
                final picked = await showDatePicker(
                  context: context,
                  firstDate: first,
                  lastDate: last,
                  initialDate: _day ?? first,
                );
                if (picked != null) setState(() => _day = picked);
              },
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: t('Day you will arrive', 'Ngày bạn sẽ đến'),
                  helperText: latest != null
                      ? t('Up to ${day(d.str('latestDay'))}', 'Muộn nhất ${day(d.str('latestDay'))}')
                      : null,
                  errorText: _errors['requestedFor'],
                  suffixIcon: const Icon(Icons.calendar_today_outlined),
                ),
                child: Text(_day == null ? '' : day(_iso(_day!))),
              ),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final f = await pickDocument();
                if (f != null) setState(() => _file = f);
              },
              icon: const Icon(Icons.attach_file),
              label: Text(
                _file?.name ?? t('Document (ticket, letter …)', 'Giấy tờ (vé, thư …)'),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (_errors['evidence'] != null) Note(_errors['evidence']!, error: true),
            Row(
              spacing: 8,
              children: [
                Expanded(
                  child: BusyButton(
                    label: t('Cancel', 'Huỷ'),
                    outlined: true,
                    onPressed: () => setState(() => _open = false),
                  ),
                ),
                Expanded(
                  child: BusyButton(
                    label: t('Send request', 'Gửi yêu cầu'),
                    busy: _busy,
                    onPressed: _reason.text.trim().isEmpty || _day == null || _file == null ? null : _send,
                  ),
                ),
              ],
            ),
          ] else ...[
            Text(
              t(
                'Cannot arrive by ${day(d.str('checkInEnd'))}? Ask for a late check-in with a document that explains why.',
                'Không đến kịp trước ${day(d.str('checkInEnd'))}? Hãy xin nhận phòng muộn kèm giấy tờ giải thích lý do.',
              ),
              style: const TextStyle(color: Tokens.fgSecondary),
            ),
            BusyButton(
              label: t('Ask for a late check-in', 'Xin nhận phòng muộn'),
              outlined: true,
              onPressed: () => setState(() => _open = true),
            ),
          ],
      ],
    );
  }
}

//// The furniture of the Room inside "Room information": one line per type; items not in use are named with their
/// asset code.
class _Furniture extends StatefulWidget {
  const _Furniture();

  @override
  State<_Furniture> createState() => _FurnitureState();
}

class _FurnitureState extends State<_Furniture> {
  List<Json>? _items;

  @override
  void initState() {
    super.initState();
    Api.get('/students/me/furniture').then((d) {
      if (mounted) setState(() => _items = d.objects('items'));
    }, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    if (items == null) return const SizedBox.shrink();
    final groups = <String, List<Json>>{};
    for (final i in items) {
      groups.putIfAbsent(furnitureName(i), () => []).add(i);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 6,
      children: [
        Text(t('Furniture', 'Nội thất'), style: const TextStyle(fontWeight: FontWeight.w600)),
        if (items.isEmpty)
          Text(
            t('No furniture recorded in this Room.', 'Phòng chưa ghi nhận nội thất.'),
            style: const TextStyle(color: Tokens.fgSecondary),
          ),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final MapEntry(key: name, value: list) in groups.entries) Tag('${list.length} × $name', dot: false),
            for (final i in items.where((i) => i.str('status') != 'In use'))
              Tag('${i.text('assetCode')} · ${label(i.str('status'))}', tone: toneOf(i.str('status'))),
          ],
        ),
      ],
    );
  }
}
