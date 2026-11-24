// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../session.dart';

/// Account verification (web SCR-AUTH-06, ADR-26, spec §6.1): a student whose Google account is not in the imported
/// student list sends their details once; a Manager then verifies the account. Until the form is sent every API call
/// answers `403 PROFILE_REQUIRED`, so the app opens here first ([onSent] then lets the student in).
/// `GET /students/me/verification`, `PUT /students/me/verification`.
class VerificationScreen extends StatelessWidget {
  const VerificationScreen({super.key, this.onSent, this.onSignOut});

  /// Called once the details are sent (the session learns the new status).
  final Future<void> Function()? onSent;

  /// Shown in the top bar when this is the first screen after sign-in.
  final Future<void> Function()? onSignOut;

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Account verification', 'Xác minh tài khoản'),
      actions: [
        if (onSignOut != null)
          IconButton(onPressed: onSignOut, tooltip: t('Sign out', 'Đăng xuất'), icon: const Icon(Icons.logout)),
      ],
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/verification'),
        builder: (context, d, reload) {
          final status = d.str('status');
          final form = d.obj('form') ?? {};
          final majors = d.obj('options')?.objects('majors') ?? const <Json>[];
          return Cards(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t(
                        'CampusStay checks every student account against the student list before you can apply for a Bed.',
                        'CampusStay đối chiếu mọi tài khoản sinh viên với danh sách sinh viên trước khi bạn đăng ký giường.',
                      ),
                      style: const TextStyle(color: Tokens.fgSecondary),
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusChip(status),
                ],
              ),
              if (status == 'Profile needed')
                Alert(
                  tone: Tone.info,
                  title: t(
                    'Your account was not found in the student list',
                    'Tài khoản của bạn chưa có trong danh sách sinh viên',
                  ),
                  body: t(
                    'Send your details below. A Manager checks them and verifies your account; you can look around meanwhile, and apply once it is verified.',
                    'Hãy gửi thông tin dưới đây. Quản lý sẽ kiểm tra và xác minh tài khoản; trong lúc chờ bạn vẫn xem được ứng dụng, và đăng ký được khi đã xác minh.',
                  ),
                ),
              if (status == 'Pending verification')
                Alert(
                  tone: Tone.warning,
                  title: t('Waiting for a Manager', 'Đang chờ Quản lý'),
                  body: t(
                    'Your details were sent. You can apply for a Bed once a Manager verifies your account. You can still correct them below.',
                    'Thông tin đã được gửi. Bạn đăng ký giường được khi Quản lý xác minh tài khoản. Bạn vẫn có thể sửa thông tin dưới đây.',
                  ),
                ),
              if (d.str('note') != null) Note(label(d.str('note'))),
              if (d.flag('locked'))
                Section(
                  title: t('Your account is verified', 'Tài khoản đã được xác minh'),
                  trailing: Icon(Icons.verified, color: Tone.success.mark),
                  children: [
                    Line(t('Student code', 'Mã sinh viên'), form.str('studentCode') ?? '—'),
                    Line(t('Full name', 'Họ tên'), form.str('name') ?? '—'),
                    Line(t('Gender', 'Giới tính'), switch (form.str('gender')) {
                      'M' => t('Male', 'Nam'),
                      'F' => t('Female', 'Nữ'),
                      _ => '—',
                    }),
                    Line(t('Date of birth', 'Ngày sinh'), day(form.str('dateOfBirth'))),
                    Line(
                      t('Major', 'Chuyên ngành'),
                      majors.where((m) => m.str('value') == form.str('major')).firstOrNull?.str('label') ??
                          form.str('major') ??
                          '—',
                    ),
                    Line(t('Cohort', 'Khoá'), form.str('cohort') ?? '—'),
                    Note(
                      t(
                        'These details come from the student list. Ask a Manager to correct them.',
                        'Thông tin lấy từ danh sách sinh viên. Hãy nhờ Quản lý sửa nếu cần.',
                      ),
                    ),
                  ],
                )
              else
                _DetailsForm(
                  data: d,
                  onSent: () async {
                    await reload();
                    await onSent?.call();
                  },
                ),
            ],
          );
        },
      ),
    );
  }
}

class _DetailsForm extends StatefulWidget {
  const _DetailsForm({required this.data, required this.onSent});

  final Json data;
  final Future<void> Function() onSent;

  @override
  State<_DetailsForm> createState() => _DetailsFormState();
}

