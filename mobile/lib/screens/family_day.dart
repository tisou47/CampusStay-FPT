import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../common.dart';

/// Family Day words that mean something else on other screens ("Checked in" is a guest coming in, not a student
/// taking a Room); web `familyDayStatus.js`.
String familyDayStatus(String? status) => isVietnamese()
    ? switch (status) {
        'Draft' => 'Bản nháp',
        'Published' => 'Đã công bố',
        'Registration open' => 'Đang mở đăng ký',
        'Registration closed' => 'Đã đóng đăng ký',
        'In progress' => 'Đang diễn ra',
        'Completed' => 'Đã kết thúc',
        'Cancelled' => 'Đã huỷ',
        _ => label(status),
      }
    : status ?? '';

String guestStatus(String? status) => isVietnamese()
    ? switch (status) {
        'Not arrived' => 'Chưa đến',
        'Checked in' => 'Đã vào',
        'Checked out' => 'Đã ra',
        'No-show' => 'Vắng mặt',
        'Overdue' => 'Quá giờ',
        _ => label(status),
      }
    : status ?? '';

Tone _dayTone(String? status) => switch (status) {
  'Registration open' || 'In progress' => Tone.success,
  'Published' => Tone.info,
  'Cancelled' => Tone.error,
  _ => Tone.neutral,
};

Tone _guestTone(String? status) => switch (status) {
  'Checked in' => Tone.success,
  'Checked out' => Tone.info,
  'No-show' || 'Overdue' || 'Cancelled' => Tone.error,
  _ => Tone.warning,
};

