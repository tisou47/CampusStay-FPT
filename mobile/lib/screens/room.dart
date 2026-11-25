import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'activity.dart';
import 'applications.dart';
import 'checkout.dart';
import 'handover.dart';
import 'apply.dart';
import 'payments.dart';
import 'requests.dart';

/// My Room (web SCR-ASG-01 `MyRoom`, spec §6.8–§6.10, §11.4): the stay's alerts (termination, unpaid Balance) over
/// three tabs like the web's: Room overview (the Room and its details, the check-in pass as a QR code (A-11), roommates,
/// links), Furniture & equipment (the Room's furniture by type), and Contract & utilities (the stay contract, its
/// milestones, the next Term with its requests, the Balance, the door code (shown 30 seconds, every view audited),
/// late check-in). `GET /students/me/allocation`, `/students/me/door-code` (+ `/reveal`), `/students/me/furniture`,
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

class _Room extends StatefulWidget {
  const _Room({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  State<_Room> createState() => _RoomState();
}

class _RoomState extends State<_Room> {
  String _tab = 'overview';
  List<Json>? _furniture;

  @override
  void initState() {
    super.initState();
    Api.get('/students/me/furniture').then((d) {
      if (mounted) setState(() => _furniture = d.objects('items'));
    }, onError: (_) {});
  }

  Future<void> _open(Widget page) async {
    await push(context, page);
    await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final a = data.obj('allocation')!;
    final termination = data.obj('termination');
    final balance = data.obj('balance');
    final checkIn = data.obj('checkIn');
    final resident = a.str('status') == 'Resident';
    final next = data.obj('nextTerm');
    final attention =
        (balance != null && balance.str('status') != 'Paid') ||
        next?.str('state') == 'Awaiting extension' ||
        next?.obj('fee')?.str('status') == 'Unpaid';

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
                  'Check out at the desk by ${day(termination.str('moveOutBy'))}.',
                  'Trả phòng tại quầy trước ${day(termination.str('moveOutBy'))}.',
                ),
            ].join(' '),
          ),
        if (!resident && a.str('status') == 'Assigned – unpaid')
          Alert(
            tone: Tone.warning,
            title: t('Pay the balance to keep your Bed', 'Hãy thanh toán tiền phòng còn lại để giữ chỗ'),
            body: t(
              'Your Bed is held until ${moment(balance?.str('dueAt'))}. Unpaid by then, it is released and the deposit is kept.',
              'Chỗ ở được giữ đến ${moment(balance?.str('dueAt'))}. Nếu chưa thanh toán, chỗ ở sẽ bị hủy và tiền đặt cọc không được hoàn.',
            ),
          ),
        // What the check-in inventory or the furniture charges ask now; nothing when all is done.
        const HandoverCard(),
        TabStrip(
          value: _tab,
          onChanged: (v) => setState(() => _tab = v),
          items: [
            (
              key: 'overview',
              text: t('Room overview', 'Tổng quan phòng'),
              icon: Icons.bed_outlined,
              count: null,
              dot: false,
            ),
            (
              key: 'furniture',
              text: t('Furniture & equipment', 'Nội thất & Thiết bị'),
              icon: Icons.inventory_2_outlined,
              count: _furniture?.length,
              dot: false,
            ),
            (
              key: 'contract',
              text: t('Contract & utilities', 'Hợp đồng & Tiện ích'),
              icon: Icons.key_outlined,
              count: null,
              dot: attention,
            ),
          ],
        ),
        ...switch (_tab) {
          'furniture' => [
            _FurnitureCard(
              items: _furniture,
              report: () => _open(const NewMaintenanceScreen()),
              changed: (items) => setState(() => _furniture = items),
            ),
          ],
          'contract' => [
            _CheckOutCard(
              data: data,
              furniture: _furniture,
              open: _open,
              showFurniture: () => setState(() => _tab = 'furniture'),
            ),
            _StayContract(data: data, open: _open),
            _StayMilestones(data: data),
            _NextTermCard(data: data, reload: widget.reload),
            if (balance != null) _BalanceCard(balance: balance, open: _open),
            const _DoorCodeCard(),
            if (checkIn?.str('checkedInAt') == null && !resident) const _LateCheckInCard(),
          ],
          _ => [
            _RoomHero(data: data, furniture: _furniture),
            ?_checkInPass(a, checkIn, resident),
            _Roommates(data: data),
            StatusList(
              children: [
                if (data.str('rulesUrl') != null)
                  StatusRow(
                    icon: Icons.menu_book_outlined,
                    title: t('Dormitory rules', 'Nội quy ký túc xá'),
                    trailing: const Icon(Icons.open_in_new, size: 18, color: Tokens.fgSecondary),
                    onTap: () => openUrl(data.text('rulesUrl')),
                  ),
                StatusRow(
                  icon: Icons.swap_horiz,
                  title: t('Request a Room change for next Term', 'Yêu cầu đổi phòng cho học kỳ sau'),
                  onTap: () => _open(const NewRoomChangeScreen()),
                ),
                StatusRow(
                  icon: Icons.people_outline,
                  title: t('Swap next-Term Beds with another student', 'Hoán đổi giường học kỳ sau với sinh viên khác'),
                  onTap: () => _open(const SwapScreen()),
                ),
              ],
            ),
          ],
        },
      ],
    );
  }

  /// The check-in pass (A-11) while the student is not a resident yet, or the check-in window without a pass; the web
  /// sends students to this app for it.
  Widget? _checkInPass(Json a, Json? checkIn, bool resident) {
    final pass = !resident ? a.str('pass') : null;
    final waiting = checkIn != null && checkIn.str('checkedInAt') == null;
    final where = waiting
        ? joinDot([range(checkIn.str('start'), checkIn.str('end')), checkIn.str('deskHours'), checkIn.str('location')])
        : null;
    if (pass != null) {
      return Section(
        title: t('Check-in pass', 'Thẻ nhận phòng'),
        subtitle: where ?? t('Show it at the desk of your Block.', 'Đưa mã này tại quầy của tòa.'),
        children: [
          Center(
            child: Semantics(
              label: t('Check-in pass', 'Thẻ nhận phòng'),
              child: QrImageView(data: pass, size: 200, backgroundColor: Colors.white),
            ),
          ),
          Center(
            child: Text(
              t('Bring your QR pass', 'Mang theo thẻ QR'),
              style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
            ),
          ),
        ],
      );
    }
    if (where == null) return null;
    return Section(
      title: t('Check-in', 'Nhận phòng'),
      children: [
        InfoRow(
          icon: Icons.event_outlined,
          name: t('Window', 'Thời gian'),
          value: range(checkIn!.str('start'), checkIn.str('end')),
        ),
        if (checkIn.str('deskHours') != null)
          InfoRow(icon: Icons.schedule, name: t('Desk hours', 'Giờ làm việc'), value: checkIn.text('deskHours')),
        if (checkIn.str('location') != null)
          InfoRow(icon: Icons.place_outlined, name: t('Where', 'Địa điểm'), value: checkIn.text('location')),
      ],
    );
  }
}

