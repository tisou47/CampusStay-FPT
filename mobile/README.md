# CampusStay — mobile app for students (Flutter)

Flutter (Dart), Android build (package `vn.fpt.campusstay.student`, Android 8.0 / API 26 or later). It follows the
web's student portal (Change Specification v2 §11.2, phone menu: Home · My Room · Payments · Activity) and calls the
same API (`docs/api-contract.md`).

| Screen | What it shows | API |
|---|---|---|
| Sign in | the CampusStay password, or Google (`@fpt.edu.vn`; a new account sets its first password in the app). Staff and Managers are sent to the web | `POST /auth/sign-in`, `POST /auth/google` (`credential`), `POST /auth/password/set` |
| Home | registration period card, Room card, Invoice due, dormitory board | `/students/me/home`, `/students/me/board`, `/registration-periods/current` |
| My Room | Room, roommates, door code behind "Show the code" (every view audited), check-in pass as a QR code (A-11), furniture, Stay, next Term with extension and end of stay | `/students/me/allocation`, `/students/me/door-code` (+ `/reveal`), `/students/me/furniture`, `/students/me/stay/*` |
| Payments | outstanding, Utility warning, every Invoice; an Invoice's VietQR, transfer content and **I have transferred** | `/students/me/invoices`, `/invoices/{id}/payment`, `/invoices/{id}/claim` |
| Activity | requests (maintenance and next-Term), notifications with announcements, **Report a problem** (with the furniture item) | `/students/me/requests`, `/notifications`, `POST /maintenance-requests` |

Texts follow the phone's language (Vietnamese, else English; every text is a `t('English', 'Tiếng Việt')` pair);
the API answers in the same language (`Accept-Language`). After sign-in the app asks for the notification permission
and sends its FCM token to `POST /devices` (A-05); signing out calls `POST /devices/unregister` (A-06). Android shows
pushes while the app is closed; one that arrives while it is open appears at the bottom of the screen.

| Folder | What |
|---|---|
| `lib/main.dart` | app, session gate (sign-in → set password → tabs), theme, the four tabs |
| `lib/api.dart`, `lib/session.dart` | the API client (bearer token, language, errors `{ message, code, details.fields }`, `401` signs out); the saved session |
| `lib/push.dart` | Firebase Cloud Messaging: token to the API, foreground messages |
| `lib/common.dart` | `t()` texts, status labels, money and date formats (campus time UTC+7), JSON reading, loading/error widgets |
| `lib/screens/` | `sign_in`, `home`, `room`, `payments` (+ the Invoice page), `activity` (+ Report a problem) |
| `android/` | the Android host Flutter generates (Gradle, manifest, icon, push channel) |
| `test/` | format tests and a sign-in widget test (`flutter test`) |

## Build

Needs the Flutter SDK (stable 3.47 or later; on the team's machine `D:\Workspace\Enviroment\flutter`), JDK 17+ and
the Android SDK. Two files stay out of Git (`.gitignore`):

- `android/app/google-services.json`: the file of Firebase project `campusstay-fpt-7e4f4` (Firebase console › Project
  settings › Android app `vn.fpt.campusstay.student`). Without it the app builds and runs without push.
- `config.json`: build settings read with `--dart-define-from-file`:
  `{ "GOOGLE_CLIENT_ID": "<the web OAuth client id>" }` (the API's `GOOGLE_CLIENT_ID`; without it the Google button is
  hidden). Google sign-in also needs an **Android** OAuth client in the same Google Cloud project, with package
  `vn.fpt.campusstay.student` and the signing key's SHA-1. `API_BASE_URL` can go in the same file.

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug --dart-define-from-file=config.json   # build/app/outputs/flutter-apk/app-debug.apk, talks to production
flutter run --dart-define-from-file=config.json --dart-define=API_BASE_URL=http://10.0.2.2:8080/api   # a local backend from the emulator
```

The API defaults to production (`https://campusstay-api.eastasia.cloudapp.azure.com/api`). Debug builds allow plain
HTTP for a local backend (`android/app/src/debug/AndroidManifest.xml`); release builds use HTTPS only.
`android/gradle.properties` turns off Kotlin's incremental build: with the pub cache on `C:` and the project on `D:`
it fails on Windows.
