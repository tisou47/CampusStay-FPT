import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';

/// The check-in inventory (web Student › My room › Check-in inventory, contract A-81): the four conditions and the
/// start (the door code), each item of the Bed and the shared items with a condition, a note and photos, the meters,
/// draft and submit; after Staff's visit the student agrees (with a comment); after the deadline a late report. The
/// Room's record is never sent to the student. The same page answers the furniture charges of a check-out and the
/// damage to a shared item Staff ask the student to confirm.
/// `GET /students/me/handover`, `POST …/start|submit|agree|late`, `PUT …`, `POST …/photos`,
/// `GET /students/me/check-out`, `POST /students/me/check-out/agree`, `POST /students/me/damage-claims/{id}`.

const _conditions = ['Good', 'Worn', 'Damaged', 'Missing'];

String _label(String? condition) => switch (condition) {
  'Good' => t('Good', 'Tốt'),
  'Worn' => t('Worn', 'Hao mòn'),
  'Damaged' => t('Damaged', 'Hư hỏng'),
  'Missing' => t('Missing', 'Thiếu'),
  _ => condition ?? '—',
};

Tone _tone(String? condition) => switch (condition) {
  'Good' => Tone.success,
  'Damaged' => Tone.error,
  'Missing' => Tone.warning,
  _ => Tone.neutral,
};

/// My Room: what the inventory or the furniture charges ask of the student now; nothing when all is done.
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
    final (String? title, String? body, Tone tone) = switch (status) {
      'Ready' => (
        t('You can receive your Room', 'Bạn đã có thể nhận phòng'),
        t('At the Room, start the check-in inventory to get the door code.', 'Khi đến phòng, hãy bắt đầu kiểm kê để nhận mã cửa.'),
        Tone.info,
      ),
      'Draft' => (
        t('File your check-in inventory', 'Hãy nộp biên bản kiểm kê'),
        '${t('Due', 'Hạn')} ${moment(h.str('dueAt'))}',
        Tone.warning,
      ),
      'Verifying' => (
        h.flag('toAgree')
            ? t('Agree with the checked inventory', 'Đồng ý với biên bản đã kiểm')
            : t('Staff will check your Room', 'Nhân viên sẽ xuống kiểm tra phòng'),
        h.str('visitAt') == null ? null : '${t('Be in the Room at', 'Hãy có mặt ở phòng lúc')} ${moment(h.str('visitAt'))}',
        Tone.warning,
      ),
      _ when claims > 0 || toAgree => (
        t('Furniture charges to answer', 'Khoản đền nội thất cần trả lời'),
        claims > 0
            ? t('Staff ask you to confirm damage to a shared item.', 'Nhân viên đề nghị bạn xác nhận hư hỏng một món đồ chung.')
            : t('Read the charges of your check-out and agree.', 'Hãy xem khoản đền khi trả phòng và bấm đồng ý.'),
        Tone.warning,
      ),
      _ => (null, null, Tone.neutral),
    };
    if (title == null) return const SizedBox.shrink();
    return Alert(
      tone: tone,
      title: title,
      body: body,
      action: SmallAction(
        t('Open', 'Mở'),
        onPressed: () async {
          await push(context, const HandoverScreen());
          await _load();
        },
      ),
    );
  }
}

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
        'Do it when you are at the Room. You receive the door code now and have 48 hours to file the inventory: after that the Room\'s recorded condition is used and you can no longer report damage that was already there.',
        'Hãy bấm khi bạn đã ở phòng. Bạn nhận mã cửa ngay và có 48 giờ để nộp biên bản: sau đó hệ thống dùng tình trạng đã ghi nhận của phòng và bạn không thể báo hư hỏng có sẵn nữa.',
      ),
      yes: t('I am at the Room, start', 'Tôi đã ở phòng, bắt đầu'),
    );
    if (!ok) return;
    setState(() => _busy = true);
    final done = await attempt(
      () => Api.post('/students/me/handover/start'),
      success: t('Inventory started. Your door code is on My Room.', 'Đã bắt đầu kiểm kê. Mã cửa nằm ở Phòng của tôi.'),
    );
    if (mounted) setState(() => _busy = false);
    if (done != null) await widget.reload();
  }

  @override
  Widget build(BuildContext context) {
    final ready = widget.data.str('status') == 'Ready';
    return Section(
      title: t('Receive your Room', 'Nhận phòng'),
      subtitle: t(
        'At the Room, start the check-in inventory: you receive the door code and record your Bed\'s items, the shared items and the meters.',
        'Khi đến phòng, hãy bắt đầu kiểm kê: bạn nhận mã cửa và ghi tình trạng đồ của giường bạn, đồ dùng chung và công tơ.',
      ),
      children: [
        for (final c in widget.data.objects('checks'))
          Row(
            spacing: 8,
            children: [
              Tag(c.flag('passed') ? t('Done', 'Đã xong') : t('Waiting', 'Đang chờ'), tone: c.flag('passed') ? Tone.success : Tone.neutral),
              Expanded(child: Text(c.text('label'))),
            ],
          ),
        BusyButton(
          label: t('Start check-in inventory', 'Bắt đầu kiểm kê nhận phòng'),
          icon: Icons.key,
          busy: _busy,
          onPressed: ready ? _start : null,
        ),
      ],
    );
  }
}

