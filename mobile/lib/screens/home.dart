import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../links.dart';
import '../session.dart';
import 'applications.dart';
import 'apply.dart';
import 'family_day.dart';
import 'notifications.dart';
import 'payments.dart';
import 'registration.dart';

//// Student Home (web SCR-HOME-01, phone MOB-HOME-01, R-12), laid out as the phone's menu: the one thing to do now,
/// then the app's features as tiles in groups (notifications and registration; room life; payments), each with its
/// count. Every list opens on a page of its own.
/// `GET /students/me/home`, `/notifications`, `/students/me/board`, `/registration-periods/current`,
/// `/students/me/roommate-invitation`.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session, required this.openTab, this.unread = 0});

  final Session session;

  /// Opens a part of the shell: 1 My Room, 2 Payments, 3 Activity (with its segment: applications, requests).
  final void Function(int tab, [String? segment]) openTab;

  /// Unread notifications (the shell's count).
  final int unread;

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
    _optional('/notifications?limit=1'),
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
        final notifications = (data[4]?.number('unread') ?? unread).toInt();
        final boardUnread = (board?.objects('items') ?? const <Json>[]).where((i) => !i.flag('read')).length;
        final due = (home.obj('invoices')?.number('due') ?? 0).toInt();
        final requests = (home.number('openRequests') ?? 0).toInt();
        final left = timeLeft(card?.str('countdownTo'));
        final app = home.obj('application');

        Future<void> open(Widget page) async {
          await push(context, page);
          await reload();
        }

        Future<void> tab(int index, [String? segment]) async {
          openTab(index, segment);
        }

        return Cards(
          children: [
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
            ?_next(home, open),
            FeatureSection(
              title: t('Notifications and applications', 'Thông báo và đơn đăng ký'),
              tiles: [
                FeatureTile(
                  icon: Icons.notifications_rounded,
                  color: const Color(0xFFF59E0B),
                  label: t('Notifications', 'Thông báo'),
                  badge: notifications,
                  onTap: () => open(const NotificationsScreen()),
                ),
                FeatureTile(
                  icon: Icons.assignment_ind_rounded,
                  color: Tokens.link,
                  label: t('Applications', 'Đơn đăng ký'),
                  note: app == null ? null : label(app.str('status')),
                  onTap: () => tab(3, 'applications'),
                ),
                if (card != null)
                  FeatureTile(
                    icon: Icons.event_available_rounded,
                    color: const Color(0xFF0EA5E9),
                    label: t('Registration period', 'Đợt đăng ký'),
                    note: left == null
                        ? label(card.str('status'))
                        : card.str('status') == 'Open'
                        ? t('closes in $left', 'còn $left')
                        : t('opens in $left', 'mở sau $left'),
                    onTap: () => open(RegistrationPeriodScreen(termId: card.text('termId'))),
                  ),
                FeatureTile(
                  icon: Icons.campaign_rounded,
                  color: const Color(0xFF8B5CF6),
                  label: t('Dormitory board', 'Bảng tin KTX'),
                  badge: boardUnread,
                  onTap: () => open(const BoardScreen()),
                ),
              ],
            ),
            FeatureSection(
              title: t('Dormitory life', 'Sinh hoạt KTX'),
              tiles: [
                FeatureTile(
                  icon: Icons.build_rounded,
                  color: const Color(0xFF10B981),
                  label: t('Requests', 'Yêu cầu'),
                  badge: requests,
                  onTap: () => tab(3, 'requests'),
                ),
                FeatureTile(
                  icon: Icons.family_restroom_rounded,
                  color: const Color(0xFFEC4899),
                  label: t('Family Days', 'Ngày gia đình'),
                  onTap: () => open(const FamilyDaysScreen()),
                ),
              ],
            ),
            FeatureSection(
              title: t('Finance', 'Tài chính'),
              tiles: [
                FeatureTile(
                  icon: Icons.payments_rounded,
                  color: Tone.error.mark,
                  label: t('Payments', 'Thanh toán'),
                  badge: due,
                  onTap: () => tab(2),
                ),
              ],
            ),
          ],
        );
      },
    );
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

// The dormitory board (spec §6.5, A-30, web `DormitoryBoard`): pinned and recent announcements, one row each with its
/// category; tapping one opens it in place and marks it read; a change announcement lists what changed, before and now.
class _Board extends StatefulWidget {
  const _Board({required this.board, required this.reload, this.all = false});

