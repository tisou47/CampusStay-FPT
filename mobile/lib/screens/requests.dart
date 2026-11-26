import 'dart:io';

// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'payments.dart';

/// Requests (web SCR-MNT-01, phone Activity › Requests): Maintenance and Room changes (next-Term requests: room
/// change, swap, extension, end of stay) with what each needs from the student — confirm a fix, pay, answer a
/// swap. `GET /students/me/requests?kind=maintenance|room-changes`.
class RequestsList extends StatefulWidget {
  const RequestsList({super.key, this.initial = 'maintenance'});

  final String initial;

  @override
  State<RequestsList> createState() => _RequestsListState();
}

class _RequestsListState extends State<RequestsList> {
  late String _kind = widget.initial;
  Key _key = UniqueKey();

  Future<void> _open(Widget page) async {
    await push(context, page);
    if (mounted) setState(() => _key = UniqueKey());
  }

  Future<void> _new() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (key, icon, text) in [
              ('maintenance', Icons.build_outlined, t('Report a problem', 'Báo hỏng')),
              ('room-change', Icons.swap_horiz, t('Change Room next Term', 'Đổi phòng kỳ sau')),
              ('swap', Icons.people_outline, t('Swap Beds for next Term', 'Đổi chỗ kỳ sau')),
            ])
              ListTile(leading: Icon(icon), title: Text(text), onTap: () => Navigator.pop(context, key)),
          ],
        ),
      ),
    );
    if (!mounted || choice == null) return;
    await _open(switch (choice) {
      'maintenance' => const NewMaintenanceScreen(),
      'room-change' => const NewRoomChangeScreen(),
      _ => const SwapScreen(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: Loader<Json>(
            key: ValueKey('$_kind$_key'),
            fetch: () => Api.get('/students/me/requests?kind=$_kind&pageSize=50'),
            builder: (context, d, reload) {
              final items = d.objects('items');
              final counts = d.obj('counts');
              final resolved = _kind == 'maintenance'
                  ? items.where(_canConfirm).firstOrNull
                  : null;
              return Cards(
                bottom: 96,
                children: [
                  Filters(
                    value: _kind,
                    onChanged: (v) => setState(() => _kind = v),
                    items: [
                      (
                        'maintenance',
                        '${t('Maintenance', 'Sửa chữa')}${counts?.number('maintenance') != null ? ' (${counts!.number('maintenance')})' : ''}',
                      ),
                      (
                        'room-changes',
                        '${t('Room changes', 'Đổi phòng')}${counts?.number('roomChanges') != null ? ' (${counts!.number('roomChanges')})' : ''}',
                      ),
                    ],
                  ),
                  if (resolved != null) _ConfirmFix(request: resolved, done: reload),
                  if (items.isEmpty)
                    _kind == 'maintenance'
                        ? EmptyState(
                            icon: Icons.build_outlined,
                            title: t('No maintenance requests', 'Chưa có yêu cầu sửa chữa'),
                            body: t(
                              'Report a problem in your Room and the maintenance staff will fix it.',
                              'Báo sự cố trong phòng để nhân viên kỹ thuật sửa.',
                            ),
                          )
                        : EmptyState(
                            icon: Icons.swap_horiz,
                            title: t('No room changes yet', 'Chưa có yêu cầu đổi phòng'),
                            body: t(
                              'Ask the dormitory office to move you to another Room, or agree a swap with another Student.',
                              'Đề nghị văn phòng KTX chuyển bạn sang phòng khác, hoặc thoả thuận đổi chỗ với sinh viên khác.',
                            ),
                          )
                  else
                    StatusList(
                      children: [
                        for (final r in items)
                          if (_kind == 'maintenance')
                            StatusRow(
                              icon: Icons.build_outlined,
                              title: r.text('title'),
                              note: r.str('visitWindow') != null
                                  ? t('Visit ', 'Lịch đến ') + r.text('visitWindow')
                                  : joinDot([label(r.str('location')), day(r.str('reportedAt'))]),
                              trailing: StatusChip(r.str('status')),
                              onTap: () => _open(MaintenanceScreen(id: r.text('id'))),
                            )
                          else
                            StatusRow(
                              icon: Icons.swap_horiz,
                              title: label(r.str('typeLabel')),
                              note: joinDot([
                                label(r.str('summary')),
                                if (r.obj('decision')?.str('note') != null) label(r.obj('decision')!.str('note')),
                              ]),
                              trailing: StatusChip(r.str('status')),
                              below: [
                                if (r.str('invoiceId') != null)
                                  _SmallButton(
                                    t('Pay', 'Thanh toán'),
                                    () => _open(InvoiceScreen(id: r.text('invoiceId'))),
                                  ),
                                if (r.str('invitationId') != null)
                                  _SmallButton(
                                    t('Answer', 'Trả lời'),
                                    () => _open(SwapInvitationScreen(id: r.text('invitationId'))),
                                  ),
                              ],
                            ),
                      ],
                    ),
                ],
              );
            },
          ),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: CreateButton(label: t('New request', 'Yêu cầu mới'), onPressed: _new),
        ),
      ],
    );
  }
}

/// A request the dormitory office opened in the student's Room (an inspection finding, `reportedByYou: false`) is
/// followed and, once Resolved, confirmed or reopened by any student living there.
bool _canConfirm(Json r) => r.str('status') == 'Resolved';

Widget _maintenanceStatus(Json r) => _canConfirm(r)
    ? Tag(t('Resolved · confirm the fix', 'Đã xử lý · hãy xác nhận'), tone: Tone.success)
    : StatusChip(r.str('status'));

