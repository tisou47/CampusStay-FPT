import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'common.dart';

/// The API the app talks to; production by default. For a local backend on the emulator:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080/api`
const apiBaseUrl = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'https://campusstay-api.eastasia.cloudapp.azure.com/api');

/// An error answer of the API (`{ message, code?, details? }`, contract "Errors"): [message] is written for the user
/// and shown as is; [fields] are the messages of `details.fields`.
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, [this.fields = const {}]);

  final int status;
  final String? code;
  final String message;
  final Map<String, String> fields;

  @override
  String toString() => message;
}

/// The CampusStay API (`docs/api-contract.md`). Every call sends the bearer token and `Accept-Language` (the API
/// answers messages in Vietnamese or English); a `401` signs the student out.
class Api {
  Api._();

  static final _client = http.Client();

  /// The signed-in student's token; null when signed out.
  static String? token;

  /// Called when the API answers `401`: the session is over.
  static void Function() onSignedOut = () {};

  static Future<Map<String, dynamic>> get(String path) => _call('GET', path);

  static Future<Map<String, dynamic>> post(String path, [Map<String, dynamic> body = const {}]) =>
      _call('POST', path, body);

  static Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) => _call('PUT', path, body);

  /// A `multipart/form-data` POST of text fields (contract "Uploads").
  static Future<Map<String, dynamic>> multipart(String path, Map<String, String> fields) {
    final request = http.MultipartRequest('POST', _url(path))..fields.addAll(fields);
    return _send(request);
  }

  /// The bytes of an image the API links to (the VietQR image of a payment).
  static Future<Uint8List> bytes(String absoluteUrl) async {
    final response = await _client.get(Uri.parse(absoluteUrl)).timeout(const Duration(seconds: 30));
    if (response.statusCode >= 300) throw HttpException('HTTP ${response.statusCode}');
    return response.bodyBytes;
  }

  static Uri _url(String path) => Uri.parse(apiBaseUrl.replaceAll(RegExp(r'/+$'), '') + path);

  static Future<Map<String, dynamic>> _call(String method, String path, [Map<String, dynamic>? body]) {
    final request = http.Request(method, _url(path));
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }
    return _send(request);
  }

  static Future<Map<String, dynamic>> _send(http.BaseRequest request) async {
    request.headers['Accept-Language'] = isVietnamese() ? 'vi' : 'en';
    final bearer = token;
    if (bearer != null) request.headers['Authorization'] = 'Bearer $bearer';
    final http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request).timeout(const Duration(seconds: 30)));
    } on Exception {
      throw ApiException(0, 'NETWORK', t('Cannot reach the server. Check your connection and try again.',
          'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.'));
    }
    Map<String, dynamic> json = {};
    final text = utf8.decode(response.bodyBytes, allowMalformed: true);
    if (text.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) json = decoded;
      } on FormatException {
        // not JSON: keep the empty body
      }
    }
    if (response.statusCode < 300) return json;
    if (response.statusCode == 401 && token != null) {
      token = null;
      onSignedOut();
    }
    final fields = <String, String>{};
    final details = json['details'];
    if (details is Map && details['fields'] is Map) {
      (details['fields'] as Map).forEach((key, value) => fields['$key'] = '$value');
    }
    final code = json['code'];
    final message = json['message'];
    throw ApiException(response.statusCode, code is String && code.isNotEmpty ? code : null,
        message is String && message.isNotEmpty ? message : 'HTTP ${response.statusCode}', fields);
  }
}
