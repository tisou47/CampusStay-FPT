import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../links.dart';
import '../session.dart';
import 'applications.dart';
import 'apply.dart';
import 'notifications.dart';
import 'payments.dart';
import 'registration.dart';

/// Student Home (web SCR-HOME-01, phone MOB-HOME-01, R-12), kept short for a phone: a greeting, the one thing to do
/// now, shortcuts with their counts, the newest notifications, the registration period in one line and the two newest
/// announcements. Details live on the screens the shortcuts open.
/// `GET /students/me/home`, `/notifications`, `/students/me/board`, `/registration-periods/current`, `/students/me/roommate-invitation`.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session, required this.openTab});

  final Session session;

  /// Opens a tab of the shell: 1 My Room, 2 Payments, 3 Activity (with its segment: applications, requests).
  final void Function(int tab, [String? segment]) openTab;

  static Future<Json?> _optional(String path) async {
    try {
      return await Api.get(path);
    } on ApiException {
      return null;
    }
  }

  static Future<List<Json?>> _fetch() => Future.wait([
    Api.get('/students/me/home'),
    _optional('/students/me/board'),
    _optional('/registration-periods/current'),
    _optional('/students/me/roommate-invitation'),
    _optional('/notifications?limit=3'),
  ]);

  @override
  Widget build(BuildContext context) {
    return Loader<List<Json?>>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final home = data[0]!;
        final board = data[1];
        final card = data[2]?.obj('card');
        final invitation = data[3]?.obj('invitation');
        final notifications = data[4];

        Future<void> open(Widget page) async {
          await push(context, page);
          await reload();
        }

        final left = timeLeft(card?.str('countdownTo'));
        return Cards(
          children: [
            _Hero(
              home: home,
              name: _greeting(home.str('firstName') ?? session.name),
              session: session,
              openTab: openTab,
            ),
            if (invitation != null)
              LinkBar(
                icon: Icons.group_add_outlined,
                tone: Tone.warning,
                text: t(
                  '${invitation.text('fromName')} invited you to share a Room',
                  '${invitation.text('fromName')} mời bạn ở chung phòng',
                ),
                note: t('Answer', 'Trả lời'),
                onTap: () => open(const RoommateInvitationScreen()),
              ),
            // Home keeps its own work: what to do now, the notifications, the registration period and the board.
            // Room, Payments and Activity are the tabs below; their screens are not repeated here.
            ?_next(home, open),
            if (notifications != null)
              NotificationsCard(data: notifications, reload: reload, seeAll: () => open(const NotificationsScreen())),
            if (card != null)
              LinkBar(
                icon: Icons.event_outlined,
                text: '${t('Registration', 'Đăng ký')} ${card.text('name')} · ${label(card.str('status'))}',
                note: left == null
                    ? null
                    : card.str('status') == 'Open'
                    ? t('closes in $left', 'còn $left')
                    : t('opens in $left', 'mở sau $left'),
                onTap: () => open(RegistrationPeriodScreen(termId: card.text('termId'))),
              ),
            if (board != null && board.objects('items').isNotEmpty) _Board(board: board, reload: reload),
          ],
        );
      },
    );
  }

  static String _greeting(String name) {
    final h = DateTime.now().hour;
    final first = name.trim().split(RegExp(r'\s+')).last;
    if (h < 12) return t('Good morning, $first', 'Chào buổi sáng, $first');
    if (h < 18) return t('Good afternoon, $first', 'Chào buổi chiều, $first');
    return t('Good evening, $first', 'Chào buổi tối, $first');
  }

  static String _stage(Json home) {
    if (home.obj('allocation') != null) return 'allocated';
    final app = home.obj('application');
    if (app == null) return 'new';
    return app.str('status') == 'Awaiting Deposit' ? 'awaiting-deposit' : 'applied';
  }

  static bool _closed(Json home) => _stage(home) == 'new' && home.obj('term')?.flag('registrationOpen') != true;

  /// The one thing to do now (web `NextAction`): apply or pay, with its button; a status while the office works on the
  /// Application; nothing once the student has a Room and nothing to pay (My Room is a tab of its own).
  Widget? _next(Json home, Future<void> Function(Widget) open) {
    final stage = _stage(home);
    final term = home.obj('term');
    final app = home.obj('application');
    final allocation = home.obj('allocation');
    final due = home.obj('dueInvoice');
    if (_closed(home)) {
      final closes = term?.str('registrationClosesAt');
      return NextAction(
        icon: Icons.description_outlined,
        title: term != null
            ? t('Registration for ${term.text('name')} is closed', 'Đăng ký ${term.text('name')} đã đóng')
            : t('Registration is not open yet', 'Đợt đăng ký chưa mở'),
        deadline: closes != null && DateTime.tryParse(closes)?.isBefore(DateTime.now()) == true
            ? t('Closed on ${day(closes)}', 'Đã đóng ngày ${day(closes)}')
            : null,
        body: t('The next period is announced on the dormitory board.', 'Đợt tiếp theo sẽ có trên bảng tin KTX.'),
      );
    }
    if (stage == 'new') {
      final left = timeLeft(term?.str('registrationClosesAt'));
      return NextAction(
        icon: Icons.description_outlined,
        title: term != null
            ? t('Apply for a Bed for ${term.text('name')}', 'Đăng ký giường KTX ${term.text('name')}')
            : t('Apply for a dormitory Bed', 'Đăng ký giường KTX'),
        deadline: left != null ? t('Registration closes in $left', 'Đăng ký đóng sau $left') : null,
        action: FilledButton(
          onPressed: term?.flag('registrationOpen') == true ? () => open(const ApplyScreen()) : null,
          child: Text(t('Start application', 'Bắt đầu đăng ký')),
        ),
      );
    }
    if (due != null && (stage == 'awaiting-deposit' || stage == 'allocated')) {
      final title = label(due.str('title')).isEmpty ? t('Invoice', 'Hoá đơn') : label(due.str('title'));
      return NextAction(
        icon: Icons.credit_card,
        title: '$title · ${money(due.number('amount'))}',
        deadline: [
          dueIn(due.str('dueAt')),
          if (due.str('dueAt') != null) moment(due.str('dueAt')),
        ].whereType<String>().join(' · '),
        body: stage == 'awaiting-deposit'
            ? t('Your Application is sent once the deposit is paid.', 'Đơn chỉ được gửi khi đã đặt cọc.')
            : null,
        action: FilledButton(
          onPressed: () => open(InvoiceScreen(id: due.text('id'))),
          child: Text(t('Pay now', 'Thanh toán ngay')),
        ),
      );
    }
    if (stage == 'awaiting-deposit') {
      return NextAction(
        icon: Icons.hourglass_top,
        title: t('Your deposit is being confirmed', 'Khoản cọc đang được xác nhận'),
        body: t('A Manager checks your transfer.', 'Quản lý đang kiểm tra khoản chuyển của bạn.'),
      );
    }
    if (stage == 'applied' || allocation == null) {
      return NextAction(
        icon: Icons.schedule,
        title: t('Your Application is under review', 'Đơn của bạn đang được xét'),
        deadline: term?.str('resultsPublishedAt') != null
            ? t(
                'Results on ${day(term!.str('resultsPublishedAt'))}',
                'Kết quả ngày ${day(term.str('resultsPublishedAt'))}',
              )
            : null,
        body: app == null
            ? null
            : joinDot([app.str('id'), label(app.str('roomTypeName')), label(app.str('roomClassName'))]),
      );
    }
    // A resident with nothing to pay: check-in dates while they matter, else nothing.
    if (home.flag('checkedIn') || term?.str('checkInStart') == null) return null;
    return NextAction(
      icon: Icons.login,
      title: t('Check-in ', 'Nhận phòng ') + range(term!.str('checkInStart'), term.str('checkInEnd')),
      deadline: '${roomBed(allocation.str('room'), allocation.str('bed'))} · ${label(allocation.str('block'))}',
      body: t(
        'Show your check-in pass at the desk; it is on My Room.',
        'Đưa thẻ nhận phòng (ở Phòng của tôi) tại quầy.',
      ),
    );
  }
}

