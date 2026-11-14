import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import 'applications.dart';
import 'payments.dart';

/// The Application wizard (web SCR-APP-01): Term and eligibility → Room preference (Room Type, Room Class, stay
/// length) → Roommate (2-bed Rooms: invite by Student code, or match automatically with optional preferences) →
/// Personal info and consent → Review and submit, then the deposit payment. The answers stay in this screen until the
/// Application is submitted. `GET /applications/eligibility`, `/catalog`, `/students/me/profile`,
/// `/registration-periods/{termId}`, `POST /applications/roommate-check`, `POST /applications`.
class ApplyScreen extends StatefulWidget {
  const ApplyScreen({super.key});

  @override
  State<ApplyScreen> createState() => _ApplyScreenState();
}

class _ApplyScreenState extends State<ApplyScreen> {
  Json? _eligibility;
  Json? _catalog;
  Json? _profile;
  Json? _period;
  Object? _error;

  int _step = 0;
  String? _roomTypeId;
  String? _roomClassId;
  int _stayTerms = 1;
  bool _invite = true;
  final _code = TextEditingController();
  String? _verifiedCode;
  bool _rejected = false;
  int? _checksLeft;
  String? _checkError;
  bool _checking = false;
  bool _preferencesOn = false;
  final Map<String, String> _preferences = {};
  bool _matchingConsent = false;
  bool _rulesConsent = false;
  bool _confirmed = false;
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final results = await Future.wait([
        Api.get('/applications/eligibility'),
        Api.get('/catalog'),
        Api.get('/students/me/profile'),
      ]);
      Json? period;
      final termId = results[0].obj('term')?.str('id');
      if (termId != null) {
        try {
          period = await Api.get('/registration-periods/${Uri.encodeComponent(termId)}');
        } on ApiException {
          period = null;
        }
      }
      if (!mounted) return;
      setState(() {
        _eligibility = results[0];
        _catalog = results[1];
        _profile = results[2];
        _period = period;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Json? get _term => _eligibility?.obj('term');
  List<Json> get _roomTypes => _catalog?.objects('roomTypes') ?? const [];
  List<Json> get _roomClasses => _catalog?.objects('roomClasses') ?? const [];
  Json? get _roomType => _roomTypes.where((r) => r.str('id') == _roomTypeId).firstOrNull;
  Json? get _roomClass => _roomClasses.where((c) => c.str('id') == _roomClassId).firstOrNull;
  bool get _twoBed => _roomType?.number('beds') == 2;
  List<String> get _steps => ['term', 'room', if (_twoBed) 'roommate', 'personal', 'review'];

  num? _price(String? typeId, String? classId) => _catalog
      ?.objects('prices')
      .where((p) => p.str('roomTypeId') == typeId && p.str('roomClassId') == classId)
      .firstOrNull
      ?.number('termPrice');

  num? _fromPrice(String typeId) {
    final list = [
      for (final p in _catalog?.objects('prices') ?? const <Json>[])
        if (p.str('roomTypeId') == typeId && p.number('termPrice') != null) p.number('termPrice')!,
    ];
    return list.isEmpty ? null : list.reduce((a, b) => a < b ? a : b);
  }

  num? get _deposit {
    final price = _price(_roomTypeId, _roomClassId);
    return price == null ? null : (price * (_catalog?.number('depositRate') ?? 0)).round();
  }

  String _title(String step) => switch (step) {
    'term' => t('Term and eligibility', 'Kỳ và điều kiện'),
    'room' => t('Room preference', 'Nguyện vọng phòng'),
    'roommate' => t('Roommate', 'Bạn cùng phòng'),
    'personal' => t('Personal info', 'Thông tin cá nhân'),
    _ => t('Review and submit', 'Xem lại và gửi'),
  };

  String? get _roommateLabel {
    if (!_twoBed) return t('Matched automatically', 'Ghép tự động');
    if (!_invite) {
      return _preferencesOn
          ? t('Automatic · with preferences', 'Tự động · theo sở thích')
          : t('Match automatically', 'Ghép tự động');
    }
    return _verifiedCode == null ? null : t('Invite · $_verifiedCode', 'Mời · $_verifiedCode');
  }

  bool get _prefsComplete => !_preferencesOn || ['region', 'semester', 'major'].every((k) => _preferences[k] != null);

  bool get _canContinue => switch (_steps[_step]) {
    'term' => _eligibility?.flag('eligible') == true,
    'room' => _roomTypeId != null && _roomClassId != null,
    'roommate' =>
      _invite ? (_verifiedCode != null && _verifiedCode == _code.text.trim().toUpperCase()) : _prefsComplete,
    'personal' => _matchingConsent && _rulesConsent,
    _ => _confirmed && !_missing && !_submitting,
  };

  bool get _missing =>
      _roomTypeId == null ||
      _roomClassId == null ||
      !_matchingConsent ||
      !_rulesConsent ||
      (_twoBed && _roommateLabel == null);

  Future<void> _check() async {
    final value = _code.text.trim().toUpperCase();
    if (value.isEmpty || _checksLeft == 0) return;
    setState(() {
      _checking = true;
      _checkError = null;
    });
    try {
      final r = await Api.post('/applications/roommate-check', {'termId': _term?.str('id'), 'studentCode': value});
      setState(() {
        _verifiedCode = r.flag('valid') ? value : null;
        _rejected = !r.flag('valid');
        _checksLeft = r.number('checksLeft')?.toInt();
      });
    } on ApiException catch (e) {
      setState(() => _checkError = e.message);
    }
    if (mounted) setState(() => _checking = false);
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final usePrefs = _twoBed && !_invite && _preferencesOn;
      final r = await Api.post('/applications', {
        'termId': _term?.str('id'),
        'roomTypeId': _roomTypeId,
        'roomClassId': _roomClassId,
        if (_twoBed)
          'roommate': {
            'mode': _invite ? 'invite' : 'auto',
            if (_invite) 'studentCode': _verifiedCode,
            if (usePrefs) 'preferences': _preferences,
          },
        'consent': {'matching': _matchingConsent, 'rules': _rulesConsent},
        'stayTerms': _stayTerms,
      });
      if (!mounted) return;
      toast(
        r.str('depositDueAt') != null
            ? t(
                '${r.text('id')} is waiting for the deposit. Pay by ${moment(r.str('depositDueAt'))}.',
                '${r.text('id')} đang chờ đặt cọc. Hãy trả trước ${moment(r.str('depositDueAt'))}.',
              )
            : t('${r.text('id')} is waiting for the deposit.', '${r.text('id')} đang chờ đặt cọc.'),
      );
      final invoice = r.str('depositInvoiceId');
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
          builder: (_) => invoice != null ? InvoiceScreen(id: invoice) : ApplicationScreen(id: r.text('id')),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitError = e.message;
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _eligibility != null && _catalog != null;
    final steps = _steps;
    if (_step >= steps.length) _step = steps.length - 1;
    final step = steps[_step];
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step--);
      },
      child: SubPage(
        title: t('New application', 'Đơn đăng ký mới'),
        bottom: !ready
            ? null
            : Column(
                mainAxisSize: MainAxisSize.min,
                spacing: 10,
                children: [
                  if (step != 'review' && _roomTypeId != null) _summaryBar(),
                  Row(
                    spacing: 8,
                    children: [
                      Expanded(
                        child: BusyButton(
                          label: _step == 0 ? t('Cancel', 'Huỷ') : t('Back', 'Quay lại'),
                          outlined: true,
                          onPressed: () => _step == 0 ? Navigator.pop(context) : setState(() => _step--),
                        ),
                      ),
                      Expanded(
                        child: BusyButton(
                          label: step == 'review'
                              ? t('Submit and pay deposit', 'Gửi và đặt cọc')
                              : t('Continue', 'Tiếp tục'),
                          busy: _submitting,
                          onPressed: _canContinue ? () => step == 'review' ? _submit() : setState(() => _step++) : null,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
        body: !ready
            ? (_error != null
                  ? Center(
                      child: ErrorBox(message: '$_error', retry: _load),
                    )
                  : const Center(child: CircularProgressIndicator()))
            : Cards(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 6,
                    children: [
                      Text(
                        '${t('Dormitory application', 'Đơn đăng ký KTX')}${_term?.str('name') != null ? ' · ${_term!.text('name')}' : ''}',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: t(
                                'Step ${_step + 1} of ${steps.length} · ',
                                'Bước ${_step + 1}/${steps.length} · ',
                              ),
                            ),
                            TextSpan(
                              text: _title(step),
                              style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fgBrand),
                            ),
                          ],
                        ),
                      ),
                      LinearProgressIndicator(
                        value: (_step + 1) / steps.length,
                        color: Tokens.primary,
                        backgroundColor: Tokens.line,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ],
                  ),
                  ...switch (step) {
                    'term' => _termStep(),
                    'room' => _roomStep(),
                    'roommate' => _roommateStep(),
                    'personal' => _personalStep(),
                    _ => _reviewStep(),
                  },
                  // On a phone the full summary is the review step's; the other steps show the price bar above the buttons.
                  if (step == 'review') _summary(),
                ],
              ),
      ),
    );
  }

