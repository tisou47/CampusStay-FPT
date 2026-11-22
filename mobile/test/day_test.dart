import 'package:campusstay_student/common.dart';
import 'package:flutter_test/flutter_test.dart';

/// MOB-24: an instant shown as a day is the campus day (UTC+7), not the UTC date.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('an instant late in the UTC evening is the next campus day', () {
    expect(day('2026-11-20T23:30:00Z'), '21 Nov 2026');
    expect(day('2026-11-20T16:59:00Z'), '20 Nov 2026');
  });

  test('a calendar day stays as it is', () {
    expect(day('2026-11-20'), '20 Nov 2026');
    expect(day(null), '—');
  });
}
