import 'dart:convert';
import 'dart:io';

import 'package:campusstay_student/api.dart';
import 'package:campusstay_student/screens/room.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// MOB-22 (N1): the last allocation (with the check-in pass) is kept for the desk when the network fails.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a network failure shows the last copy, marked offline; a server error does not', () async {
    SharedPreferences.setMockInitialValues({});
    final answer = {
      'allocation': {'room': 'A101', 'bed': '1', 'pass': 'PASS-1'},
    };
    Api.client = MockClient((_) async => http.Response(jsonEncode(answer), 200));
    expect((await loadAllocation())['_offlineAt'], isNull);

    Api.client = MockClient((_) async => throw const SocketException('offline'));
    final offline = await loadAllocation();
    expect((offline['allocation'] as Map)['pass'], 'PASS-1');
    expect(offline['_offlineAt'], isNotNull);

    Api.client = MockClient((_) async => http.Response(jsonEncode({'message': 'Boom'}), 500));
    expect(loadAllocation(), throwsA(isA<ApiException>()));
  });

  test('without a copy the network error still shows', () async {
    SharedPreferences.setMockInitialValues({});
    Api.client = MockClient((_) async => throw const SocketException('offline'));
    expect(loadAllocation(), throwsA(isA<ApiException>()));
  });
}