/// The Room as the web's hero card: an orange-tinted head with the Room, the Bed and the status, then the details
/// (Block, floor, Room Type and Class, furniture, allocation day, stay length).
class _RoomHero extends StatelessWidget {
  const _RoomHero({required this.data, required this.furniture});

  final Json data;
  final List<Json>? furniture;

  @override
  Widget build(BuildContext context) {
    final a = data.obj('allocation')!;
    final term = data.obj('term');
    final stay = data.obj('stay');
    String or(String? v) => label(v).isEmpty ? '—' : label(v);
    final groups = <String, int>{};
    for (final f in furniture ?? const <Json>[]) {
      groups.update(furnitureName(f), (n) => n + 1, ifAbsent: () => 1);
    }
    final furnitureText = groups.isNotEmpty
        ? groups.entries.map((e) => '${e.value} × ${e.key}').join(' · ')
        : (a.objects('furniture').isNotEmpty ? countLines(a.objects('furniture')) : '—');
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            color: Tokens.brandSubtle,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            child: Row(
              spacing: 12,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: const BoxDecoration(color: Tokens.surface, shape: BoxShape.circle),
                  child: const Icon(Icons.bed_outlined, color: Tokens.fgBrand, size: 24),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            roomBed(a.str('room'), a.str('bed')),
                            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: Tokens.fg),
                          ),
                          StatusChip(a.str('status') ?? 'Allocated'),
                        ],
                      ),
                      Text(
                        joinDot(
                          [a.str('block'), a.str('floor'), a.str('roomTypeName'), a.str('roomClassName')].map(label),
                        ),
                        style: const TextStyle(color: Tokens.fgSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                Text(t('Details', 'Chi tiết'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                if (term != null) Line(t('Term', 'Học kỳ'), term.text('name')),
                if (term?.str('stayStart') != null)
                  Line(t('Stay', 'Thời gian ở'), range(term!.str('stayStart'), term.str('stayEnd'))),
                Line(t('Block', 'Tòa'), or(a.str('blockLabel') ?? a.str('block'))),
                Line(t('Floor', 'Tầng'), or(a.str('floor'))),
                Line(t('Room type', 'Loại phòng'), or(a.str('roomTypeName'))),
                Line(t('Room tier', 'Hạng phòng'), or(a.str('roomClassName'))),
                Line(t('Furniture', 'Nội thất'), furnitureText),
                Line(t('Allocated on', 'Ngày xếp phòng'), day(a.str('allocatedAt'))),
                if (stay != null) ...[
                  Line(t('Stay length', 'Số kỳ đăng ký'), terms(stay.number('committedTerms'))),
                  Line(t('Terms used', 'Số học kỳ đã ở'), '${stay.number('termsUsed') ?? 0}'),
                ] else if (data.number('stayTerms') != null)
                  Line(t('Stay length', 'Số kỳ đăng ký'), terms(data.number('stayTerms'))),
                if (a.str('residentSince') != null) Line(t('Resident since', 'Cư dân từ'), day(a.str('residentSince'))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Roommates (web `RoommatesCard`): one row per roommate with the initial, the name and the Bed; only names are shared.
class _Roommates extends StatelessWidget {
  const _Roommates({required this.data});

  final Json data;

  @override
  Widget build(BuildContext context) {
    final roommates = data.objects('roommates');
    final capacity = data.number('roommateCapacity');
    return Section(
      title: t('Roommates', 'Bạn cùng phòng'),
      trailing: capacity == null
          ? null
          : Text('${roommates.length}/$capacity', style: const TextStyle(color: Tokens.fgTertiary)),
      children: [
        if (roommates.isEmpty)
          Text(
            t('No roommates assigned yet.', 'Chưa có bạn cùng phòng.'),
            style: const TextStyle(color: Tokens.fgSecondary),
          )
        else
          Column(
            spacing: 8,
            children: [
              for (final r in roommates)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(10)),
                  child: Row(
                    spacing: 10,
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: Tokens.brandSubtle,
                        child: Text(
                          r.text('name').trim().split(RegExp(r'\s+')).last.characters.firstOrNull ?? '?',
                          style: const TextStyle(fontSize: 13, color: Tokens.fgBrand, fontWeight: FontWeight.w600),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          r.text('name'),
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
                        decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(999)),
                        child: Text(
                          '${t('Bed', 'Giường')} ${r.text('bed')}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: Tokens.fgSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        Note(
          t(
            'Only names are shared. Contact details stay private; you meet your roommates at check-in.',
            'Chỉ chia sẻ họ tên. Thông tin liên hệ được giữ kín; bạn gặp bạn cùng phòng khi nhận phòng.',
          ),
        ),
      ],
    );
  }
}

/// Furniture & equipment (web `FurnitureCard`): one tile per type with its count, the status of its items (never the
/// asset codes) and what the student declared; "Report broken equipment", and the in-stay declaration of a worn,
/// damaged or missing item that Staff check at check-out. `PUT /students/me/furniture/report`.
class _FurnitureCard extends StatelessWidget {
  const _FurnitureCard({required this.items, required this.report, required this.changed});

  final List<Json>? items;
  final VoidCallback report;

  /// The Room's items after a declaration (the API answers with them).
  final ValueChanged<List<Json>> changed;

  String _place(Json i) => i.flag('personal') && i.str('bed') != null
      ? t('Bed ${i.text('bed')}', 'Giường ${i.text('bed')}')
      : t('Shared', 'Dùng chung');

  /// Declaring needs a photo of the item, taken on the Check-out page; the items are read again after it.
  Future<void> _declare(BuildContext context, List<Json> reportable, Json? item) async {
    await push(context, const CheckOutScreen());
    try {
      changed((await Api.get('/students/me/furniture')).objects('items'));
    } on ApiException {
      // the list on screen stays
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = items;
    if (list == null) {
      return const Center(
        child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()),
      );
    }
    final reportable = list.where((i) => i.str('itemId') != null && i['reportable'] != false).toList();
    final reported = list.where((i) => i.str('reportedCondition') != null).toList();
    final groups = <String, List<Json>>{};
    for (final i in list) {
      groups.putIfAbsent(furnitureName(i), () => []).add(i);
    }

    Widget tile(MapEntry<String, List<Json>> g) {
      final statuses = <String, int>{};
      for (final i in g.value) {
        statuses.update(i.str('status') ?? 'In use', (n) => n + 1, ifAbsent: () => 1);
      }
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 10,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(9)),
                  child: const Icon(Icons.inventory_2_outlined, size: 18, color: Tokens.fgBrand),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Text(g.key, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    '× ${g.value.length}',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Tokens.fgBrand),
                  ),
                ),
              ],
            ),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final MapEntry(key: status, value: n) in statuses.entries)
                  Tag(statuses.length > 1 ? '${label(status)} ($n)' : label(status), tone: toneOf(status)),
                for (final i in g.value.where((i) => i.str('reportedCondition') != null))
                  Tag(
                    t(
                      'Declared: ${conditionName(i.str('reportedCondition'))}',
                      'Đã kê khai: ${conditionName(i.str('reportedCondition'))}',
                    ),
                    tone: conditionTone(i.str('reportedCondition')),
                  ),
              ],
            ),
          ],
        ),
      );
    }

    final entries = groups.entries.toList();
    return Section(
      title: '${t('Furniture & equipment', 'Nội thất & Thiết bị')} (${list.length})',
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            BusyButton(
              label: t('Report broken equipment', 'Báo cáo hỏng hóc'),
              icon: Icons.build_outlined,
              onPressed: report,
            ),
            if (reportable.isNotEmpty)
              BusyButton(
                label: t('Declare damaged / missing', 'Kê khai hư hỏng / mất'),
                icon: Icons.edit_note,
                outlined: true,
                onPressed: () => _declare(context, reportable, null),
              ),
          ],
        ),
        if (reported.isNotEmpty)
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 6, 6),
            decoration: BoxDecoration(
              color: Tone.warning.bg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Tone.warning.mark.withValues(alpha: 0.4)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  spacing: 8,
                  children: [
                    Icon(Icons.warning_amber_rounded, size: 18, color: Tone.warning.fg),
                    Expanded(
                      child: Text(
                        t(
                          'Declared furniture issues during stay (${reported.length})',
                          'Nội thất bạn đã kê khai hư hỏng / mất trong kỳ ở (${reported.length})',
                        ),
                        style: TextStyle(fontWeight: FontWeight.w600, color: Tone.warning.fg),
                      ),
                    ),
                  ],
                ),
                for (final i in reported)
                  Row(
                    children: [
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 4,
                            children: [
                              Wrap(
                                spacing: 6,
                                runSpacing: 4,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Text(
                                    '${furnitureName(i)} · ${_place(i)}',
                                    style: const TextStyle(fontWeight: FontWeight.w500),
                                  ),
                                  Tag(
                                    conditionName(i.str('reportedCondition')),
                                    tone: conditionTone(i.str('reportedCondition')),
                                  ),
                                ],
                              ),
                              if (i.str('reportedNote') != null)
                                Text(
                                  i.text('reportedNote'),
                                  style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                                ),
                            ],
                          ),
                        ),
                      ),
                      if (i['reportable'] != false)
                        TextButton(
                          onPressed: () => _declare(context, reportable, i),
                          child: Text(t('Update', 'Cập nhật')),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        if (list.isEmpty)
          Text(
            t('No furniture recorded in this Room.', 'Chưa ghi nhận nội thất nào trong phòng này.'),
            style: const TextStyle(color: Tokens.fgSecondary),
          )
        else
          Column(
            spacing: 10,
            children: [
              for (var i = 0; i < entries.length; i += 2)
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 10,
                    children: [
                      Expanded(child: tile(entries[i])),
                      Expanded(child: i + 1 < entries.length ? tile(entries[i + 1]) : const SizedBox.shrink()),
                    ],
                  ),
                ),
            ],
          ),
        Note(
          t(
            'You can declare worn, damaged or missing furniture during your stay so Staff can verify it when you check out. Something to repair? Report it from Requests.',
            'Bạn có thể kê khai nội thất hao mòn, hư hỏng hoặc mất trong quá trình ở để nhân viên đối chiếu khi trả phòng. Cần sửa chữa? Hãy báo trong mục Yêu cầu.',
          ),
        ),
      ],
    );
  }
}

