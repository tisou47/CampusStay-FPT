// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'handover.dart';

/// Check-out (the student's side of the check-out at the desk, mirroring the check-in inventory): the check-out period
/// (the stay's end and the day to check out by), the student's check-out declaration of each item of the Bed and the
/// shared items (Good by default; worn, damaged or missing with a note), Staff's check at the desk, the furniture
/// charges with the Utility Deposit settlement to answer, and the end (checked out, the refund).
/// `GET /students/me/allocation`, `GET /students/me/furniture`, `PUT /students/me/furniture/report`,
/// `GET /students/me/check-out` (+ `/agree`, `/students/me/damage-claims/{id}` through [FurnitureCharges]).
class CheckOutScreen extends StatelessWidget {
  const CheckOutScreen({super.key});

  static Future<Json?> _optional(String path) async {
    try {
      return await Api.get(path);
    } on ApiException {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Check-out', 'Trả phòng'),
      body: Loader<List<Json?>>(
        fetch: () => Future.wait([
          _optional('/students/me/allocation'),
          _optional('/students/me/furniture'),
          _optional('/students/me/check-out'),
        ]),
        builder: (context, d, reload) => _CheckOut(allocation: d[0], furniture: d[1], charges: d[2], reload: reload),
      ),
    );
  }
}

class _CheckOut extends StatefulWidget {
  const _CheckOut({required this.allocation, required this.furniture, required this.charges, required this.reload});

  final Json? allocation;
  final Json? furniture;
  final Json? charges;
  final Future<void> Function() reload;

  @override
  State<_CheckOut> createState() => _CheckOutState();
}

class _CheckOutState extends State<_CheckOut> {
  /// The Room's items, replaced by the API's answer after a declaration.
  late List<Json> _items = widget.furniture?.objects('items') ?? const [];

  /// Bumped after a save, so the declaration starts again from what the API now holds.
  int _version = 0;

  /// What the declaration and the meter card hold now (they report it), for the Submit card.
  _DeclStatus? _decl;
  _MeterStatus? _meters;

  @override
  void didUpdateWidget(covariant _CheckOut old) {
    super.didUpdateWidget(old);
    if (!identical(old.furniture, widget.furniture)) {
      _items = widget.furniture?.objects('items') ?? const [];
      _version++;
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.allocation;
    final c = widget.charges;
    if (a == null && c == null) {
      return Cards(
        children: [
          EmptyState(
            icon: Icons.logout_rounded,
            title: t('No stay to check out of', 'Chưa có phòng để trả'),
            body: t(
              'Check-out opens when your stay ends or your contract is terminated.',
              'Thủ tục trả phòng mở khi kỳ ở kết thúc hoặc hợp đồng bị chấm dứt.',
            ),
          ),
        ],
      );
    }
    final termination = a?.obj('termination');
    final next = a?.obj('nextTerm');
    final leaving = termination != null || next?.str('state') == 'Not continuing';
    final saved = c?.flag('saved') ?? false;
    final claims = c?.objects('claims').where((x) => x.str('status') == 'Pending').length ?? 0;
    final agreed = c?.str('agreedAt') != null;
    final checkedOut = termination?.str('status') == 'Checked out' || c?.str('checkedOutAt') != null;
    final declared = _items.where((i) => i.str('reportedCondition') != null).length;
    final submittedAt = c?.str('declarationSubmittedAt');
    final locked = saved || checkedOut || submittedAt != null;

    return Cards(
      children: [
        if (checkedOut) _Done(charges: c),
        _Period(allocation: a, leaving: leaving, checkedOut: checkedOut, agreed: agreed),
        _Steps(
          declared: declared,
          submittedAt: submittedAt,
          saved: saved,
          claims: claims,
          agreed: agreed,
          checkedOut: checkedOut,
        ),
        if (!saved && !checkedOut) _StaffCheck(declared: declared, submittedAt: submittedAt),
        if (claims > 0)
          Alert(
            tone: Tone.warning,
            title: t('Confirm or decline the damage', 'Xác nhận hoặc từ chối hư hỏng'),
            body: t(
              'Staff ask you to confirm damage to a shared item. Answer it in the charges below.',
              'Nhân viên đề nghị bạn xác nhận hư hỏng một món đồ chung. Hãy trả lời ở phần khoản đền bên dưới.',
            ),
          )
        else if (saved && !agreed && !checkedOut && c?.obj('dispute')?.str('status') != 'Open')
          Alert(
            tone: Tone.warning,
            title: t('Read the charges and agree', 'Hãy xem khoản đền và bấm đồng ý'),
            body: t(
              'Staff can complete your check-out once you agree.',
              'Nhân viên hoàn tất trả phòng sau khi bạn đồng ý.',
            ),
          ),
        if (c != null && (saved || claims > 0)) FurnitureCharges(data: c, reload: widget.reload),
        if (_items.isNotEmpty)
          _Declaration(
            key: ValueKey(_version),
            items: _items,
            levels: c?.objects('conditionLevels') ?? const [],
            locked: locked,
            changed: (items) => setState(() {
              _items = items;
              _version++;
            }),
            status: (v) {
              if (v != _decl) setState(() => _decl = v);
            },
          ),
        if (c != null && (!locked || c.obj('studentMeters')?.number('electricity') != null))
          _Meters(
            key: const ValueKey('meters'),
            data: c.obj('studentMeters') ?? const {},
            locked: locked,
            status: (v) {
              if (v != _meters) setState(() => _meters = v);
            },
          ),
        if (c != null && !locked) _Submit(declaration: _decl, meters: _meters, reload: widget.reload),
      ],
    );
  }
}

/// The check-out period: when the stay ends, the day to check out by and how long is left, and why the stay ends.
class _Period extends StatelessWidget {
  const _Period({required this.allocation, required this.leaving, required this.checkedOut, required this.agreed});

