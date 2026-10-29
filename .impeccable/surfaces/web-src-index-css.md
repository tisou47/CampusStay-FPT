---
version: 1
slug: "web-src-index-css"
primary_target: "web/src/index.css"
related_targets: ["web/src/components/layout/BackOfficeLayout.jsx","web/src/components/layout/StudentLayout.jsx"]
---

# Surface brief: CampusStay web app (whole app, redesign)

Scope: every screen of `web/` through the shared tokens (`web/src/index.css`), the shells (`BackOfficeLayout`, `StudentLayout`, `MobileBar`), `Logo`, `LanguageSwitch`, `Notifications` and the UI kit. Mode: Operate (back office first, student portal phone-first).
Audience and job: Staff and Managers deciding many things a day at 1366 px+; students on phones. Constraints: VI/EN, status never by colour alone, Review 2 demo on 31/10/2026 must keep working.
Chosen direction: FPT orange campus (user-pinned FPT palette after three rounds). Memorable moment: the solid FPT-orange band that frames every screen like an FPT campus sign, with the Term status chip always in it.

## Direction contract
THESIS: The app wears FPT's campus orange as its frame, the way every FPT building signs itself; it refuses the grey-sidebar SaaS admin where the brand is a 32 px tile.
OWN-WORLD: Solid FPT orange #F37021 top band across the whole width; everything on it is ink (#1d1d1f family) or a white control (Term, Block, search, language as white pills). White side menu below the band, warm-white canvas, warm hairlines. Deep orange #C64F0E is the only action colour (buttons, selection); FPT blue #0A5DA8 only for links and Room codes; FPT green #226B2D/#3FA34D only for done and paid. Be Vietnam Pro, tabular figures.
STORY: Staff and Managers see at once which Term and Block they are in (band), find their work in the menu, act with one deep-orange button whose label states count and amount; students see the same orange frame on the phone.
FIRST VIEWPORT: 56 px orange band: logo (white CS mark, ink wordmark) at menu width, then Term and Block pills, duty toggle; search, VI/EN, notifications at the right. Below: 248 px white menu, page header and work area on warm canvas.
FORM: grounded "FPT orange campus", user-pinned palette after re-rolls; seed:bbc41eb9fa822249
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
