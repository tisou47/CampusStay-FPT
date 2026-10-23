# CampusStay FPT — web app

Web front end of the CampusStay FPT dormitory system (registration, room assignment, payments, maintenance, room changes and swaps, check-in/out) for four roles: **Student, Staff, Block Manager, Admin**. It implements the web frames of the Figma file *CampusStay-FPT* and reads all data from the CampusStay API. There is no sample data in the app.

## Run

Requires Node.js 24.16.0 or later.

```bash
npm install
cp .env.example .env.local   # then adjust the values
npm run dev                  # http://localhost:5173
npm run build                # production build in dist/
npm run preview              # serve the build
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | API base URL seen by the browser. |
| `VITE_API_PROXY_TARGET` | `http://localhost:8080` | Development only: where Vite forwards `/api`. |
| `VITE_GOOGLE_CLIENT_ID` | — | Google OAuth client ID for "Sign in with Google" (only @fpt.edu.vn accounts): the same client as the backend's `GOOGLE_CLIENT_ID`. Add the site origin to the client's authorized JavaScript origins. |
| `VITE_SKIP_AUTH` | `false` | Development only: open every portal without signing in, to review screens before the backend is ready. Ignored in production builds. |
| `VITE_PAYMENT_SIMULATOR` | `false` | Shows "Simulate bank transfer" on Invoice Payment in a production build (always shown in development). Only for a demo server whose API has `PAYMENT_SIMULATOR=true` (ADR-18, contract A-08). |

Stack: React 19, Vite 8, Tailwind CSS 4 (design tokens in `src/index.css`), React Router, lucide-react.

## Connecting the backend

- The API the app expects is described in [docs/api-contract.md](../docs/api-contract.md) at the repository root: conventions (auth, errors, lists, dates, money) and every endpoint with its request and response shape.
- In development the Vite proxy forwards `/api` and drops the browser's `Origin` header, so the API (whose CORS is closed by default) treats the calls as same-origin. If the web app is served from another origin, the backend needs `CORS_ALLOWED_ORIGINS`.
- `src/api/endpoints.js` lists the calls; each page also repeats the shapes it reads in a comment at the top of the file.
- Sign-in uses the account **email** and the CampusStay password (`POST /auth/sign-in`), or Google (`POST /auth/google` with the authorization code from the popup; the server rejects accounts outside @fpt.edu.vn). The returned token is stored; a `401` signs the user out. Each portal (`/student`, `/staff`, `/manager`, `/admin`) only opens for its role.
- Public password pages: `/forgot-password`, and the pages the emails link to, `/reset-password?token=…` and `/set-password?token=…` (invitation). Every role changes its password from the user menu (Student) or the key icon next to Sign out (back office).
- Errors: a `400 VALIDATION_FAILED` lists its field messages in the error text (and under the inputs on the sign-in and password forms); a `409 STALE_DATA` reloads the data on screen.
- Every list and panel shows a loading state, an error with **Retry**, or an empty state.
- Every route, its screen code, Figma frame and API calls: [docs/web/01_Screen_Map.md](../docs/web/01_Screen_Map.md) (generated from the router, `src/app/screens.js` and the page header comments by `node docs/tools/generate-catalogs.mjs`; rerun it when you add or rename a page).

## Deploy (Vercel)

Production: https://campusstay-fpt-ten.vercel.app (project `campusstay-fpt`, Root Directory `web/`). Vercel builds every push to `main` for production and a preview for other branches that change `web/`. `vercel.json` sets the Vite build, rewrites every path to `index.html` for client-side routes, caches `/assets/*` for a year and adds security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`).

Vercel environment variables (Production and Preview): `VITE_API_BASE_URL=https://campusstay-api.eastasia.cloudapp.azure.com/api`, `VITE_PAYMENT_SIMULATOR=true` (demo server); `VITE_GOOGLE_CLIENT_ID` once the Google OAuth client exists. `VITE_*` values are baked in at build time: redeploy after changing one. The API must list the web origins in `CORS_ALLOWED_ORIGINS` (`infra/prod/.env.example`). Setup and rollback: `infra/prod/README.md` §2 and §6.

## Layout

Every screen fits one window (checked at 1440×900 and 1366×768): the page itself never scrolls. Tables and long panels scroll inside their own card, with table headers kept in view, and lists are paginated. On a window smaller than the layout needs, the content area scrolls as a fallback.

**Phones and portrait tablets (Student portal, below 1024 px).** The student pages follow the Figma page *09 Android – Student*: an App Bar with the page title (and a back arrow on detail pages), a Bottom Nav with Home, My Room, Payments and Activity (Applications and Requests), single-column cards, and lists of rows instead of tables. The page scrolls between the two bars; on a tablet the column is at most 680 px wide. The bell opens `/student/notifications`. From 1024 px the desktop layout applies; the term chip, language toggle and the name next to the avatar appear from 1280 px. Tailwind's `lg:` prefix marks the desktop styles, `max-lg:` the phone-only ones. Checked at 360×800, 820×1180, 1024×768 and 1440×900. The back office stays desktop-only.

## What changed in this version

- **Period of Stay and renewal removed.** Applications are for one Term; there is no renewal screen, renewal setting or renewal email. Admin › Utility keeps the utility billing and Utility Deposit rules.
- **Roommate preferences** (region, semester, major) is a free, optional add-on for 2-bed Rooms. It appears on the Roommate step when the student chooses *Match me automatically*, and is no longer part of the Room preference step.
- **No sample data.** Everything comes from the API; the demo presets and the demo navigator were removed.

## Development tools

- **Alt + D** opens a screen index (development builds only) to jump to any screen.
- `npm run build` must pass before you commit.

## Project layout

```
src/
  api/          HTTP client, data hooks (useQuery, useMutation), endpoint list
  app/          router, session (user, Term, Block scope), toasts, navigation, screen index data
  components/   layout shells (Student, back office) and UI kit (Button, Field, Table, Tag, Modal, Drawer, States…)
  dev/          development-only screen index
  lib/          formatting and small helpers
  pages/        student/, staff/, manager/, admin/, auth/, common/
```

The API contract lives in the repository's shared `docs/` folder, next to the backend design.
