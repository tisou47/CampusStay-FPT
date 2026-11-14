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
import 'screens/payments.dart';
import 'screens/room.dart';
import 'screens/sign_in.dart';
import 'session.dart';

/// The CampusStay student app (Change Specification v2 §11.2, phone menu: Home · My Room · Payments · Activity).
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

class _CampusStayAppState extends State<CampusStayApp> {
  final _navigator = GlobalKey<NavigatorState>();
  Session? _session;

  @override
  void initState() {
    super.initState();
    _session = widget.store.load();
    Api.token = _session?.token;
    Api.onSignedOut = () async {
      await widget.store.clear();
      _navigator.currentState?.popUntil((route) => route.isFirst);
      if (mounted) setState(() => _session = null);
    };
    if (_session != null) _refreshUser();
  }

  /// Learns the account's current state (`GET /auth/me`): a verification decided meanwhile, a new name.
  Future<void> _refreshUser() async {
    final session = _session;
    if (session == null) return;
    try {
      final user = await Api.get('/auth/me');
      final updated = await widget.store.save(session.token, user.obj('user') ?? user);
      if (mounted) setState(() => _session = updated);
    } on ApiException {
      // keep the saved session; a 401 signs out on its own
    }
  }

  Future<void> _signOut() async {
    await Push.unregister();
    try {
      await Api.post('/auth/sign-out');
    } on ApiException {
      // the token is dropped anyway
    }
    await widget.store.clear();
    Api.token = null;
    _navigator.currentState?.popUntil((route) => route.isFirst);
    setState(() => _session = null);
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
          : Shell(key: ValueKey(session.token), session: session, onSignOut: _signOut),
    );
  }
}

/// The four tabs of the phone menu; the top bar has the notifications bell and the account menu.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.session, required this.onSignOut});

  final Session session;
  final Future<void> Function() onSignOut;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;
  String _segment = 'requests';
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
      toast(body == null ? title : '$title\n$body');
      _loadUnread();
    });
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

  void _open(int tab, [String? segment]) {
    setState(() {
      _tab = tab;
      if (segment != null) _segment = segment;
      _key = UniqueKey();
    });
    _loadUnread();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      (t('Home', 'Trang chủ'), Icons.home_outlined, Icons.home),
      (t('My Room', 'Phòng của tôi'), Icons.bed_outlined, Icons.bed),
      (t('Payments', 'Thanh toán'), Icons.payments_outlined, Icons.payments),
      (t('Activity', 'Hoạt động'), Icons.view_list_outlined, Icons.view_list),
    ];
    final pending = widget.session.verification == 'Pending verification';
    final first = widget.session.name.trim().split(RegExp(r'\s+')).last;
    return Scaffold(
      appBar: AppBar(
        title: _tab == 0
            ? Row(
                spacing: 8,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(color: Tokens.accent, borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.apartment, size: 18, color: Colors.white),
                  ),
                  const Text('CampusStay'),
                ],
              )
            : Text(tabs[_tab].$1),
        actions: [
          if (_assistant)
            IconButton(
              tooltip: t('Ask the CampusStay Assistant', 'Hỏi Trợ lý CampusStay'),
              onPressed: () => push(context, const AssistantScreen()),
              icon: const Icon(Icons.smart_toy_outlined),
            ),
          IconButton(
            tooltip: t('Notifications', 'Thông báo'),
            onPressed: () async {
              await push(context, const NotificationsScreen());
              _loadUnread();
            },
            icon: Badge(
              isLabelVisible: _unread > 0,
              label: Text('$_unread'),
              backgroundColor: Tokens.primary,
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              tooltip: t('Account', 'Tài khoản'),
              onPressed: () => showAccountSheet(context, widget.session, widget.onSignOut),
              icon: CircleAvatar(
                radius: 15,
                backgroundColor: Tokens.accent,
                foregroundColor: Colors.white,
                child: Text(
                  first.characters.firstOrNull ?? '?',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
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
                0 => HomeScreen(session: widget.session, openTab: _open),
                1 => const RoomScreen(),
                2 => const PaymentsScreen(),
                _ => ActivityScreen(segment: _segment),
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => _open(i),
        destinations: [
          for (final (name, icon, selected) in tabs)
            NavigationDestination(icon: Icon(icon), selectedIcon: Icon(selected), label: name),
        ],
      ),
    );
  }
}
