# CampusStay FPT — Web screen map

| Field | Value |
|---|---|
| Generated | 29/10/2026 by `node docs/tools/generate-catalogs.mjs` from `web/src/app/router.jsx`, `web/src/app/screens.js` and the header comment of each page |
| Feeds | Report 3 (SRS: screens and actors), Report 4 (SDD: user interface design), Report 6 (User Guides) |
| Related | `docs/api-contract.md` (request and response shapes), Figma file *CampusStay-FPT* |

Every route of the web app with its screen code, its Figma frame and the API calls the page makes. Do not edit by hand: change the page's header comment, `screens.js` or the router, then run the generator.

## Public pages (no sign-in)

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|
| SCR-AUTH-01 | Sign In | `/signin` | 128:58 | `POST /auth/sign-in`<br>`POST /auth/google` | [auth/SignIn.jsx](../../web/src/pages/auth/SignIn.jsx) |
| SCR-AUTH-02 | Forgot password | `/forgot-password` | — | `POST /auth/password/forgot` | [auth/ForgotPassword.jsx](../../web/src/pages/auth/ForgotPassword.jsx) |
| SCR-AUTH-03 | Reset password (from the email link) (`mode="reset"`) | `/reset-password` | — | `POST /auth/password/reset` | [auth/ResetPassword.jsx](../../web/src/pages/auth/ResetPassword.jsx) |
| SCR-AUTH-04 | Set password (invitation link) (`mode="invite"`) | `/set-password` | — | `POST /auth/password/reset` | [auth/ResetPassword.jsx](../../web/src/pages/auth/ResetPassword.jsx) |
| SCR-AUTH-05 | Set a password (first Google sign-in) | `/account/password` | — | `POST /auth/password/set`<br>`GET /auth/me` | [auth/FirstPassword.jsx](../../web/src/pages/auth/FirstPassword.jsx) |

## Student — Figma page 05 Web – Student (phones and tablets: 09 Android – Student)

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|

## Staff — Figma page 06 Web – Staff

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|

## Block Manager — Figma page 07 Web – Manager

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|

## Admin — Figma page 08 Web – Admin

| Code | Screen | Route | Figma | API calls | Page |
|---|---|---|---|---|---|

## Notes

- Detail pages (`…/:id`) open from their lists and are not in the development screen index (`Alt + D`).
- The Block Manager shares the Staff work queues (Applications, Inventory, Maintenance) for its Block; the same page then shows the Manager's scope.
- The back office is desktop-only (checked at 1440×900 and 1366×768); the Student portal also has a phone and tablet layout below 1024 px (`web/README.md`).
- The wizard steps share SCR-APP-01; the Manager's copies of Staff pages keep the Staff code.
