import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'common.dart';

/// The signed-in student: the token and the `user` of `POST /auth/sign-in` or `/auth/google`.
///
/// [passwordSet] is false for a Google sign-up that has not set its CampusStay password yet (spec §6.1);
/// [verification] is `Verified`, `Pending verification` or `Profile needed`.
class Session {
  const Session(this.token, this.name, this.email, this.studentCode, this.passwordSet, this.verification);

  final String token;
  final String name;
  final String email;
  final String? studentCode;
  final bool passwordSet;
  final String? verification;
}

/// Keeps the session, so the student stays signed in: the bearer token in the Android Keystore
/// (`flutter_secure_storage`, MOB-11), the name and status in the app's private preferences.
class SessionStore {
  SessionStore(this._prefs, this._secure, this._token);

  final SharedPreferences _prefs;
  final FlutterSecureStorage _secure;
  String? _token;

  static Future<SessionStore> open([FlutterSecureStorage secure = const FlutterSecureStorage()]) async {
    final prefs = await SharedPreferences.getInstance();
    String? token;
    try {
      token = await secure.read(key: 'token');
    } on PlatformException {
      token = null; // an unreadable keystore entry (restored phone): sign in again
    }
    // MOB-11: a version before 1.1 kept the token in plain preferences; move it to the keystore once.
    final old = prefs.getString('token');
    if (old != null) {
      token ??= old;
      await secure.write(key: 'token', value: token);
      await prefs.remove('token');
    }
    return SessionStore(prefs, secure, token);
  }

  Session? load() {
    final token = _token;
    if (token == null) return null;
    return Session(
      token,
      _prefs.getString('name') ?? '',
      _prefs.getString('email') ?? '',
      _prefs.getString('studentCode'),
      _prefs.getBool('passwordSet') ?? true,
      _prefs.getString('verification'),
    );
  }

  Future<Session> save(String token, Json user) async {
    final session = Session(
      token,
      user.text('name'),
      user.text('email'),
      user.str('studentCode'),
      user['passwordSet'] != false,
      user.str('verification'),
    );
    if (token != _token) await _secure.write(key: 'token', value: token);
    _token = token;
    await _prefs.setString('name', session.name);
    await _prefs.setString('email', session.email);
    await _set('studentCode', session.studentCode);
    await _prefs.setBool('passwordSet', session.passwordSet);
    await _set('verification', session.verification);
    return session;
  }

  Future<Session?> passwordSet() async {
    await _prefs.setBool('passwordSet', true);
    return load();
  }

  Future<void> clear() async {
    _token = null;
    await _secure.delete(key: 'token');
    await _prefs.clear();
  }

  Future<void> _set(String key, String? value) => value == null ? _prefs.remove(key) : _prefs.setString(key, value);
}