  final Json? allocation;
  final bool leaving;
  final bool checkedOut;
  final bool agreed;

  @override
  Widget build(BuildContext context) {
    final a = allocation;
    final term = a?.obj('term');
    final termination = a?.obj('termination');
    final next = a?.obj('nextTerm');
    final by = termination?.str('moveOutBy') ?? next?.obj('window')?.str('checkOutBy') ?? next?.str('checkOutBy');
    final byDay = by == null ? null : DateTime.tryParse(by.length >= 10 ? by.substring(0, 10) : by);
    final now = DateTime.now();
    final left = byDay?.difference(DateTime(now.year, now.month, now.day)).inDays;
    final reason = termination != null
        ? joinDot([label(termination.str('reason')), termination.str('note')])
        : (next?.str('endReason') == null ? null : label(next!.str('endReason')));

    final (String tag, Tone tone) = checkedOut
        ? (t('Checked out', 'Đã trả phòng'), Tone.success)
        : agreed
        ? (t('Charges agreed', 'Đã đồng ý khoản đền'), Tone.success)
        : left != null && left < 0
        ? (t('Overdue', 'Quá hạn'), Tone.error)
        : leaving
        ? (t('Check-out period', 'Đang trong kỳ trả phòng'), Tone.warning)
        : (t('Not yet', 'Chưa đến kỳ'), Tone.neutral);

    return Panel(
      border: left != null && left < 0 && !checkedOut ? Tone.error.mark.withValues(alpha: 0.5) : null,
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
                child: const Icon(Icons.logout_rounded, size: 19, color: Tokens.fgBrand),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      t('Check-out period', 'Kỳ trả phòng'),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    if (a?.str('room') != null)
                      Text(
                        roomBed(a!.str('room'), a.str('bed')),
                        style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                      ),
                  ],
                ),
              ),
              Tag(tag, tone: tone),
            ],
          ),
          if (term?.str('stayEnd') != null)
            InfoRow(
              icon: Icons.event_busy_outlined,
              name: t('Stay ends', 'Kỳ ở kết thúc'),
              value: day(term!.str('stayEnd')),
            ),
          if (by != null && !checkedOut)
            InfoRow(
              icon: Icons.event_outlined,
              name: t('Check out at the desk by', 'Trả phòng tại quầy trước'),
              value: left == null
                  ? day(by)
                  : '${day(by)} · ${left < 0
                        ? t('${-left} days late', 'trễ ${-left} ngày')
                        : left == 0
                        ? t('today', 'hôm nay')
                        : t('$left days left', 'còn $left ngày')}',
            ),
          if (reason != null && reason.isNotEmpty)
            InfoRow(icon: Icons.info_outline, name: t('Reason', 'Lý do'), value: reason),
          if (!leaving && !checkedOut)
            Text(
              t(
                'Your check-out period has not started. You can still declare an item that got worse during your stay.',
                'Chưa đến kỳ trả phòng. Bạn vẫn có thể kê khai món đồ bị xấu đi trong kỳ ở.',
              ),
              style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
            ),
        ],
      ),
    );
  }
}