// The dormitory board (spec §6.5, A-30): pinned and recent announcements, one compact row each; tapping one opens it
/// in a sheet and marks it read; a change announcement lists its old → new values.
class _Board extends StatefulWidget {
  const _Board({required this.board, required this.reload});

  final Json board;
  final Future<void> Function() reload;

  @override
  State<_Board> createState() => _BoardState();
}

class _BoardState extends State<_Board> {
  bool _all = false;
  final Set<String> _read = {};

  /// Web `categoryTone`.
  static Tone _tone(String? category) => switch (category) {
    'Registration' => Tone.brand,
    'Finance' => Tone.warning,
    'Rules' => Tone.info,
    _ => Tone.neutral,
  };

  bool _isRead(Json item) => item.flag('read') || _read.contains(item.str('id'));

  Future<void> _open(Json item) async {
    final id = item.text('id');
    if (!_isRead(item)) {
      setState(() => _read.add(id));
      Api.post('/notifications/${Uri.encodeComponent(id)}/read').ignore();
    }
    final link = item.str('link');
    final changes = item.objects('changes');
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 10,
            children: [
              Wrap(
                spacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (item.flag('pinned')) const Icon(Icons.push_pin, size: 16, color: Tokens.fgBrand),
                  if (item.str('category') != null)
                    Tag(label(item.str('category')), tone: _tone(item.str('category')), dot: false),
                  Text(
                    moment(item.str('shownFrom') ?? item.str('createdAt')),
                    style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                  ),
                ],
              ),
              Text(item.text('title'), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600)),
              for (final c in changes)
                Panel(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      Text(label(c.str('field')), style: const TextStyle(color: Tokens.fgTertiary)),
                      Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: _value(c.str('type'), c['before']),
                              style: const TextStyle(decoration: TextDecoration.lineThrough, color: Tokens.fgSecondary),
                            ),
                            const TextSpan(text: '  →  '),
                            TextSpan(
                              text: _value(c.str('type'), c['after']),
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              if (changes.isEmpty)
                Text(item.text('body'), style: const TextStyle(color: Tokens.fgSecondary, fontSize: 15)),
              if (link != null && link != '/student')
                BusyButton(
                  label: t('Open', 'Mở'),
                  onPressed: () async {
                    Navigator.pop(sheet);
                    await openLink(context, link);
                    await widget.reload();
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.board.objects('items');
    final shown = _all ? items : items.take(2).toList();
    final unread = items.where((i) => !_isRead(i)).length;
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 8,
            children: [
              const Icon(Icons.campaign_outlined, size: 20, color: Tokens.fg),
              Expanded(
                child: Text(
                  t('Dormitory board', 'Bảng tin KTX'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
              ),
              if (unread > 0) Tag(t('$unread unread', '$unread chưa đọc'), tone: Tone.brand, dot: false),
            ],
          ),
          const SizedBox(height: 6),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                t('No announcements right now.', 'Hiện chưa có thông báo.'),
                style: const TextStyle(color: Tokens.fgTertiary),
              ),
            ),
          for (var i = 0; i < shown.length; i++) ...[if (i > 0) const Divider(height: 1), _row(shown[i])],
          if (items.length > 2)
            LinkButton(
              _all ? t('Show fewer', 'Thu gọn') : t('Show all ${items.length}', 'Xem tất cả ${items.length}'),
              icon: _all ? Icons.expand_less : Icons.expand_more,
              onPressed: () => setState(() => _all = !_all),
            ),
        ],
      ),
    );
  }

  Widget _row(Json item) {
    final read = _isRead(item);
    return InkWell(
      onTap: () => _open(item),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 10,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 7),
              width: 8,
              height: 8,
              decoration: BoxDecoration(shape: BoxShape.circle, color: read ? Colors.transparent : Tokens.primary),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 3,
                children: [
                  Text(
                    item.text('title'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: read ? FontWeight.w400 : FontWeight.w600),
                  ),
                  Row(
                    spacing: 6,
                    children: [
                      if (item.flag('pinned')) const Icon(Icons.push_pin, size: 13, color: Tokens.fgBrand),
                      if (item.str('category') != null)
                        Text(
                          label(item.str('category')),
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: _tone(item.str('category')).fg,
                          ),
                        ),
                      Text(
                        moment(item.str('shownFrom') ?? item.str('createdAt')).split(' ').first,
                        style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Tokens.fgTertiary),
          ],
        ),
      ),
    );
  }

  /// A changed value as the web shows it (`showValue`): money, instants, days or text.
  static String _value(String? type, Object? value) {
    if (value == null) return '—';
    if ('$value'.isEmpty) return '—';
    return switch (type) {
      'MONEY' => money(value is num ? value : num.tryParse('$value')),
      'datetime' || 'DATETIME' => moment('$value'),
      'date' || 'DATE' => day('$value'),
      'PERCENT' => '$value%',
      'BOOL' => '$value' == 'true' ? t('On', 'Bật') : t('Off', 'Tắt'),
      _ => label('$value'),
    };
  }
}