class _Form extends StatefulWidget {
  const _Form({super.key, required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  @override
  State<_Form> createState() => _FormState();
}

class _FormState extends State<_Form> {
  late final Map<String, String?> _conditions = {
    for (final i in widget.data.objects('items')) i.text('itemId'): i.str('condition'),
  };
  late final Map<String, TextEditingController> _notes = {
    for (final i in widget.data.objects('items')) i.text('itemId'): TextEditingController(text: i.text('note')),
  };
  late final _electricity = TextEditingController(text: widget.data.text('electricity'));
  late final _water = TextEditingController(text: widget.data.text('water'));
  bool _busy = false;
  Map<String, String> _errors = const {};

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
      for (final e in _conditions.entries)
        if (e.value != null) {'itemId': e.key, 'condition': e.value, 'note': _notes[e.key]!.text.trim()},
    ],
    if (_electricity.text.trim().isNotEmpty) 'electricity': num.tryParse(_electricity.text.trim()),
    if (_water.text.trim().isNotEmpty) 'water': num.tryParse(_water.text.trim()),
  };

  Future<void> _photo(String? itemId) async {
    final picked = await pickImages(1);
    if (picked.isEmpty) return;
    await Api.put('/students/me/handover', _body());
    final done = await attempt(
      () => Api.multipart('/students/me/handover/photos', {'itemId': ?itemId}, [('photo', picked.first.path)]),
      success: t('Photo added', 'Đã thêm ảnh'),
    );
    if (done != null) await widget.reload();
  }