/// The four steps of a check-out, like the check-in inventory's.
class _Steps extends StatelessWidget {
  const _Steps({
    required this.declared,
    required this.submittedAt,
    required this.saved,
    required this.claims,
    required this.agreed,
    required this.checkedOut,
  });

  final int declared;
  final String? submittedAt;
  final bool saved;
  final int claims;
  final bool agreed;
  final bool checkedOut;

  @override
  Widget build(BuildContext context) {
    final settled = agreed || checkedOut;
    return Section(
      title: t('Check-out steps', 'Các bước trả phòng'),
      children: [
        const SizedBox(height: 12),
        Milestones(
          items: [
            (
              title: t('Your furniture declaration', 'Bạn kê khai nội thất'),
              text: declared > 0
                  ? t(
                      '$declared items declared worn, damaged or missing.',
                      'Đã kê khai $declared món hao mòn, hư hỏng hoặc mất.',
                    )
                  : t(
                      'Photograph every item, declare what is not Good, enter the meters and submit.',
                      'Chụp ảnh mọi món, kê khai món không Tốt, nhập công tơ rồi nộp.',
                    ),
              time: submittedAt == null ? null : moment(submittedAt),
              done: submittedAt != null || saved || checkedOut,
              current: submittedAt == null && !saved && !checkedOut,
            ),
            (
              title: t('Staff check at the desk', 'Nhân viên kiểm tra'),
              text: t(
                'Final meter readings and each item against your check-in record and declaration.',
                'Ghi chỉ số công tơ cuối và đối chiếu từng món với biên bản nhận phòng và kê khai của bạn.',
              ),
              time: null,
              done: saved || checkedOut,
              current: submittedAt != null && !saved && !checkedOut,
            ),
            (
              title: t('Charges and deposit settlement', 'Khoản đền và quyết toán cọc'),
              text: t(
                'Nothing is charged if nothing got worse; otherwise it is taken from your Utility Deposit.',
                'Không hư hỏng thì không đền; nếu có, khoản đền được trừ vào cọc điện nước.',
              ),
              time: null,
              done: settled,
              current: saved && !settled,
            ),
            (
              title: t('Checked out', 'Hoàn tất trả phòng'),
              text: t(
                'The rest of the deposit is refunded to your refund account.',
                'Phần cọc còn lại được hoàn vào tài khoản nhận hoàn tiền.',
              ),
              time: null,
              done: checkedOut,
              current: agreed && !checkedOut,
            ),
          ],
        ),
      ],
    );
  }
}

/// The check-out declaration: every item of the student's Bed and the shared items, Good by default; a worn, damaged
/// or missing item with a note. Saves only what changed; read-only once Staff have checked the Room.
class _Declaration extends StatefulWidget {
  const _Declaration({
    super.key,
    required this.items,
    required this.levels,
    required this.locked,
    required this.changed,
    required this.status,
  });

  final List<Json> items;
  final List<Json> levels;
  final bool locked;
  final ValueChanged<List<Json>> changed;

  /// What it holds now: items with a photo, items, unsaved changes.
  final ValueChanged<_DeclStatus> status;

  @override
  State<_Declaration> createState() => _DeclarationState();
}

class _DeclarationState extends State<_Declaration> {
  late final List<Json> _reportable = widget.items
      .where((i) => i.str('itemId') != null && i['reportable'] != false)
      .toList();
  late final Map<String, String> _conditions = {
    for (final i in _reportable) i.text('itemId'): i.str('reportedCondition') ?? 'Good',
  };
  late final Map<String, TextEditingController> _notes = {
    for (final i in _reportable) i.text('itemId'): TextEditingController(text: i.text('reportedNote')),
  };

  /// What the API holds for each item: its condition and note.
  late final Map<String, (String, String)> _base = {
    for (final i in _reportable) i.text('itemId'): (i.str('reportedCondition') ?? 'Good', i.text('reportedNote')),
  };
  late final Map<String, List<Json>> _photos = {
    for (final i in _reportable) i.text('itemId'): [...i.objects('reportedPhotos')],
  };
  bool _busy = false;

  /// A submitted declaration is folded: it opens on request.
  bool _open = false;

