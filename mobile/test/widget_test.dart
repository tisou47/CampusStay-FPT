import 'package:campusstay_student/common.dart';
import 'package:campusstay_student/screens/sign_in.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// The test machine's language is English, so the English texts and formats are checked.
void main() {
  test('money, days and instants read like the web', () {
    expect(money(1200000), '1,200,000 VND');
    expect(money(null), '0 VND');
    expect(day('2026-10-28'), '28 Oct 2026');
    expect(day(null), '—');
    expect(moment('2026-10-28T17:05:00Z'), '29 Oct 2026 00:05');
    expect(label('Awaiting confirmation'), 'Awaiting confirmation');
  });

  test('JSON reading treats blanks and nulls alike', () {
    final Json json = {'a': '', 'b': null, 'c': 'x', 'd': {'e': 1}, 'f': [{'g': true}]};
    expect(json.str('a'), isNull);
    expect(json.str('b'), isNull);
    expect(json.text('c'), 'x');
    expect(json.obj('d')?.number('e'), 1);
    expect(json.objects('f').single.flag('g'), isTrue);
  });

  testWidgets('sign-in needs an email and a password', (tester) async {
    await tester.pumpWidget(MaterialApp(home: SignInScreen(onSignedIn: (_, _) async {})));
    expect(find.text('CampusStay FPT'), findsOneWidget);
    final button = find.widgetWithText(FilledButton, 'Sign in');
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    await tester.enterText(find.byType(TextField).at(0), 'student@fpt.edu.vn');
    await tester.enterText(find.byType(TextField).at(1), 'secret123');
    await tester.pump();
    expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
  });
}
