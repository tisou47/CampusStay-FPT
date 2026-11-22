import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';

/// The check-in inventory (web Student › My room › Check-in inventory `CheckInInventory`, contract A-81): the
/// conditions to start and the start (the door code); each item of the Bed and the shared items with a condition (the
/// condition guide explains each level for the item), a note and photos, the meters, draft and submit; once filed the
/// record with its steps, what the student and Staff recorded, the meters and the Final report; after Staff's visit
/// the student agrees (with a comment); after the deadline a late report. The Room's record is never sent to the
/// student. The same page answers the furniture charges of a check-out, with the Utility Deposit settlement, and the
/// damage to a shared item Staff ask the student to confirm.
/// `GET /students/me/handover`, `POST …/start|submit|agree|late`, `PUT …`, `POST …/photos`, `DELETE …/photos/{id}`,
/// `GET /students/me/check-out`, `POST /students/me/check-out/agree`, `POST /students/me/damage-claims/{id}`.

const _conditions = ['Good', 'Worn', 'Damaged', 'Missing'];

/// A condition in the language in use: the Admin's level name when the API sends the levels (web `conditionName`).
String _name(String? condition, [List<Json> levels = const []]) {
  if (condition == null || condition.isEmpty) return '—';
  final level = levels.where((l) => l.str('handoverKey') == condition).firstOrNull;
  final own = level == null ? null : (isVietnamese() ? level.str('nameVi') : level.str('name'));
  if (own != null && own.isNotEmpty) return own;
  return switch (condition) {
    'Good' => t('Good', 'Tốt'),
    'Worn' => t('Worn', 'Hao mòn'),
    'Damaged' => t('Damaged', 'Hư hỏng'),
    'Missing' => t('Missing', 'Thiếu'),
    _ => condition,
  };
}

/// Web `conditionTone`.
Tone _tone(String? condition) => switch (condition) {
  'Good' => Tone.success,
  'Worn' => Tone.info,
  'Damaged' => Tone.error,
  'Missing' => Tone.warning,
  _ => Tone.neutral,
};

/// How a final inventory was recorded.
String _source(String? source) => switch (source) {
  'Checked in the Room' => t('checked in the Room', 'đã kiểm tại phòng'),
  'As filed' => t('as filed', 'theo bản đã nộp'),
  'Deadline passed' => t('deadline passed', 'quá hạn'),
  _ => label(source),
};

String _where(Json item) => joinDot([
  item.str('assetCode'),
  item.flag('personal')
      ? t('Your Bed ${item.text('bed')}', 'Giường ${item.text('bed')} của bạn')
      : t('Shared', 'Dùng chung'),
]);

/// My Room: what the inventory or the furniture charges ask of the student now (web `HandoverBanner`); once filed or
/// final, the way back to the record. Nothing when there is no inventory.
class HandoverCard extends StatefulWidget {
  const HandoverCard({super.key});

  @override
  State<HandoverCard> createState() => _HandoverCardState();
}

class _HandoverCardState extends State<HandoverCard> {
  Json? _inventory;
  Json? _charges;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final inventory = await Api.get('/students/me/handover');
      Json? charges;
      try {
        charges = await Api.get('/students/me/check-out');
      } on ApiException {
        charges = null;
      }
      if (mounted) {
        setState(() {
          _inventory = inventory;
          _charges = charges;
        });
      }
    } on ApiException {
      // the card stays hidden
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = _inventory;
    if (h == null) return const SizedBox.shrink();
    final status = h.str('status');
    final c = _charges;
    final claims = c?.objects('claims').where((x) => x.str('status') == 'Pending').length ?? 0;
    final toAgree = c != null && c.flag('saved') && c.flag('studentPresent') && c.str('agreedAt') == null;
    final (String? title, String? body, Tone tone, String action) = switch (status) {
      'Ready' => (
        t('You can receive your Room', 'Bạn đã có thể nhận phòng'),
        t(
          'At the Room, start the check-in inventory to get the door code.',
          'Khi đến phòng, hãy bắt đầu kiểm kê để nhận mã cửa.',
        ),
        Tone.info,
        t('Start check-in inventory', 'Bắt đầu kiểm kê nhận phòng'),
      ),
      'Draft' => (
        t('File your check-in inventory', 'Hãy nộp biên bản kiểm kê'),
        t(
          'Due ${moment(h.str('dueAt'))}. After that the Room’s recorded condition is used.',
          'Hạn ${moment(h.str('dueAt'))}. Sau đó hệ thống dùng tình trạng đã ghi nhận của phòng.',
        ),
        Tone.warning,
        t('Continue', 'Tiếp tục'),
      ),
      'Verifying' => (
        h.flag('toAgree')
            ? t('Agree with the checked inventory', 'Đồng ý với biên bản đã kiểm')
            : t('Staff will check your Room', 'Nhân viên sẽ xuống kiểm tra phòng'),
        h.flag('toAgree')
            ? t('Staff recorded what they found in the Room.', 'Nhân viên đã ghi nhận thực tế tại phòng.')
            : h.str('visitAt') != null
            ? t('Be in the Room at ${moment(h.str('visitAt'))}.', 'Hãy có mặt ở phòng lúc ${moment(h.str('visitAt'))}.')
            : t('Staff will tell you when they come.', 'Nhân viên sẽ báo khi nào họ đến.'),
        Tone.warning,
        t('Open', 'Mở'),
      ),
      _ when claims > 0 || toAgree => (
        t('Furniture charges to answer', 'Khoản đền nội thất cần trả lời'),
        claims > 0
            ? t(
                'Staff ask you to confirm damage to a shared item.',
                'Nhân viên đề nghị bạn xác nhận hư hỏng một món đồ chung.',
              )
            : t('Read the charges of your check-out and agree.', 'Hãy xem khoản đền khi trả phòng và bấm đồng ý.'),
        Tone.warning,
        t('Open', 'Mở'),
      ),
      'Submitted' => (
        t('Your check-in inventory is with Staff', 'Biên bản kiểm kê của bạn đang chờ nhân viên'),
        t(
          'Submitted ${moment(h.str('submittedAt'))}. Staff confirm it, or come to check the Room with you.',
          'Đã nộp lúc ${moment(h.str('submittedAt'))}. Nhân viên sẽ xác nhận, hoặc hẹn xuống phòng kiểm tra cùng bạn.',
        ),
        Tone.info,
        t('View inventory', 'Xem biên bản'),
      ),
      'Final' => (
        t('Check-in inventory final', 'Biên bản kiểm kê nhận phòng đã chốt'),
        t(
          'Final on ${moment(h.str('finalizedAt'))}. Open it to read what was recorded or show it to Staff.',
          'Đã chốt lúc ${moment(h.str('finalizedAt'))}. Mở để xem lại nội dung đã ghi hoặc đưa nhân viên xem.',
        ),
        Tone.success,
        t('View inventory', 'Xem biên bản'),
      ),
      _ => (null, null, Tone.neutral, ''),
    };
    if (title == null) return const SizedBox.shrink();
    return Alert(
      tone: tone,
      title: title,
      body: body,
      action: FilledButton.icon(
        onPressed: () async {
          await push(context, const HandoverScreen());
          await _load();
        },
        icon: const Icon(Icons.assignment_outlined, size: 18),
        label: Text(action),
      ),
    );
  }
}