  /// The item whose photo is uploading.
  String? _uploading;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    for (final n in _notes.values) {
      n.dispose();
    }
    super.dispose();
  }

  String _place(Json i) => i.flag('personal') && i.str('bed') != null
      ? t('Bed ${i.text('bed')}', 'Giường ${i.text('bed')}')
      : t('Shared', 'Dùng chung');

  bool _changed(Json i) {
    final id = i.text('itemId');
    final (was, wasNote) = _base[id]!;
    final now = _conditions[id]!;
    if (now != was) return true;
    return now != 'Good' && _notes[id]!.text.trim() != wasNote;
  }

  /// A worn, damaged or missing item without a photo (photos are required at check-out).
  bool _needsPhoto(Json i) {
    final id = i.text('itemId');
    return _conditions[id] != 'Good' && _photos[id]!.isEmpty;
  }

  /// Saves one item's declaration; resolves to the Room's items.
  Future<List<Json>> _put(String id) async {
    final note = _notes[id]!.text.trim();
    final condition = _conditions[id]!;
    final mine = await Api.put('/students/me/furniture/report', {
      'itemId': id,
      'condition': condition,
      if (condition != 'Good' && note.isNotEmpty) 'note': note,
    });
    _base[id] = (condition, condition == 'Good' ? '' : note);
    return mine.objects('items');
  }

  /// Takes a photo with the camera and adds it to the item's declaration (saved first when it changed).
  Future<void> _takePhoto(Json i) async {
    final id = i.text('itemId');
    final shot = await takePhoto();
    if (shot == null || !mounted) return;
    setState(() => _uploading = id);
    final photo = await attempt(
      () => Api.multipart('/students/me/furniture/report/photos', {'itemId': id}, [('photo', shot.path)]),
      success: t('Photo added', 'Đã thêm ảnh'),
    );
    if (!mounted) return;
    setState(() {
      _uploading = null;
      if (photo != null) _photos[id]!.add(photo);
    });
  }

  Future<void> _removePhoto(String id, String photoId) async {
    final ok = await confirm(
      context,
      title: t('Remove this photo?', 'Xoá ảnh này?'),
      yes: t('Remove', 'Xoá'),
      no: t('Back', 'Quay lại'),
      danger: true,
    );
    if (!ok) return;
    final done = await attempt(
      () => Api.delete('/students/me/furniture/report/photos/${Uri.encodeComponent(photoId)}'),
    );
    if (done != null && mounted) setState(() => _photos[id]!.removeWhere((p) => p.text('id') == photoId));
  }

  Future<void> _save() async {
    final changed = _reportable.where(_changed).toList();
    if (changed.isEmpty) return;
    setState(() {
      _busy = true;
      _errors = const {};
    });
    List<Json>? latest;
    try {
      for (final i in changed) {
        latest = await _put(i.text('itemId'));
      }
      toast(
        t(
          'Check-out declaration saved. Staff check it at the desk.',
          'Đã lưu kê khai trả phòng. Nhân viên sẽ đối chiếu tại quầy.',
        ),
      );
      if (latest != null) widget.changed(latest);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errors = e.fields;
      });
      if (e.fields.isEmpty) toast(e.message, error: true);
      if (latest != null) widget.changed(latest);
    }
  }

  Widget _item(Json i) {
    final id = i.text('itemId');
    final condition = _conditions[id]!;
    final locked = widget.locked;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: condition == 'Good' ? Tokens.surface : conditionTone(condition).bg.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: condition == 'Good' ? Tokens.line : conditionTone(condition).mark.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          Row(
            spacing: 8,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(furnitureName(i), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(
                      joinDot([_place(i), i.str('assetCode')]),
                      style: const TextStyle(fontSize: 12.5, color: Tokens.fgSecondary),
                    ),
                  ],
                ),
              ),
              if (locked) Tag(conditionName(condition, widget.levels), tone: conditionTone(condition)),
            ],
          ),
          if (!locked)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in furnitureConditions)
                  ChoiceChip(
                    label: Text(conditionName(c, widget.levels)),
                    selected: condition == c,
                    showCheckmark: false,
                    selectedColor: conditionTone(c).bg,
                    side: BorderSide(color: condition == c ? conditionTone(c).mark : Tokens.line),
                    labelStyle: TextStyle(
                      color: condition == c ? conditionTone(c).fg : Tokens.fg,
                      fontWeight: condition == c ? FontWeight.w600 : FontWeight.w400,
                    ),
                    onSelected: (_) => setState(() => _conditions[id] = c),
                  ),
              ],
            ),
          if (condition != 'Good' && !locked)
            Input(
              controller: _notes[id]!,
              label: t('Note', 'Ghi chú'),
              hint: t('e.g. Broken chair leg, missing locker key…', 'Ví dụ: Gãy chân ghế, mất chìa khóa tủ…'),
              maxLength: 300,
              error: _errors['note'],
              onChanged: (_) => setState(() {}),
            )
          else if (condition != 'Good' && i.str('reportedNote') != null)
            Text(i.text('reportedNote'), style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
          if (_photos[id]!.isNotEmpty)
            PhotoThumbs(photos: _photos[id]!, onRemove: locked ? null : (photoId) => _removePhoto(id, photoId)),
          if (!locked)
            OutlinedButton.icon(
              onPressed: _uploading == null ? () => _takePhoto(i) : null,
              icon: _uploading == id
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.photo_camera_outlined, size: 18),
              label: Text(
                _photos[id]!.isEmpty ? t('Take a photo', 'Chụp ảnh') : t('Take another photo', 'Chụp thêm ảnh'),
              ),
            ),
          if (!locked && _photos[id]!.isEmpty)
            Note(t('Take at least one photo of this item.', 'Cần chụp ít nhất 1 ảnh cho món này.'), error: true),
        ],
      ),
    );
  }

  /// A small figure of the submitted declaration.
  Widget _stat(IconData icon, String value, String name, {Tone? tone}) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(color: tone?.bg ?? Tokens.subtle, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 4,
        children: [
          Icon(icon, size: 18, color: tone?.fg ?? Tokens.fgSecondary),
          Text(
            value,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: tone?.fg ?? Tokens.fg),
          ),
          Text(name, style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary)),
        ],
      ),
    ),
  );

  /// Opens or folds the items of the submitted declaration.
  Widget _toggle() => InkWell(
    borderRadius: BorderRadius.circular(10),
    onTap: () => setState(() => _open = !_open),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _open ? t('Hide the items', 'Thu gọn') : t('See each item and its photos', 'Xem từng món và ảnh'),
              style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fgBrand),
            ),
          ),
          Icon(_open ? Icons.expand_less : Icons.expand_more, color: Tokens.fgBrand),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final mine = _reportable.where((i) => i.flag('personal')).toList();
    final shared = _reportable.where((i) => !i.flag('personal')).toList();
    final pending = _reportable.where(_changed).length;
    final missing = _reportable.where(_needsPhoto).length;
    final declared = _conditions.values.where((c) => c != 'Good').length;
    final status = (
      photographed: _reportable.where((i) => _photos[i.text('itemId')]!.isNotEmpty).length,
      total: _reportable.length,
      unsaved: pending,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.status(status);
    });

    Widget group(String title, List<Json> items) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Tokens.fgSecondary),
        ),
        for (final i in items) _item(i),
      ],
    );

    return Section(
      title: t('Check-out furniture report', 'Kê khai nội thất trả phòng'),
      subtitle: widget.locked
          ? t(
              'Your declaration is submitted and kept with the check-out record.',
              'Kê khai của bạn đã nộp và được lưu kèm biên bản trả phòng.',
            )
          : t(
              'Take a photo of every item before you leave. Leave it Good, or choose its condition and add a note.',
              'Chụp ảnh từng món trước khi rời đi. Để Tốt, hoặc chọn tình trạng và ghi chú.',
            ),
      trailing: widget.locked
          ? Tag(
              declared > 0 ? t('$declared not Good', '$declared món không Tốt') : t('All Good', 'Tất cả Tốt'),
              tone: declared > 0 ? Tone.warning : Tone.success,
            )
          : (declared > 0 ? Tag('$declared', tone: Tone.warning) : null),
      children: [
        const SizedBox(height: 12),
        if (widget.locked) ...[
          Row(
            spacing: 8,
            children: [
              _stat(Icons.inventory_2_outlined, '${_reportable.length}', t('Items', 'Món')),
              _stat(
                Icons.report_gmailerrorred_outlined,
                '$declared',
                t('Not Good', 'Không Tốt'),
                tone: declared > 0 ? Tone.warning : null,
              ),
              _stat(Icons.photo_camera_outlined, '${status.photographed}/${status.total}', t('With a photo', 'Có ảnh')),
            ],
          ),
          const SizedBox(height: 8),
          _toggle(),
        ],
        if (!widget.locked || _open)
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 16,
            children: [
              if (mine.isNotEmpty) group(t('Your Bed', 'Giường của bạn'), mine),
              if (shared.isNotEmpty) group(t('Shared items', 'Đồ dùng chung'), shared),
              if (_reportable.isEmpty)
                Text(
                  t('No items to declare.', 'Không có món nào để kê khai.'),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
              if (!widget.locked && missing > 0)
                Note(
                  t(
                    '$missing declared items still need a photo before you can save.',
                    'Còn $missing món đã kê khai chưa có ảnh, chưa thể lưu.',
                  ),
                  error: true,
                ),
              if (!widget.locked && _reportable.isNotEmpty && pending == 0)
                Row(
                  spacing: 8,
                  children: [
                    Icon(Icons.check_circle, size: 18, color: Tone.success.mark),
                    Expanded(
                      child: Text(
                        t(
                          'Saved. Take the photos still missing, then submit the declaration below.',
                          'Đã lưu. Chụp nốt ảnh còn thiếu rồi nộp kê khai ở bên dưới.',
                        ),
                        style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                      ),
                    ),
                  ],
                )
              else if (!widget.locked && _reportable.isNotEmpty)
                BusyButton(
                  label: t('Save declaration ($pending)', 'Lưu kê khai ($pending)'),
                  icon: Icons.save_outlined,
                  busy: _busy,
                  onPressed: missing == 0 ? _save : null,
                ),
            ],
          ),
      ],
    );
  }
}