/// Check-out (the student's side of the web's check-out at the desk): shown when the stay ends (a termination, no Bed
/// next Term) or Staff have recorded the furniture charges. The day to check out by, the three steps at the desk
/// (final meters, the furniture against the check-in record and what the student declared, the Utility Deposit
/// settlement), and the charges to answer. `GET /students/me/check-out`.
class _CheckOutCard extends StatefulWidget {
  const _CheckOutCard({required this.data, required this.furniture, required this.open, required this.showFurniture});

  final Json data;
  final List<Json>? furniture;
  final Future<void> Function(Widget page) open;

  /// Opens the Furniture & equipment tab (to declare an item before check-out).
  final VoidCallback showFurniture;

  @override
  State<_CheckOutCard> createState() => _CheckOutCardState();
}

class _CheckOutCardState extends State<_CheckOutCard> {
  Json? _charges;

  @override
  void initState() {
    super.initState();
    Api.get('/students/me/check-out').then((d) {
      if (mounted) setState(() => _charges = d);
    }, onError: (_) {});
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final termination = data.obj('termination');
    final next = data.obj('nextTerm');
    final leaving = next?.str('state') == 'Not continuing';
    final c = _charges;
    final saved = c?.flag('saved') ?? false;
    final claims = c?.objects('claims').where((x) => x.str('status') == 'Pending').length ?? 0;
    final agreed = c?.str('agreedAt') != null;
    final checkedOut = termination?.str('status') == 'Checked out';
    if (termination == null && !leaving && !saved && claims == 0) return const SizedBox.shrink();
    final by = termination?.str('moveOutBy') ?? next?.obj('window')?.str('checkOutBy') ?? next?.str('checkOutBy');
    final declared = (widget.furniture ?? const <Json>[]).where((i) => i.str('reportedCondition') != null).length;

    return Panel(
      border: claims > 0 || (saved && !agreed) ? Tone.warning.mark.withValues(alpha: 0.5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          Row(
            spacing: 10,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(9)),
                child: const Icon(Icons.logout, size: 19, color: Tokens.fgBrand),
              ),
              Expanded(
                child: Text(
                  t('Check-out', 'Trả phòng'),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
              Tag(
                checkedOut
                    ? t('Checked out', 'Đã trả phòng')
                    : agreed
                    ? t('Charges agreed', 'Đã đồng ý khoản đền')
                    : t('Coming up', 'Sắp trả phòng'),
                tone: checkedOut || agreed ? Tone.success : Tone.warning,
              ),
            ],
          ),
          if (by != null && !checkedOut)
            InfoRow(
              icon: Icons.event_outlined,
              name: t('Check out at the desk by', 'Trả phòng tại quầy trước'),
              value: day(by),
            ),
          if (termination != null)
            InfoRow(
              icon: Icons.info_outline,
              name: t('Reason', 'Lý do'),
              value: joinDot([label(termination.str('reason')), termination.str('note')]),
            )
          else if (leaving && next?.str('endReason') != null)
            InfoRow(icon: Icons.info_outline, name: t('Reason', 'Lý do'), value: label(next!.str('endReason'))),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            decoration: BoxDecoration(
              color: Tokens.subtle.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Milestones(
              items: [
                (
                  title: t('Final meter reading', 'Chỉ số công tơ cuối'),
                  text: t(
                    'Staff read the Room\'s electricity and water meters when you leave.',
                    'Nhân viên ghi chỉ số điện, nước của phòng khi bạn rời đi.',
                  ),
                  time: null,
                  done: saved,
                  current: !saved,
                ),
                (
                  title: t('Furniture check', 'Đối chiếu nội thất'),
                  text: t(
                    'Each item is compared with your check-in record; only what got worse since is charged.',
                    'Từng món được so với biên bản nhận phòng; chỉ phần xấu đi sau đó mới bị tính.',
                  ),
                  time: null,
                  done: saved && claims == 0,
                  current: saved && claims > 0,
                ),
                (
                  title: t('Utility Deposit settlement', 'Quyết toán cọc điện nước'),
                  text: t(
                    'The deposit pays the last Utility share and the charges; the rest is refunded to your refund account.',
                    'Cọc điện nước trừ phần điện nước cuối và khoản đền; phần còn lại được hoàn vào tài khoản nhận hoàn tiền.',
                  ),
                  time: c?.str('agreedAt') == null ? null : moment(c!.str('agreedAt')),
                  done: agreed || checkedOut,
                  current: saved && claims == 0 && !agreed,
                ),
              ],
            ),
          ),
          if (claims > 0)
            Alert(
              tone: Tone.warning,
              title: t('Confirm or decline the damage', 'Xác nhận hoặc từ chối hư hỏng'),
              body: t(
                'Staff ask you to confirm damage to a shared item.',
                'Nhân viên đề nghị bạn xác nhận hư hỏng một món đồ chung.',
              ),
            )
          else if (saved && !agreed)
            Alert(
              tone: Tone.warning,
              title: t('Read the charges and agree', 'Hãy xem khoản đền và bấm đồng ý'),
              body: t(
                'Staff can complete your check-out once you agree.',
                'Nhân viên hoàn tất trả phòng sau khi bạn đồng ý.',
              ),
            ),
          if (saved || claims > 0)
            BusyButton(
              label: t('View furniture charges', 'Xem tiền đền nội thất'),
              icon: Icons.receipt_long_outlined,
              outlined: !(claims > 0 || (saved && !agreed)),
              onPressed: () => widget.open(const CheckOutScreen()),
            )
          else if (!checkedOut)
            Text(
              declared > 0
                  ? t(
                      'You declared $declared items during your stay; Staff check them at the desk.',
                      'Bạn đã kê khai $declared món trong kỳ ở; nhân viên sẽ đối chiếu tại quầy.',
                    )
                  : t(
                      'Something worn, damaged or missing? Declare it before you check out.',
                      'Có món hao mòn, hư hỏng hoặc mất? Hãy kê khai trước khi trả phòng.',
                    ),
              style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
            ),
          if (!checkedOut && !saved)
            BusyButton(
              label: t('Open check-out & furniture report', 'Mở trả phòng & kê khai nội thất'),
              icon: Icons.edit_note,
              onPressed: () => widget.open(const CheckOutScreen()),
            ),
        ],
      ),
    );
  }
}

