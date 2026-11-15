import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'common.dart';

/// The API the app talks to; production by default. For a local backend on the emulator:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080/api`
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://campusstay-api.eastasia.cloudapp.azure.com/api',
);

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

  /// The HTTP client; tests put a `MockClient` here.
  static http.Client client = http.Client();

  /// The signed-in student's token; null when signed out.
  static String? token;

  /// Called when the API answers `401`: the session is over.
  static void Function() onSignedOut = () {};

  static Future<Map<String, dynamic>> get(String path) => _call('GET', path);

  static Future<Map<String, dynamic>> post(String path, [Map<String, dynamic> body = const {}]) =>
      _call('POST', path, body);

  static Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) => _call('PUT', path, body);

  /// The query string of [params] (nulls and blanks left out), with the leading `?`.
  static String query(Map<String, Object?> params) {
    final kept = {
      for (final e in params.entries)
        if (e.value != null && '${e.value}'.isNotEmpty) e.key: '${e.value}',
    };
    return kept.isEmpty ? '' : '?${Uri(queryParameters: kept).query}';
  }

  /// A `multipart/form-data` POST of text fields and files (contract "Uploads"): [files] are `(field, file path)`.
  static Future<Map<String, dynamic>> multipart(
    String path,
    Map<String, String> fields, [
    List<(String, String)> files = const [],
  ]) async {
    final request = http.MultipartRequest('POST', _url(path))..fields.addAll(fields);
    for (final (field, file) in files) {
      request.files.add(await http.MultipartFile.fromPath(field, file));
    }
    return _send(request);
  }

  /// A file of the API (a receipt PDF), with the bearer token.
  static Future<Uint8List> download(String path) async {
    final request = http.Request('GET', _url(path));
    request.headers['Accept-Language'] = isVietnamese() ? 'vi' : 'en';
    final bearer = token;
    if (bearer != null) request.headers['Authorization'] = 'Bearer $bearer';
    final http.Response response;
    try {
      response = await http.Response.fromStream(await client.send(request).timeout(const Duration(seconds: 60)));
    } on Exception {
      throw ApiException(
        0,
        'NETWORK',
        t(
          'Cannot reach the server. Check your connection and try again.',
          'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.',
        ),
      );
    }
    if (response.statusCode >= 300) {
      throw ApiException(response.statusCode, null, t('Could not download the file.', 'Không tải được tệp.'));
    }
    return response.bodyBytes;
  }

  /// The bytes of an image the API links to (the VietQR image of a payment).
  static Future<Uint8List> bytes(String absoluteUrl) async {
    final response = await client.get(Uri.parse(absoluteUrl)).timeout(const Duration(seconds: 30));
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
      response = await http.Response.fromStream(await client.send(request).timeout(const Duration(seconds: 30)));
    } on Exception {
      throw ApiException(
        0,
        'NETWORK',
        t(
          'Cannot reach the server. Check your connection and try again.',
          'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.',
        ),
      );
    }
    Map<String, dynamic> json = {};
    final text = utf8.decode(response.bodyBytes, allowMalformed: true);
    if (text.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(text);
        if (decoded is Map<String, dynamic>) json = decoded;
        // A list answer (`GET /banks`) reads as `{ items }`.
        if (decoded is List) json = {'items': decoded};
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
    throw ApiException(
      response.statusCode,
      code is String && code.isNotEmpty ? code : null,
      message is String && message.isNotEmpty ? message : 'HTTP ${response.statusCode}',
      fields,
    );
  }
}
