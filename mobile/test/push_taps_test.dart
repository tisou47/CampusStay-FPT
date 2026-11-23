import 'dart:async';

import 'package:campusstay_student/push.dart';
import 'package:flutter_test/flutter_test.dart';

/// MOB-02 (Review Focus 4): a tapped notification opens its link once signed in; the one that started the app first.
void main() {
  test(
    'the notification that started the app and later taps open their links',
    () async {
      final taps = StreamController<String?>();
      Push.initialLink = () async => '/student/invoices/INV-1/pay';
      Push.openedLinks = () => taps.stream;
      final opened = <String>[];
      await Push.listenForTaps(opened.add);
      taps.add('/student/notifications');
      taps.add(null);
      await Future<void>.delayed(Duration.zero);
      expect(opened, ['/student/invoices/INV-1/pay', '/student/notifications']);
      await taps.close();
    },
  );

  test('nothing opens when no notification was tapped', () async {
    Push.initialLink = () async => null;
    Push.openedLinks = () => const Stream<String?>.empty();
    final opened = <String>[];
    await Push.listenForTaps(opened.add);
    expect(opened, isEmpty);
  });
}