/// The dormitory stay contract (web `StayContractCard`): its code, the Room and Bed, the Term, the Room Type and
/// Class, the stay commitment, this Term's room fee and the rules.
class _StayContract extends StatelessWidget {
  const _StayContract({required this.data, required this.open});

  final Json data;
  final Future<void> Function(Widget page) open;

  @override
  Widget build(BuildContext context) {
    final a = data.obj('allocation')!;
    final term = data.obj('term');
    final balance = data.obj('balance');
    final stay = data.obj('stay');
    final app = data.obj('application');
    final code = app?.str('code') != null
        ? 'HD-${app!.text('code')}'
        : 'HD-${a.str('block') ?? 'KTX'}-${a.str('room') ?? '000'}-${a.str('bed') ?? '0'}';
    final paid = balance?.str('status') == 'Paid';
    final standard = t('Standard', 'Tiêu chuẩn');
    final used = stay?.number('termsUsed') ?? 1;
    final total = stay?.number('committedTerms') ?? 1;
    final left = stay?.number('termsLeft');
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Row(
            spacing: 10,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(9)),
                child: const Icon(Icons.description_outlined, size: 19, color: Tokens.fgBrand),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t('Dormitory stay contract', 'Hợp đồng lưu trú KTX'),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    Text(code, style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary)),
                  ],
                ),
              ),
              StatusChip(a.str('status') ?? 'Allocated'),
            ],
          ),
          const Divider(height: 1),
          InfoRow(
            icon: Icons.apartment_outlined,
            name: t('Assigned Room & Bed', 'Phòng & giường được xếp'),
            value: '${roomBed(a.str('room'), a.str('bed'))} (${label(a.str('blockLabel') ?? a.str('block'))})',
          ),
          InfoRow(
            icon: Icons.event_outlined,
            name: t('Contract validity period', 'Thời hạn hợp đồng'),
            value: term == null ? '—' : '${term.text('name')} (${range(term.str('stayStart'), term.str('stayEnd'))})',
          ),
          InfoRow(
            icon: Icons.bed_outlined,
            name: t('Room Class & Type', 'Hạng phòng & loại phòng'),
            value:
                '${label(a.str('roomTypeName')).isEmpty ? standard : label(a.str('roomTypeName'))} · '
                '${label(a.str('roomClassName')).isEmpty ? standard : label(a.str('roomClassName'))}',
          ),
          InfoRow(
            icon: Icons.schedule,
            name: t('Stay commitment', 'Thời gian cam kết ở'),
            value: stay == null
                ? terms(data.number('stayTerms') ?? 1)
                : left != null
                ? t('$used of $total Terms used · $left Terms left', 'Đã ở $used/$total kỳ · còn $left kỳ')
                : t('$used of $total Terms used', 'Đã ở $used/$total kỳ'),
          ),
          if (balance != null)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
              decoration: BoxDecoration(
                color: Tokens.subtle.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Tokens.line),
              ),
              child: Row(
                spacing: 10,
                children: [
                  const Icon(Icons.credit_card, size: 18, color: Tokens.fgSecondary),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 4,
                      children: [
                        Text(
                          t('Current Term room fee', 'Tiền phòng học kỳ này'),
                          style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
                        ),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(money(balance.number('amount')), style: const TextStyle(fontWeight: FontWeight.w600)),
                            Tag(
                              paid ? t('Paid', 'Đã thanh toán') : t('Unpaid', 'Chưa thanh toán'),
                              tone: paid ? Tone.success : Tone.warning,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (balance.str('invoiceId') != null)
                    SmallAction(
                      t('View invoice', 'Xem hóa đơn'),
                      onPressed: () => open(InvoiceDetailScreen(id: balance.text('invoiceId'))),
                    ),
                ],
              ),
            ),
          if (data.str('rulesUrl') != null) ...[
            Note(
              t(
                'Residents must strictly follow dormitory regulations, safety and curfew policies.',
                'Sinh viên nội trú có trách nhiệm tuân thủ nghiêm ngặt nội quy KTX, quy định an toàn và giờ giới nghiêm.',
              ),
            ),
            LinkButton(
              t('Dormitory rules', 'Nội quy ký túc xá'),
              icon: Icons.open_in_new,
              onPressed: () => openUrl(data.text('rulesUrl')),
            ),
          ],
        ],
      ),
    );
  }
}