/// Before Staff's check: what to bring and what happens at the desk.
class _StaffCheck extends StatelessWidget {
  const _StaffCheck({required this.declared, required this.submittedAt});

  final int declared;
  final String? submittedAt;

  @override
  Widget build(BuildContext context) {
    if (submittedAt != null) {
      return Alert(
        tone: Tone.success,
        title: t('Declaration submitted', 'Đã nộp kê khai trả phòng'),
        body: t(
          'Submitted ${moment(submittedAt)}. Come to the desk before the deadline with your keys; you get a notification when Staff record the charges.',
          'Đã nộp lúc ${moment(submittedAt)}. Hãy đến quầy trước hạn và mang theo chìa khóa; bạn sẽ nhận thông báo khi nhân viên ghi nhận khoản đền.',
        ),
      );
    }
    return Alert(
      tone: Tone.info,
      title: t('Waiting for Staff\'s check', 'Chờ nhân viên kiểm tra'),
      body: t(
        'Come to the desk before the deadline with your keys. Staff read the meters and compare each item with your check-in record${declared > 0 ? ' and your $declared declared items' : ''}. You get a notification when the charges are recorded.',
        'Hãy đến quầy trước hạn và mang theo chìa khóa. Nhân viên ghi chỉ số công tơ và đối chiếu từng món với biên bản nhận phòng${declared > 0 ? ' và $declared món bạn đã kê khai' : ''}. Bạn sẽ nhận thông báo khi khoản đền được ghi nhận.',
      ),
    );
  }
}