/// The check-in inventory page (from My Room's card and a notification's link `/student/room/inventory`).
class HandoverScreen extends StatelessWidget {
  const HandoverScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Check-in inventory', 'Kiểm kê nhận phòng'),
      body: Loader<(Json, Json?)>(
        fetch: () async {
          final inventory = await Api.get('/students/me/handover');
          Json? charges;
          try {
            charges = await Api.get('/students/me/check-out');
          } on ApiException {
            charges = null;
          }
          return (inventory, charges);
        },
        builder: (context, d, reload) {
          final (h, charges) = d;
          final status = h.str('status');
          return Cards(
            children: [
              if (status == 'Not needed')
                EmptyState(
                  icon: Icons.assignment_outlined,
                  title: t('No check-in inventory to file', 'Không có biên bản kiểm kê cần nộp'),
                  body: t('You file one when you receive a Room.', 'Bạn sẽ nộp biên bản khi nhận phòng.'),
                )
              else if (status == 'Waiting' || status == 'Ready')
                _Start(data: h, reload: reload)
              else if (status == 'Draft')
                _Form(key: ValueKey(h.str('id')), data: h, reload: reload)
              else
                _Summary(data: h, reload: reload),
              if (charges != null) _Charges(data: charges, reload: reload),
            ],
          );
        },
      ),
    );
  }
}

/// A small icon chip in front of a card's title.
Widget _chip(IconData icon, {Color bg = Tokens.brandSubtle, Color fg = Tokens.fgBrand}) => Container(
  width: 36,
  height: 36,
  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
  child: Icon(icon, size: 19, color: fg),
);

/// A card head: the chip, the title, a line under it and something on the right.
Widget _head(IconData icon, String title, String? text, {Widget? trailing}) => Row(
  crossAxisAlignment: CrossAxisAlignment.start,
  spacing: 12,
  children: [
    _chip(icon),
    Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          if (text != null) Text(text, style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
        ],
      ),
    ),
    ?trailing,
  ],
);

/// Before the start (web `Start`): the conditions the Room waits for, and "Start check-in inventory" once all are met.
class _Start extends StatefulWidget {
  const _Start({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  State<_Start> createState() => _StartState();
}

class _StartState extends State<_Start> {
  bool _busy = false;

  Future<void> _start() async {
    final ok = await confirm(
      context,
      title: t('Start the check-in inventory?', 'Bắt đầu kiểm kê nhận phòng?'),
      body: t(
        'Do it when you are at the Room. You receive the door code now, and you have 48 hours to file the inventory: after that the Room\'s recorded condition is used and you can no longer report damage that was already there.',
        'Hãy bấm khi bạn đã ở phòng. Bạn nhận mã cửa ngay, và có 48 giờ để nộp biên bản: sau thời hạn đó hệ thống dùng tình trạng đã ghi nhận của phòng và bạn không thể báo hư hỏng có sẵn nữa.',
      ),
      yes: t('I am at the Room, start', 'Tôi đã ở phòng, bắt đầu'),
      no: t('Not yet', 'Chưa'),
    );
    if (!ok) return;
    setState(() => _busy = true);
    final done = await attempt(
      () => Api.post('/students/me/handover/start'),
      success: t(
        'Inventory started. Your door code is on My Room. File the inventory before the deadline.',
        'Đã bắt đầu kiểm kê. Mã cửa nằm ở Phòng của tôi. Hãy nộp biên bản trước hạn.',
      ),
    );
    if (mounted) setState(() => _busy = false);
    if (done != null) await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final ready = widget.data.str('status') == 'Ready';
    final checks = widget.data.objects('checks');
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 14,
        children: [
          _head(
            Icons.vpn_key_outlined,
            t('Receive your Room', 'Nhận phòng'),
            t(
              'At the Room, start the check-in inventory: you receive the door code and record the condition of your Bed\'s items, the shared items and the meters.',
              'Khi đến phòng, hãy bắt đầu kiểm kê nhận phòng: bạn nhận mã cửa và ghi tình trạng đồ của giường bạn, đồ dùng chung và công tơ.',
            ),
          ),
          if (checks.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(12)),
              child: Column(
                spacing: 10,
                children: [
                  for (final c in checks)
                    Row(
                      spacing: 10,
                      children: [
                        Icon(
                          c.flag('passed') ? Icons.check_circle : Icons.radio_button_unchecked,
                          size: 20,
                          color: c.flag('passed') ? Tone.success.mark : Tokens.fgTertiary,
                        ),
                        Expanded(
                          child: Text(
                            label(c.str('label')),
                            style: TextStyle(color: c.flag('passed') ? Tokens.fg : Tokens.fgSecondary),
                          ),
                        ),
                        Tag(
                          c.flag('passed') ? t('Done', 'Xong') : t('Waiting', 'Đang chờ'),
                          tone: c.flag('passed') ? Tone.success : Tone.neutral,
                          dot: false,
                        ),
                      ],
                    ),
                ],
              ),
            ),
          BusyButton(
            label: t('Start check-in inventory', 'Bắt đầu kiểm kê nhận phòng'),
            icon: Icons.vpn_key_outlined,
            busy: _busy,
            onPressed: ready ? _start : null,
          ),
        ],
      ),
    );
  }
}