  final Json board;
  final Future<void> Function() reload;

  /// Every announcement (the board's page) instead of the newest three.
  final bool all;

  @override
  State<_Board> createState() => _BoardState();
}

class _BoardState extends State<_Board> {
  late bool _all = widget.all;
  final Set<String> _read = {};
  final Set<String> _open = {};

  /// Web `categoryTone`.
  static Tone _tone(String? category) => switch (category) {
    'Registration' => Tone.brand,
    'Finance' => Tone.warning,
    'Rules' => Tone.info,
    _ => Tone.neutral,
  };

  bool _isRead(Json item) => item.flag('read') || _read.contains(item.str('id'));

  void _toggle(Json item) {
    final id = item.text('id');
    setState(() {
      if (!_open.remove(id)) _open.add(id);
      if (!_isRead(item)) {
        _read.add(id);
        Api.post('/notifications/${Uri.encodeComponent(id)}/read').ignore();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.board.objects('items');
    final shown = _all ? items : items.take(3).toList();
    final unread = items.where((i) => !_isRead(i)).length;
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 8,
            children: [
              const Icon(Icons.campaign_outlined, size: 20, color: Tokens.fgBrand),
              Expanded(
                child: Text(
                  t('Dormitory board', 'Bảng tin ký túc xá'),
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
                t('No announcements right now.', 'Hiện chưa có tin.'),
                style: const TextStyle(color: Tokens.fgTertiary),
              ),
            ),
          for (var i = 0; i < shown.length; i++) ...[if (i > 0) const Divider(height: 1), _row(shown[i])],
          if (items.length > 3)
            LinkButton(
              _all ? t('Show fewer', 'Thu gọn') : t('Show all ${items.length}', 'Xem cả ${items.length}'),
              icon: _all ? Icons.expand_less : Icons.expand_more,
              onPressed: () => setState(() => _all = !_all),
            ),
        ],
      ),
    );
  }

  Widget _row(Json item) {
    final read = _isRead(item);
    final open = _open.contains(item.str('id'));
    final link = item.str('link');
    final changes = item.objects('changes');
    final body = item.text('body');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: () => _toggle(item),
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
                    spacing: 4,
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (item.flag('pinned')) const Icon(Icons.push_pin, size: 14, color: Tokens.fgBrand),
                          if (item.str('category') != null)
                            Tag(label(item.str('category')), tone: _tone(item.str('category')), dot: false),
                        ],
                      ),
                      Text(
                        item.text('title'),
                        maxLines: open ? null : 2,
                        overflow: open ? null : TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: read ? FontWeight.w400 : FontWeight.w600),
                      ),
                      Text(
                        moment(item.str('shownFrom') ?? item.str('createdAt')),
                        style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                      ),
                    ],
                  ),
                ),
                Icon(open ? Icons.expand_less : Icons.expand_more, color: Tokens.fgSecondary),
              ],
            ),
          ),
        ),
        if (open)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 0, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                if (changes.isNotEmpty) ...[
                  ChangesTable(changes: changes),
                  // The lines of the text that are not the changes themselves (the reason for the change).
                  if (body.contains('\n'))
                    Text(
                      body.split('\n').where((l) => !l.startsWith('•')).skip(1).join('\n'),
                      style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                    ),
                ] else
                  Text(body, style: const TextStyle(fontSize: 14, color: Tokens.fgSecondary)),
                if (link != null && link != '/student')
                  LinkButton(
                    t('Open', 'Mở'),
                    icon: Icons.chevron_right,
                    onPressed: () async {
                      await openLink(context, link);
                      await widget.reload();
                    },
                  ),
              ],
            ),
          ),
      ],
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

/// What a change announcement changed (web board table): one row per value, before and now.
class ChangesTable extends StatelessWidget {
  const ChangesTable({super.key, required this.changes});

  final List<Json> changes;