  Future<void> _send(bool submit) async {
    setState(() {
      _busy = true;
      _errors = const {};
    });
    try {
      final v = submit ? await Api.post('/students/me/handover/submit', _body()) : await Api.put('/students/me/handover', _body());
      toast(
        submit
            ? (v.str('status') == 'Final'
                  ? t('Inventory submitted: it matches the Room and is final.', 'Đã nộp: biên bản khớp với phòng và đã được chốt.')
                  : t('Inventory submitted. Staff look at it.', 'Đã nộp biên bản. Nhân viên sẽ xem.'))
            : t('Saved', 'Đã lưu'),
      );
      if (submit) await widget.reload();
    } on ApiException catch (e) {
      setState(() => _errors = e.fields);
      if (e.fields.isEmpty) toast(e.message, error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final max = d.number('maxPhotos') ?? 3;
    return Section(
      title: '${t('Check-in inventory', 'Kiểm kê nhận phòng')} · ${d.text('room')}',
      subtitle: '${t('Due', 'Hạn')} ${moment(d.str('dueAt'))}',
      children: [
        for (final i in d.objects('items'))
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                Text(furnitureName(i), style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  joinDot([
                    i.str('assetCode'),
                    i.flag('personal') ? '${t('Your Bed', 'Giường của bạn')} ${i.text('bed')}' : t('Shared', 'Chung'),
                  ]),
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
                if (i.str('roommateCondition') != null)
                  Note(
                    '${t('Your roommate recorded it as', 'Bạn cùng phòng đã ghi món này là')} ${_label(i.str('roommateCondition'))}.',
                  ),
                Choice<String>(
                  name: t('Condition', 'Tình trạng'),
                  values: _conditionsList,
                  text: _label,
                  value: _conditions[i.text('itemId')],
                  onChanged: (v) => setState(() => _conditions[i.text('itemId')] = v),
                ),
                if (_conditions[i.text('itemId')] != null && _conditions[i.text('itemId')] != 'Good')
                  Input(controller: _notes[i.text('itemId')]!, label: t('What do you see?', 'Bạn thấy gì?')),
                Row(
                  spacing: 8,
                  children: [
                    Text('${i.objects('photos').length} ${t('photos', 'ảnh')}', style: const TextStyle(color: Tokens.fgSecondary)),
                    if (i.objects('photos').length < max)
                      SmallAction(t('Add photo', 'Thêm ảnh'), onPressed: () => _photo(i.text('itemId'))),
                  ],
                ),
              ],
            ),
          ),
        Input(
          controller: _electricity,
          label: t('Electricity (kWh)', 'Điện (kWh)'),
          keyboard: const TextInputType.numberWithOptions(decimal: true),
          error: _errors['electricity'],
        ),
        Input(
          controller: _water,
          label: t('Water (m³)', 'Nước (m³)'),
          keyboard: const TextInputType.numberWithOptions(decimal: true),
          error: _errors['water'],
        ),
        Row(
          spacing: 8,
          children: [
            Text('${d.objects('meterPhotos').length} ${t('meter photos', 'ảnh công tơ')}', style: const TextStyle(color: Tokens.fgSecondary)),
            if (d.objects('meterPhotos').length < max)
              SmallAction(t('Add photo', 'Thêm ảnh'), onPressed: () => _photo(null)),
          ],
        ),
        if (_errors['items'] != null) Text(_errors['items']!, style: TextStyle(color: Tone.error.mark)),
        Note(
          t(
            'Your answers are compared with the Room\'s record. A large difference brings Staff to the Room to check it with you.',
            'Câu trả lời của bạn được so với tình trạng đã ghi nhận của phòng. Lệch lớn thì nhân viên sẽ xuống phòng kiểm cùng bạn.',
          ),
        ),
        BusyButton(label: t('Save draft', 'Lưu nháp'), outlined: true, busy: _busy, onPressed: () => _send(false)),
        BusyButton(label: t('Submit inventory', 'Nộp biên bản'), busy: _busy, onPressed: () => _send(true)),
      ],
    );
  }
}

const _conditionsList = _conditions;

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
    final subtitle = switch (status) {
      'Final' => '${t('Recorded', 'Đã ghi nhận')} ${moment(d.str('finalizedAt'))} · ${t('Utility from', 'Điện nước tính từ')} ${moment(d.str('utilityFrom'))}',
      'Verifying' when d.flag('toAgree') => t('Staff recorded what they found in the Room. Read it and agree.', 'Nhân viên đã ghi nhận thực tế tại phòng. Hãy xem và bấm đồng ý.'),
      'Verifying' => '${t('Staff will check the Room with you', 'Nhân viên sẽ xuống kiểm tra phòng cùng bạn')} ${moment(d.str('visitAt'))}',
      _ => t('Submitted. Staff are looking at it.', 'Đã nộp. Nhân viên đang xem.'),
    };
    return Section(
      title: '${t('Check-in inventory', 'Kiểm kê nhận phòng')} · ${d.text('room')}',
      subtitle: subtitle,
      trailing: Tag(status == 'Final' ? t('Final', 'Đã chốt') : status ?? '', tone: status == 'Final' ? Tone.success : Tone.info),
      children: [
        for (final i in d.objects('items'))
          Row(
            spacing: 8,
            children: [
              Expanded(child: Text(furnitureName(i))),
              Tag(_label(i.str('condition')), tone: _tone(i.str('condition'))),
              if (i.str('staffCondition') != null && i.str('staffCondition') != i.str('condition')) ...[
                const Icon(Icons.arrow_forward, size: 14),
                Tag(_label(i.str('staffCondition')), tone: _tone(i.str('staffCondition'))),
              ],
            ],
          ),
        Line(t('Meters', 'Công tơ'), '${d.str('staffElectricity') ?? d.str('electricity') ?? '—'} kWh · ${d.str('staffWater') ?? d.str('water') ?? '—'} m³'),
        if (d.flag('toAgree')) ...[
          Input(
            controller: _comment,
            label: t('Comment (optional)', 'Ý kiến (không bắt buộc)'),
            helper: t('Kept with the inventory and read at check-out.', 'Được lưu cùng biên bản và được xem khi trả phòng.'),
            lines: 2,
          ),
          BusyButton(
            label: t('Agree', 'Đồng ý'),
            icon: Icons.check_circle_outline,
            busy: _busy,
            onPressed: () => _post(
              '/students/me/handover/agree',
              {if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim()},
              t('Inventory final', 'Biên bản đã chốt'),
            ),
          ),
        ],
        if (d.flag('lateAllowed')) ...[
          Input(
            controller: _late,
            label: t('Report something you found late', 'Báo cáo trễ điều bạn phát hiện'),
            helper: t('Staff decide whether it was there before you.', 'Nhân viên sẽ quyết định món đó có từ trước khi bạn vào hay không.'),
            lines: 2,
          ),
          BusyButton(
            label: t('Send late report', 'Gửi báo cáo trễ'),
            outlined: true,
            busy: _busy,
            onPressed: () => _post('/students/me/handover/late', {'note': _late.text.trim()}, t('Late report sent', 'Đã gửi báo cáo trễ')),
          ),
        ],
        if (d.str('lateNote') != null) Note('${t('Your late report', 'Báo cáo trễ của bạn')}: ${d.text('lateNote')}'),
        if (d.str('studentComment') != null) Note('${t('Your comment', 'Ý kiến của bạn')}: ${d.text('studentComment')}'),
      ],
    );
  }
}