/// Photos as thumbnails; a tap shows one full size; [onRemove] adds a remove mark in the corner.
class _Photos extends StatelessWidget {
  const _Photos({required this.photos, this.onRemove, this.empty});

  final List<Json> photos;
  final void Function(String id)? onRemove;

  /// Shown when there is no photo (the record); nothing when null (the form).
  final String? empty;

  @override
  Widget build(BuildContext context) {
    if (photos.isEmpty) {
      return empty == null
          ? const SizedBox.shrink()
          : Text(empty!, style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary));
    }
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        for (final p in photos)
          Stack(
            clipBehavior: Clip.none,
            children: [
              GestureDetector(
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (dialog) => Dialog(
                    insetPadding: const EdgeInsets.all(16),
                    clipBehavior: Clip.antiAlias,
                    child: InteractiveViewer(child: Image.network(p.text('url'), fit: BoxFit.contain)),
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    p.text('url'),
                    width: 64,
                    height: 64,
                    fit: BoxFit.cover,
                    semanticLabel: t('Photo', 'Ảnh'),
                    errorBuilder: (_, _, _) => Container(
                      width: 64,
                      height: 64,
                      color: Tokens.subtle,
                      child: const Icon(Icons.image_not_supported_outlined, color: Tokens.fgTertiary),
                    ),
                  ),
                ),
              ),
              if (onRemove != null)
                Positioned(
                  top: -6,
                  right: -6,
                  child: Material(
                    color: Tokens.fg.withValues(alpha: 0.75),
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => onRemove!(p.text('id')),
                      child: Tooltip(
                        message: t('Remove photo', 'Xóa ảnh'),
                        child: const Padding(
                          padding: EdgeInsets.all(4),
                          child: Icon(Icons.close, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// What each condition means, in general and for the common furniture types (web `ConditionGuide`), so a student
/// picks the right one. Matched on the type's English name; other types get the general texts.
class _Guide {
  static String general(String c) => switch (c) {
    'Good' => t(
      'Works and looks fine: only light marks from normal use.',
      'Dùng tốt, trông bình thường: chỉ có vết nhẹ do sử dụng.',
    ),
    'Worn' => t(
      'Used but still works: scratches, faded paint, small marks.',
      'Đã cũ nhưng vẫn dùng được: trầy xước, phai màu, vết bẩn nhỏ.',
    ),
    'Damaged' => t(
      'Broken or not working properly: it needs a repair.',
      'Bị hỏng hoặc không hoạt động bình thường: cần sửa chữa.',
    ),
    _ => t('Not in the Room, or a part of it is gone.', 'Không có trong phòng, hoặc bị mất một bộ phận.'),
  };

  static final _examples = <(RegExp, Map<String, (String, String)>)>[
    (
      RegExp('chair|stool'),
      {
        'Good': ('Steady, the seat and back are whole.', 'Chắc chắn, mặt ngồi và lưng ghế nguyên vẹn.'),
        'Worn': ('Scratches, a slightly wobbly leg.', 'Trầy xước, chân ghế hơi lung lay.'),
        'Damaged': (
          'A loose or cracked leg, a broken seat or back.',
          'Chân ghế lỏng hoặc nứt, mặt ngồi hay lưng ghế bị gãy.',
        ),
        'Missing': ('No chair in the Room.', 'Không có ghế trong phòng.'),
      },
    ),
    (
      RegExp('desk|table'),
      {
        'Good': ('Steady top, drawers open and close.', 'Mặt bàn chắc, ngăn kéo đóng mở được.'),
        'Worn': ('Scratches or marks on the top.', 'Mặt bàn trầy xước hoặc có vết.'),
        'Damaged': ('Wobbly, a broken drawer or a cracked top.', 'Bàn lung lay, ngăn kéo hỏng hoặc mặt bàn nứt.'),
        'Missing': ('No desk, or a drawer is gone.', 'Không có bàn, hoặc mất ngăn kéo.'),
      },
    ),
    (
      RegExp('mattress'),
      {
        'Good': ('Clean and firm.', 'Sạch và còn êm, chắc.'),
        'Worn': ('Small stains, slightly flattened.', 'Có vết bẩn nhỏ, hơi xẹp.'),
        'Damaged': ('Torn, springs coming out, very sunken.', 'Bị rách, lò xo lòi ra, lún nhiều.'),
        'Missing': ('No mattress on the Bed.', 'Không có nệm trên giường.'),
      },
    ),
    (
      RegExp('bed|bunk|ladder'),
      {
        'Good': ('Steady frame, every slat in place.', 'Khung giường chắc, đủ các thanh nan.'),
        'Worn': ('Chipped paint, creaks a little.', 'Tróc sơn, hơi kêu cót két.'),
        'Damaged': ('A broken slat or frame, a loose ladder.', 'Gãy thanh nan hoặc khung, thang bị lỏng.'),
        'Missing': ('A slat or the ladder is gone.', 'Mất thanh nan hoặc thang.'),
      },
    ),
    (
      RegExp('wardrobe|locker|cabinet|closet|shelf'),
      {
        'Good': ('Doors close, the lock works.', 'Cửa đóng được, khóa hoạt động.'),
        'Worn': ('Scratches, a door is hard to close.', 'Trầy xước, cửa khó đóng.'),
        'Damaged': ('A door off its hinge, a broken lock.', 'Cửa bung bản lề, khóa hỏng.'),
        'Missing': ('No key, a shelf or the whole unit is gone.', 'Mất chìa khóa, mất ngăn kệ hoặc mất cả tủ.'),
      },
    ),
    (
      RegExp('air|conditioner|fan|heater'),
      {
        'Good': ('Turns on and cools or blows normally.', 'Bật được, làm mát hoặc thổi gió bình thường.'),
        'Worn': ('Works but is noisy or dusty.', 'Vẫn chạy nhưng ồn hoặc bám bụi.'),
        'Damaged': ('Does not turn on or cool, leaks water.', 'Không bật được hoặc không mát, chảy nước.'),
        'Missing': ('No unit, or its remote is gone.', 'Không có máy, hoặc mất điều khiển.'),
      },
    ),
    (
      RegExp('light|lamp|bulb'),
      {
        'Good': ('Turns on, steady light.', 'Bật được, ánh sáng ổn định.'),
        'Worn': ('Dim or a little discoloured.', 'Sáng yếu hoặc hơi đổi màu.'),
        'Damaged': ('Does not turn on or flickers.', 'Không sáng hoặc nhấp nháy.'),
        'Missing': ('No bulb or no lamp.', 'Không có bóng hoặc không có đèn.'),
      },
    ),
    (
      RegExp('curtain|blind'),
      {
        'Good': ('Whole and slides well.', 'Nguyên vẹn, kéo trơn tru.'),
        'Worn': ('Faded or with small stains.', 'Phai màu hoặc có vết bẩn nhỏ.'),
        'Damaged': ('Torn, the rail or hooks broken.', 'Bị rách, thanh ray hoặc móc treo hỏng.'),
        'Missing': ('No curtain.', 'Không có rèm.'),
      },
    ),
  ];

  /// The example of [condition] for [item]'s type, or null.
  static String? example(Json item, String condition) {
    final name = (item.str('type') ?? item.str('name') ?? '').toLowerCase();
    final match = _examples.where((e) => e.$1.hasMatch(name)).firstOrNull;
    final pair = match?.$2[condition];
    return pair == null ? null : t(pair.$1, pair.$2);
  }

  /// Opens the guide for [item] in a sheet; resolves to the condition picked there, or null.
  static Future<String?> show(
    BuildContext context, {
    required Json item,
    required String? value,
    required List<Json> levels,
    required bool photosRequired,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Tokens.surface,
      constraints: const BoxConstraints(minWidth: double.infinity),
      builder: (sheet) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(Icons.info_outline, color: Tokens.fgBrand),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(
                        t('Which condition?', 'Chọn mức độ nào?'),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                      ),
                      Text(
                        '${furnitureName(item)} · ${item.text('assetCode')}',
                        style: const TextStyle(color: Tokens.fgSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            for (final c in _conditions)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: value == c ? Tokens.brandSubtle : Tokens.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: value == c ? Tokens.primary : Tokens.line, width: value == c ? 1.5 : 1),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => Navigator.pop(sheet, c),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 10,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 6,
                              children: [
                                Tag(_name(c, levels), tone: _tone(c)),
                                Text(general(c), style: const TextStyle(fontSize: 14)),
                                if (example(item, c) != null)
                                  Text(
                                    t('E.g. ${example(item, c)}', 'Ví dụ: ${example(item, c)}'),
                                    style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                                  ),
                              ],
                            ),
                          ),
                          Icon(
                            value == c ? Icons.radio_button_checked : Icons.radio_button_off,
                            color: value == c ? Tokens.primary : Tokens.fgTertiary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            Text(
              photosRequired
                  ? t(
                      'Damaged or Missing items need a photo and a short note.',
                      'Món Hư hỏng hoặc Thiếu cần có ảnh và ghi chú ngắn.',
                    )
                  : t(
                      'Add a short note and a photo when something is worn, damaged or missing.',
                      'Hãy thêm ghi chú ngắn và ảnh khi món đồ bị hao mòn, hư hỏng hoặc thiếu.',
                    ),
              style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
            ),
          ],
        ),
      ),
    );
  }
}

/// The inventory being filled in (web `Form`): each item with the four conditions, the guide, a note when it is not
/// good, photos; the meters with their photos; save a draft or submit.
class _Form extends StatefulWidget {
  const _Form({super.key, required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  State<_Form> createState() => _FormState();
}

class _FormState extends State<_Form> {
  late final Map<String, String?> _answers = {
    for (final i in widget.data.objects('items')) i.text('itemId'): i.str('condition'),
  };
  late final Map<String, TextEditingController> _notes = {
    for (final i in widget.data.objects('items')) i.text('itemId'): TextEditingController(text: i.text('note')),
  };
  late final _electricity = TextEditingController(text: widget.data.text('electricity'));
  late final _water = TextEditingController(text: widget.data.text('water'));
  bool _busy = false;
  String? _uploading;
  Map<String, String> _errors = const {};

  List<Json> get _levels => widget.data.objects('conditionLevels');

  @override
  void dispose() {
    for (final c in _notes.values) {
      c.dispose();
    }
    _electricity.dispose();
    _water.dispose();
    super.dispose();
  }

  Map<String, dynamic> _body() => {
    'items': [
      for (final e in _answers.entries)
        if (e.value != null)
          {
            'itemId': e.key,
            'condition': e.value,
            if (_notes[e.key]!.text.trim().isNotEmpty) 'note': _notes[e.key]!.text.trim(),
          },
    ],
    if (_electricity.text.trim().isNotEmpty) 'electricity': num.tryParse(_electricity.text.trim()),
    if (_water.text.trim().isNotEmpty) 'water': num.tryParse(_water.text.trim()),
  };

  /// Adds a photo of an item (or of the meters when [itemId] is null); the answers are saved first, so the reload
  /// that shows the photo keeps them.
  Future<void> _photo(String? itemId) async {
    final picked = await pickImages(1);
    if (picked.isEmpty) return;
    setState(() => _uploading = itemId ?? 'meters');
    await attempt(() => Api.put('/students/me/handover', _body()));
    final done = await attempt(
      () => Api.multipart('/students/me/handover/photos', {'itemId': ?itemId}, [('photo', picked.first.path)]),
      success: t('Photo added', 'Đã thêm ảnh'),
    );
    if (mounted) setState(() => _uploading = null);
    if (done != null) await widget.reload();
  }

  Future<void> _remove(String id) async {
    await attempt(() => Api.put('/students/me/handover', _body()));
    final done = await attempt(() => Api.delete('/students/me/handover/photos/${Uri.encodeComponent(id)}'));
    if (done != null) await widget.reload();
  }

  Future<void> _send(bool submit) async {
    setState(() {
      _busy = true;
      _errors = const {};
    });
    try {
      final v = submit
          ? await Api.post('/students/me/handover/submit', _body())
          : await Api.put('/students/me/handover', _body());
      toast(
        submit
            ? (v.str('status') == 'Final'
                  ? t(
                      'Inventory submitted. It matches the Room: it is final.',
                      'Đã nộp biên bản. Biên bản khớp với phòng: đã được chốt.',
                    )
                  : t(
                      'Inventory submitted. Staff look at it; they may come to check the Room with you.',
                      'Đã nộp biên bản. Nhân viên sẽ xem; họ có thể xuống phòng kiểm cùng bạn.',
                    ))
            : t('Saved. You can continue later before the deadline.', 'Đã lưu. Bạn có thể làm tiếp trước hạn.'),
      );
      if (submit) await widget.reload();
    } on ApiException catch (e) {
      setState(() => _errors = e.fields);
      if (e.fields.isEmpty) toast(e.message, error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Widget _photoButton(String? itemId) => TextButton.icon(
    onPressed: _uploading != null ? null : () => _photo(itemId),
    icon: _uploading == (itemId ?? 'meters')
        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
        : const Icon(Icons.photo_camera_outlined, size: 18),
    label: Text(_uploading == (itemId ?? 'meters') ? t('Uploading…', 'Đang tải lên…') : t('Add photo', 'Thêm ảnh')),
  );

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final items = d.objects('items');
    final max = (d.number('maxPhotos') ?? 3).toInt();
    final answered = _answers.values.where((v) => v != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 10,
            children: [
              _head(
                Icons.assignment_outlined,
                t('Check-in inventory · Room ${d.text('room')}', 'Kiểm kê nhận phòng · Phòng ${d.text('room')}'),
                t(
                  'Due ${moment(d.str('dueAt'))}. $answered of ${items.length} items answered.',
                  'Hạn ${moment(d.str('dueAt'))}. Đã khai $answered/${items.length} món.',
                ),
              ),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: items.isEmpty ? 0 : answered / items.length,
                  minHeight: 6,
                  backgroundColor: Tokens.subtle,
                  color: Tokens.primary,
                ),
              ),
            ],
          ),
        ),
        Alert(
          tone: Tone.info,
          title: t('Fill it in at the Room', 'Hãy khai khi đang ở phòng'),
          body: t(
            'Your answers are compared with the Room\'s record. A large difference brings Staff to the Room to check it with you, and the inventory you make together is the one that counts.',
            'Câu trả lời của bạn được so với tình trạng đã ghi nhận của phòng. Lệch lớn thì nhân viên sẽ xuống phòng kiểm cùng bạn, và biên bản lập chung đó mới là bản được dùng.',
          ),
        ),
        for (final i in items) _item(i, max, d.flag('photosRequired')),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: [
              _head(Icons.speed_outlined, t('Meters of the Room', 'Công tơ của phòng'), null),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Expanded(
                    child: Input(
                      controller: _electricity,
                      label: '${t('Electricity (kWh)', 'Điện (kWh)')} *',
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      error: _errors['electricity'],
                    ),
                  ),
                  Expanded(
                    child: Input(
                      controller: _water,
                      label: '${t('Water (m³)', 'Nước (m³)')} *',
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      error: _errors['water'],
                    ),
                  ),
                ],
              ),
              if (d.objects('meterPhotos').isNotEmpty) _Photos(photos: d.objects('meterPhotos'), onRemove: _remove),
              if (d.objects('meterPhotos').length < max)
                Align(alignment: Alignment.centerLeft, child: _photoButton(null)),
              Text(
                d.flag('photosRequired')
                    ? t(
                        'Photos are required for the meters and for Damaged or Missing items.',
                        'Bắt buộc chụp ảnh công tơ và các món Hư hỏng hoặc Thiếu.',
                      )
                    : t(
                        'Photos are optional but help if something is damaged.',
                        'Ảnh không bắt buộc nhưng sẽ giúp bạn nếu có món bị hỏng.',
                      ),
                style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
              ),
            ],
          ),
        ),
        if (_errors['items'] != null) Note(_errors['items']!, error: true),
        Row(
          spacing: 10,
          children: [
            Expanded(
              child: BusyButton(
                label: t('Save draft', 'Lưu nháp'),
                outlined: true,
                busy: _busy,
                onPressed: () => _send(false),
              ),
            ),
            Expanded(
              child: BusyButton(
                label: t('Submit inventory', 'Nộp biên bản'),
                busy: _busy,
                onPressed: () => _send(true),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// One item: its name and place, the four conditions as chips (the guide one tap away), the roommate's answer, a
  /// note when it is not good, and its photos.
  Widget _item(Json i, int max, bool photosRequired) {
    final id = i.text('itemId');
    final value = _answers[id];
    return Panel(
      border: value == null ? null : _tone(value).mark.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 10,
            children: [
              _chip(Icons.chair_outlined, bg: Tokens.subtle, fg: Tokens.fgSecondary),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(furnitureName(i), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(_where(i), style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
                  ],
                ),
              ),
              if (value != null) Icon(Icons.check_circle, size: 20, color: Tone.success.mark),
            ],
          ),
          if (i.str('roommateCondition') != null)
            Note(
              t(
                'Your roommate recorded it as ${_name(i.str('roommateCondition'), _levels)}. Choose the same if it is right, or what you see.',
                'Bạn cùng phòng đã ghi món này là ${_name(i.str('roommateCondition'), _levels)}. Chọn giống vậy nếu đúng, hoặc chọn theo những gì bạn thấy.',
              ),
            ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in _conditions)
                ChoiceChip(
                  label: Text(_name(c, _levels)),
                  selected: value == c,
                  showCheckmark: false,
                  selectedColor: _tone(c).bg,
                  side: BorderSide(color: value == c ? _tone(c).mark : Tokens.line),
                  labelStyle: TextStyle(
                    color: value == c ? _tone(c).fg : Tokens.fg,
                    fontWeight: value == c ? FontWeight.w600 : FontWeight.w400,
                  ),
                  onSelected: (_) => setState(() => _answers[id] = c),
                ),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
              onPressed: () async {
                final picked = await _Guide.show(
                  context,
                  item: i,
                  value: value,
                  levels: _levels,
                  photosRequired: photosRequired,
                );
                if (picked != null) setState(() => _answers[id] = picked);
              },
              icon: const Icon(Icons.help_outline, size: 17),
              label: Text(t('Which condition?', 'Chọn mức độ nào?')),
            ),
          ),
          if (value == 'Worn' || value == 'Damaged' || value == 'Missing')
            Input(controller: _notes[id]!, label: t('What do you see?', 'Bạn thấy gì?')),
          if (i.objects('photos').isNotEmpty) _Photos(photos: i.objects('photos'), onRemove: _remove),
          if (i.objects('photos').length < max) Align(alignment: Alignment.centerLeft, child: _photoButton(id)),
        ],
      ),
    );
  }
}