class _DetailsFormState extends State<_DetailsForm> {
  late final Json _form = widget.data.obj('form') ?? {};
  late final _code = TextEditingController(text: _form.str('studentCode'));
  late final _name = TextEditingController(text: _form.str('name'));
  late final _cohort = TextEditingController(text: _form.str('cohort'));
  late final _phone = TextEditingController(text: _form.str('phone'));
  late String? _gender = _form.str('gender');
  late String? _major = _form.str('major');
  late String? _birth = _form.str('dateOfBirth');
  Map<String, String> _errors = const {};
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_code, _name, _cohort, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _ready =>
      [_code.text, _name.text, _cohort.text, _phone.text].every((v) => v.trim().isNotEmpty) &&
      _gender != null &&
      _major != null &&
      _birth != null;

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
      _errors = const {};
    });
    final first = widget.data.str('status') == 'Profile needed';
    try {
      await Api.put('/students/me/verification', {
        'studentCode': _code.text.trim().toUpperCase(),
        'name': _name.text.trim(),
        'gender': _gender,
        'dateOfBirth': _birth,
        'major': _major,
        'cohort': _cohort.text.trim().toUpperCase(),
        'phone': _phone.text.trim(),
      });
      toast(
        first
            ? t(
                'Details sent. A Manager checks them against the student list and verifies your account.',
                'Đã gửi thông tin. Quản lý sẽ đối chiếu với danh sách sinh viên và xác minh tài khoản.',
              )
            : t('Details updated.', 'Đã cập nhật thông tin.'),
      );
      await widget.onSent();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _errors = e.fields;
        _error = e.fields.isEmpty ? e.message : null;
      });
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final options = widget.data.obj('options') ?? {};
    final genders = options.objects('genders');
    final majors = options.objects('majors');
    String text(List<Json> list, String v) => list.where((x) => x.str('value') == v).firstOrNull?.str('label') ?? v;
    final first = widget.data.str('status') == 'Profile needed';
    void changed(_) => setState(() {});
    return Section(
      title: first ? t('Your student details', 'Thông tin sinh viên') : t('Correct your details', 'Sửa thông tin'),
      children: [
        if (_error != null) Note(_error!, error: true),
        Input(
          controller: _code,
          label: t('Student code', 'Mã sinh viên'),
          helper: t(
            'Two letters and six digits, as on your student card.',
            'Hai chữ cái và sáu chữ số, như trên thẻ sinh viên.',
          ),
          hint: 'SE190421',
          capitalize: true,
          error: _errors['studentCode'],
          onChanged: changed,
        ),
        Input(
          controller: _name,
          label: t('Full name', 'Họ tên'),
          helper: t('As in the FPT student records, with accents.', 'Như trong hồ sơ sinh viên FPT, có dấu.'),
          error: _errors['name'],
          onChanged: changed,
        ),
        Choice<String>(
          name: t('Gender', 'Giới tính'),
          values: [for (final g in genders) g.text('value')],
          text: (v) => text(genders, v),
          value: _gender,
          error: _errors['gender'],
          onChanged: (v) => setState(() => _gender = v),
        ),
        InkWell(
          onTap: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              firstDate: DateTime(now.year - 60),
              lastDate: now,
              initialDate: DateTime.tryParse(_birth ?? '') ?? DateTime(now.year - 19),
              initialEntryMode: DatePickerEntryMode.input,
            );
            if (picked != null) {
              setState(
                () => _birth =
                    '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}',
              );
            }
          },
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: t('Date of birth', 'Ngày sinh'),
              errorText: _errors['dateOfBirth'],
              suffixIcon: const Icon(Icons.calendar_today_outlined),
            ),
            child: Text(_birth == null ? '' : day(_birth)),
          ),
        ),
        Choice<String>(
          name: t('Major', 'Chuyên ngành'),
          values: [for (final m in majors) m.text('value')],
          text: (v) => text(majors, v),
          value: _major,
          error: _errors['major'],
          onChanged: (v) => setState(() => _major = v),
        ),
        Input(
          controller: _cohort,
          label: t('Cohort', 'Khoá'),
          helper: t('For example K19.', 'Ví dụ K19.'),
          hint: 'K19',
          capitalize: true,
          error: _errors['cohort'],
          onChanged: changed,
        ),
        Input(
          controller: _phone,
          label: t('Phone', 'Số điện thoại'),
          keyboard: TextInputType.phone,
          error: _errors['phone'],
          onChanged: changed,
        ),
        BusyButton(
          label: first ? t('Send for verification', 'Gửi để xác minh') : t('Save changes', 'Lưu thay đổi'),
          icon: Icons.send,
          busy: _busy,
          onPressed: _ready ? _send : null,
        ),
      ],
    );
  }
}

/// What is wrong with a new password, or null when it follows the rule (web `passwordProblem`): 8 to 64 characters
/// with at least one letter and one number.
String? passwordProblem(String password) {
  if (password.length < 8 ||
      password.length > 64 ||
      !RegExp(r'\p{L}', unicode: true).hasMatch(password) ||
      !RegExp(r'\p{Nd}', unicode: true).hasMatch(password)) {
    return t(
      'Use 8 to 64 characters with at least one letter and one number.',
      'Dùng 8 đến 64 ký tự, có ít nhất một chữ và một số.',
    );
  }
  return null;
}