/// The stay's milestones (web `StayActivityLogCard`): application, allocation, room fee, check-in, residency.
class _StayMilestones extends StatelessWidget {
  const _StayMilestones({required this.data});

  final Json data;

  @override
  Widget build(BuildContext context) {
    final a = data.obj('allocation')!;
    final term = data.obj('term');
    final balance = data.obj('balance');
    final checkIn = data.obj('checkIn');
    final app = data.obj('application');
    final resident = a.str('status') == 'Resident';
    final paid = balance?.str('status') == 'Paid';
    final checkedIn = checkIn?.str('checkedInAt') != null;
    final block = label(a.str('blockLabel') ?? a.str('block'));
    final amount = money(balance?.number('amount'));
    return Section(
      title: t('Stay milestones & activity', 'Mốc sự kiện & hoạt động lưu trú'),
      children: [
        Milestones(
          items: [
            (
              title: t('Application & eligibility', 'Hồ sơ đăng ký & duyệt chỗ ở'),
              text: app?.str('code') != null
                  ? t(
                      'Application ${app!.text('code')} verified and approved',
                      'Đơn đăng ký ${app.text('code')} đã được xác minh và phê duyệt',
                    )
                  : t('Application submitted and verified', 'Đơn đăng ký đã nộp và được xác thực'),
              time: a.str('allocatedAt') == null ? null : day(a.str('allocatedAt')),
              done: true,
              current: false,
            ),
            (
              title: t('Room & Bed allocation', 'Xếp phòng & phân bổ giường'),
              text: t(
                'Allocated to ${a.text('room')} · Bed ${a.text('bed')} (Block $block)',
                'Đã xếp vào ${a.text('room')} · Giường ${a.text('bed')} (Tòa $block)',
              ),
              time: a.str('allocatedAt') == null ? null : moment(a.str('allocatedAt')),
              done: true,
              current: false,
            ),
            (
              title: t('Room fee payment', 'Thanh toán tiền phòng & cọc'),
              text: paid
                  ? t('Paid $amount successfully', 'Đã thanh toán thành công $amount')
                  : t('Room fee $amount awaiting payment', 'Tiền phòng $amount đang chờ thanh toán'),
              time: balance?.str('paidAt') != null
                  ? day(balance!.str('paidAt'))
                  : balance?.str('dueAt') != null
                  ? t('Due ${day(balance!.str('dueAt'))}', 'Hạn ${day(balance.str('dueAt'))}')
                  : null,
              done: paid,
              current: !paid,
            ),
            (
              title: t('Key handover & check-in', 'Bàn giao chìa khóa & nhận phòng'),
              text: checkedIn
                  ? t(
                      'Checked in at the dormitory desk, key and room inventory handed over',
                      'Đã làm thủ tục nhận phòng tại quầy, bàn giao chìa khóa và tài sản',
                    )
                  : checkIn?.str('start') != null
                  ? t(
                      'Check-in window: ${range(checkIn!.str('start'), checkIn.str('end'))}',
                      'Khung giờ nhận phòng: ${range(checkIn.str('start'), checkIn.str('end'))}',
                    )
                  : t('Prepare the check-in pass in this app', 'Chuẩn bị thẻ nhận phòng trên ứng dụng'),
              time: checkedIn ? moment(checkIn!.str('checkedInAt')) : null,
              done: checkedIn || resident,
              current: !checkedIn && paid && !resident,
            ),
            (
              title: t('Active residency', 'Lưu trú chính thức'),
              text: resident
                  ? t(
                      'Currently residing in the Room until ${day(term?.str('stayEnd'))}',
                      'Hiện đang lưu trú tại phòng đến ngày ${day(term?.str('stayEnd'))}',
                    )
                  : t('Begins upon check-in at the desk', 'Bắt đầu sau khi hoàn tất thủ tục tại quầy nhận phòng'),
              time: term?.str('stayStart') == null ? null : range(term!.str('stayStart'), term.str('stayEnd')),
              done: false,
              current: resident,
            ),
          ],
        ),
      ],
    );
  }
}