/// Runs one answer at a time: [builder] gets whether one is running and the way to start one (MOB-25).
class _OneAtATime extends StatefulWidget {
  const _OneAtATime({required this.builder});

  final Widget Function(bool busy, Future<void> Function(Future<void> Function() action) run) builder;

  @override
  State<_OneAtATime> createState() => _OneAtATimeState();
}

class _OneAtATimeState extends State<_OneAtATime> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => widget.builder(_busy, _run);
}

class _SmallButton extends StatelessWidget {
  const _SmallButton(this.text, this.onPressed, {this.outlined = false});

  final String text;
  final VoidCallback? onPressed;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final style = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(0, 32)),
      padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 12)),
      visualDensity: VisualDensity.compact,
    );
    return outlined
        ? OutlinedButton(style: style, onPressed: onPressed, child: Text(text))
        : FilledButton(style: style, onPressed: onPressed, child: Text(text));
  }
}

/// "Is it fixed?" for the first Resolved request: confirm closes it, reopen sends it back.
/// `POST /maintenance-requests/{id}/confirm { fixed }`.
class _ConfirmFix extends StatefulWidget {
  const _ConfirmFix({required this.request, required this.done});

  final Json request;
  final Future<void> Function() done;

  @override
  State<_ConfirmFix> createState() => _ConfirmFixState();
}