  List<Widget> _termStep() {
    final term = _term;
    final checks = _eligibility?.objects('checks') ?? const <Json>[];
    final eligible = _eligibility?.flag('eligible') == true;
    return [
      Section(
        title: term?.str('name') ?? t('Term', 'Kỳ'),
        subtitle: term?.str('stayStart') != null
            ? t('Stay ', 'Thời gian ở ') + range(term!.str('stayStart'), term.str('stayEnd'))
            : null,
        children: [
          if (_period != null) Timeline(items: scheduleRows(_period!.objects('timeline'))),
          if (term?.number('depositWindowHours') != null)
            Text(
              t(
                'After you submit, pay the Deposit within ${term!.number('depositWindowHours')} hours.',
                'Sau khi gửi đơn, hãy đặt cọc trong ${term.number('depositWindowHours')} giờ.',
              ),
            ),
          Note(
            t(
              'Registration opens only for the upcoming Term. The Term is set by the dormitory office and cannot be changed here.',
              'Chỉ mở đăng ký cho kỳ sắp tới. Kỳ do văn phòng KTX đặt và không đổi được ở đây.',
            ),
          ),
        ],
      ),
      Section(
        title: t('Eligibility check', 'Kiểm tra điều kiện'),
        trailing: Tag(
          eligible ? t('Eligible', 'Đủ điều kiện') : t('Not eligible', 'Chưa đủ điều kiện'),
          tone: eligible ? Tone.success : Tone.error,
        ),
        children: [
          for (final c in checks)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                Icon(
                  c.flag('passed') ? Icons.check_circle : Icons.cancel,
                  size: 20,
                  color: c.flag('passed') ? Tone.success.mark : Tone.error.mark,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(label(c.str('title')), style: const TextStyle(fontWeight: FontWeight.w500)),
                      if (c.str('detail') != null)
                        Text(label(c.str('detail')), style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      Alert(
        tone: Tone.info,
        title: t('Something looks wrong?', 'Thông tin chưa đúng?'),
        body: t(
          'Your enrollment data comes from FPT student records. Contact the dormitory office before you continue.',
          'Dữ liệu học vụ lấy từ hồ sơ sinh viên FPT. Hãy liên hệ văn phòng KTX trước khi tiếp tục.',
        ),
      ),
    ];
  }

  List<Widget> _roomStep() {
    final maxTerms = (_eligibility?.number('maxStayTerms') ?? 1).toInt().clamp(1, 20);
    if (_stayTerms > maxTerms) _stayTerms = maxTerms;
    return [
      Section(
        title: t('Room Type', 'Loại phòng'),
        subtitle: t(
          'Number of Beds in the Room. Prices are per Bed for the whole Term.',
          'Số giường trong phòng. Giá tính theo giường cho cả kỳ.',
        ),
        children: [
          for (final rt in _roomTypes)
            OptionTile(
              selected: _roomTypeId == rt.str('id'),
              title: label(rt.str('name')),
              trailing: _fromPrice(rt.text('id')) == null ? null : t('from ', 'từ ') + money(_fromPrice(rt.text('id'))),
              lines: [
                rt.str('description') ??
                    (rt.number('beds') == 2
                        ? t(
                            'Name one roommate, or be matched automatically.',
                            'Mời một bạn cùng phòng, hoặc ghép tự động.',
                          )
                        : t('Matched automatically by gender.', 'Ghép tự động theo giới tính.')),
              ],
              onTap: () => setState(() => _roomTypeId = rt.str('id')),
            ),
        ],
      ),
      Section(
        title: t('Room Class', 'Hạng phòng'),
        subtitle: t(
          'Each Room of a class has the furniture listed. The surcharge is added to the Room Type price.',
          'Mỗi phòng của một hạng có nội thất như liệt kê. Phụ phí được cộng vào giá loại phòng.',
        ),
        children: [
          for (final c in _roomClasses)
            OptionTile(
              selected: _roomClassId == c.str('id'),
              title: '${label(c.str('name'))}  ${surcharge(c.number('surchargeRate'))}',
              trailing: _roomTypeId == null ? null : money(_price(_roomTypeId, c.str('id'))),
              lines: [
                if (_roomTypeId == null) t('Choose a Room Type', 'Hãy chọn loại phòng'),
                if (c.objects('furniture').isNotEmpty) countLines(c.objects('furniture')),
                if (c.objects('furniture').isEmpty && c.strings('amenities').isNotEmpty)
                  c.strings('amenities').map(label).join(', '),
              ],
              onTap: () => setState(() => _roomClassId = c.str('id')),
            ),
        ],
      ),
      Section(
        title: t('How long do you want to stay?', 'Bạn muốn ở bao lâu?'),
        subtitle: t(
          'The number of Terms you plan to stay. You keep your Bed from Term to Term and can extend or end your stay later.',
          'Số kỳ bạn dự định ở. Bạn giữ giường qua các kỳ và có thể gia hạn hoặc kết thúc sau.',
        ),
        children: [
          Choice<int>(
            name: t('Stay length', 'Thời gian ở'),
            values: [for (var i = 1; i <= maxTerms; i++) i],
            text: terms,
            value: _stayTerms,
            onChanged: (v) => setState(() => _stayTerms = v ?? 1),
          ),
          Note(
            t(
              'Each Term is billed and paid on its own; the stay length is not a payment commitment.',
              'Mỗi kỳ được lập hoá đơn và thanh toán riêng; thời gian ở không phải cam kết thanh toán.',
            ),
          ),
        ],
      ),
    ];
  }

  List<Widget> _roommateStep() {
    final options = _catalog?.obj('preferenceOptions') ?? {};
    final accepted = _verifiedCode != null && _verifiedCode == _code.text.trim().toUpperCase();
    return [
      Section(
        title: t('Roommate', 'Bạn cùng phòng'),
        subtitle: t(
          '2-bed Rooms only. Enter the student code of the person you want to share with, or let the dormitory match you.',
          'Chỉ cho phòng 2 giường. Nhập mã sinh viên của người bạn muốn ở cùng, hoặc để KTX ghép.',
        ),
        children: [
          OptionTile(
            selected: _invite,
            title: t('Invite a roommate', 'Mời bạn cùng phòng'),
            onTap: () => setState(() => _invite = true),
          ),
          OptionTile(
            selected: !_invite,
            title: t('Match me automatically', 'Ghép tự động'),
            onTap: () => setState(() => _invite = false),
          ),
          if (_invite) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                Expanded(
                  child: Input(
                    controller: _code,
                    label: t("Roommate's student code", 'Mã sinh viên của bạn cùng phòng'),
                    hint: 'SE190388',
                    capitalize: true,
                    error:
                        _checkError ??
                        (_rejected
                            ? t(
                                'This student code cannot be used. Check it and try again, or choose Match me automatically.',
                                'Không dùng được mã sinh viên này. Hãy kiểm tra lại, hoặc chọn Ghép tự động.',
                              )
                            : null),
                    onChanged: (_) => setState(() => _rejected = false),
                  ),
                ),
                SizedBox(
                  height: 56,
                  child: OutlinedButton(
                    onPressed: _checking || _checksLeft == 0 || _code.text.trim().isEmpty ? null : _check,
                    child: Text(_checking ? t('Checking…', 'Đang kiểm tra…') : t('Check', 'Kiểm tra')),
                  ),
                ),
              ],
            ),
            if (accepted)
              Text(
                t(
                  'Student code $_verifiedCode noted. The invitation is sent when you submit.',
                  'Đã ghi nhận mã $_verifiedCode. Lời mời được gửi khi bạn gửi đơn.',
                ),
                style: TextStyle(color: Tone.success.fg, fontWeight: FontWeight.w500),
              ),
            Note(
              t(
                    'For privacy, we never show who a student code belongs to. Any code that cannot be used returns the same message.',
                    'Vì quyền riêng tư, hệ thống không cho biết mã thuộc về ai. Mọi mã không dùng được đều nhận cùng một thông báo.',
                  ) +
                  (_checksLeft != null
                      ? t(
                          ' $_checksLeft checks left for this Application.',
                          ' Còn $_checksLeft lần kiểm tra cho đơn này.',
                        )
                      : ''),
            ),
          ] else
            Note(
              t(
                'The dormitory pairs you with another Student of the same gender who also chose a 2-bed Room.',
                'KTX ghép bạn với một sinh viên cùng giới tính cũng chọn phòng 2 giường.',
              ),
            ),
        ],
      ),
      if (!_invite)
        Section(
          title: t('Roommate preferences', 'Sở thích bạn cùng phòng'),
          trailing: Tag(t('Free · Optional', 'Miễn phí · Tuỳ chọn'), tone: Tone.success, dot: false),
          children: [
            Text(
              t(
                'Add-on service for 2-bed Rooms: we look for a roommate who matches your preferences. They raise the match score; they are not guaranteed.',
                'Dịch vụ thêm cho phòng 2 giường: hệ thống tìm bạn cùng phòng hợp sở thích. Sở thích tăng điểm ghép nhưng không được đảm bảo.',
              ),
              style: const TextStyle(color: Tokens.fgSecondary),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t('Use roommate preferences', 'Dùng sở thích bạn cùng phòng')),
              value: _preferencesOn,
              onChanged: (v) => setState(() => _preferencesOn = v),
            ),
            if (_preferencesOn)
              for (final (key, name) in [
                ('region', t('Region', 'Vùng miền')),
                ('semester', t('Semester', 'Kỳ học')),
                ('major', t('Major', 'Chuyên ngành')),
              ])
                Choice<String>(
                  name: name,
                  values: options.strings(key),
                  text: label,
                  value: _preferences[key],
                  onChanged: (v) => setState(() => v == null ? _preferences.remove(key) : _preferences[key] = v),
                ),
          ],
        )
      else
        Alert(
          tone: Tone.info,
          title: t('How pairing works', 'Cách ghép đôi'),
          body: t(
            'After you submit, your roommate has a limited time to accept. Each of you pays your own deposit; both Applications reach the dormitory office together once both deposits are paid. If the invitation is declined or not answered, invite someone else or continue alone.',
            'Sau khi bạn gửi đơn, bạn cùng phòng có thời gian giới hạn để nhận lời. Mỗi người tự đặt cọc; hai đơn cùng tới văn phòng KTX khi cả hai đã đặt cọc. Nếu lời mời bị từ chối hoặc không được trả lời, hãy mời người khác hoặc đăng ký một mình.',
          ),
        ),
    ];
  }