/// `14:30` in campus time (UTC+7).
String clock(String? iso) {
  final at = DateTime.tryParse(iso ?? '');
  if (at == null) return '—';
  final local = at.toUtc().add(const Duration(hours: 7));
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

const _relationships = ['Father', 'Mother', 'Brother', 'Sister', 'Grandparent', 'Guardian', 'Relative'];

String _relationship(String? r) => isVietnamese()
    ? switch (r) {
        'Father' => 'Cha',
        'Mother' => 'Mẹ',
        'Brother' => 'Anh/em trai',
        'Sister' => 'Chị/em gái',
        'Grandparent' => 'Ông/bà',
        'Guardian' => 'Người giám hộ',
        'Relative' => 'Họ hàng',
        _ => r ?? '',
      }
    : r ?? '';

/// Family Days (web SCR-VIS-04, ADR-29, A-69): the Family Days of the student's Block and those they registered guests
/// for. Families meet residents in a common area: never in the Rooms, never overnight. `GET /students/me/family-days`.
class FamilyDaysScreen extends StatelessWidget {
  const FamilyDaysScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Family Days', 'Ngày gia đình'),
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/family-days'),
        builder: (context, d, reload) {
          final items = d.objects('items');
          return Cards(
            children: [
              Text(
                t(
                  'Invite your family to visit you in the common area of your Block.',
                  'Mời gia đình đến thăm bạn tại khu vực chung của Block.',
                ),
                style: const TextStyle(color: Tokens.fgSecondary),
              ),
              if (items.isEmpty)
                EmptyState(
                  icon: Icons.family_restroom,
                  title: t('No Family Day yet', 'Chưa có Ngày gia đình nào'),
                  body: d['resident'] == false
                      ? t(
                          'Family Days are for students who live in the dormitory.',
                          'Ngày gia đình dành cho sinh viên đang ở KTX.',
                        )
                      : t(
                          'When a Manager plans one for your Block, you will be told.',
                          'Khi Quản lý lên kế hoạch cho Block của bạn, bạn sẽ được thông báo.',
                        ),
                )
              else ...[
                StatusList(
                  children: [
                    for (final day in items)
                      StatusRow(
                        icon: Icons.family_restroom,
                        title: day.text('title'),
                        note:
                            '${dateOf(day.str('startsAt'))}, ${clock(day.str('startsAt'))}–${clock(day.str('endsAt'))} · ${day.text('area')}',
                        below: [
                          Tag(familyDayStatus(day.str('status')), tone: _dayTone(day.str('status'))),
                          if (day.obj('registration') != null)
                            Text(
                              day.obj('registration')!.str('status') == 'Approved'
                                  ? t(
                                      '${day.obj('registration')!.number('guests')} guests registered for ${clock(day.obj('registration')!.str('slotStartsAt'))}',
                                      '${day.obj('registration')!.number('guests')} khách đã đăng ký lúc ${clock(day.obj('registration')!.str('slotStartsAt'))}',
                                    )
                                  : t('Registration cancelled', 'Đã huỷ đăng ký'),
                              style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                            ),
                        ],
                        onTap: () async {
                          await push(context, FamilyDayScreen(id: day.text('id')));
                          await reload();
                        },
                      ),
                  ],
                ),
                Note(_rule),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// The calendar day of an instant in campus time.
String dateOf(String? iso) {
  final text = moment(iso);
  final cut = text.lastIndexOf(' ');
  return cut < 0 ? text : text.substring(0, cut);
}

String get _rule => t(
  'Guests stay in the common area of the Block. They may not enter the Rooms or stay overnight.',
  'Khách ở khu vực chung của Block, không được vào phòng ở hoặc ở lại qua đêm.',
);

/// A Family Day (web SCR-VIS-05): the student registers their guests for one time slot (approved at once; each guest
/// gets their own QR pass to show at the visitor desk with an identity paper), and may cancel before the slot starts
/// while no guest came in. `GET /students/me/family-days/{id}`, `POST …/registration`, `POST …/registration/cancel`.
class FamilyDayScreen extends StatelessWidget {
  const FamilyDayScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) {
    final path = '/students/me/family-days/${Uri.encodeComponent(id)}';
    return SubPage(
      title: t('Family Day', 'Ngày gia đình'),
      body: Loader<Json>(
        fetch: () => Api.get(path),
        builder: (context, d, reload) {
          final registration = d.obj('registration');
          return Cards(
            children: [
              Section(
                title: d.text('title'),
                subtitle: 'Block ${d.text('block')} · ${d.text('area')}',
                trailing: Tag(familyDayStatus(d.str('status')), tone: _dayTone(d.str('status'))),
                children: [
                  Text(
                    '${dateOf(d.str('startsAt'))}, ${clock(d.str('startsAt'))}–${clock(d.str('endsAt'))}',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  Text(
                    t(
                      'Registration: ${moment(d.str('registrationOpensAt'))} – ${moment(d.str('registrationClosesAt'))}',
                      'Đăng ký: ${moment(d.str('registrationOpensAt'))} – ${moment(d.str('registrationClosesAt'))}',
                    ),
                    style: const TextStyle(color: Tokens.fgSecondary),
                  ),
                  if (d.str('description') != null) Text(d.text('description')),
                  Note(_rule),
                ],
              ),
              if (registration != null) _Registration(path: path, registration: registration, reload: reload),
              if (d.flag('canRegister'))
                _RegisterForm(path: path, day: d, reload: reload)
              else if (registration?.str('status')?.startsWith('Approved') != true &&
                  d.str('registerBlockedBy') != null)
                Alert(tone: Tone.info, title: t('Registration', 'Đăng ký'), body: label(d.str('registerBlockedBy'))),
            ],
          );
        },
      ),
    );
  }
}

class _Registration extends StatelessWidget {
  const _Registration({required this.path, required this.registration, required this.reload});

  final String path;
  final Json registration;
  final Future<void> Function() reload;

  @override
  Widget build(BuildContext context) {
    final r = registration;
    return Section(
      title: t('Your guests', 'Khách của bạn'),
      subtitle: '${t('Time slot', 'Khung giờ')} ${moment(r.str('slotStartsAt'))} – ${clock(r.str('slotEndsAt'))}',
      trailing: StatusChip(r.str('status')),
      children: [
        if (r.str('cancelReason') != null)
          Alert(tone: Tone.warning, title: t('Cancelled', 'Đã huỷ'), body: r.text('cancelReason')),
        for (final g in r.objects('guests'))
          Panel(
            padding: const EdgeInsets.all(12),
            child: Column(
              spacing: 6,
              children: [
                if (g.str('passToken') != null)
                  Semantics(
                    label: t('Pass QR code', 'Mã QR vào cổng'),
                    child: QrImageView(data: g.text('passToken'), size: 180, backgroundColor: Colors.white),
                  ),
                Text(g.text('fullName'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                Text(
                  '${_relationship(g.str('relationship'))} · ${g.str('birthYear') ?? '—'}',
                  style: const TextStyle(color: Tokens.fgSecondary),
                ),
                Tag(guestStatus(g.str('status')), tone: _guestTone(g.str('status'))),
                if (g.str('checkedInAt') != null)
                  Text(
                    joinDot([
                      t('In ', 'Vào ') + clock(g.str('checkedInAt')),
                      if (g.str('checkedOutAt') != null) t('Out ', 'Ra ') + clock(g.str('checkedOutAt')),
                    ]),
                    style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                  ),
              ],
            ),
          ),
        if (r.str('status') == 'Approved')
          Note(
            t(
              'Send each guest a photo of their own pass. A pass lets one guest in once, during this time slot.',
              'Hãy gửi cho mỗi khách ảnh mã vào của họ. Mỗi mã cho một khách vào một lần, trong khung giờ này.',
            ),
          ),
        if (r.flag('canCancel'))
          BusyButton(
            label: t('Cancel registration', 'Huỷ đăng ký'),
            outlined: true,
            danger: true,
            onPressed: () async {
              final ok = await confirm(
                context,
                title: t('Cancel your registration?', 'Huỷ đăng ký?'),
                body: t(
                  'Every pass of your guests stops working. You can register again while registration is open.',
                  'Mọi mã vào của khách sẽ hết hiệu lực. Bạn có thể đăng ký lại khi còn mở đăng ký.',
                ),
                yes: t('Cancel registration', 'Huỷ đăng ký'),
                no: t('Back', 'Quay lại'),
                danger: true,
              );
              if (!ok) return;
              final done = await attempt(
                () => Api.post('$path/registration/cancel'),
                success: t(
                  'Registration cancelled. The passes no longer work and the places are free again.',
                  'Đã huỷ đăng ký. Các mã vào không còn hiệu lực và chỗ được trả lại.',
                ),
              );
              if (done != null) await reload();
            },
          ),
      ],
    );
  }
}

class _Guest {
  final name = TextEditingController();
  final year = TextEditingController();
  String relationship = 'Father';

  void dispose() {
    name.dispose();
    year.dispose();
  }
}

class _RegisterForm extends StatefulWidget {
  const _RegisterForm({required this.path, required this.day, required this.reload});

  final String path;
  final Json day;
  final Future<void> Function() reload;

  @override
  State<_RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<_RegisterForm> {
  String? _slot;
  final List<_Guest> _guests = [_Guest()];
  Map<String, String> _errors = const {};
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final g in _guests) {
      g.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
      _errors = const {};
    });
    try {
      await Api.post('${widget.path}/registration', {
        'slotId': _slot,
        'guests': [
          for (final g in _guests)
            {
              'fullName': g.name.text.trim(),
              'relationship': g.relationship,
              'birthYear': int.tryParse(g.year.text.trim()),
            },
        ],
      });
      toast(
        t(
          'Guests registered. Each guest has their own pass. Send it to them before the day.',
          'Đã đăng ký khách. Mỗi khách có mã vào riêng; hãy gửi cho khách trước ngày thăm.',
        ),
      );
      await widget.reload();
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
    final day = widget.day;
    final max = (day.number('maxGuests') ?? 1).toInt();
    return Section(
      title: t('Register your guests', 'Đăng ký khách'),
      children: [
        if (_error != null) Alert(tone: Tone.error, title: t('Could not register', 'Không đăng ký được'), body: _error),
        Text(t('Time slot', 'Khung giờ'), style: const TextStyle(fontWeight: FontWeight.w500)),
        for (final s in day.objects('slots'))
          OptionTile(
            selected: _slot == s.str('id'),
            title: '${moment(s.str('startsAt'))} – ${clock(s.str('endsAt'))}',
            lines: [
              (s.number('remaining') ?? 0) == 0
                  ? t('Full', 'Hết chỗ')
                  : t('${s.number('remaining')} places left', 'Còn ${s.number('remaining')} chỗ'),
            ],
            onTap: (s.number('remaining') ?? 0) == 0 ? null : () => setState(() => _slot = s.str('id')),
          ),
        if (_errors['slotId'] != null) Note(_errors['slotId']!, error: true),
        Row(
          children: [
            Expanded(
              child: Text(
                t('Guests (up to $max)', 'Khách (tối đa $max)'),
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
            ),
            TextButton.icon(
              onPressed: _guests.length >= max ? null : () => setState(() => _guests.add(_Guest())),
              icon: const Icon(Icons.add),
              label: Text(t('Add a guest', 'Thêm khách')),
            ),
          ],
        ),
        if (_errors['guests'] != null) Note(_errors['guests']!, error: true),
        for (var i = 0; i < _guests.length; i++)
          Panel(
            padding: const EdgeInsets.all(12),
            child: Column(
              spacing: 10,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        t('Guest ${i + 1}', 'Khách ${i + 1}'),
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                    IconButton(
                      tooltip: t('Remove the guest', 'Bỏ khách này'),
                      onPressed: _guests.length == 1 ? null : () => setState(() => _guests.removeAt(i).dispose()),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
                Input(
                  controller: _guests[i].name,
                  label: t('Full name', 'Họ tên'),
                  hint: t('As on the identity paper', 'Như trên giấy tờ tuỳ thân'),
                  maxLength: 100,
                  error: _errors['guests[$i].fullName'],
                ),
                Choice<String>(
                  name: t('Relationship', 'Quan hệ'),
                  values: _relationships,
                  text: _relationship,
                  value: _guests[i].relationship,
                  error: _errors['guests[$i].relationship'],
                  onChanged: (v) => setState(() => _guests[i].relationship = v ?? 'Father'),
                ),
                Input(
                  controller: _guests[i].year,
                  label: t('Year of birth', 'Năm sinh'),
                  keyboard: TextInputType.number,
                  error: _errors['guests[$i].birthYear'],
                ),
              ],
            ),
          ),
        Note(
          t(
            'A guest under ${day.number('adultAge') ?? 18} must come with an adult guest. Guests bring an identity paper; their name is checked at the desk.',
            'Khách dưới ${day.number('adultAge') ?? 18} tuổi phải đi cùng một khách đã thành niên. Khách mang theo giấy tờ tuỳ thân; tên được kiểm tra tại quầy.',
          ),
        ),
        BusyButton(
          label: t('Register guests', 'Đăng ký khách'),
          icon: Icons.person_add_alt,
          busy: _busy,
          onPressed: _slot == null ? null : _send,
        ),
      ],
    );
  }
}
