---
version: 1
slug: "web-src-index-css"
primary_target: "web/src/index.css"
related_targets: ["web/src/components/layout/BackOfficeLayout.jsx","web/src/components/layout/StudentLayout.jsx","web/src/pages/staff/Inventory.jsx","web/src/pages/staff/MySchedule.jsx","mobile/lib/ui.dart"]
---

# Surface brief: CampusStay web app and Android companion (whole app, redesign 26/11/2026)

Scope: every screen of `web/` through `web/src/index.css`, the shells (`BackOfficeLayout`, `StudentLayout`, `MobileBar`) and the UI kit; page-level signature moves on the room map (`pages/staff/Inventory.jsx`) and the shift schedule (`pages/staff/MySchedule.jsx`; the Manager planner `pages/manager/StaffSchedule.jsx` already is a person × day grid and stays); the Flutter theme `mobile/lib/ui.dart`. Mode: Operate.
Audience and job: Staff and Managers deciding many things a day at 1366 px+; students on phones. Constraints: FPT palette binding, VI/EN, status never by colour alone, demo flows must keep working.
Chosen direction: "FPT desk" (safer round), with two page-level moves the user approved: the room map drawn as a floor plan, schedules set as a FAP timetable grid.

## Direction contract
THESIS: A disciplined back office framed by solid FPT orange: list on the left, detail on the right, one deep-orange button that says the count and the amount. It refuses both the soft-gradient decoration of the previous build and the grey SaaS admin where the brand is a logo tile.
OWN-WORLD: Solid FPT orange #F37021 band (ink or white controls only), white grouped menu with work counts, warm canvas #F7F4F0, white panels with 10 px radius and warm hairlines, deep orange #C64F0E the only action colour, FPT blue links, FPT green done/paid. Be Vietnam Pro, tabular figures (the Android app keeps Roboto: platform face, no font download approved). The Term milestone strip M1–M7 lives on the Term dashboards only: the user removed it from every page on 24/11/2026 to give screens their height back.
STORY: Operators see which Term and Block they are in, find work by count in the menu, select rows, read the detail panel and act with a button stating count and amount; Staff read Rooms as a floor plan and their week as a timetable; students see the same orange frame and one next step.
FIRST VIEWPORT: 56 px solid orange band (logo at menu width, Term and Block white pills, search, VI/EN, bell); 248 px white menu; page header; work area: list plus detail panel; primary action at the panel's foot.
FORM: grounded "FPT desk", position 1 of the safer lineup, plus grounded floor-plan and timetable moves at page scope; seed:2c63f6b4e4e27406
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
