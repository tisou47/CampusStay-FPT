# Backend questions from the UX review (30/10/2026)

A design review of the web app (score 23/40, report in `.impeccable/critique/`) found places where the screens cannot be made clear until the backend answers a question. Each question names the screens it affects and what the web app needs. Figures are from the local demo data on 30/10/2026.

| # | Question | Seen on | What the web needs |
|---|---|---|---|
| Q1 | How are "collected" figures computed? Manager Overview shows 15,29 tỷ (`GET /dashboards/manager`), Collections and refunds 16.035.456.000 ₫ (`GET /finance/summary`), Admin Overview 16,04 bn (`GET /dashboards/admin` `kpis.collected`). | Manager Overview, Collections and refunds, Admin Overview | One definition (Term, which Invoice kinds, Utility Deposit in or out), the same number from every endpoint, and the definition named so the screen can label it. |
| Q2 | Admin "Residents 0 of 3,680" vs Manager "Occupancy 61 % · 2,232 / 3,680": is one checked-in residents and the other allocated Beds? | Admin Overview, Manager Overview | Field names that say what they count (`checkedIn`, `allocatedBeds`, `heldBeds`). |
| Q3 | The application funnel says Allocated 288 while the Blocks hold 2,232 Beds. Are continuing residents left out? | Admin Overview funnel | The rule, and a `funnelNote` that says it. |
| Q4 | "100 % of invoiced" is shown while 4.380.000 ₫ is unpaid. Is the rate rounded? | Admin and Manager Overview | The unrounded rate plus the count and amount still unpaid, so the screen never shows 100 % with debt left. |
| Q5 | Every check-out time reads 03:59. Is a date-only value stored as end of day in UTC? | Check-out history, student hub | Real timestamps, or a date-only field the web shows without a time. |
| Q6 | Can every status come back as a stable code (`AWAITING_CONFIRMATION`) with its parameters, instead of an English label? Today about 100 labels reach `Tag.jsx`, with near-duplicates ("Awaiting confirmation" / "Waiting for confirmation", "Rejected" / "Declined", "Resolved" / "Completed" / "Done"), and lowercase keys in some places (`ready`, `blocked`, `review`). | Every list with a status tag | One code list per entity (Invoice, Application, Allocation, request, door code). The web then owns labels, colours and both languages. |
| Q7 | `attention[]` in `GET /dashboards/staff` returns English `title`, `body` and `cta` text, which shows in English on Vietnamese pages. Can it return a code and values instead? | Staff Today, Manager Overview | `{ kind, values }` per item. |
| Q8 | Why do `POST /payments/{id}/confirm` and `POST /payment-claims/confirm` both exist? Can a Manager confirm money in one place only? | Payment confirmations, Payments | One confirm path (the claims one, with a receipt option), so the screens can merge. |
| Q9 | `GET /check-in/today` reports 0 / 278 on 30/10 although check-in starts 31/10. Can it say the window has not opened? | Staff Today, Check-in desk | `windowOpensAt` and 0 expected before it. |
| Q10 | Admin calls Spring 2027 the current Term while Fall 2026 is still in stay until 02/11. Which Term is "current" for each role? | Admin Overview, the Term picker | One rule, ideally `currentTerm` (in stay) and `nextTerm` (registration) as separate fields. |
| Q11 | Staff Today makes about 9 calls and Manager Overview 6 (one fetches the whole Staff dashboard, another a list just for its count). Can one inbox endpoint per role return the counts and items? | Staff Today, Manager Overview | `GET /dashboards/{role}/inbox` → `{ counts, items: [{ kind, values, link, severity, dueAt }] }`. |

Also found: `docs/web/01_Screen_Map.md` has empty tables for every role; the generator in `docs/tools/` seems broken, and Reports 3, 4 and 6 draw on that file.
