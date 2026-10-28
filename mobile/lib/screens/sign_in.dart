import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../api.dart';
import '../common.dart';

/// Google sign-in asks for an ID token of the web's OAuth client (the API's GOOGLE_CLIENT_ID):
/// `--dart-define=GOOGLE_CLIENT_ID=…`; blank = no Google button.
const googleClientId = String.fromEnvironment('GOOGLE_CLIENT_ID');

/// Sign-in with the CampusStay password (`POST /auth/sign-in`) or with Google (`POST /auth/google` with the ID
/// token, spec §6.1: only `@fpt.edu.vn` accounts; an unknown one signs up as a student). Only students use the app.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.onSignedIn});

  final Future<void> Function(String token, Json user) onSignedIn;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.addListener(() => setState(() {}));
    _password.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _finish(Json result) async {
    final user = result.obj('user') ?? {};
    if (user['role'] != 'student') {
      setState(() => _error = t('This app is for students. Staff and Managers use the web.',
          'Ứng dụng dành cho sinh viên. Nhân viên và Quản lý dùng bản web.'));
      return;
    }
    await widget.onSignedIn(result.text('token'), user);
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      _error = e.message;
    } on GoogleSignInException catch (e) {
      if (e.code != GoogleSignInExceptionCode.canceled) {
        _error = t('Google sign-in is not available on this phone: ', 'Không đăng nhập Google được trên máy này: ') +
            (e.description ?? e.code.name);
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _signIn() => _run(() async => _finish(await Api.post('/auth/sign-in',
      {'email': _email.text.trim(), 'password': _password.text, 'remember': true})));

  Future<void> _google() => _run(() async {
        final idToken = await googleIdToken();
        if (idToken != null) await _finish(await Api.post('/auth/google', {'credential': idToken, 'remember': true}));
      });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 16, children: [
              Text('CampusStay FPT',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium
                      ?.copyWith(fontWeight: FontWeight.bold, color: theme.colorScheme.primary)),
              Text(t('Dormitory of FPT University, Tân Uyên Campus', 'Ký túc xá Đại học FPT, cơ sở Tân Uyên'),
                  textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
              ),
              TextField(
                controller: _password,
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _signIn(),
                decoration: InputDecoration(labelText: t('Password', 'Mật khẩu'), border: const OutlineInputBorder()),
              ),
              if (_error != null) Note(_error!, error: true),
              FilledButton(
                onPressed: _busy || _email.text.trim().isEmpty || _password.text.isEmpty ? null : _signIn,
                child: _busy
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(t('Sign in', 'Đăng nhập')),
              ),
              if (googleClientId.isNotEmpty)
                OutlinedButton(
                  onPressed: _busy ? null : _google,
                  child: Text(t('Sign in with Google (@fpt.edu.vn)', 'Đăng nhập bằng Google (@fpt.edu.vn)')),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

bool _googleReady = false;

/// A Google ID token for the web's OAuth client (the API checks its audience); null when the student cancels.
Future<String?> googleIdToken() async {
  final google = GoogleSignIn.instance;
  if (!_googleReady) {
    await google.initialize(serverClientId: googleClientId, hostedDomain: 'fpt.edu.vn');
    _googleReady = true;
  }
  final account = await google.authenticate();
  return account.authentication.idToken;
}

/// The first password of an account made by Google sign-up (spec §6.1 step 3, `POST /auth/password/set`): until it
/// is set, the API answers every other call with `403 PASSWORD_REQUIRED`. Same rule as the web: 8–64 characters with
/// a letter and a number, not containing the email name.
class SetPasswordScreen extends StatefulWidget {
  const SetPasswordScreen({super.key, required this.email, required this.onDone, required this.onSignOut});

  final String email;
  final VoidCallback onDone;
  final VoidCallback onSignOut;

  @override
  State<SetPasswordScreen> createState() => _SetPasswordScreenState();
}

class _SetPasswordScreenState extends State<SetPasswordScreen> {
  final _password = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_password.text != _again.text) {
      setState(() => _error = t('The two passwords differ.', 'Hai mật khẩu không khớp.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Api.post('/auth/password/set', {'newPassword': _password.text});
      widget.onDone();
    } on ApiException catch (e) {
      if (e.code == 'PASSWORD_ALREADY_SET') {
        widget.onDone();
      } else {
        _error = e.fields['newPassword'] ?? e.message;
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 16, children: [
              Text(t('Set your CampusStay password', 'Đặt mật khẩu CampusStay'),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
              Text(t('You signed up with Google as ${widget.email}. Choose a password to use CampusStay.',
                  'Bạn đã đăng ký bằng Google với ${widget.email}. Hãy chọn mật khẩu để dùng CampusStay.')),
              TextField(
                controller: _password,
                obscureText: true,
                decoration:
                    InputDecoration(labelText: t('New password', 'Mật khẩu mới'), border: const OutlineInputBorder()),
              ),
              TextField(
                controller: _again,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: t('Repeat the password', 'Nhập lại mật khẩu'), border: const OutlineInputBorder()),
              ),
              if (_error != null) Note(_error!, error: true),
              FilledButton(onPressed: _busy ? null : _save, child: Text(t('Save the password', 'Lưu mật khẩu'))),
              OutlinedButton(onPressed: widget.onSignOut, child: Text(t('Sign out', 'Đăng xuất'))),
            ]),
          ),
        ),
      ),
    );
  }
}