/// The filed inventory (web `Summary`): its steps, the Final report, what the student recorded and, after a Room
/// visit, what was checked with Staff; the meters; agreeing with Staff's record; a late report.
class _Summary extends StatefulWidget {
  const _Summary({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  State<_Summary> createState() => _SummaryState();
}

class _SummaryState extends State<_Summary> {
  final _comment = TextEditingController();
  final _late = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    _late.dispose();
    super.dispose();
  }

  Future<void> _post(String path, Map<String, dynamic> body, String success) async {
    setState(() => _busy = true);
    final done = await attempt(() => Api.post(path, body), success: success);
    if (mounted) setState(() => _busy = false);
    if (done != null) await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final status = d.str('status');
    final levels = d.objects('conditionLevels');
    final visited = d['staffElectricity'] != null || d.objects('items').any((i) => i.str('staffCondition') != null);
    final subtitle = switch (status) {
      'Final' => t(
        'Recorded (${_source(d.str('source'))}) on ${moment(d.str('finalizedAt'))}. Utility is counted from ${moment(d.str('utilityFrom'))}.',
        'Đã ghi nhận (${_source(d.str('source'))}) lúc ${moment(d.str('finalizedAt'))}. Điện nước tính từ ${moment(d.str('utilityFrom'))}.',
      ),
      'Verifying' when d.flag('toAgree') => t(
        'Staff recorded what they found in the Room. Read it and agree.',
        'Nhân viên đã ghi nhận thực tế tại phòng. Hãy xem và bấm đồng ý.',
      ),
      'Verifying' => t(
        'Staff will check the Room with you${d.str('visitAt') == null ? '' : ' ${moment(d.str('visitAt'))}'}.',
        'Nhân viên sẽ xuống kiểm tra phòng cùng bạn${d.str('visitAt') == null ? '' : ' ${moment(d.str('visitAt'))}'}.',
      ),
      _ => t(
        'Submitted ${moment(d.str('submittedAt'))}. Staff are looking at it.',
        'Đã nộp lúc ${moment(d.str('submittedAt'))}. Nhân viên đang xem.',
      ),
    };
    final steps = [
      (t('Started (door code received)', 'Bắt đầu (đã nhận mã cửa)'), d.str('openedAt')),
      (t('Submitted', 'Đã nộp'), d.str('submittedAt')),
      (t('Room visit with Staff', 'Hẹn kiểm tra cùng nhân viên'), d.str('visitAt')),
      (t('Final', 'Đã chốt'), d.str('finalizedAt')),
    ].where((s) => s.$2 != null).toList();
    const head = TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Tokens.fgSecondary);

    Widget meter(String name, Object? value, Object? staff) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 2,
          children: [
            Text(name, style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary)),
            Text('${value ?? '—'}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            if (visited && staff != null)
              Text(
                t('Checked with Staff: $staff', 'Kiểm cùng nhân viên: $staff'),
                style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary),
              ),
          ],
        ),
      ),
    );

    Widget labelled(String name, String? condition) => Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 6,
      children: [
        Text(name, style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary)),
        condition == null
            ? const Text('—', style: TextStyle(color: Tokens.fgTertiary))
            : Tag(_name(condition, levels), tone: _tone(condition)),
      ],
    );

    Widget tag(String? condition) => condition == null
        ? const Text('—', style: TextStyle(color: Tokens.fgTertiary))
        : Align(
            alignment: Alignment.centerLeft,
            child: Tag(_name(condition, levels), tone: _tone(condition)),
          );

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 14,
        children: [
          _head(
            Icons.assignment_turned_in_outlined,
            t('Check-in inventory · Room ${d.text('room')}', 'Kiểm kê nhận phòng · Phòng ${d.text('room')}'),
            subtitle,
            trailing: Tag(switch (status) {
              'Final' => t('Final', 'Đã chốt'),
              'Verifying' => t('Verifying', 'Chờ xác minh'),
              'Submitted' => t('Submitted', 'Đã nộp'),
              _ => label(status),
            }, tone: status == 'Final' ? Tone.success : Tone.info),
          ),
          if (status == 'Final')
            Alert(
              tone: Tone.success,
              title: t(
                'Final report: your handover record until check-out',
                'Báo cáo Final: biên bản bàn giao của bạn đến khi trả phòng',
              ),
              body: t(
                'This is the final, signed record of your Room (${_source(d.str('source'))}). Keep it: at check-out Staff compare each item with it, and only what got worse since is charged. Damage recorded here is never charged to you.',
                'Đây là biên bản bàn giao đã chốt cuối cùng của phòng bạn (${_source(d.str('source'))}). Hãy giữ lại: khi trả phòng, nhân viên đối chiếu từng món với biên bản này và chỉ tính phần xấu đi sau đó. Hư hỏng đã ghi ở đây không bao giờ bị tính cho bạn.',
              ),
            ),
          if (steps.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              decoration: BoxDecoration(
                color: Tokens.subtle.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Milestones(
                items: [
                  for (final (name, at) in steps) (title: name, text: '', time: moment(at), done: true, current: false),
                ],
              ),
            ),
          // What the student recorded per item and, after a visit, what was checked with Staff.
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Tokens.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  color: Tokens.subtle.withValues(alpha: 0.7),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text(t('Items of the Room', 'Đồ đạc trong phòng'), style: head),
                ),
                for (final i in d.objects('items')) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 6,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(furnitureName(i), style: const TextStyle(fontWeight: FontWeight.w500)),
                            Text(_where(i), style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary)),
                          ],
                        ),
                        // What the student recorded and, after a visit, what was checked with Staff; the tags wrap.
                        Wrap(
                          spacing: 14,
                          runSpacing: 6,
                          children: [
                            labelled(t('You recorded', 'Bạn khai'), i.str('condition')),
                            if (visited)
                              labelled(t('Checked with Staff', 'Kiểm cùng nhân viên'), i.str('staffCondition')),
                          ],
                        ),
                        if (i.str('note') != null || i.str('staffNote') != null)
                          Text(
                            [
                              if (i.str('note') != null)
                                t('Your note: ${i.text('note')}', 'Ghi chú của bạn: ${i.text('note')}'),
                              if (i.str('staffNote') != null)
                                t('Staff: ${i.text('staffNote')}', 'Nhân viên: ${i.text('staffNote')}'),
                            ].join(' · '),
                            style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                          ),
                        _Photos(photos: i.objects('photos'), empty: t('No photo', 'Không có ảnh')),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(t('Meters of the Room', 'Công tơ của phòng'), style: const TextStyle(fontWeight: FontWeight.w600)),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 10,
              children: [
                meter(t('Electricity (kWh)', 'Điện (kWh)'), d['electricity'], d['staffElectricity']),
                meter(t('Water (m³)', 'Nước (m³)'), d['water'], d['staffWater']),
              ],
            ),
          ),
          _Photos(photos: d.objects('meterPhotos'), empty: t('No photo of the meters', 'Không có ảnh công tơ')),
          if (d.flag('toAgree')) ...[
            Input(
              controller: _comment,
              label: t('Comment (optional)', 'Ý kiến (không bắt buộc)'),
              helper: t(
                'If you still see something differently, write it here: it is kept with the inventory and read at check-out.',
                'Nếu bạn vẫn thấy khác, hãy ghi ở đây: ý kiến được lưu cùng biên bản và được xem khi trả phòng.',
              ),
              lines: 2,
              onChanged: (_) => setState(() {}),
            ),
            BusyButton(
              label: _comment.text.trim().isNotEmpty
                  ? t('Agree with my comment', 'Đồng ý kèm ý kiến')
                  : t('Agree', 'Đồng ý'),
              icon: Icons.check_circle_outline,
              busy: _busy,
              onPressed: () => _post(
                '/students/me/handover/agree',
                {if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim()},
                t(
                  'Inventory final. Utility is counted from the meters recorded with Staff.',
                  'Biên bản đã chốt. Điện nước được tính từ chỉ số ghi cùng nhân viên.',
                ),
              ),
            ),
          ],
          if (d.flag('lateAllowed')) ...[
            const Divider(height: 1),
            Input(
              controller: _late,
              label: t('Report something you found late', 'Báo cáo trễ điều bạn phát hiện'),
              helper: t(
                'The deadline passed, so the Room\'s record is used. Staff decide whether it was there before you.',
                'Đã quá hạn nên hệ thống dùng tình trạng đã ghi nhận của phòng. Nhân viên sẽ quyết định món đó có từ trước khi bạn vào hay không.',
              ),
              lines: 2,
              onChanged: (_) => setState(() {}),
            ),
            BusyButton(
              label: t('Send late report', 'Gửi báo cáo trễ'),
              outlined: true,
              busy: _busy,
              onPressed: _late.text.trim().isEmpty
                  ? null
                  : () => _post(
                      '/students/me/handover/late',
                      {'note': _late.text.trim()},
                      t(
                        'Late report sent. Staff decide whether it was there before you.',
                        'Đã gửi báo cáo trễ. Nhân viên sẽ quyết định món đó có từ trước khi bạn vào hay không.',
                      ),
                    ),
            ),
          ],
          if (d.str('lateNote') != null)
            Alert(tone: Tone.info, title: t('Your late report', 'Báo cáo trễ của bạn'), body: d.text('lateNote')),
          if (d.str('studentComment') != null)
            Alert(tone: Tone.info, title: t('Your comment', 'Ý kiến của bạn'), body: d.text('studentComment')),
        ],
      ),
    );
  }
}