/// The end: checked out, and what is refunded from the Utility Deposit.
class _Done extends StatelessWidget {
  const _Done({required this.charges});

  final Json? charges;

  @override
  Widget build(BuildContext context) {
    final refund = charges?.obj('settlement')?.number('refund');
    final at = charges?.str('checkedOutAt');
    return Alert(
      tone: Tone.success,
      title: at == null
          ? t('Check-out completed', 'Trả phòng thành công')
          : t('Check-out completed · ${moment(at)}', 'Trả phòng thành công · ${moment(at)}'),
      body: refund != null && refund > 0
          ? t(
              '${money(refund)} of your Utility Deposit is refunded to your refund account.',
              '${money(refund)} tiền cọc điện nước được hoàn vào tài khoản nhận hoàn tiền của bạn.',
            )
          : refund != null && refund < 0
          ? t(
              'You still owe ${money(-refund)}: it is invoiced to you, see Payments.',
              'Bạn còn thiếu ${money(-refund)}: đã lập hóa đơn, xem ở mục Thanh toán.',
            )
          : t('Thank you for staying with us.', 'Cảm ơn bạn đã ở tại ký túc xá.'),
    );
  }
}

/// The meter readings the student enters before checking out, with photos of the meters; Staff compare them with
/// their own reading at the desk. `PUT /students/me/check-out/meters`, `POST|DELETE …/meters/photos`.
class _Meters extends StatefulWidget {
  const _Meters({super.key, required this.data, required this.locked, required this.status});

  final Json data;
  final bool locked;

  /// Whether the readings are saved and a photo of the meters is there.
  final ValueChanged<_MeterStatus> status;

  @override
  State<_Meters> createState() => _MetersState();
}

class _MetersState extends State<_Meters> {
  static String _text(num? n) => n == null ? '' : (n == n.roundToDouble() ? '${n.toInt()}' : '$n');

