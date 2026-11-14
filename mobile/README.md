# CampusStay — mobile app for students (Flutter)

Flutter (Dart), Android build (package `vn.fpt.campusstay.student`, Android 8.0 / API 26 or later). It follows the
web's student portal (Change Specification v2 §11.2, phone menu: Home · My Room · Payments · Activity) and calls the
same API (`docs/api-contract.md`).

Every screen and action of the web's Student portal is reachable in the app (web page → app screen):

| Screen (web page) | What it shows and does | API |
|---|---|---|
| Sign in | the CampusStay password, or Google (`@fpt.edu.vn`; a new account sets its first password in the app). Staff and Managers are sent to the web | `POST /auth/sign-in`, `POST /auth/google` (`credential`), `POST /auth/password/set`, `GET /auth/me` |
| Account verification (`/student/verification`) | a Google sign-up the student list does not know sends the sign-up form before anything else; a banner while a Manager verifies it; the verified details | `GET`/`PUT /students/me/verification` |
| Account menu (top bar) | name and code, verification, **Change password**, sign out | `POST /auth/password/change`, `POST /auth/sign-out` |
| Home (`/student`) | the next action for the student's stage (apply, pay, under review, all set), a roommate invitation, the registration period with its schedule, the dormitory board (open → read, changes old → new, show all), the status rows, the latest notification | `/students/me/home`, `/students/me/board`, `/registration-periods/current` (+ `/{termId}`), `/notifications/{id}/read` |
| Registration period details (`/student/registration-periods/:termId`) | Timeline · Prices (places and furniture per Room Class) · Rules (house rules, documents) · FAQ; **Apply now** while open | `/registration-periods/{termId}` |
| New application (`/student/apply/*`) | the wizard: Term and eligibility → Room Type, Room Class, stay length → Roommate (2-bed: check a Student code, or match automatically with optional preferences) → Personal info and consent → Review and submit, then the deposit payment | `/applications/eligibility`, `/catalog`, `/students/me/profile`, `POST /applications/roommate-check`, `POST /applications` |
| My applications, Application (`/student/applications`, `/:id`) | Activity › Applications; an Application's alert and action, progress, Room preference, Invoices, waitlist choices (Round 2 or withdraw with the refund account), cancel with a reason | `/students/me/applications`, `/applications/{id}` (+ `/cancel`, `/withdraw`) |
| Roommate invitation, Round 2 offer | accept or decline an invitation (then pay the deposit); choose a Round 2 Bed or decline with the refund account | `/students/me/roommate-invitation`, `/roommate-invitations/{id}/respond`, `/students/me/round2-offer`, `/round2-offers/{id}/respond` |
| My Room (`/student/room`) | termination and unpaid-Balance alerts, the Room, check-in pass as a QR code (A-11), the next Term (fee, extension for 1–8 Terms with a reason, end of stay, room change, swap, Room Class), door code shown 30 s (every view audited), late check-in (day and a document), check-in window, Balance, details, roommates, furniture, rules | `/students/me/allocation`, `/students/me/door-code` (+ `/reveal`), `/students/me/furniture`, `/students/me/late-check-in`, `/students/me/stay/extension`, `/students/me/stay/end` |
| Payments (`/student/invoices`) | Utility warning, transfers waiting, outstanding / paid / next Invoice, the refund account, every Invoice, the refunds | `/students/me/invoices`, `/students/me/refunds`, `/students/me/refund-account`, `/banks` |
| Invoice (`/student/invoices/:id`) | the amount card, its lines or the Utility breakdown per segment, the receipt with its PDF (opens in the phone's PDF viewer) | `/invoices/{id}`, `/invoices/{id}/receipt` |
| Pay (`/student/invoices/:id/pay`) | the VietQR image with its expiry and **Refresh QR**, open the QR image, copy the transfer content and bank details, **I have transferred** with an optional bank reference; checks again every 15 s while a Manager decides | `/invoices/{id}/payment` (+ `/refresh`), `POST /invoices/{id}/claim` |
| Requests (`/student/requests`) | Activity › Requests: Maintenance and Room changes with their counts; confirm a fix or reopen; Pay, Answer a swap, Agree / Decline a Room Class change; **New request** | `/students/me/requests`, `/maintenance-requests/{id}` (+ `/confirm`), `/room-class-changes/{id}/consent` |
| New maintenance request | category, place, furniture item (A-49), title, description, urgency, whether Staff may enter, up to 3 photos | `/maintenance-requests/options`, `POST /maintenance-requests` (multipart) |
| Room change, Room Class change | the next Term's Bed or Room, what changes, the reason and the next-Term fee; an open Room Class change with its consents | `/room-changes/options`, `POST /room-changes`, `/room-class-changes/options`, `POST /room-class-changes` |
| Swap (`/student/requests/swap/*`) | with a specific Student by code, or the anonymous swap board (my post, compatible posts, request); a swap invitation (accept or decline) | `POST /swaps`, `/swap-board` (+ `/my-post`, `/posts/{id}/request`), `/swap-invitations/{id}` (+ `/respond`) |
| Family Days (`/student/family-days`, `/:id`) | from Home's status rows and My Room: the Family Days of the student's Block; register guests (name, relationship, year of birth, up to the limit) for a time slot with places left; each guest's QR pass and status (not arrived, in, out); cancel the registration | `/students/me/family-days` (+ `/{id}`, `/{id}/registration`, `/{id}/registration/cancel`) |
| CampusStay Assistant | the robot in the top bar, only when the server has a model (ADR-28): suggestions, questions and answers; the conversation lasts while the app runs | `/students/me/assistant`, `POST /students/me/assistant/chat` |
| Notifications (`/student/notifications`) | Home's Notifications card (the newest three, "See all") and the top bar's bell with the unread count open the page: today and earlier; opening one marks it read and opens its link in the app | `/notifications` (+ `/{id}/read`, `/read-all`) |

Differences from the web: the language follows the phone (no language switch); the QR image opens in the phone's
viewer to be saved (no "Save to gallery" button); the notifications are on Home and behind the bell; Activity holds the
applications and requests.

Texts follow the phone's language (Vietnamese, else English; every text is a `t('English', 'Tiếng Việt')` pair);
the API answers in the same language (`Accept-Language`). After sign-in the app asks for the notification permission
and sends its FCM token to `POST /devices` (A-05); signing out calls `POST /devices/unregister` (A-06). Android shows
pushes while the app is closed; one that arrives while it is open appears at the bottom of the screen.

| Folder | What |
|---|---|
| `lib/main.dart` | app, session gate (sign-in → set password → verification form → tabs), the four tabs, bell and account menu |
| `lib/api.dart`, `lib/session.dart` | the API client (bearer token, language, errors `{ message, code, details.fields }`, `401` signs out); the saved session |
| `lib/push.dart` | Firebase Cloud Messaging: token to the API, foreground messages |
| `lib/common.dart` | `t()` texts, status labels, money and date formats (campus time UTC+7), JSON reading, loading/error widgets |
| `lib/ui.dart` | the web's design tokens (colours of `web/src/index.css`) and pieces: theme, `Tag`/`StatusChip`, `Alert`, `NextAction`, `StatusList`/`StatusRow`, `Section`, `Timeline`, `OptionTile`, form fields |
| `lib/links.dart`, `lib/files.dart` | web links of notifications → app screens; browser links, receipt PDF, picking photos and documents |
| `lib/screens/` | `sign_in`, `account` (verification, change password), `home`, `registration`, `apply`, `applications` (+ roommate invitation, Round 2), `room`, `payments` (+ Invoice, Pay), `refund` (refund account), `requests` (maintenance, room change, Room Class, swap), `family_day`, `assistant`, `notifications`, `activity` |
| `android/` | the Android host Flutter generates (Gradle, manifest, icon, push channel) |
| `test/` | format tests, a sign-in widget test and widget tests of the student screens against a fake API (`flutter test`) |

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

Flutter 3.50 and later mark `package:flutter/material.dart` as deprecated in favour of the `material_ui` package; the
app keeps the Flutter import so it still builds with 3.47, so there `flutter analyze --no-fatal-infos` is the check.

The API defaults to production (`https://campusstay-api.eastasia.cloudapp.azure.com/api`). Debug builds allow plain
HTTP for a local backend (`android/app/src/debug/AndroidManifest.xml`); release builds use HTTPS only.
`android/gradle.properties` turns off Kotlin's incremental build: with the pub cache on `C:` and the project on `D:`
it fails on Windows.