class _Charges extends StatelessWidget {
  const _Charges({required this.data, required this.reload});

  final Json data;
  final Future<void> Function() reload;

  Future<void> _answer(String id, bool acknowledge) async {
    final done = await attempt(
      () => Api.post('/students/me/damage-claims/$id', {'acknowledge': acknowledge}),
      success: acknowledge ? t('Damage confirmed', 'Đã xác nhận hư hỏng') : t('Damage declined', 'Đã từ chối hư hỏng'),
    );
    if (done != null) await reload();
  }

  @override
  Widget build(BuildContext context) {
    final pending = data.objects('claims').where((c) => c.str('status') == 'Pending').toList();
    if (!data.flag('saved') && pending.isEmpty) return const SizedBox.shrink();
    return Section(
      title: t('Furniture charges', 'Tiền đền nội thất'),
      subtitle: t(
        'Only what got worse while you lived here is charged; damage that was already there and wear are not.',
        'Chỉ tính phần xấu đi trong thời gian bạn ở; hư hỏng có sẵn và hao mòn không bị tính.',
      ),
      children: [
        for (final c in pending)
          Alert(
            tone: Tone.warning,
            title: '${t('Did you damage', 'Bạn có làm hỏng')} ${c.text('type')} ${c.text('assetCode')}?',
            body:
                '${t('Confirm by', 'Xác nhận trước')} ${moment(c.str('dueAt'))}: ${money(c.number('amount'))} ${t('is charged at check-out. Decline: nobody is charged.', 'sẽ tính khi trả phòng. Từ chối: không ai bị tính.')}',
            action: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SmallAction(t('Decline', 'Từ chối'), onPressed: () => _answer(c.text('id'), false)),
                SmallAction(t('Confirm', 'Xác nhận'), onPressed: () => _answer(c.text('id'), true)),
              ],
            ),
          ),
        if (data.flag('saved')) ...[
          for (final i in data.objects('items'))
            Line(
              '${furnitureName(i)} · ${_label(i.str('atCheckIn') ?? 'Good')} → ${_label(i.str('atCheckOut'))}',
              money(i.number('amount')),
            ),
          Line(t('Total', 'Tổng'), money(data.number('total')), strong: true),
          if (data.flag('studentPresent') && data.str('agreedAt') == null)
            BusyButton(
              label: t('Agree with the charges', 'Đồng ý với khoản đền'),
              onPressed: () async {
                final done = await attempt(
                  () => Api.post('/students/me/check-out/agree'),
                  success: t('Agreed. Staff can complete your check-out.', 'Đã đồng ý. Nhân viên có thể hoàn tất trả phòng.'),
                );
                if (done != null) await reload();
              },
            ),
        ],
      ],
    );
  }
}
