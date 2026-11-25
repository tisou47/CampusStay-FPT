// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import 'api.dart';
import 'common.dart';
import 'links.dart';
import 'push.dart';
import 'screens/account.dart';
import 'screens/activity.dart';
import 'screens/assistant.dart';
import 'screens/home.dart';
import 'screens/notifications.dart';

import 'screens/room.dart';
import 'screens/sign_in.dart';
import 'session.dart';

/// The CampusStay student app (Change Specification v2 §11.2, bottom bar: Home · My Room · Account).
/// It follows the web's student portal and calls the same API; students sign in with their CampusStay password or
/// with Google (a Google sign-up first sets its password, then sends the sign-up form when the student list does not
/// know it), and the app registers for push once signed in.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await SessionStore.open();
  await Push.init();
  runApp(CampusStayApp(store: store));
}

class CampusStayApp extends StatefulWidget {
  const CampusStayApp({super.key, required this.store});

  final SessionStore store;

  @override
  State<CampusStayApp> createState() => _CampusStayAppState();
}

class _CampusStayAppState extends State<CampusStayApp> with WidgetsBindingObserver {
  final _navigator = GlobalKey<NavigatorState>();
  Session? _session;

  @override
  void initState() {
    super.initState();
    _session = widget.store.load();
    Api.token = _session?.token;
    Api.onSignedOut = () async {
      AssistantScreen.messages.clear(); // the next student on this phone must not see it (MOB-01)
      await Push.unregister(); // MOB-03: the device must not keep getting the previous student's pushes
      await googleSignOut(); // MOB-21
      await widget.store.clear();
      _navigator.currentState?.popUntil((route) => route.isFirst);
      if (mounted) setState(() => _session = null);
    };
    if (_session != null) _refreshUser();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // MOB-32: a verification decided while the app was in the background shows when the student comes back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshUser();
  }

  /// Learns the account's current state (`GET /auth/me`): a verification decided meanwhile, a new name.
  Future<void> _refreshUser() async {
    final session = _session;
    if (session == null) return;
    try {
      final me = await Api.get('/auth/me');
      final user = me.obj('user') ?? me;
      // MOB-19: pushes and emails follow the phone's language, like the app's own texts.
      final locale = isVietnamese() ? 'vi' : 'en';
      if (user.str('locale') != null && user.str('locale') != locale) {
        try {
          await Api.put('/auth/me/locale', {'locale': locale});
        } on ApiException {
          // the account keeps its language; tried again next time
        }
      }
      final updated = await widget.store.save(session.token, user);
      if (mounted) setState(() => _session = updated);
    } on ApiException {
      // keep the saved session; a 401 signs out on its own
    }
  }

  Future<void> _signOut() async {
    AssistantScreen.messages.clear(); // MOB-01
    await Push.unregister();
    try {
      await Api.post('/auth/sign-out');
    } on ApiException {
      // the token is dropped anyway
    }
    await googleSignOut(); // MOB-21
    await widget.store.clear();
    Api.token = null;
    _navigator.currentState?.popUntil((route) => route.isFirst);
    if (mounted) setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    return MaterialApp(
      title: 'CampusStay',
      theme: campusTheme(),
      navigatorKey: _navigator,
      scaffoldMessengerKey: messenger,
      debugShowCheckedModeBanner: false,
      home: session == null
          ? SignInScreen(
              onSignedIn: (token, user) async {
                Api.token = token;
                final saved = await widget.store.save(token, user);
                setState(() => _session = saved);
              },
            )
          : !session.passwordSet
          ? SetPasswordScreen(
              email: session.email,
              onDone: () async {
                final updated = await widget.store.passwordSet();
                setState(() => _session = updated);
                await _refreshUser();
              },
              onSignOut: _signOut,
            )
          : session.verification == 'Profile needed'
          ? VerificationScreen(onSent: _refreshUser, onSignOut: _signOut)
          : Shell(key: ValueKey(session.token), session: session, onSignOut: _signOut, onMessage: _refreshUser),
    );
  }
}