class _ConfirmFixState extends State<_ConfirmFix> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    return Panel(
      color: Tone.success.bg,
      border: Tone.success.mark.withValues(alpha: 0.35),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Row(
            spacing: 8,
            children: [
              Icon(Icons.task_alt, size: 20, color: Tone.success.mark),
              Expanded(
                child: Text(
                  t('Is “${r.text('title')}” fixed?', '“${r.text('title')}” đã sửa xong chưa?'),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          Row(
            spacing: 8,
            children: [
              Expanded(
                child: BusyButton(
                  label: t('Reopen', 'Mở lại'),
                  outlined: true,
                  onPressed: _busy ? null : () => _confirm(false),
                ),
              ),
              Expanded(
                child: BusyButton(
                  label: t('Confirm fixed', 'Đã sửa xong'),
                  busy: _busy,
                  onPressed: () => _confirm(true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _confirm(bool fixed) async {
    setState(() => _busy = true);
    final id = widget.request.text('id');
    final ok = await confirmMaintenance(id, fixed);
    if (ok) await widget.done();
    if (mounted) setState(() => _busy = false);
  }
}

/// Confirms or reopens a Resolved maintenance request; true when it worked.
Future<bool> confirmMaintenance(String id, bool fixed) async {
  final ok = await attempt(
    () => Api.post('/maintenance-requests/${Uri.encodeComponent(id)}/confirm', {'fixed': fixed}),
    success: fixed
        ? t('Thanks for confirming. $id is now closed.', 'Cảm ơn bạn. $id đã đóng.')
        : t('$id goes back to the maintenance staff.', '$id được chuyển lại cho nhân viên kỹ thuật.'),
  );
  return ok != null;
}

/// A maintenance request (web Request drawer): status, details, progress, the office's updates and, once Resolved,
/// confirm the fix or not. `GET /maintenance-requests/{id}`.
class MaintenanceScreen extends StatelessWidget {
  const MaintenanceScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: id,
      body: Loader<Json>(
        fetch: () => Api.get('/maintenance-requests/${Uri.encodeComponent(id)}'),
        builder: (context, r, reload) {
          final status = r.str('status');
          final fixed = status == 'Resolved' || status == 'Closed';
          final updates = r.objects('events').where((e) => e.str('message') != null).toList();
          return Cards(
            children: [
              Section(
                title: r.text('title'),
                subtitle: joinDot([r.str('id'), label(r.str('category')), label(r.str('location'))]),
                children: [
                  Row(
                    children: [
                      _maintenanceStatus(r),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          t('Reported ', 'Báo lúc ') + moment(r.str('reportedAt')),
                          style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                        ),
                      ),
                    ],
                  ),
                  Line(t('Room', 'Phòng'), r.str('room') ?? '—'),
                  Line(t('Location', 'Vị trí'), label(r.str('location')).isEmpty ? '—' : label(r.str('location'))),
                  Line(t('Category', 'Loại sự cố'), label(r.str('category')).isEmpty ? '—' : label(r.str('category'))),
                  if (r.str('assignee') != null) Line(t('Assigned to', 'Người xử lý'), r.text('assignee')),
                  if (r.str('visitWindow') != null) Line(t('Visit window', 'Lịch đến'), r.text('visitWindow')),
                  Text(r.str('description') ?? '—', style: const TextStyle(color: Tokens.fgSecondary)),
                ],
              ),
              Section(
                title: t('Progress', 'Tiến trình'),
                children: [
                  Timeline(
                    items: [
                      (t('Submitted', 'Đã gửi'), moment(r.str('reportedAt')), 'done'),
                      (
                        r.str('assignee') != null
                            ? t('Assigned to ${r.text('assignee')}', 'Giao cho ${r.text('assignee')}')
                            : t('Assigned to maintenance staff', 'Giao cho nhân viên kỹ thuật'),
                        status == 'Submitted'
                            ? t('Usually within 24 hours', 'Thường trong 24 giờ')
                            : r.str('visitWindow') != null
                            ? t('Visit ', 'Lịch đến ') + r.text('visitWindow')
                            : t('Done', 'Xong'),
                        status == 'Submitted' ? 'current' : 'done',
                      ),
                      (
                        t('Fixed by maintenance staff', 'Nhân viên kỹ thuật đã sửa'),
                        status == 'In progress' ? t('Work in progress', 'Đang sửa') : null,
                        fixed
                            ? 'done'
                            : (status == 'Assigned' || status == 'In progress')
                            ? 'current'
                            : 'upcoming',
                      ),
                      (
                        t('Confirmed by you', 'Bạn xác nhận'),
                        status == 'Closed' ? t('Closed', 'Đã đóng') : null,
                        status == 'Closed'
                            ? 'done'
                            : status == 'Resolved'
                            ? 'current'
                            : 'upcoming',
                      ),
                    ],
                  ),
                ],
              ),
              if (updates.isNotEmpty)
                Section(
                  title: t('Updates from the dormitory office', 'Cập nhật từ văn phòng KTX'),
                  children: [
                    for (final e in updates)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 2,
                        children: [
                          Text(e.text('message')),
                          Text(
                            joinDot([e.str('who'), moment(e.str('at'))]),
                            style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                          ),
                        ],
                      ),
                  ],
                ),
              if (_canConfirm(r))
                _OneAtATime(
                  builder: (busy, run) => Row(
                    spacing: 8,
                    children: [
                      Expanded(
                        child: BusyButton(
                          label: t('Not fixed yet', 'Chưa sửa xong'),
                          outlined: true,
                          busy: busy,
                          onPressed: () => run(() async {
                            if (await confirmMaintenance(id, false)) await reload();
                          }),
                        ),
                      ),
                      Expanded(
                        child: BusyButton(
                          label: t('Confirm the fix', 'Xác nhận đã sửa'),
                          busy: busy,
                          onPressed: () => run(() async {
                            if (await confirmMaintenance(id, true)) await reload();
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Reporting a problem in the student's Room (web SCR-MNT-02, `POST /maintenance-requests`, multipart): category,
/// where, optionally the furniture item (A-49), title, description, urgency, whether Staff may enter, up to three
/// photos. Pops `true` when sent.
class NewMaintenanceScreen extends StatelessWidget {
  const NewMaintenanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Report a problem', 'Báo hỏng'),
      body: Loader<Json>(
        fetch: () => Api.get('/maintenance-requests/options?for=student'),
        builder: (context, options, reload) => _MaintenanceForm(options: options),
      ),
    );
  }
}

class _MaintenanceForm extends StatefulWidget {
  const _MaintenanceForm({required this.options});

  final Json options;

  @override
  State<_MaintenanceForm> createState() => _MaintenanceFormState();
}

class _MaintenanceFormState extends State<_MaintenanceForm> {
  static const _maxPhotos = 3;
  final _title = TextEditingController();
  final _description = TextEditingController();
  String? _category;
  String? _location;
  bool _urgent = false;
  bool _entry = true;
  Json? _furniture;
  final List<Picked> _photos = [];
  Map<String, String> _errors = const {};
  String? _message;
  bool _busy = false;
  bool _touched = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _touched = true);
    if (_title.text.trim().isEmpty || _description.text.trim().isEmpty || _category == null) return;
    setState(() => _busy = true);
    try {
      final result = await Api.multipart(
        '/maintenance-requests',
        {
          'title': _title.text.trim(),
          'description': _description.text.trim(),
          'category': _category ?? '',
          'location': _location ?? '',
          'urgency': _urgent ? 'Urgent' : 'Normal',
          'staffMayEnter': '$_entry',
          if (_furniture != null) 'furnitureItemId': _furniture!.text('id'),
        },
        [for (final p in _photos) ('photos', p.path)],
      );
      toast(
        t(
          '${result.str('id') ?? 'Your request'} was sent to the maintenance staff.',
          '${result.str('id') ?? 'Yêu cầu'} đã được gửi tới nhân viên kỹ thuật.',
        ),
      );
      if (mounted) Navigator.pop(context, true);
      return;
    } on ApiException catch (e) {
      _errors = e.fields;
      _message = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final furniture = widget.options.objects('furniture');
    String? required(TextEditingController c, String message) => _touched && c.text.trim().isEmpty ? message : null;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Column(
          spacing: 14,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Choice<String>(
              name: t('Category', 'Loại sự cố'),
              values: widget.options.strings('categories'),
              text: label,
              value: _category,
              error:
                  _errors['category'] ??
                  (_touched && _category == null ? t('Choose a category.', 'Hãy chọn loại sự cố.') : null),
              onChanged: (v) => setState(() => _category = v),
            ),
            Choice<String>(
              name: t('Where in the Room', 'Vị trí trong phòng'),
              values: widget.options.strings('locations'),
              text: label,
              value: _location,
              error: _errors['location'],
              onChanged: (v) => setState(() => _location = v),
            ),
            if (furniture.isNotEmpty)
              Choice<Json>(
                name: t('Furniture item (optional)', 'Đồ nội thất (không bắt buộc)'),
                values: furniture,
                text: (f) => '${furnitureName(f)} · ${f.text('assetCode')}',
                value: _furniture,
                error: _errors['furnitureItemId'],
                onChanged: (v) => setState(() => _furniture = v),
              ),
            Input(
              controller: _title,
              label: t('Title', 'Tiêu đề'),
              error: _errors['title'] ?? required(_title, t('Enter a short title.', 'Hãy nhập tiêu đề ngắn.')),
            ),
            Input(
              controller: _description,
              label: t('Description', 'Mô tả'),
              lines: 3,
              maxLength: 1000,
              error: _errors['description'] ?? required(_description, t('Describe the problem.', 'Hãy mô tả sự cố.')),
            ),
            Text(t('Urgency', 'Mức độ'), style: const TextStyle(fontWeight: FontWeight.w500)),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: Text(label('Normal')),
                  selected: !_urgent,
                  onSelected: (_) => setState(() => _urgent = false),
                ),
                ChoiceChip(
                  label: Text(label('Urgent')),
                  selected: _urgent,
                  onSelected: (_) => setState(() => _urgent = true),
                ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t('Staff may enter when I am not in', 'Nhân viên được vào phòng khi tôi vắng mặt')),
              value: _entry,
              onChanged: (v) => setState(() => _entry = v),
            ),
            Text(
              t('Photos (up to $_maxPhotos)', 'Ảnh (tối đa $_maxPhotos)'),
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final p in _photos)
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          File(p.path),
                          width: 88,
                          height: 88,
                          fit: BoxFit.cover,
                          semanticLabel: p.name,
                        ),
                      ),
                      Positioned(
                        right: 0,
                        top: 0,
                        child: IconButton.filledTonal(
                          visualDensity: VisualDensity.compact,
                          tooltip: t('Remove ${p.name}', 'Bỏ ${p.name}'),
                          onPressed: () => setState(() => _photos.remove(p)),
                          icon: const Icon(Icons.close, size: 16),
                        ),
                      ),
                    ],
                  ),
                if (_photos.length < _maxPhotos)
                  SizedBox(
                    width: 88,
                    height: 88,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(padding: EdgeInsets.zero),
                      onPressed: () async {
                        final picked = await pickImages(_maxPhotos - _photos.length);
                        if (mounted) setState(() => _photos.addAll(picked));
                      },
                      child: const Icon(Icons.add_a_photo_outlined),
                    ),
                  ),
              ],
            ),
            if (_message != null) Note(_message!, error: true),
            BusyButton(label: t('Submit request', 'Gửi yêu cầu'), busy: _busy, onPressed: _send),
            Note(
              t(
                'Next: Submitted → Assigned to Staff → In progress → Resolved → You confirm the fix.',
                'Tiếp theo: Đã gửi → Giao nhân viên → Đang sửa → Đã xử lý → Bạn xác nhận.',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Requesting a room change for the next Term (web SCR-REQ-02, spec §6.10): same kind elsewhere, another Room Class or
/// another Room Type, a reason, and the next-Term price of the new Bed. `GET /room-changes/options`, `POST /room-changes`.
class NewRoomChangeScreen extends StatelessWidget {
  const NewRoomChangeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Room change next Term', 'Đổi phòng kỳ sau'),
      body: Loader<Json>(
        fetch: () => Api.get('/room-changes/options'),
        builder: (context, opts, reload) => opts.obj('currentRoom') == null
            ? Cards(
                children: [
                  Alert(
                    tone: Tone.info,
                    title: t('Room changes open with the requests window', 'Đổi phòng mở cùng đợt nhận yêu cầu'),
                    body: label(opts.str('unavailable')),
                  ),
                ],
              )
            : _RoomChangeForm(opts: opts),
      ),
    );
  }
}

class _RoomChangeForm extends StatefulWidget {
  const _RoomChangeForm({required this.opts});

  final Json opts;

  @override
  State<_RoomChangeForm> createState() => _RoomChangeFormState();
}

class _RoomChangeFormState extends State<_RoomChangeForm> {
  String _kind = 'same';
  String? _newType;
  String? _reason;
  final _details = TextEditingController();
  bool _understood = false;
  bool _busy = false;
  String? _error;

  Json get _cur => widget.opts.obj('currentRoom')!;

  @override
  void initState() {
    super.initState();
    _newType =
        widget.opts.objects('roomTypes').where((r) => r.str('id') != _cur.str('roomTypeId')).firstOrNull?.str('id') ??
        _cur.str('roomTypeId');
  }

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  num? _price(String? type, String? cls) => widget.opts
      .objects('prices')
      .where((p) => p.str('roomTypeId') == type && p.str('roomClassId') == cls)
      .firstOrNull
      ?.number('termPrice');

  String _name(String list, String? id) =>
      label(widget.opts.objects(list).where((x) => x.str('id') == id).firstOrNull?.str('name'));

  @override
  Widget build(BuildContext context) {
    final opts = widget.opts;
    final cur = _cur;
    final window = opts.obj('window');
    final targetType = _kind == 'type' ? _newType : cur.str('roomTypeId');
    // A room change keeps the Room Class: only Managers set a Room's class per Term.
    final targetClass = cur.str('roomClassId');
    return Cards(
      children: [
        if (_error != null)
          Alert(tone: Tone.error, title: t('Could not submit the request', 'Không gửi được yêu cầu'), body: _error),
        if (!opts.flag('canAsk'))
          Alert(
            tone: Tone.warning,
            title: t('You cannot ask now', 'Hiện chưa thể gửi yêu cầu'),
            body: label(opts.str('unavailable')),
          ),
        Section(
          title: t('Your Bed next Term', 'Giường của bạn kỳ sau'),
          children: [
            Text(
              '${roomBed(cur.str('room'), cur.str('bed'))} · ${label(cur.str('roomTypeName'))} · ${label(cur.str('roomClassName'))}',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ],
        ),
        Section(
          title: t('What do you want next Term?', 'Kỳ sau bạn muốn gì?'),
          children: [
            for (final (value, text) in [
              ('same', t('Same Room Type, different Room', 'Cùng loại phòng, phòng khác')),
              ('type', t('Different Room Type', 'Loại phòng khác')),
            ])
              OptionTile(selected: _kind == value, title: text, onTap: () => setState(() => _kind = value)),
            Choice<String>(
              name: _kind == 'type' ? t('New Room Type', 'Loại phòng mới') : t('Room Type', 'Loại phòng'),
              values: [
                for (final r in opts.objects('roomTypes'))
                  if (_kind != 'type' || r.str('id') != cur.str('roomTypeId')) r.text('id'),
              ],
              text: (id) => _name('roomTypes', id),
              value: targetType,
              enabled: _kind == 'type',
              onChanged: (v) => setState(() => _newType = v),
            ),
            Choice<String>(
              name: t('Room Class', 'Hạng phòng'),
              values: [for (final c in opts.objects('roomClasses')) c.text('id')],
              text: (id) => _name('roomClasses', id),
              value: targetClass,
              enabled: false,
              onChanged: (_) {},
            ),
            Choice<String>(
              name: t('Reason', 'Lý do'),
              values: opts.strings('reasons'),
              text: label,
              value: _reason,
              onChanged: (v) => setState(() => _reason = v),
            ),
            Input(controller: _details, label: t('Details (optional)', 'Chi tiết (không bắt buộc)'), lines: 2),
            Check(
              value: _understood,
              label: t(
                "I understand the change takes effect next Term: I keep my Room until then and pay the next Term's price of the new Bed.",
                'Tôi hiểu thay đổi có hiệu lực từ kỳ sau: tôi giữ phòng hiện tại tới lúc đó và trả giá kỳ sau của giường mới.',
              ),
              onChanged: (v) => setState(() => _understood = v),
            ),
          ],
        ),
        Section(
          title: t('Next-Term fee', 'Phí kỳ sau'),
          children: [
            Line(
              t(
                'Your Bed now · ${label(cur.str('roomClassName'))}',
                'Giường hiện tại · ${label(cur.str('roomClassName'))}',
              ),
              money(_price(cur.str('roomTypeId'), cur.str('roomClassId'))),
            ),
            Line(
              t('New · ', 'Mới · ') +
                  (_kind == 'type'
                      ? '${_name('roomTypes', targetType)} ${_name('roomClasses', targetClass)}'
                      : _name('roomClasses', targetClass)),
              money(_price(targetType, targetClass)),
              strong: true,
            ),
            Note(
              t(
                'The price per Bed in ${window?.str('termName') ?? 'the next Term'}. Nothing is charged or refunded now: the next-Term fee is issued for the Bed you hold next Term.',
                'Giá mỗi giường của ${window?.str('termName') ?? 'kỳ sau'}. Không thu hay hoàn tiền lúc này: phí kỳ sau được phát hành theo giường bạn giữ kỳ sau.',
              ),
            ),
          ],
        ),
        Alert(
          tone: Tone.info,
          title: t('How room changes work', 'Cách đổi phòng'),
          body: t(
            'One open request at a time, until ${moment(window?.str('closesAt'))}. Staff decide by ${moment(window?.str('decisionsDueAt'))} and pick a free Bed; you move at the start of the next Term.',
            'Mỗi lần một yêu cầu, tới ${moment(window?.str('closesAt'))}. Nhân viên quyết định trước ${moment(window?.str('decisionsDueAt'))} và chọn giường trống; bạn chuyển khi kỳ sau bắt đầu.',
          ),
        ),
        BusyButton(
          label: t('Submit request', 'Gửi yêu cầu'),
          busy: _busy,
          onPressed: !_understood || _reason == null || !opts.flag('canAsk')
              ? null
              : () async {
                  setState(() {
                    _busy = true;
                    _error = null;
                  });
                  try {
                    final r = await Api.post('/room-changes', {
                      'termId': window?.str('termId'),
                      'kind': _kind,
                      'roomTypeId': targetType,
                      'roomClassId': targetClass,
                      'reason': _reason,
                      if (_details.text.trim().isNotEmpty) 'details': _details.text.trim(),
                    });
                    toast(
                      t(
                        '${r.str('id') ?? 'Your request'} submitted: it is approved only if a Bed is free.',
                        'Đã gửi ${r.str('id') ?? 'yêu cầu'}: chỉ được duyệt khi còn giường trống.',
                      ),
                    );
                    if (context.mounted) Navigator.pop(context, true);
                  } on ApiException catch (e) {
                    setState(() {
                      _error = e.message;
                      _busy = false;
                    });
                  }
                },
        ),
      ],
    );
  }
}

/// Swapping next-Term Beds (web SCR-REQ-03 and SCR-REQ-04, spec §6.10): with a specific Student by their code, or on
/// the anonymous swap board. `POST /swaps`, `GET /swap-board`, `PUT /swap-board/my-post`, `POST /swap-board/posts/{id}/request`.
class SwapScreen extends StatefulWidget {
  const SwapScreen({super.key, this.board = false});

  final bool board;

  @override
  State<SwapScreen> createState() => _SwapScreenState();
}

class _SwapScreenState extends State<SwapScreen> {
  late bool _board = widget.board;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Swap your Room', 'Đổi chỗ ở'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Segments(
              value: _board ? 'board' : 'specific',
              onChanged: (v) => setState(() => _board = v == 'board'),
              items: [
                ('specific', t('A specific Student', 'Một sinh viên cụ thể')),
                ('board', t('Swap board', 'Bảng đổi chỗ')),
              ],
            ),
          ),
          Expanded(child: _board ? const _SwapBoard() : const _SwapSpecific()),
        ],
      ),
    );
  }
}

/// The Bed the student holds for the next Term (swaps are of next-Term Beds).
class _YourBedNextTerm extends StatelessWidget {
  const _YourBedNextTerm();

  @override
  Widget build(BuildContext context) {
    return Loader<Json>(
      fetch: () => Api.get('/students/me/allocation'),
      builder: (context, d, reload) {
        final n = d.obj('nextTerm');
        return Section(
          title: t('Your Bed next Term', 'Giường của bạn kỳ sau'),
          children: [
            if (n?.str('room') == null)
              Text(
                t(
                  'Swaps open with the requests window, when your Bed is kept for the next Term.',
                  'Đổi chỗ mở cùng đợt nhận yêu cầu, khi giường của bạn được giữ cho kỳ sau.',
                ),
                style: const TextStyle(color: Tokens.fgSecondary),
              )
            else ...[
              Line(t('Term', 'Kỳ'), n!.obj('term')?.str('name') ?? '—'),
              Line(t('Room and Bed', 'Phòng và giường'), roomBed(n.str('room'), n.str('bed'))),
              Line(
                t('Type / Class', 'Loại / Hạng'),
                '${label(n.str('roomTypeName'))} · ${label(n.str('roomClassName'))}',
              ),
            ],
            Note(
              t(
                'A swap takes effect at the start of the next Term. Same-Block swaps are approved by Staff; cross-Block swaps by a Manager.',
                'Đổi chỗ có hiệu lực khi kỳ sau bắt đầu. Đổi trong cùng Block do nhân viên duyệt; khác Block do Quản lý duyệt.',
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SwapSpecific extends StatefulWidget {
  const _SwapSpecific();

  @override
  State<_SwapSpecific> createState() => _SwapSpecificState();
}

class _SwapSpecificState extends State<_SwapSpecific> {
  final _code = TextEditingController();
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Cards(
      children: [
        if (_error != null)
          Alert(
            tone: Tone.error,
            title: t('This swap cannot be requested', 'Không thể yêu cầu đổi chỗ này'),
            body: _error,
          ),
        Section(
          title: t('Swap with a specific Student', 'Đổi với một sinh viên cụ thể'),
          subtitle: t('Enter their Student code; they approve', 'Nhập mã sinh viên; họ sẽ duyệt'),
          children: [
            Input(
              controller: _code,
              label: t('Student code of the person you swap with', 'Mã sinh viên của người đổi với bạn'),
              helper: t(
                'For privacy we never show who the code belongs to.',
                'Vì quyền riêng tư, hệ thống không cho biết mã thuộc về ai.',
              ),
              hint: 'SE190702',
              capitalize: true,
              onChanged: (_) => setState(() {}),
            ),
            Input(controller: _reason, label: t('Reason (optional)', 'Lý do (không bắt buộc)')),
            Text(
              t('Rules checked after you send', 'Điều kiện được kiểm tra sau khi gửi'),
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            for (final rule in [
              t(
                'Same gender, both keep their Beds for the next Term',
                'Cùng giới tính, cả hai đều giữ giường cho kỳ sau',
              ),
              t('No overdue Invoices for either Student', 'Không ai có hoá đơn quá hạn'),
              t(
                'No price difference: each pays the next-Term fee of the Bed they get',
                'Không bù chênh lệch: mỗi người trả phí kỳ sau của giường mình nhận',
              ),
              t(
                'Your partner must accept before the invitation expires (at the latest the request deadline)',
                'Người kia phải đồng ý trước khi lời mời hết hạn (muộn nhất là hạn gửi yêu cầu)',
              ),
            ])
              Text('• $rule', style: const TextStyle(color: Tokens.fgSecondary)),
            Alert(
              tone: Tone.info,
              title: t('One message for every problem', 'Một thông báo cho mọi trường hợp'),
              body: t(
                'If the code cannot be used for any reason, you see the same message: “This swap cannot be requested. Check the code or try the swap board.”',
                'Nếu mã không dùng được vì bất kỳ lý do gì, bạn nhận cùng một thông báo: “Không thể yêu cầu đổi chỗ này. Hãy kiểm tra mã hoặc thử bảng đổi chỗ.”',
              ),
            ),
            BusyButton(
              label: t('Send swap invitation', 'Gửi lời mời đổi chỗ'),
              busy: _busy,
              onPressed: _code.text.trim().isEmpty
                  ? null
                  : () async {
                      setState(() {
                        _busy = true;
                        _error = null;
                      });
                      try {
                        final reason = _reason.text.trim();
                        await Api.post('/swaps', {
                          'studentCode': _code.text.trim().toUpperCase(),
                          if (reason.isNotEmpty) 'reason': reason,
                        });
                        toast(
                          t(
                            'Swap invitation sent. If the code is eligible, they get your invitation.',
                            'Đã gửi lời mời. Nếu mã hợp lệ, người đó sẽ nhận được lời mời.',
                          ),
                        );
                        if (context.mounted) Navigator.pop(context, true);
                      } on ApiException catch (e) {
                        setState(() {
                          _error = e.message;
                          _busy = false;
                        });
                      }
                    },
            ),
          ],
        ),
        const _YourBedNextTerm(),
      ],
    );
  }
}

class _SwapBoard extends StatefulWidget {
  const _SwapBoard();

  @override
  State<_SwapBoard> createState() => _SwapBoardState();
}

class _SwapBoardState extends State<_SwapBoard> {
  String? _block;
  String? _type;
  String? _class;
  bool _filled = false;
  bool _busy = false;
  final Set<String> _requesting = {};

  Future<(Json, Json?)> _fetch() async {
    final board = await Api.get('/swap-board');
    final termId = board.obj('window')?.str('termId');
    Json? catalog;
    try {
      catalog = await Api.get('/catalog${Api.query({'termId': termId})}');
    } on ApiException {
      catalog = null;
    }
    return (board, catalog);
  }

  @override
  Widget build(BuildContext context) {
    return Loader<(Json, Json?)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (board, catalog) = data;
        final myPost = board.obj('myPost');
        if (!_filled && myPost != null) {
          _filled = true;
          _block = myPost.str('block');
          _type = myPost.str('roomTypeId');
          _class = myPost.str('roomClassId');
        }
        final items = board.objects('items');
        final types = catalog?.objects('roomTypes') ?? const <Json>[];
        final classes = catalog?.objects('roomClasses') ?? const <Json>[];
        final dirty =
            myPost == null ||
            myPost.str('block') != _block ||
            myPost.str('roomTypeId') != _type ||
            myPost.str('roomClassId') != _class;
        return Cards(
          children: [
            Section(
              title: t('Post on the swap board', 'Đăng lên bảng đổi chỗ'),
              subtitle: t('The system finds a matching request', 'Hệ thống tìm yêu cầu phù hợp'),
              children: [
                Choice<String>(
                  name: t('Block I want', 'Block tôi muốn'),
                  values: ['', ...board.strings('blocks')],
                  text: (b) => b.isEmpty ? t('Any Block', 'Block bất kỳ') : 'Block $b',
                  value: _block ?? '',
                  onChanged: (v) => setState(() => _block = v == null || v.isEmpty ? null : v),
                ),
                // MOB-33: without the catalog the lists below are empty; say why and offer a retry.
                if (catalog == null)
                  RetryRow(what: t('the Room Types and Classes', 'loại và hạng phòng'), retry: reload),
                Choice<String>(
                  name: t('Room Type', 'Loại phòng'),
                  values: [for (final r in types) r.text('id')],
                  text: (id) => label(types.firstWhere((r) => r.str('id') == id).str('name')),
                  value: _type,
                  onChanged: (v) => setState(() => _type = v),
                ),
                Choice<String>(
                  name: t('Room Class', 'Hạng phòng'),
                  values: [for (final c in classes) c.text('id')],
                  text: (id) => label(classes.firstWhere((c) => c.str('id') == id).str('name')),
                  value: _class,
                  onChanged: (v) => setState(() => _class = v),
                ),
                BusyButton(
                  label: myPost != null ? t('Update post', 'Cập nhật bài đăng') : t('Post', 'Đăng'),
                  busy: _busy,
                  onPressed: _type == null || _class == null || !dirty
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          final ok = await attempt(
                            () => Api.put('/swap-board/my-post', {
                              'termId': board.obj('window')?.str('termId'),
                              'block': _block,
                              'roomTypeId': _type,
                              'roomClassId': _class,
                            }),
                            success: t(
                              'Swap post saved. Compatible posts are listed below.',
                              'Đã lưu bài đăng. Các bài phù hợp hiện bên dưới.',
                            ),
                          );
                          if (mounted) setState(() => _busy = false);
                          if (ok != null) await reload();
                        },
                ),
                if (myPost?.str('expiresAt') != null)
                  Tag(
                    t(
                      'Your post is live until ${day(myPost!.str('expiresAt'))}',
                      'Bài đăng hiển thị tới ${day(myPost.str('expiresAt'))}',
                    ),
                    tone: Tone.info,
                  ),
              ],
            ),
            Heading('${t('Compatible posts', 'Bài đăng phù hợp')} (${items.length})'),
            Note(
              t(
                'Posts that want your Room and offer what you want. No names or Student codes are shown.',
                'Các bài muốn phòng của bạn và có phòng bạn muốn. Không hiện tên hay mã sinh viên.',
              ),
            ),
            if (items.isEmpty)
              EmptyState(
                icon: Icons.swap_horiz,
                title: myPost != null
                    ? t('No compatible posts yet', 'Chưa có bài phù hợp')
                    : t('Post what you want first', 'Hãy đăng điều bạn muốn trước'),
                body: myPost != null
                    ? t('We notify you when a matching post appears.', 'Bạn sẽ được báo khi có bài phù hợp.')
                    : t('Choose the Room you want and press Post.', 'Chọn phòng bạn muốn rồi bấm Đăng.'),
              )
            else
              StatusList(
                children: [
                  for (final p in items)
                    StatusRow(
                      icon: Icons.bed_outlined,
                      title: '${label(p.str('offeredRoomTypeName'))} · ${label(p.str('offeredRoomClassName'))}',
                      note: joinDot([
                        'Block ${p.text('block')}',
                        if (p.str('floor') != null) t('Floor ${p.text('floor')}', 'Tầng ${p.text('floor')}'),
                        t('wants ', 'muốn ') + label(p.str('wants')),
                        money(p.number('termPrice')),
                      ]),
                      below: [
                        _SmallButton(
                          p.flag('requested') ? t('Requested', 'Đã yêu cầu') : t('Request swap', 'Yêu cầu đổi'),
                          p.flag('requested') || _requesting.contains(p.str('id'))
                              ? null
                              : () async {
                                  setState(() => _requesting.add(p.text('id')));
                                  final ok = await attempt(
                                    () => Api.post('/swap-board/posts/${Uri.encodeComponent(p.text('id'))}/request'),
                                    success: p.flag('crossBlock')
                                        ? t(
                                            'Swap requested. If they request you back, a Manager approves the cross-Block swap.',
                                            'Đã yêu cầu. Nếu họ cũng yêu cầu bạn, Quản lý duyệt đổi khác Block.',
                                          )
                                        : t(
                                            'Swap requested. If they request you back, Staff approve the swap.',
                                            'Đã yêu cầu. Nếu họ cũng yêu cầu bạn, nhân viên duyệt việc đổi.',
                                          ),
                                  );
                                  if (mounted) setState(() => _requesting.remove(p.text('id')));
                                  if (ok != null) await reload();
                                },
                          outlined: true,
                        ),
                      ],
                    ),
                ],
              ),
            Note(
              t(
                'When both sides request each other, the swap goes to Staff (same Block) or a Manager (cross-Block) for approval.',
                'Khi hai bên cùng yêu cầu nhau, việc đổi chỗ được chuyển cho nhân viên (cùng Block) hoặc Quản lý (khác Block) duyệt.',
              ),
            ),
            const _YourBedNextTerm(),
          ],
        );
      },
    );
  }
}

/// A swap invitation seen by the partner Student (web SCR-REQ-05): the Bed they give and get next Term, and Accept or
/// Decline. `GET /swap-invitations/{id}`, `POST /swap-invitations/{id}/respond { accept }`.
class SwapInvitationScreen extends StatelessWidget {
  const SwapInvitationScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Swap invitation', 'Lời mời đổi chỗ'),
      body: Loader<Json>(
        fetch: () => Api.get('/swap-invitations/${Uri.encodeComponent(id)}'),
        builder: (context, inv, reload) {
          final open = inv.str('status') == 'Invited';
          Widget box(String name, Json? room) => Panel(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Text(name, style: const TextStyle(color: Tokens.fgTertiary)),
                Text(
                  roomBed(room?.str('room'), room?.str('bed')),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
                Text(
                  joinDot([
                    label(room?.str('roomTypeName')),
                    label(room?.str('roomClassName')),
                    if (room?.str('block') != null) 'Block ${room!.text('block')}',
                  ]),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
                if (room?.number('termPrice') != null)
                  Text(t('${money(room!.number('termPrice'))} next Term', '${money(room.number('termPrice'))} kỳ sau')),
              ],
            ),
          );
          Future<void> respond(bool accept) async {
            final ok = await attempt(
              () => Api.post('/swap-invitations/${Uri.encodeComponent(id)}/respond', {'accept': accept}),
              success: accept
                  ? (inv.flag('crossBlock')
                        ? t(
                            'Swap accepted. A Manager reviews the cross-Block swap.',
                            'Đã đồng ý. Quản lý sẽ xét việc đổi khác Block.',
                          )
                        : t(
                            'Swap accepted. Staff review the swap and set the move date.',
                            'Đã đồng ý. Nhân viên sẽ xét và hẹn ngày chuyển.',
                          ))
                  : t(
                      'Swap declined. The other Student only sees that the invitation was not accepted.',
                      'Đã từ chối. Người kia chỉ thấy lời mời không được chấp nhận.',
                    ),
            );
            if (ok != null && context.mounted) Navigator.pop(context, true);
          }

          return Cards(
            children: [
              open
                  ? Alert(
                      tone: Tone.warning,
                      title: t(
                        'Reply by ${moment(inv.str('expiresAt'))}',
                        'Trả lời trước ${moment(inv.str('expiresAt'))}',
                      ),
                      body: t(
                        'If you do not reply in time, the invitation expires.',
                        'Nếu không trả lời kịp, lời mời sẽ hết hạn.',
                      ),
                    )
                  : Alert(
                      tone: Tone.info,
                      title: t(
                        'This invitation is ${label(inv.str('status'))}',
                        'Lời mời: ${label(inv.str('status'))}',
                      ),
                    ),
              Section(
                title: t(
                  'A Student wants to swap next-Term Beds with you',
                  'Một sinh viên muốn đổi giường kỳ sau với bạn',
                ),
                subtitle: t(
                  'Their name and code stay private until the swap is approved.',
                  'Tên và mã của họ được giữ kín tới khi việc đổi được duyệt.',
                ),
                children: [
                  box(t('You give', 'Bạn đưa'), inv.obj('give')),
                  box(t('You get', 'Bạn nhận'), inv.obj('get')),
                  Note(
                    t(
                      'No price difference: each of you pays the next-Term fee of the Bed you get. After approval you move at the start of ${inv.str('termName') ?? 'the next Term'}.',
                      'Không bù chênh lệch: mỗi người trả phí kỳ sau của giường mình nhận. Sau khi duyệt, bạn chuyển khi ${inv.str('termName') ?? 'kỳ sau'} bắt đầu.',
                    ),
                  ),
                ],
              ),
              if (open) ...[
                _OneAtATime(
                  builder: (busy, run) => Column(
                    spacing: 8,
                    children: [
                    BusyButton(
                      label: t('Accept swap', 'Đồng ý đổi'),
                      busy: busy,
                      onPressed: () async {
                        final ok = await confirm(
                      context,
                      title: t('Accept the swap?', 'Đồng ý đổi giường?'),
                      body: t(
                        'Once Staff approve it, your next-Term Bed is the one you get.',
                        'Khi nhân viên duyệt, giường kỳ sau của bạn là giường bạn nhận.',
                      ),
                      yes: t('Accept swap', 'Đồng ý đổi'),
                      no: t('Back', 'Quay lại'),
                    );
                        if (ok) await run(() => respond(true));
                      },
                    ),
                    BusyButton(
                      label: t('Decline', 'Từ chối'),
                      outlined: true,
                      busy: busy,
                      onPressed: () => run(() => respond(false)),
                    ),
                  ],
                ),
              ),
              ],
            ],
          );
        },
      ),
    );
  }
}