/// The Balance (web `BalanceCard`): the amount and its status, "Pay balance" or "View invoices".
class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance, required this.open});

  final Json balance;
  final Future<void> Function(Widget page) open;

  @override
  Widget build(BuildContext context) {
    final paid = balance.str('status') == 'Paid';
    return Section(
      title: t('Balance', 'Tiền phòng còn lại'),
      trailing: StatusChip(balance.str('status')),
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 2,
          children: [
            Text(money(balance.number('amount')), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
            Text(
              paid
                  ? t('Paid ${day(balance.str('paidAt'))}', 'Đã thanh toán ${day(balance.str('paidAt'))}')
                  : t('Due ${day(balance.str('dueAt'))}', 'Hạn ${day(balance.str('dueAt'))}'),
              style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
            ),
          ],
        ),
        if (paid)
          BusyButton(
            label: t('View invoices', 'Xem hóa đơn'),
            outlined: true,
            onPressed: () => open(const PaymentsPage()),
          )
        else if (balance.str('invoiceId') != null)
          BusyButton(
            label: t('Pay balance', 'Thanh toán tiền phòng còn lại'),
            icon: Icons.credit_card,
            onPressed: () => open(InvoiceScreen(id: balance.text('invoiceId'))),
          ),
      ],
    );
  }
}

