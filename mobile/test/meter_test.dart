import 'package:campusstay_student/common.dart';
import 'package:flutter_test/flutter_test.dart';

/// MOB-29: meter readings in Vietnamese or English style, the web's `parseDecimal` rule.
void main() {
  test('a decimal comma or point reads as the same number', () {
    expect(meterReading('1360,5'), 1360.5);
    expect(meterReading('1.360,5'), 1360.5);
    expect(meterReading('1360.5'), 1360.5);
    expect(meterReading('1,360.5'), 1360.5);
    expect(meterReading(' 12,5 '), 12.5);
    expect(meterReading('0,125'), 0.125);
    expect(meterReading('1234'), 1234);
  });

  test('an ambiguous or non-number reading is refused, not sent as null', () {
    expect(meterReading('1.360'), isNull);
    expect(meterReading('1,360'), isNull);
    expect(meterReading('12a'), isNull);
  });
}