/// The top of Home: the greeting and today's date on the brand gradient, and three facts at a glance (the Room, what
/// is due, open requests); tapping one opens its tab.
class _Hero extends StatelessWidget {
  const _Hero({required this.home, required this.name, required this.session, required this.openTab});

  final Json home;
  final String name;
  final Session session;
  final void Function(int tab, [String? segment]) openTab;

  static String _today() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    const vi = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
    const en = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    final date = day('${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}');
    return '${t(en[now.weekday - 1], vi[now.weekday - 1])}, $date';
  }

  @override
  Widget build(BuildContext context) {
    final allocation = home.obj('allocation');
    final due = (home.obj('invoices')?.number('due') ?? 0).toInt();
    final requests = (home.number('openRequests') ?? 0).toInt();
    return HeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 4,
        children: [
          Text(_today(), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
          Text(
            name,
            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
          ),
          if (session.studentCode != null)
            Text(
              session.studentCode!.toUpperCase(),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
            ),
          const SizedBox(height: 10),
          Row(
            spacing: 8,
            children: [
              _fact(
                Icons.bed_outlined,
                allocation == null ? t('Not yet', 'Chưa xếp') : allocation.text('room'),
                t('Room', 'Phòng'),
                () => openTab(1),
              ),
              _fact(Icons.credit_card, '$due', t('To pay', 'Cần trả'), () => openTab(2)),
              _fact(Icons.build_outlined, '$requests', t('Open requests', 'Yêu cầu mở'), () => openTab(3, 'requests')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _fact(IconData icon, String value, String text, VoidCallback onTap) {
    return Expanded(
      child: Material(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Icon(icon, size: 18, color: Colors.white),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
                ),
                Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