// The next Term (spec §6.10, web `NextTermCard`): the Bed, its fee, the requests window, and while it is open the
/// requests that change it (extension, Room change, swap, end of stay); before the window a short plan.
class _NextTermCard extends StatelessWidget {
  const _NextTermCard({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  Future<void> _extend(BuildContext context, int max) async {
    var count = 1;
    final reason = TextEditingController();
    final ok = await confirm(
      context,
      title: t('Extend my stay', 'Gia hạn hợp đồng ở'),
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
      title: t('End my stay after this Term', 'Kết thúc hợp đồng ở sau học kỳ này'),
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
    Future<void> open(Widget page) async {
      await push(context, page);
      await reload();
    }

    final n = data.obj('nextTerm');
    if (n == null) {
      return Section(
        title: t('Next Term plan', 'Kế hoạch học kỳ tiếp theo'),
        trailing: Tag(t('Upcoming', 'Sắp tới'), dot: false),
        children: [
          Text(
            t(
              'Registration for the next Term is not open yet. You will be notified when extension, Room change and swap requests become available before the current Term ends.',
              'Chưa mở đợt đăng ký cho học kỳ tiếp theo. Bạn sẽ nhận được thông báo khi cổng đăng ký gia hạn, đổi phòng hoặc hoán đổi chỗ ở mở trước khi kết thúc học kỳ.',
            ),
            style: const TextStyle(color: Tokens.fgSecondary),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              OutlinedButton.icon(
                onPressed: () => open(const RequestsPage(kind: 'room-changes')),
                icon: const Icon(Icons.swap_horiz, size: 18),
                label: Text(t('View submitted requests', 'Xem các yêu cầu đã gửi')),
              ),
              TextButton(
                onPressed: () => open(const NewRoomChangeScreen()),
                child: Text(t('Room change info', 'Thông tin đổi phòng')),
              ),
            ],
          ),
        ],
      );
    }
    final w = n.obj('window');
    final filing = w?.flag('filing') == true;
    final fee = n.obj('fee');
    final stay = data.obj('stay');
    final left = stay != null ? (9 - (stay.number('committedTerms') ?? 1)).clamp(1, 8).toInt() : 8;
    final state = n.str('state');

    return Section(
      title: t('Next Term · ${n.obj('term')?.text('name')}', 'Học kỳ sau · ${n.obj('term')?.text('name')}'),
      trailing: StatusChip(state),
      children: [
        if (state == 'Not continuing')
          Alert(
            tone: Tone.warning,
            title: t('No Bed for the next Term', 'Không có giường cho học kỳ sau'),
            body: [
              t('Reason: ${label(n.str('endReason'))}.', 'Lý do: ${label(n.str('endReason'))}.'),
              if (n.str('checkOutBy') != null)
                t(
                  'Check out at the desk by ${day(n.str('checkOutBy'))}.',
                  'Trả phòng tại quầy trước ${day(n.str('checkOutBy'))}.',
                ),
            ].join(' '),
          )
        else ...[
          InfoRow(
            icon: Icons.bed_outlined,
            name: t('Your Bed next Term', 'Giường của bạn học kỳ sau'),
            value: joinDot([
              roomBed(n.str('room'), n.str('bed')),
              label(n.str('roomTypeName')),
              label(n.str('roomClassName')),
            ]),
          ),
          if (n.number('termPrice') != null)
            InfoRow(
              icon: Icons.credit_card,
              name: t('Next-Term fee', 'Phí học kỳ sau'),
              value: money(n.number('termPrice')),
            ),
          if (state == 'Awaiting extension')
            Alert(
              tone: Tone.warning,
              title: t('This is the last Term of your stay', 'Đây là học kỳ cuối của hợp đồng ở'),
              body: t(
                'Ask for an extension before ${moment(w?.str('closesAt'))} to keep your Bed. Otherwise it is released and you check out at the end of this Term.',
                'Hãy xin gia hạn trước ${moment(w?.str('closesAt'))} để giữ giường. Nếu không, giường sẽ được trả lại và bạn trả phòng vào cuối kỳ này.',
              ),
            )
          else
            Text(
              t(
                'Terms left on your stay after this one: ${n.number('termsLeft') ?? 0}',
                'Số học kỳ còn lại của hợp đồng ở sau học kỳ này: ${n.number('termsLeft') ?? 0}',
              ),
              style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
            ),
          if (fee != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(10)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(money(fee.number('amount')), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      if (fee.str('status') == 'Unpaid')
                        Text(
                          t('Due ${moment(fee.str('dueAt'))}', 'Hạn ${moment(fee.str('dueAt'))}'),
                          style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                        )
                      else
                        StatusChip(fee.str('status')),
                    ],
                  ),
                  if (fee.str('status') == 'Unpaid' && fee.str('invoiceId') != null)
                    BusyButton(
                      label: t('Pay next-Term fee', 'Thanh toán phí học kỳ sau'),
                      icon: Icons.credit_card,
                      onPressed: () => open(InvoiceScreen(id: fee.text('invoiceId'))),
                    ),
                ],
              ),
            ),
        ],
        if (w != null)
          Text(
            filing
                ? t(
                    'Requests for the next Term are open until ${moment(w.str('closesAt'))}.',
                    'Nhận yêu cầu cho học kỳ sau đến ${moment(w.str('closesAt'))}.',
                  )
                : t(
                    'Requests for the next Term closed on ${moment(w.str('closesAt'))}.',
                    'Đã đóng nhận yêu cầu cho học kỳ sau ngày ${moment(w.str('closesAt'))}.',
                  ),
            style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
          ),
        if (filing && state != 'Not continuing')
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              BusyButton(
                label: t('Extend my stay', 'Gia hạn hợp đồng ở'),
                icon: Icons.event_repeat,
                outlined: state != 'Awaiting extension',
                onPressed: () => _extend(context, left),
              ),
              if (state == 'Continuing') ...[
                BusyButton(
                  label: t('Change Room next Term', 'Đổi phòng học kỳ sau'),
                  icon: Icons.swap_horiz,
                  outlined: true,
                  onPressed: () => open(const NewRoomChangeScreen()),
                ),
                BusyButton(
                  label: t('Swap Beds for next Term', 'Hoán đổi giường cho học kỳ sau'),
                  icon: Icons.people_outline,
                  outlined: true,
                  onPressed: () => open(const SwapScreen()),
                ),
              ],
              TextButton(
                onPressed: () => _end(context, n),
                style: TextButton.styleFrom(foregroundColor: Tone.error.fg),
                child: Text(t('End my stay after this Term', 'Kết thúc hợp đồng ở sau học kỳ này')),
              ),
            ],
          ),
      ],
    );
  }
}