/// The three tabs (Home with the features as tiles, My Room, Account); the top bar has the assistant and the bell.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.session, required this.onSignOut, this.onMessage});

  final Session session;
  final Future<void> Function() onSignOut;

  /// A push arrived while the app is open: the account may have changed (a verification decided, MOB-32).
  final Future<void> Function()? onMessage;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;
  int _unread = 0;
  bool _assistant = false;
  Key _key = UniqueKey();

  @override
  void initState() {
    super.initState();
    openTab = _open;
    _loadUnread();
    assistantEnabled().then((on) {
      if (mounted) setState(() => _assistant = on);
    });
    // Push (A-05): ask for the notification permission, then send the FCM token to the API. A message that arrives
    // while the app is open is shown at the bottom of the screen.
    Push.register((message) {
      final title = message.notification?.title;
      if (title == null) return;
      final body = message.notification?.body;
      final link = message.data['link'] as String?;
      toast(
        body == null ? title : '$title\n$body',
        actionLabel: link == null || link.isEmpty ? null : 'Open',
        onAction: () => _openLink(link),
      );
      _loadUnread();
      widget.onMessage?.call();
    });
    // A notification tapped in the system tray opens its screen (MOB-02).
    Push.listenForTaps(_openLink);
  }

  void _openLink(String? link) {
    if (mounted) openLink(context, link);
  }

  @override
  void dispose() {
    if (openTab == _open) openTab = null;
    super.dispose();
  }

  Future<void> _loadUnread() async {
    try {
      final n = (await Api.get('/notifications?limit=1')).number('unread')?.toInt() ?? 0;
      if (mounted) setState(() => _unread = n);
    } on ApiException {
      // the bell shows no count
    }
  }

  /// Opens a part of the app: 0 Home, 1 My Room and 4 Account are tabs; 2 Payments and 3 Activity (applications or
  /// requests) open as pages over Home.
  Future<void> _open(int tab, [String? segment]) async {
    if (tab == 2 || tab == 3) {
      final page = tab == 2
          ? const PaymentsPage()
          : segment == 'applications'
          ? const ApplicationsPage()
          : RequestsPage(kind: segment == 'room-changes' ? 'room-changes' : 'maintenance');
      await push(context, page);
      _refresh();
      return;
    }
    setState(() {
      _tab = tab == 4 ? 2 : tab;
      _key = UniqueKey();
    });
    _loadUnread();
  }

  void _refresh() {
    if (!mounted) return;
    setState(() => _key = UniqueKey());
    _loadUnread();
  }

  @override
  Widget build(BuildContext context) {
    final pending = widget.session.verification == 'Pending verification';
    final name = widget.session.name.trim();
    final first = name.split(RegExp(r'\s+')).last;
    final titles = [null, t('My Room', 'Phòng của tôi'), t('Account', 'Tài khoản')];
    return Scaffold(
      appBar: AppBar(
        centerTitle: _tab != 0,
        titleSpacing: _tab == 0 ? 16 : null,
        toolbarHeight: _tab == 0 ? 68 : null,
        // Home's bar: the student's initial, name and code; the other tabs: their name.
        title: _tab == 0
            ? Row(
                spacing: 12,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                    alignment: Alignment.center,
                    child: Text(
                      first.characters.firstOrNull ?? '?',
                      style: const TextStyle(color: Tokens.primary, fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(
                          joinDot([widget.session.studentCode?.toUpperCase(), 'CampusStay FPT']),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                            color: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              )
            : Text(titles[_tab]!),
        actions: [
          if (_assistant)
            IconButton(
              tooltip: t('Ask the CampusStay Assistant', 'Hỏi Trợ lý CampusStay'),
              onPressed: () => push(context, const AssistantScreen()),
              icon: const Icon(Icons.smart_toy_outlined),
            ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              tooltip: t('Notifications', 'Thông báo'),
              onPressed: () async {
                await push(context, const NotificationsScreen());
                _refresh();
              },
              icon: Badge(
                isLabelVisible: _unread > 0,
                label: Text('$_unread'),
                backgroundColor: Tone.error.mark,
                child: const Icon(Icons.notifications, size: 28),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (pending)
            Material(
              color: Tone.warning.bg,
              child: InkWell(
                onTap: () => push(context, const VerificationScreen()),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  child: Row(
                    spacing: 10,
                    children: [
                      Icon(Icons.hourglass_top, size: 18, color: Tone.warning.mark),
                      Expanded(
                        child: Text(
                          t(
                            'Your account is waiting for a Manager to verify it. You can look around; you can apply once it is verified.',
                            'Tài khoản đang chờ Quản lý xác minh. Bạn vẫn xem được ứng dụng; đăng ký được khi đã xác minh.',
                          ),
                          style: TextStyle(color: Tone.warning.fg, fontSize: 13),
                        ),
                      ),
                      Text(
                        t('See my details', 'Xem thông tin'),
                        style: TextStyle(color: Tone.warning.fg, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Expanded(
            child: KeyedSubtree(
              key: _key,
              child: switch (_tab) {
                0 => HomeScreen(session: widget.session, openTab: _open, unread: _unread),
                1 => const RoomScreen(),
                _ => AccountScreen(session: widget.session, onSignOut: widget.onSignOut),
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomBar(
        index: _tab,
        onTap: (i) => _open(i == 2 ? 4 : i),
        items: [
          (Icons.home_rounded, t('Home', 'Trang chủ')),
          (Icons.bed_rounded, t('My Room', 'Phòng của tôi')),
          (Icons.person_rounded, t('Account', 'Tài khoản')),
        ],
      ),
    );
  }
}
