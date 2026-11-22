import 'package:campusstay_student/api.dart';
import 'package:campusstay_student/main.dart';
import 'package:campusstay_student/screens/assistant.dart';
import 'package:campusstay_student/session.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

// MOB-01: the assistant conversation holds the student's data; the next student on the same phone must not see it.
void main() {
  testWidgets('signing out forgets the assistant conversation', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await SessionStore.open();
    await tester.pumpWidget(CampusStayApp(store: store));
    AssistantScreen.messages
      ..add((role: 'user', content: 'Which room am I in?', error: false, signature: null))
      ..add((role: 'assistant', content: 'Room B-509, Bed F.', error: false, signature: 'sig'));

    Api.onSignedOut(); // what a 401 does
    await tester.pump();

    expect(AssistantScreen.messages, isEmpty);
  });
}