  List<Widget> _personalStep() {
    final p = _profile ?? {};
    final term = _term?.str('name');
    return [
      Section(
        title: t('From FPT student records', 'Từ hồ sơ sinh viên FPT'),
        trailing: Tag(t('Read-only', 'Chỉ xem')),
        children: [
          Line(t('Full name', 'Họ tên'), p.str('name') ?? '—'),
          Line(t('Student code', 'Mã sinh viên'), p.str('studentCode') ?? '—'),
          Line(t('Gender', 'Giới tính'), label(p.str('gender')).isEmpty ? '—' : label(p.str('gender'))),
          Line(t('Major', 'Chuyên ngành'), p.str('major') ?? '—'),
          Line(t('Cohort', 'Khoá'), p.str('cohort') ?? '—'),
          Line(t('Hometown', 'Quê quán'), p.str('hometown') ?? '—'),
        ],
      ),
      Section(
        title: t('Consent', 'Đồng ý'),
        subtitle: t(
          'Required under the Personal Data Protection Law 91/2025/QH15.',
          'Bắt buộc theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15.',
        ),
        children: [
          Check(
            value: _matchingConsent,
            label: term != null
                ? t(
                    'I agree that CampusStay uses my gender, major and hometown to match roommates for $term.',
                    'Tôi đồng ý để CampusStay dùng giới tính, chuyên ngành và quê quán của tôi để ghép bạn cùng phòng cho $term.',
                  )
                : t(
                    'I agree that CampusStay uses my gender, major and hometown to match roommates.',
                    'Tôi đồng ý để CampusStay dùng giới tính, chuyên ngành và quê quán của tôi để ghép bạn cùng phòng.',
                  ),
            onChanged: (v) => setState(() => _matchingConsent = v),
          ),
          Check(
            value: _rulesConsent,
            label: t(
              'I have read the dormitory rules and the Privacy Notice.',
              'Tôi đã đọc nội quy KTX và Thông báo quyền riêng tư.',
            ),
            onChanged: (v) => setState(() => _rulesConsent = v),
          ),
          LinkButton(t('Read the Privacy Notice', 'Đọc Thông báo quyền riêng tư'), onPressed: () => _privacy()),
        ],
      ),
    ];
  }

