import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';

/// Push notifications (contract A-05, A-06, C-25): after sign-in the app asks for the notification permission and
/// sends its FCM token to `POST /devices`, and takes it back with `POST /devices/unregister` before signing out.
/// Without the Firebase project file (`android/app/google-services.json`) Firebase does not start and nothing
/// happens; the in-app notifications still work. Messages are shown by Android while the app is in the background;
/// one that arrives while it is open is passed to [onForeground].
class Push {
  Push._();

  static bool _available = false;
  static StreamSubscription<String>? _refresh;
  static StreamSubscription<RemoteMessage>? _messages;

  /// Starts Firebase if the project file was built in; false when push is not set up.
  static Future<bool> init() async {
    try {
      await Firebase.initializeApp();
      _available = true;
    } catch (e) {
      debugPrint('Push is off: $e');
      _available = false;
    }
    return _available;
  }

  /// The current FCM token, or null when push is not set up or Google Play services cannot give one.
  static Future<String?> token() async {
    if (!_available) return null;
    try {
      // The API sends to FCM registration tokens (A-05), not to the installation ids of register()/onRegistered.
      // ignore: deprecated_member_use
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('No FCM token: $e');
      return null;
    }
  }

  /// After sign-in: asks for the permission (Android 13+), registers the token and keeps it registered on refresh.
  static Future<void> register(void Function(RemoteMessage message) onForeground) async {
    if (!_available) return;
    await FirebaseMessaging.instance.requestPermission();
    await _send(await token());
    await _refresh?.cancel();
    // ignore: deprecated_member_use
    _refresh = FirebaseMessaging.instance.onTokenRefresh.listen(_send);
    await _messages?.cancel();
    _messages = FirebaseMessaging.onMessage.listen(onForeground);
  }

  static Future<void> unregister() async {
    await _refresh?.cancel();
    await _messages?.cancel();
    _refresh = null;
    _messages = null;
    final value = await token();
    if (value == null) return;
    try {
      await Api.post('/devices/unregister', {'token': value});
    } catch (_) {
      // signing out goes on
    }
  }

  static Future<void> _send(String? value) async {
    if (value == null || Api.token == null) return;
    try {
      await Api.post('/devices', {'token': value, 'platform': 'android'});
    } catch (_) {
      // push is best effort; the in-app notifications still work
    }
  }
}
