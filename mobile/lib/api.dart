import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:http/http.dart' as http;

import 'common.dart';

/// The API the app talks to: production in a release build, a local backend on the emulator's host in a debug build
/// (MOB-13, N4: a developer's debug run never writes to production by accident). Any build can name another one:
/// `--dart-define=API_BASE_URL=https://…/api`.
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: kReleaseMode ? 'https://campusstay-api.eastasia.cloudapp.azure.com/api' : 'http://10.0.2.2:8080/api',
);

/// The web app: pages the app does not have open there (Forgot password, MOB-09).
const webBaseUrl = String.fromEnvironment('WEB_BASE_URL', defaultValue: 'https://campusstay-fpt-ten.vercel.app');

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

/// The CampusStay API (`tools/postman/api-contract.md`). Every call sends the bearer token and `Accept-Language` (the API
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

  /// [timeout]: how long to wait for the answer (30 s by default; the assistant's model needs longer, MOB-04).
  static Future<Map<String, dynamic>> post(
    String path, [
    Map<String, dynamic> body = const {},
    Duration timeout = const Duration(seconds: 30),
  ]) => _call('POST', path, body, timeout);

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
      try {
        request.files.add(await http.MultipartFile.fromPath(field, file));
      } on FileSystemException {
        // The picker's copy was cleaned up meanwhile (MOB-15): an ApiException every caller already handles.
        throw ApiException(
          0,
          'FILE_GONE',
          t('The chosen file is no longer on the phone. Choose it again.', 'Tệp đã chọn không còn trên máy. Hãy chọn lại.'),
        );
      }
    }
    // Photos over a slow campus network take longer than a JSON call (MOB-06).
    return _send(request, const Duration(seconds: 120));
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

  static Future<Map<String, dynamic>> _call(
    String method,
    String path, [
    Map<String, dynamic>? body,
    Duration timeout = const Duration(seconds: 30),
  ]) {
    final request = http.Request(method, _url(path));
    if (body != null) {
      request.headers['Content-Type'] = 'application/json; charset=utf-8';
      request.body = jsonEncode(body);
    }
    return _send(request, timeout);
  }

  static Future<Map<String, dynamic>> _send(
    http.BaseRequest request, [
    Duration timeout = const Duration(seconds: 30),
  ]) async {
    final streamed = await _open(request, timeout);
    final http.Response response;
    try {
      response = await http.Response.fromStream(streamed).timeout(timeout);
    } on TimeoutException {
      throw _timeout();
    } on Exception {
      throw _network();
    }
    return _read(response);
  }

  /// A POST answered with Server-Sent Events (`text/event-stream`, the assistant's stream, D6): each event as its name
  /// and its `data` JSON. An answer that is not a stream (an error before it starts) throws its [ApiException]; so does
  /// a stream silent for longer than [timeout].
  static Stream<(String, Json)> events(
    String path,
    Map<String, dynamic> body, [
    Duration timeout = const Duration(seconds: 100),
  ]) async* {
    final request = http.Request('POST', _url(path))
      ..headers['Content-Type'] = 'application/json; charset=utf-8'
      ..headers['Accept'] = 'text/event-stream, application/json'
      ..body = jsonEncode(body);
    final response = await _open(request, timeout);
    if (!(response.headers['content-type'] ?? '').contains('text/event-stream')) {
      _read(await http.Response.fromStream(response));
      throw ApiException(response.statusCode, null, 'HTTP ${response.statusCode}');
    }
    var event = 'message';
    final data = StringBuffer();
    try {
      await for (final line in response.stream.timeout(timeout).transform(utf8.decoder).transform(const LineSplitter())) {
        if (line.isEmpty) {
          if (data.isNotEmpty) {
            final decoded = jsonDecode(data.toString());
            yield (event, decoded is Map<String, dynamic> ? decoded : <String, dynamic>{});
          }
          event = 'message';
          data.clear();
        } else if (line.startsWith('event:')) {
          event = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          if (data.isNotEmpty) data.writeln();
          data.write(line.substring(5).trimLeft());
        }
      }
    } on TimeoutException {
      throw _timeout();
    } on FormatException {
      throw _network();
    } on IOException {
      throw _network();
    } on http.ClientException {
      throw _network();
    }
  }

  /// Sends [request] with the language and the token; network failures and timeouts become [ApiException]s.
  static Future<http.StreamedResponse> _open(http.BaseRequest request, Duration timeout) async {
    request.headers['Accept-Language'] = isVietnamese() ? 'vi' : 'en';
    final bearer = token;
    if (bearer != null) request.headers['Authorization'] = 'Bearer $bearer';
    try {
      return await client.send(request).timeout(timeout);
    } on TimeoutException {
      throw _timeout();
    } on Exception {
      throw _network();
    }
  }

  static ApiException _timeout() => ApiException(
    0,
    'TIMEOUT',
    t(
      'The server is taking too long to answer. Try again in a moment.',
      'Máy chủ phản hồi quá lâu. Hãy thử lại sau ít phút.',
    ),
  );

  static ApiException _network() => ApiException(
    0,
    'NETWORK',
    t(
      'Cannot reach the server. Check your connection and try again.',
      'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.',
    ),
  );

  /// The JSON of an answer, or its error as an [ApiException] (a `401` signs out).
  static Map<String, dynamic> _read(http.Response response) {
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
