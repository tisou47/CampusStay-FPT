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

/// Keeps the session in the app's private preferences, so the student stays signed in.
class SessionStore {
  SessionStore(this._prefs);

  final SharedPreferences _prefs;

  static Future<SessionStore> open() async => SessionStore(await SharedPreferences.getInstance());

  Session? load() {
    final token = _prefs.getString('token');
    if (token == null) return null;
    return Session(token, _prefs.getString('name') ?? '', _prefs.getString('email') ?? '',
        _prefs.getString('studentCode'), _prefs.getBool('passwordSet') ?? true, _prefs.getString('verification'));
  }

  Future<Session> save(String token, Json user) async {
    final session = Session(token, user.text('name'), user.text('email'), user.str('studentCode'),
        user['passwordSet'] != false, user.str('verification'));
    await _prefs.setString('token', token);
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

  Future<void> clear() => _prefs.clear();

  Future<void> _set(String key, String? value) => value == null ? _prefs.remove(key) : _prefs.setString(key, value);
}