/// The furniture charges of a check-out (web `FurnitureCharges`): the damage Staff ask the student to confirm, the
/// final meters, each item from check-in to check-out with its price and percent, the total, the Utility Deposit
/// settlement, and agreeing at the desk.
class _Charges extends StatelessWidget {
  const _Charges({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  Future<void> _answer(String id, bool acknowledge) async {
    final done = await attempt(
      () => Api.post('/students/me/damage-claims/${Uri.encodeComponent(id)}', {'acknowledge': acknowledge}),
      success: acknowledge
          ? t(
              'Damage confirmed. It is charged at check-out.',
              'Đã xác nhận hư hỏng. Khoản này được tính khi trả phòng.',
            )
          : t('Damage declined. You are not charged for it.', 'Đã từ chối hư hỏng. Bạn không bị tính khoản này.'),
    );
    if (done != null) await reload();
  }

  @override
  Widget build(BuildContext context) {
    final pending = data.objects('claims').where((c) => c.str('status') == 'Pending').toList();
    if (!data.flag('saved') && pending.isEmpty) return const SizedBox.shrink();
    final levels = data.objects('conditionLevels');
    final s = data.obj('settlement');
    final items = data.objects('items');

    Widget amountLine(String name, String value, {Color? color, bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(name, style: TextStyle(fontSize: 13.5, color: strong ? Tokens.fg : Tokens.fgSecondary)),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: strong ? 16 : 13.5,
              fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );

    Widget meter(String name, Object? value) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(12)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 2,
          children: [
            Text(name, style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary)),
            Text('${value ?? '—'}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );

    Widget line(Json i) => Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 6,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(furnitureName(i), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(_where(i), style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary)),
                  ],
                ),
              ),
              Text(money(i.number('amount')), style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Tag(_name(i.str('atCheckIn') ?? 'Good', levels), tone: _tone(i.str('atCheckIn') ?? 'Good')),
              const Icon(Icons.arrow_forward, size: 14, color: Tokens.fgTertiary),
              Tag(_name(i.str('atCheckOut'), levels), tone: _tone(i.str('atCheckOut'))),
              if (i.str('review') != null)
                Tag(switch (i.str('review')) {
                  'Pending' => t('Pending', 'Đang chờ'),
                  'Kept' => t('Kept', 'Giữ nguyên'),
                  'Dropped' => t('Dropped', 'Bỏ'),
                  _ => label(i.str('review')),
                }, dot: false),
            ],
          ),
          Text(
            '${t('Real price', 'Giá thực')} ${money(i.number('unitPrice') ?? 0)} × ${i.number('percent') ?? 0}%',
            style: const TextStyle(fontSize: 12.5, color: Tokens.fgSecondary),
          ),
          if (i.str('note') != null)
            Text(
              '${t('Note', 'Ghi chú')}: ${i.text('note')}',
              style: const TextStyle(fontSize: 12.5, color: Tokens.fgSecondary),
            ),
        ],
      ),
    );

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          _head(
            Icons.chair_outlined,
            t('Furniture charges', 'Tiền đền nội thất'),
            t(
              'Only what got worse while you lived here is charged; items that were already damaged and normal wear are not.',
              'Chỉ tính phần xấu đi trong thời gian bạn ở; món hỏng từ trước và hao mòn tự nhiên không bị tính.',
            ),
          ),
          for (final c in pending)
            Alert(
              tone: Tone.warning,
              title: t(
                'Did you damage ${c.text('type')} ${c.text('assetCode')}?',
                'Bạn có làm hỏng ${c.text('type')} ${c.text('assetCode')} không?',
              ),
              body: t(
                'Staff recorded it as ${_name(c.str('condition'), levels)}. If it was you, confirm by ${moment(c.str('dueAt'))}: ${money(c.number('amount'))} is charged at check-out. Otherwise decline: nobody is charged.',
                'Nhân viên ghi nhận món này là ${_name(c.str('condition'), levels)}. Nếu đúng do bạn, hãy xác nhận trước ${moment(c.str('dueAt'))}: ${money(c.number('amount'))} sẽ được tính khi trả phòng. Nếu không, hãy từ chối: không ai bị tính.',
              ),
              action: Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _answer(c.text('id'), false),
                      child: Text(t('Decline', 'Từ chối')),
                    ),
                  ),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _answer(c.text('id'), true),
                      child: Text(t('Confirm', 'Xác nhận')),
                    ),
                  ),
                ],
              ),
            ),
          if (data.flag('saved')) ...[
            if (data['electricity'] != null || data['water'] != null) ...[
              Text(
                t('1. Final meter reading', '1. Chỉ số công tơ cuối'),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Row(
                spacing: 10,
                children: [
                  meter(t('Electricity (kWh)', 'Điện (kWh)'), data['electricity']),
                  meter(t('Water (m³)', 'Nước (m³)'), data['water']),
                ],
              ),
            ],
            if (items.isNotEmpty)
              Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Tokens.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var n = 0; n < items.length; n++) ...[if (n > 0) const Divider(height: 1), line(items[n])],
                  ],
                ),
              ),
            amountLine(t('Total', 'Tổng'), money(data.number('total')), strong: true),
            if (s != null)
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Tokens.subtle.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Tokens.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      t('3. Utility Deposit settlement', '3. Quyết toán cọc điện nước').toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                        color: Tokens.fgSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    amountLine(t('Utility Deposit held', 'Cọc điện nước đang giữ'), money(s.number('held'))),
                    amountLine(
                      '${t('Final Utility share', 'Phần điện nước cuối')}${s.str('periodLabel') == null ? '' : ' (${s.text('periodLabel')})'}',
                      '− ${money(s.number('share'))}',
                    ),
                    if ((s.number('unpaid') ?? 0) > 0)
                      amountLine(
                        t('Unpaid Utility Invoices', 'Hóa đơn điện nước chưa thanh toán'),
                        '− ${money(s.number('unpaid'))}',
                      ),
                    amountLine(
                      t('Damage charge', 'Phí hư hỏng'),
                      '− ${money(s.number('damage'))}',
                      color: Tone.warning.fg,
                    ),
                    const Divider(height: 14),
                    amountLine(
                      (s.number('refund') ?? 0) >= 0
                          ? t('Refund to you', 'Hoàn cho bạn')
                          : t('You still owe', 'Bạn còn nợ'),
                      money((s.number('refund') ?? 0).abs()),
                      strong: true,
                      color: (s.number('refund') ?? 0) >= 0 ? Tone.success.fg : Tone.error.fg,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (s.number('refund') ?? 0) >= 0
                          ? t('The refund goes to a Manager for approval.', 'Khoản hoàn sẽ được gửi Quản lý duyệt.')
                          : t('The rest will be invoiced to you.', 'Số tiền thiếu sẽ được lập hóa đơn cho bạn.'),
                      style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
                    ),
                  ],
                ),
              ),
            if (data.flag('studentPresent') && data.str('agreedAt') == null)
              BusyButton(
                label: t('Agree with the charges', 'Đồng ý với khoản đền'),
                icon: Icons.check_circle_outline,
                onPressed: () async {
                  final done = await attempt(
                    () => Api.post('/students/me/check-out/agree'),
                    success: t(
                      'Agreed. Staff can complete your check-out.',
                      'Đã đồng ý. Nhân viên có thể hoàn tất trả phòng cho bạn.',
                    ),
                  );
                  if (done != null) await reload();
                },
              ),
            if (data.str('agreedAt') != null)
              Text(
                t(
                  'You agreed on ${moment(data.str('agreedAt'))}.',
                  'Bạn đã đồng ý lúc ${moment(data.str('agreedAt'))}.',
                ),
                style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
              ),
          ],
        ],
      ),
    );
  }
}
