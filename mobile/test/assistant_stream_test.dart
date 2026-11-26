import 'dart:convert';

import 'package:campusstay_student/api.dart';
import 'package:campusstay_student/common.dart';
import 'package:campusstay_student/screens/assistant.dart';
// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// D6: the assistant's answer streams in (Server-Sent Events); an older server without the stream still answers.
void main() {
  setUp(AssistantScreen.messages.clear);

  Future<void> ask(WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(theme: campusTheme(), home: const AssistantScreen()));
    await tester.enterText(find.byType(TextField), 'Which room am I in?');
    await tester.tap(find.byIcon(Icons.send));
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump();
    }
  }

  testWidgets('the streamed answer is kept with its signature, a reset clears the text so far', (tester) async {
    Api.client = MockClient((request) async {
      expect(request.url.path, endsWith('/students/me/assistant/chat/stream'));
      const sse = 'event: delta\ndata: {"text":"你好"}\n\n'
          'event: reset\ndata: {}\n\n'
          'event: delta\ndata: {"text":"Room "}\n\n'
          'event: delta\ndata: {"text":"B-509."}\n\n'
          'event: done\ndata: {"reply":"Room B-509.","signature":"sig"}\n\n';
      return http.Response.bytes(utf8.encode(sse), 200, headers: {'content-type': 'text/event-stream'});
    });
    await ask(tester);
    expect(AssistantScreen.messages.last.content, 'Room B-509.');
    expect(AssistantScreen.messages.last.signature, 'sig');
    expect(find.text('Room B-509.'), findsOneWidget);
  });

  testWidgets('a server without the stream answers through /chat', (tester) async {
    Api.client = MockClient((request) async {
      if (request.url.path.endsWith('/stream')) return http.Response(jsonEncode({'message': 'Not found'}), 404);
      return http.Response.bytes(utf8.encode(jsonEncode({'reply': 'Room B-509.', 'signature': 's'})), 200);
    });
    await ask(tester);
    expect(AssistantScreen.messages.last.content, 'Room B-509.');
  });

  testWidgets('an error event shows as an error turn', (tester) async {
    Api.client = MockClient((request) async {
      const sse = 'event: error\ndata: {"code":"ASSISTANT_OFFLINE","message":"The assistant is offline."}\n\n';
      return http.Response.bytes(utf8.encode(sse), 200, headers: {'content-type': 'text/event-stream'});
    });
    await ask(tester);
    expect(AssistantScreen.messages.last.error, isTrue);
    expect(find.text('The assistant is offline.'), findsOneWidget);
  });
}
