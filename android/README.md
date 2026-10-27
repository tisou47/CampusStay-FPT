# CampusStay — Android app for students

Kotlin + Jetpack Compose. It follows the web's student portal (Change Specification v2 §11.2, phone menu:
Home · My Room · Payments · Activity) and calls the same API (`docs/api-contract.md`).

| Screen | What it shows | API |
|---|---|---|
| Sign in | the CampusStay password, or Google (`@fpt.edu.vn`; a new account sets its first password in the app). Staff and Managers are sent to the web | `POST /auth/sign-in`, `POST /auth/google` (`credential`), `POST /auth/password/set` |
| Home | registration period card, Room card, Invoice due, dormitory board | `/students/me/home`, `/students/me/board`, `/registration-periods/current` |
| My Room | Room, roommates, door code behind "Show the code" (every view audited), check-in pass as a QR code (A-11), furniture, Stay, next Term with extension and end of stay | `/students/me/allocation`, `/students/me/door-code` (+ `/reveal`), `/students/me/furniture`, `/students/me/stay/*` |
| Payments | outstanding, Utility warning, every Invoice; an Invoice's VietQR, transfer content and **I have transferred** | `/students/me/invoices`, `/invoices/{id}/payment`, `/invoices/{id}/claim` |
| Activity | requests (maintenance and next-Term), notifications with announcements, **Report a problem** (with the furniture item) | `/students/me/requests`, `/notifications`, `POST /maintenance-requests` |

Texts follow the phone's language (Vietnamese, else English); the API answers in the same language
(`Accept-Language`). After sign-in the app asks for the notification permission and sends its FCM token to
`POST /devices` (A-05); signing out calls `POST /devices/unregister` (A-06).

## Build

Needs JDK 17+ and the Android SDK. Two files stay out of Git:

- `local.properties`: `sdk.dir=…` and `campusstay.googleClientId=<the web OAuth client id>` (the API's
  `GOOGLE_CLIENT_ID`; without it the Google button is hidden). Google sign-in also needs an **Android** OAuth client in
  the same Google Cloud project, with package `vn.fpt.campusstay.student` and the signing key's SHA-1.
- `app/google-services.json`: the Firebase project's file (push). Without it the app builds without push.

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk, talks to production
./gradlew installDebug -PcampusstayApi=http://10.0.2.2:8080/api   # a local backend from the emulator
```

Debug builds allow plain HTTP for that local backend (`src/debug/AndroidManifest.xml`); release builds use HTTPS only.