  void _privacy() {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t('Privacy Notice', 'Thông báo quyền riêng tư')),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            spacing: 12,
            children: [
              Text(
                t(
                  'CampusStay processes your name, student code, gender, major, cohort, hometown and contact details to review your Application, match roommates and assign a Room and Bed.',
                  'CampusStay xử lý họ tên, mã sinh viên, giới tính, chuyên ngành, khoá, quê quán và thông tin liên hệ của bạn để xét đơn, ghép bạn cùng phòng và xếp phòng, giường.',
                ),
              ),
              Text(
                t(
                  'Matching data (gender, major, hometown) is used only for the Term you apply for. The dormitory office keeps Application records for the period required by FPT University regulations, then deletes them.',
                  'Dữ liệu ghép phòng (giới tính, chuyên ngành, quê quán) chỉ dùng cho kỳ bạn đăng ký. Văn phòng KTX lưu hồ sơ đơn theo thời hạn quy định của Trường Đại học FPT rồi xoá.',
                ),
              ),
              Text(
                t(
                  'You can ask the dormitory office to see, correct or withdraw consent for your data at any time, as set out in the Personal Data Protection Law 91/2025/QH15 and Decree 356/2025/NĐ-CP.',
                  'Bạn có thể yêu cầu văn phòng KTX cho xem, sửa hoặc rút lại sự đồng ý với dữ liệu của mình bất cứ lúc nào, theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.',
                ),
              ),
            ],
          ),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: Text(t('Close', 'Đóng')))],
      ),
    );
  }

  List<Widget> _reviewStep() {
    final term = _term;
    final usePrefs = _twoBed && !_invite && _preferencesOn;
    return [
      if (_submitError != null)
        Alert(tone: Tone.error, title: t('Could not submit the Application', 'Không gửi được đơn'), body: _submitError),
      if (_missing)
        Alert(
          tone: Tone.warning,
          title: t('Some answers are missing', 'Còn thiếu thông tin'),
          body: t(
            'Go back and complete every step before you submit.',
            'Hãy quay lại và hoàn thành mọi bước trước khi gửi.',
          ),
        ),
      Section(
        title: t('Term and Room preference', 'Kỳ và nguyện vọng phòng'),
        trailing: SmallAction(t('Edit', 'Sửa'), onPressed: () => setState(() => _step = 1)),
        children: [
          Line(t('Term', 'Kỳ'), term?.str('name') ?? '—'),
          Line(
            t('Room Type', 'Loại phòng'),
            label(_roomType?.str('name')).isEmpty ? '—' : label(_roomType?.str('name')),
          ),
          Line(
            t('Room Class', 'Hạng phòng'),
            _roomClass == null
                ? '—'
                : '${label(_roomClass!.str('name'))} (${surcharge(_roomClass!.number('surchargeRate'))})',
          ),
          Line(t('Roommate', 'Bạn cùng phòng'), _roommateLabel ?? '—'),
          Line(t('Stay length', 'Thời gian ở'), terms(_stayTerms)),
          if (usePrefs) ...[
            Line(t('Region', 'Vùng miền'), label(_preferences['region'])),
            Line(t('Semester', 'Kỳ học'), label(_preferences['semester'])),
            Line(t('Major', 'Chuyên ngành'), label(_preferences['major'])),
          ],
        ],
      ),
      Section(
        title: t('Personal info', 'Thông tin cá nhân'),
        trailing: SmallAction(t('Edit', 'Sửa'), onPressed: () => setState(() => _step = _steps.indexOf('personal'))),
        children: [
          Line(
            t('Consent', 'Đồng ý'),
            _matchingConsent && _rulesConsent ? t('Given', 'Đã đồng ý') : t('Not given', 'Chưa đồng ý'),
          ),
        ],
      ),
      Panel(
        color: Tokens.brandSubtle,
        border: Tokens.brandLine,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 6,
          children: [
            Text(
              t('Deposit to pay after submit', 'Tiền cọc cần trả sau khi gửi'),
              style: const TextStyle(color: Tokens.fgSecondary),
            ),
            Text(
              _deposit == null ? '—' : money(_deposit),
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Tokens.fgBrand),
            ),
            if (term?.number('depositWindowHours') != null)
              Text(
                t(
                  'Pay within ${term!.number('depositWindowHours')} hours',
                  'Trả trong ${term.number('depositWindowHours')} giờ',
                ),
                style: TextStyle(color: Tone.warning.fg, fontWeight: FontWeight.w500),
              ),
            Text(
              t(
                'Your Application reaches the dormitory office only after the deposit is paid. Unpaid Applications expire at the deadline.',
                'Đơn chỉ tới văn phòng KTX sau khi đặt cọc. Đơn chưa đặt cọc sẽ hết hạn khi quá hạn.',
              ),
            ),
            Check(
              value: _confirmed,
              label: t('I confirm the information above is correct.', 'Tôi xác nhận thông tin trên là đúng.'),
              onChanged: (v) => setState(() => _confirmed = v),
            ),
          ],
        ),
      ),
      Alert(
        tone: Tone.warning,
        title: t('Room Type and Room Class are locked after submit', 'Loại và hạng phòng bị khoá sau khi gửi'),
        body: term?.str('registrationClosesAt') != null
            ? t(
                'To change them, cancel this Application and apply again before ${moment(term!.str('registrationClosesAt'))}.',
                'Để đổi, hãy huỷ đơn và đăng ký lại trước ${moment(term.str('registrationClosesAt'))}.',
              )
            : t(
                'To change them, cancel this Application and apply again while registration is open.',
                'Để đổi, hãy huỷ đơn và đăng ký lại khi đợt đăng ký còn mở.',
              ),
      ),
    ];
  }

  /// Two short lines above the buttons: what is chosen, then the Term price and the deposit due on submit.
  Widget _summaryBar() {
    final price = _price(_roomTypeId, _roomClassId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 2,
      children: [
        Text(
          joinDot([
            label(_roomType?.str('name')),
            _roomClass == null ? null : label(_roomClass!.str('name')),
            if (_stayTerms > 1) terms(_stayTerms),
          ]),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Tokens.fgSecondary, fontSize: 13),
        ),
        if (price != null)
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: money(price),
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                TextSpan(
                  text: t(' per Term · deposit ', ' / kỳ · cọc '),
                  style: const TextStyle(color: Tokens.fgSecondary, fontSize: 13),
                ),
                TextSpan(
                  text: money(_deposit),
                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fgBrand),
                ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );
  }

  /// "Your selection" (web `SelectionSummary`).
  Widget _summary() {
    final price = _price(_roomTypeId, _roomClassId);
    final deposit = _deposit;
    final rate = _catalog?.number('depositRate');
    String or(String? v, [String? empty]) => v == null || v.isEmpty ? (empty ?? t('Not selected', 'Chưa chọn')) : v;
    return Section(
      title: t('Your selection', 'Lựa chọn của bạn'),
      children: [
        Line(t('Term', 'Kỳ'), or(_term?.str('name'))),
        Line(t('Room Type', 'Loại phòng'), or(label(_roomType?.str('name')))),
        Line(
          t('Room Class', 'Hạng phòng'),
          or(
            _roomClass == null
                ? null
                : '${label(_roomClass!.str('name'))} (${surcharge(_roomClass!.number('surchargeRate'))})',
          ),
        ),
        if (_twoBed) Line(t('Roommate', 'Bạn cùng phòng'), or(_roommateLabel, t('Not set', 'Chưa đặt'))),
        const Divider(),
        Line(t('Term price per Bed', 'Giá kỳ mỗi giường'), price == null ? '—' : money(price)),
        Line(
          rate == null
              ? t('Deposit due on submit', 'Tiền cọc khi gửi')
              : t('Deposit due on submit (${(rate * 100).round()}%)', 'Tiền cọc khi gửi (${(rate * 100).round()}%)'),
          deposit == null ? '—' : money(deposit),
          strong: true,
        ),
        Line(
          t('Balance after Allocation', 'Tiền phòng sau khi xếp'),
          price == null || deposit == null ? '—' : money(price - deposit),
        ),
        Line(
          t('Utility Deposit before check-in', 'Cọc điện nước trước khi nhận phòng'),
          _catalog?.number('utilityDeposit') == null ? '—' : money(_catalog!.number('utilityDeposit')),
        ),
        Note(
          t(
            'The dormitory assigns your Room and Bed after review. You cannot pick a specific Room.',
            'KTX xếp phòng và giường sau khi xét duyệt. Bạn không chọn được phòng cụ thể.',
          ),
        ),
      ],
    );
  }
}