  late final _electricity = TextEditingController(text: _text(widget.data.number('electricity')));
  late final _water = TextEditingController(text: _text(widget.data.number('water')));
  late String _saved = '${_electricity.text}|${_water.text}';
  late final List<Json> _photos = [...widget.data.objects('photos')];
  bool _busy = false;
  bool _uploading = false;
  Map<String, String> _errors = const {};

  /// A meter reading, large, with its unit.
  Widget _reading(IconData icon, Color color, String name, String value, String unit) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
      child: Row(
        spacing: 10,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(9)),
            child: Icon(icon, size: 19, color: color),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary)),
                Text.rich(
                  TextSpan(
                    text: value.isEmpty ? '—' : value,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Tokens.fg),
                    children: [
                      TextSpan(
                        text: ' $unit',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Tokens.fgSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  @override
  void dispose() {
    _electricity.dispose();
    _water.dispose();
    super.dispose();
  }

  num? _number(TextEditingController c) => num.tryParse(c.text.trim().replaceAll(',', '.'));

  bool get _changed => '${_electricity.text}|${_water.text}' != _saved;

  Future<void> _save() async {
    final e = _number(_electricity);
    final w = _number(_water);
    final errors = <String, String>{
      if (e == null) 'electricity': t('Enter the electricity reading.', 'Hãy nhập chỉ số điện.'),
      if (w == null) 'water': t('Enter the water reading.', 'Hãy nhập chỉ số nước.'),
    };
    if (errors.isNotEmpty) {
      setState(() => _errors = errors);
      return;
    }
    setState(() {
      _busy = true;
      _errors = const {};
    });
    try {
      await Api.put('/students/me/check-out/meters', {'electricity': e, 'water': w});
      toast(t('Meter readings saved.', 'Đã lưu chỉ số công tơ.'));
      if (mounted) setState(() => _saved = '${_electricity.text}|${_water.text}');
    } on ApiException catch (x) {
      if (mounted) setState(() => _errors = x.fields);
      if (x.fields.isEmpty) toast(x.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _takePhoto() async {
    final shot = await takePhoto();
    if (shot == null || !mounted) return;
    setState(() => _uploading = true);
    final photo = await attempt(
      () => Api.multipart('/students/me/check-out/meters/photos', const {}, [('photo', shot.path)]),
      success: t('Photo added', 'Đã thêm ảnh'),
    );
    if (!mounted) return;
    setState(() {
      _uploading = false;
      if (photo != null) _photos.add(photo);
    });
  }

  Future<void> _removePhoto(String id) async {
    final ok = await confirm(
      context,
      title: t('Remove this photo?', 'Xoá ảnh này?'),
      yes: t('Remove', 'Xoá'),
      no: t('Back', 'Quay lại'),
      danger: true,
    );
    if (!ok) return;
    final done = await attempt(() => Api.delete('/students/me/check-out/meters/photos/${Uri.encodeComponent(id)}'));
    if (done != null && mounted) setState(() => _photos.removeWhere((p) => p.text('id') == id));
  }

  @override
  Widget build(BuildContext context) {
    final status = (
      saved: !_changed && _electricity.text.trim().isNotEmpty && _water.text.trim().isNotEmpty,
      photo: _photos.isNotEmpty,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.status(status);
    });
    final locked = widget.locked;
    return Section(
      title: t('Meter readings', 'Chỉ số công tơ điện nước'),
      trailing: locked ? Tag(t('Submitted', 'Đã nộp'), tone: Tone.success) : null,
      subtitle: locked
          ? t(
              'What you read before leaving. Staff compare it with their own reading.',
              'Chỉ số bạn đọc trước khi rời đi. Nhân viên đối chiếu với chỉ số họ ghi.',
            )
          : t(
              "Read the Room's meters before you leave and take a photo. Staff check them at the desk.",
              'Đọc chỉ số công tơ của phòng trước khi rời đi và chụp ảnh. Nhân viên sẽ đối chiếu tại quầy.',
            ),
      children: [
        const SizedBox(height: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            if (locked)
              Row(
                spacing: 10,
                children: [
                  _reading(
                    Icons.bolt_rounded,
                    const Color(0xFFF59E0B),
                    t('Electricity', 'Điện'),
                    _electricity.text,
                    'kWh',
                  ),
                  _reading(Icons.water_drop_rounded, const Color(0xFF0EA5E9), t('Water', 'Nước'), _water.text, 'm³'),
                ],
              )
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Expanded(
                    child: Input(
                      controller: _electricity,
                      label: t('Electricity (kWh)', 'Điện (kWh)'),
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      error: _errors['electricity'],
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  Expanded(
                    child: Input(
                      controller: _water,
                      label: t('Water (m³)', 'Nước (m³)'),
                      keyboard: const TextInputType.numberWithOptions(decimal: true),
                      error: _errors['water'],
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                ],
              ),
            if (_photos.isNotEmpty) ...[
              if (locked)
                Text(
                  t('Photos of the meters', 'Ảnh công tơ'),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Tokens.fgSecondary),
                ),
              PhotoThumbs(photos: _photos, onRemove: locked ? null : _removePhoto),
            ],
            if (!locked) ...[
              OutlinedButton.icon(
                onPressed: _uploading ? null : _takePhoto,
                icon: _uploading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.photo_camera_outlined, size: 18),
                label: Text(
                  _photos.isEmpty
                      ? t('Take a photo of the meters', 'Chụp ảnh công tơ')
                      : t('Take another photo', 'Chụp thêm ảnh'),
                ),
              ),
              if (_photos.isEmpty)
                Note(
                  t('Take a photo of the meters before saving.', 'Cần chụp ảnh công tơ trước khi lưu.'),
                  error: true,
                ),
              BusyButton(
                label: _changed ? t('Save readings', 'Lưu chỉ số') : t('Readings saved', 'Đã lưu chỉ số'),
                icon: Icons.save_outlined,
                busy: _busy,
                onPressed: _changed && _photos.isNotEmpty ? _save : null,
              ),
            ],
          ],
        ),
      ],
    );
  }
}

typedef _DeclStatus = ({int photographed, int total, int unsaved});
typedef _MeterStatus = ({bool saved, bool photo});

/// Submitting the check-out declaration: what is still missing, then the button (`POST /students/me/check-out/submit`).
/// It is final: Staff check the Room against it.
class _Submit extends StatefulWidget {
  const _Submit({required this.declaration, required this.meters, required this.reload});

  final _DeclStatus? declaration;
  final _MeterStatus? meters;
  final Future<void> Function() reload;

  @override
  State<_Submit> createState() => _SubmitState();
}

class _SubmitState extends State<_Submit> {
  bool _busy = false;

  Future<void> _submit() async {
    final ok = await confirm(
      context,
      title: t('Submit your check-out declaration?', 'Nộp kê khai trả phòng?'),
      body: t(
        'After this you cannot change the items, photos or meter readings.',
        'Sau khi nộp, bạn không thể sửa tình trạng, ảnh hay chỉ số công tơ nữa.',
      ),
      yes: t('Submit', 'Nộp'),
      no: t('Back', 'Quay lại'),
    );
    if (!ok) return;
    setState(() => _busy = true);
    final done = await attempt(
      () => Api.post('/students/me/check-out/submit', const {}),
      success: t('Check-out declaration submitted.', 'Đã nộp kê khai trả phòng.'),
    );
    if (mounted) setState(() => _busy = false);
    if (done != null) await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.declaration;
    final m = widget.meters;
    final photosDone = d != null && d.photographed == d.total;
    final saved = d != null && d.unsaved == 0;
    final metersDone = m != null && m.saved && m.photo;
    final ready = photosDone && saved && metersDone;

    Widget row(bool ok, String text) => Row(
      spacing: 8,
      children: [
        Icon(
          ok ? Icons.check_circle : Icons.radio_button_unchecked,
          size: 18,
          color: ok ? Tone.success.mark : Tokens.fgTertiary,
        ),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5))),
      ],
    );

    return Section(
      title: t('Submit the declaration', 'Nộp kê khai trả phòng'),
      subtitle: t('Staff check the Room against what you submit.', 'Nhân viên đối chiếu phòng với kê khai bạn nộp.'),
      children: [
        const SizedBox(height: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            row(
              photosDone,
              t(
                'A photo of every item (${d?.photographed ?? 0}/${d?.total ?? 0})',
                'Ảnh của mọi món (${d?.photographed ?? 0}/${d?.total ?? 0})',
              ),
            ),
            row(saved, t('Declaration saved', 'Đã lưu kê khai')),
            row(metersDone, t('Meter readings saved with a photo', 'Đã lưu chỉ số công tơ kèm ảnh')),
            const SizedBox(height: 4),
            BusyButton(
              label: t('Submit check-out declaration', 'Nộp kê khai trả phòng'),
              icon: Icons.send_outlined,
              busy: _busy,
              onPressed: ready ? _submit : null,
            ),
          ],
        ),
      ],
    );
  }
}