  @override
  Widget build(BuildContext context) {
    const head = TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Tokens.fgTertiary);
    return Table(
      columnWidths: const {0: FlexColumnWidth(1.2), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1)},
      defaultVerticalAlignment: TableCellVerticalAlignment.top,
      children: [
        TableRow(
          children: [
            for (final text in [t('What changed', 'Mục thay đổi'), t('Before', 'Trước'), t('Now', 'Bây giờ')])
              Padding(
                padding: const EdgeInsets.only(bottom: 4, right: 8),
                child: Text(text, style: head),
              ),
          ],
        ),
        for (final c in changes)
          TableRow(
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Tokens.line)),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 5, 8, 5),
                child: Text(label(c.str('field')), style: const TextStyle(fontSize: 13)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 5, 8, 5),
                child: Text(
                  _BoardState._value(c.str('type'), c['before']),
                  style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Text(
                  _BoardState._value(c.str('type'), c['after']),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

/// Opens an announcement of the dormitory board in a sheet (the board's rows and the notifications that are
/// announcements): its category, date and title, the old → new values of a change announcement or its text, and
/// "Open" when it links to another screen. [reload] runs after that screen is closed.
Future<void> showAnnouncement(BuildContext context, Json item, {Future<void> Function()? reload}) async {
  final link = item.str('link');
  final changes = item.objects('changes');
  final body = item.text('body');
  final tone = _BoardState._tone(item.str('category'));
  final icon = switch (item.str('category')) {
    'Registration' => Icons.how_to_reg_outlined,
    'Finance' => Icons.payments_outlined,
    'Rules' => Icons.gavel_outlined,
    _ => Icons.campaign_outlined,
  };
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: Tokens.surface,
    // Full width on every phone (Material 3 otherwise sizes the sheet to its content).
    constraints: const BoxConstraints(minWidth: double.infinity),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (sheet) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.35,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          Row(
            spacing: 12,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: tone == Tone.neutral ? Tokens.brandSubtle : tone.bg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 22, color: tone == Tone.neutral ? Tokens.fgBrand : tone.fg),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 4,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (item.str('category') != null) Tag(label(item.str('category')), tone: tone, dot: false),
                        if (item.flag('pinned'))
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            spacing: 3,
                            children: [
                              const Icon(Icons.push_pin, size: 14, color: Tokens.fgBrand),
                              Text(t('Pinned', 'Đã ghim'), style: const TextStyle(fontSize: 12, color: Tokens.fgBrand)),
                            ],
                          ),
                      ],
                    ),
                    Text(
                      moment(item.str('shownFrom') ?? item.str('createdAt')),
                      style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: t('Close', 'Đóng'),
                onPressed: () => Navigator.pop(sheet),
                icon: const Icon(Icons.close, color: Tokens.fgSecondary),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            item.text('title'),
            style: const TextStyle(fontSize: 21, height: 1.3, fontWeight: FontWeight.w700, color: Tokens.fg),
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 14),
          if (changes.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Tokens.subtle, borderRadius: BorderRadius.circular(12)),
              child: ChangesTable(changes: changes),
            ),
            // The lines of the text that are not the changes themselves (the reason for the change).
            if (body.contains('\n')) ...[
              const SizedBox(height: 12),
              Text(
                body.split('\n').where((l) => !l.startsWith('•')).skip(1).join('\n'),
                style: const TextStyle(fontSize: 14, height: 1.5, color: Tokens.fgSecondary),
              ),
            ],
          ] else
            Text(body, style: const TextStyle(fontSize: 15.5, height: 1.55, color: Tokens.fg)),
          const SizedBox(height: 24),
          if (link != null && link != '/student') ...[
            BusyButton(
              label: t('Open', 'Mở'),
              icon: Icons.open_in_new,
              onPressed: () async {
                Navigator.pop(sheet);
                await openLink(context, link);
                await reload?.call();
              },
            ),
            const SizedBox(height: 8),
          ],
          BusyButton(label: t('Close', 'Đóng'), outlined: true, onPressed: () => Navigator.pop(sheet)),
        ],
      ),
    ),
  );
}

/// The dormitory board on a page of its own (Home's "Dormitory board" tile): every announcement, newest first.
class BoardScreen extends StatelessWidget {
  const BoardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Dormitory board', 'Bảng tin KTX'),
      body: Loader<Json>(
        fetch: () => Api.get('/students/me/board'),
        builder: (context, board, reload) => Cards(
          children: [
            if (board.objects('items').isEmpty)
              EmptyState(icon: Icons.campaign_outlined, title: t('No announcements right now.', 'Hiện chưa có tin.'))
            else
              _Board(board: board, reload: reload, all: true),
          ],
        ),
      ),
    );
  }
}
