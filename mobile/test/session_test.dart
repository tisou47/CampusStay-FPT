import 'dart:convert';

import 'package:campusstay_student/api.dart';
import 'package:campusstay_student/main.dart';
import 'package:campusstay_student/push.dart';
import 'package:campusstay_student/screens/assistant.dart';
import 'package:campusstay_student/screens/sign_in.dart';
import 'package:campusstay_student/session.dart';
// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

// MOB-11, MOB-20: where the session is kept, what a 401 and signing out do (fictional data only).
const _user = {
  'name': 'Nguyễn Văn Demo',
  'email': 'demo@fpt.edu.vn',
  'studentCode': 'SE000001',
  'role': 'student',
  'passwordSet': true,
  'verification': 'Verified',
};

final calls = <String>[];

void useApi(int Function(String call) status) {
  calls.clear();
  Api.client = MockClient((request) async {
    final call = '${request.method} ${request.url.path.replaceFirst(RegExp(r'^/api'), '')}';
    calls.add(call);
    final code = status(call);
    final body = call == 'GET /auth/me' && code == 200 ? {'user': _user} : {'items': [], 'unread': 0};
    return http.Response.bytes(utf8.encode(jsonEncode(code == 200 ? body : {'message': 'No'})), code);
  });
}

/// Lets the platform-channel mocks (secure storage, preferences) answer, then draws.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pumpAndSettle();
  }
}

void main() {
  setUp(() {
    Push.token = () async => 'fcm-token';
    Push.initialLink = () async => null;
    Push.openedLinks = () => const Stream<String?>.empty();
  });

  test('the token lives in secure storage and survives a restart; prefs hold no token', () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    final store = await SessionStore.open();
    await store.save('tok-1', _user);

    final again = await SessionStore.open();
    expect(again.load()?.token, 'tok-1');
    expect(again.load()?.name, 'Nguyễn Văn Demo');
    expect((await SharedPreferences.getInstance()).getString('token'), isNull);
    expect(await const FlutterSecureStorage().read(key: 'token'), 'tok-1');

    await again.clear();
    expect((await SessionStore.open()).load(), isNull);
  });

  test('a token an older version left in plain prefs moves to secure storage once', () async {
    SharedPreferences.setMockInitialValues({'token': 'old-tok', 'name': 'Demo', 'email': 'demo@fpt.edu.vn'});
    FlutterSecureStorage.setMockInitialValues({});
    final store = await SessionStore.open();
    expect(store.load()?.token, 'old-tok');
    expect((await SharedPreferences.getInstance()).getString('token'), isNull);
    expect(await const FlutterSecureStorage().read(key: 'token'), 'old-tok');
  });

  testWidgets('a 401 signs out: the sign-in screen shows and the store is empty', (tester) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    useApi((call) => call == 'GET /auth/me' ? 401 : 200);
    final store = await SessionStore.open();
    await store.save('tok-1', _user);
    AssistantScreen.messages.add((role: 'user', content: 'Hi', error: false, signature: null));

    await tester.pumpWidget(CampusStayApp(store: store));
    await settle(tester);

    expect(find.byType(SignInScreen), findsOneWidget);
    expect(store.load(), isNull);
    expect(Api.token, isNull);
    expect(AssistantScreen.messages, isEmpty);
    expect(calls, contains('POST /devices/unregister'));
  });

  testWidgets('signing out unregisters the device, ends the session and clears the store', (tester) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    useApi((_) => 200);
    final store = await SessionStore.open();
    await store.save('tok-1', _user);
    await tester.pumpWidget(CampusStayApp(store: store));
    await settle(tester);
    expect(find.byType(Shell), findsOneWidget);
    tester.widget<Shell>(find.byType(Shell)).onSignOut(); // what Account › Sign out calls
    await settle(tester);

    expect(calls, containsAllInOrder(['POST /devices/unregister', 'POST /auth/sign-out']));
    expect(find.byType(SignInScreen), findsOneWidget);
    expect(store.load(), isNull);
  });

  testWidgets('a Staff sign-in on the app ends the session it opened (MOB-12)', (tester) async {
    useApi((_) => 200);
    Api.client = MockClient((request) async {
      final call = '${request.method} ${request.url.path.replaceFirst(RegExp(r'^/api'), '')}';
      calls.add('$call ${request.headers['Authorization'] ?? ''}');
      final body = call == 'POST /auth/sign-in'
          ? {
              'token': 'staff-tok',
              'user': {..._user, 'role': 'staff'},
            }
          : <String, Object>{};
      return http.Response.bytes(utf8.encode(jsonEncode(body)), 200);
    });
    var signedIn = false;
    await tester.pumpWidget(MaterialApp(home: SignInScreen(onSignedIn: (_, _) async => signedIn = true)));
    await tester.enterText(find.byType(TextField).at(0), 'staff@fpt.edu.vn');
    await tester.enterText(find.byType(TextField).at(1), 'secret123');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await settle(tester);

    expect(signedIn, isFalse);
    expect(calls, contains('POST /auth/sign-out Bearer staff-tok'));
    expect(Api.token, isNull);
    expect(find.textContaining('This app is for students'), findsOneWidget);
  });
}