/// The Room's door code (ADR-23, web `DoorCodeCard`): shown on request for 30 seconds; every view is written to the
/// Audit Log.
class _DoorCodeCard extends StatefulWidget {
  const _DoorCodeCard();

  @override
  State<_DoorCodeCard> createState() => _DoorCodeCardState();
}

class _DoorCodeCardState extends State<_DoorCodeCard> {
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
    return Section(
      title: t('Door code', 'Mã cửa'),
      trailing: StatusChip(d.str('status')),
      children: [
        if (d.str('status') == 'Ready') ...[
          if (code != null)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
              decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(10)),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      code,
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: 8),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() => _code = null),
                    icon: const Icon(Icons.visibility_off_outlined, size: 18),
                    label: Text(t('Hide', 'Ẩn')),
                  ),
                ],
              ),
            )
          else
            BusyButton(
              label: t('Show door code', 'Xem mã cửa'),
              icon: Icons.visibility_outlined,
              busy: _busy,
              onPressed: _reveal,
            ),
          Text(
            t(
              'Changed ${moment(d.str('changedAt'))}. It changes whenever someone leaves the Room; never share it.',
              'Đổi lúc ${moment(d.str('changedAt'))}. Mã được đổi mỗi khi có người rời phòng; đừng chia sẻ mã.',
            ),
            style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
          ),
        ] else
          InfoRow(
            icon: Icons.key_outlined,
            name: t('Room ${d.text('room')}', 'Phòng ${d.text('room')}'),
            value: label(d.str('note')),
          ),
      ],
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