/// Changing the CampusStay password (`POST /auth/password/change`); the account's other sessions are signed out.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  Map<String, String> _errors = const {};
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mismatch = _again.text.isNotEmpty && _again.text != _next.text;
    final problem = _next.text.isEmpty ? null : passwordProblem(_next.text);
    final ready = _current.text.isNotEmpty && _next.text.isNotEmpty && problem == null && _again.text == _next.text;
    void changed(_) => setState(() {});
    return SubPage(
      title: t('Change password', 'Đổi mật khẩu'),
      body: Cards(
        children: [
          Section(
            title: t('Your CampusStay password', 'Mật khẩu CampusStay'),
            children: [
              if (_error != null) Note(_error!, error: true),
              Input(
                controller: _current,
                label: t('Current password', 'Mật khẩu hiện tại'),
                obscure: true,
                error: _errors['currentPassword'],
                onChanged: changed,
              ),
              Input(
                controller: _next,
                label: t('New password', 'Mật khẩu mới'),
                helper: t(
                  'Use 8 to 64 characters with at least one letter and one number.',
                  'Dùng 8 đến 64 ký tự, có ít nhất một chữ và một số.',
                ),
                obscure: true,
                error: _errors['newPassword'] ?? problem,
                onChanged: changed,
              ),
              Input(
                controller: _again,
                label: t('Repeat the new password', 'Nhập lại mật khẩu mới'),
                obscure: true,
                error: mismatch ? t('The passwords do not match.', 'Mật khẩu không khớp.') : null,
                onChanged: changed,
              ),
              Note(
                t(
                  'Your other devices and browsers are signed out.',
                  'Các thiết bị và trình duyệt khác sẽ bị đăng xuất.',
                ),
              ),
              BusyButton(
                label: t('Change password', 'Đổi mật khẩu'),
                busy: _busy,
                onPressed: !ready
                    ? null
                    : () async {
                        setState(() {
                          _busy = true;
                          _error = null;
                          _errors = const {};
                        });
                        try {
                          await Api.post('/auth/password/change', {
                            'currentPassword': _current.text,
                            'newPassword': _next.text,
                          });
                          toast(t('Password changed.', 'Đã đổi mật khẩu.'));
                          if (context.mounted) Navigator.pop(context);
                        } on ApiException catch (e) {
                          setState(() {
                            _errors = e.fields;
                            _error = e.fields.isEmpty ? e.message : null;
                            _busy = false;
                          });
                        }
                      },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The Account tab: who is signed in (name, student code, email, verification) and the account's own actions —
/// verification details, change password, sign out. The language follows the phone.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key, required this.session, required this.onSignOut});

  final Session session;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final name = session.name.trim();
    final initial = name.split(RegExp(r'\s+')).last.characters.firstOrNull ?? '?';
    Widget info(IconData icon, Color color, String label, String value) => Row(
      spacing: 14,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 2,
            children: [
              Text(label, style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary)),
              Text(
                value,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Tokens.fg),
              ),
            ],
          ),
        ),
      ],
    );
    return Cards(
      children: [
        HeroCard(
          child: Column(
            spacing: 10,
            children: [
              Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2),
                ),
                alignment: Alignment.center,
                child: Text(initial, style: HeroCard.strong.copyWith(fontSize: 34)),
              ),
              Text(name, textAlign: TextAlign.center, style: HeroCard.strong.copyWith(fontSize: 22)),
              if (session.verification != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    label(session.verification),
                    style: TextStyle(color: toneOf(session.verification).fg, fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
            ],
          ),
        ),
        Section(
          title: t('Student information', 'Thông tin sinh viên'),
          children: [
            if (session.studentCode != null)
              info(
                Icons.badge_outlined,
                Tokens.link,
                t('Student code', 'Mã sinh viên'),
                session.studentCode!.toUpperCase(),
              ),
            info(Icons.mail_outline, Tokens.accent, 'Email', session.email),
            info(
              Icons.verified_user_outlined,
              Tone.success.mark,
              t('Account', 'Tài khoản'),
              label(session.verification).isEmpty ? '—' : label(session.verification),
            ),
          ],
        ),
        StatusList(
          children: [
            StatusRow(
              icon: Icons.verified_user_outlined,
              title: t('Account verification', 'Xác minh tài khoản'),
              onTap: () => push(context, const VerificationScreen()),
            ),
            StatusRow(
              icon: Icons.lock_outline,
              title: t('Change password', 'Đổi mật khẩu'),
              onTap: () => push(context, const ChangePasswordScreen()),
            ),
            StatusRow(
              icon: Icons.language,
              title: t('Language', 'Ngôn ngữ'),
              note: t('Follows the phone: English', 'Theo ngôn ngữ của máy: Tiếng Việt'),
            ),
          ],
        ),
        BusyButton(
          label: t('Sign out', 'Đăng xuất'),
          icon: Icons.logout,
          outlined: true,
          danger: true,
          onPressed: onSignOut,
        ),
      ],
    );
  }
}
