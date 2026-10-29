import 'package:flutter/material.dart';

import 'api.dart';
import 'common.dart';
import 'push.dart';
import 'screens/activity.dart';
import 'screens/home.dart';
import 'screens/payments.dart';
import 'screens/room.dart';
import 'screens/sign_in.dart';
import 'session.dart';

/// The CampusStay student app (Change Specification v2 §11.2, phone menu: Home · My Room · Payments · Activity).
/// It follows the web's student portal and calls the same API; students sign in with their CampusStay password or
/// with Google (a Google sign-up first sets its password), and the app registers for push once signed in.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await SessionStore.open();
  await Push.init();
  runApp(CampusStayApp(store: store));
}

final messenger = GlobalKey<ScaffoldMessengerState>();

/// The web's student portal colours: FPT orange on a light grey canvas.
final _theme = ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFFF26F21),
    primary: const Color(0xFFF26F21),
    onPrimary: Colors.white,
    primaryContainer: const Color(0xFFFFE6D6),
    onPrimaryContainer: const Color(0xFF6B2A00),
    surface: Colors.white,
  ),
  scaffoldBackgroundColor: const Color(0xFFF7F7F8),
  cardTheme: const CardThemeData(color: Colors.white, elevation: 0.5),
);

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
  }

  Future<void> _signOut() async {
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
      theme: _theme,
      navigatorKey: _navigator,
      scaffoldMessengerKey: messenger,
      debugShowCheckedModeBanner: false,
      home: session == null
          ? SignInScreen(onSignedIn: (token, user) async {
              Api.token = token;
              final saved = await widget.store.save(token, user);
              setState(() => _session = saved);
            })
          : !session.passwordSet
              ? SetPasswordScreen(
                  email: session.email,
                  onDone: () async {
                    final updated = await widget.store.passwordSet();
                    setState(() => _session = updated);
                  },
                  onSignOut: _signOut,
                )
              : Shell(key: ValueKey(session.token), session: session, onSignOut: _signOut),
    );
  }
}

/// The four tabs of the phone menu, with sign-out in the top bar.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.session, required this.onSignOut});

  final Session session;
  final Future<void> Function() onSignOut;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    // Push (A-05): ask for the notification permission, then send the FCM token to the API. A message that arrives
    // while the app is open is shown at the bottom of the screen.
    Push.register((message) {
      final title = message.notification?.title;
      if (title == null) return;
      final body = message.notification?.body;
      messenger.currentState?.showSnackBar(SnackBar(content: Text(body == null ? title : '$title\n$body')));
    });
  }

  Future<void> _signOut() async {
    await Push.unregister();
    try {
      await Api.post('/auth/sign-out');
    } on ApiException {
      // the token is dropped anyway
    }
    await widget.onSignOut();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      (t('Home', 'Trang chủ'), Icons.home_outlined, Icons.home),
      (t('My Room', 'Phòng của tôi'), Icons.bed_outlined, Icons.bed),
      (t('Payments', 'Thanh toán'), Icons.payments_outlined, Icons.payments),
      (t('Activity', 'Hoạt động'), Icons.notifications_outlined, Icons.notifications),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(tabs[_tab].$1),
        actions: [
          IconButton(onPressed: _signOut, tooltip: t('Sign out', 'Đăng xuất'), icon: const Icon(Icons.logout)),
        ],
      ),
      body: switch (_tab) {
        0 => HomeScreen(
            session: widget.session,
            openPayments: () => setState(() => _tab = 2),
            openRoom: () => setState(() => _tab = 1),
          ),
        1 => const RoomScreen(),
        2 => const PaymentsScreen(),
        _ => const ActivityScreen(),
      },
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          for (final (name, icon, selected) in tabs)
            NavigationDestination(icon: Icon(icon), selectedIcon: Icon(selected), label: name),
        ],
      ),
    );
  }
}
