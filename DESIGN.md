---
name: CampusStay FPT
description: Dormitory operations for FPT University, framed by a solid FPT-orange band.
colors:
  band: "#f37021"
  band-fg: "#1d1714"
  band-line: "#d9600f"
  band-hover: "#fb9a5c"
  primary: "#c64f0e"
  primary-hover: "#9e3f0f"
  primary-subtle: "#fff1e6"
  fg-brand: "#b8490d"
  secondary: "#0a5da8"
  canvas: "#f7f4f0"
  surface: "#ffffff"
  subtle: "#f3ede6"
  fg: "#1d1714"
  fg-secondary: "#5c4f46"
  fg-tertiary: "#75665b"
  fg-disabled: "#a8998d"
  line: "#ebe3db"
  line-strong: "#d9cec4"
  wall: "#3f352e"
  success: "#2e8a3c"
  success-bg: "#eef8ef"
  success-fg: "#226b2d"
  fpt-green: "#3fa34d"
  warning: "#f59e0b"
  warning-bg: "#fffbeb"
  warning-fg: "#92400e"
  error: "#c81e1e"
  error-bg: "#fef2f2"
  error-fg: "#a61b1b"
  info-bg: "#eef5fc"
  info-fg: "#084a86"
  neutral-bg: "#f5f0eb"
  neutral-fg: "#3f352e"
  progress: "#c64f0e"
  progress-bg: "#fff1e6"
  progress-fg: "#9e3f0f"
typography:
  kpi:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "36px"
  h1:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.025em"
  h2:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  h3:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body-lg:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "22px"
  small:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
  axis:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
  android-body:
    fontFamily: "Roboto"
    fontSize: "14px"
    fontWeight: 400
  android-title:
    fontFamily: "Roboto"
    fontSize: "18px"
    fontWeight: 700
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-text:
    textColor: "{colors.fg-brand}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-fg}"
    height: "56px"
  band-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.primary-subtle}"
    textColor: "{colors.fg-brand}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  tag-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-fg}"
    rounded: "{rounded.full}"
    padding: "2px 10px 2px 8px"
  tag-progress:
    backgroundColor: "{colors.progress-bg}"
    textColor: "{colors.progress-fg}"
    rounded: "{rounded.full}"
    padding: "2px 10px 2px 8px"
  bed-square:
    rounded: "{rounded.sm}"
    size: "20px"
  timetable-shift:
    backgroundColor: "#ffe8d5"
    textColor: "#662d12"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  android-app-bar:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-fg}"
  android-bottom-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg-secondary}"
    height: "68px"
---

# Design System: CampusStay FPT

Source of truth: the `@theme` block in `web/src/index.css` for the web, and `Tokens` / `campusTheme()` in `mobile/lib/ui.dart` for the Android companion, which mirror the same values. Tailwind's default palette, type scale and shadows are reset in `index.css`, so screens can only use these tokens.

## Overview

**Creative North Star: "FPT desk"**

A disciplined back office framed by solid FPT orange. A flat #f37021 band runs the full width of every shell, with nothing on it but ink and white controls; below it a white grouped menu shows how much work waits in each place, and the work area reads list on the left, detail on the right, with one deep-orange button at the foot of the detail. Back office (Staff, Manager, Admin) is dense and desktop-first at 1366 px and up; the student portal is phone-first and keeps the same orange frame; the Android app wears it as an orange app bar.

Everything below the band is quiet: warm canvas, white panels with 10 px corners and warm hairlines, colour given one job each. Where a domain has its own drawing convention, the screen borrows it: Rooms are drawn as a floor plan, a person's week as an FAP-style timetable. The system refuses soft-gradient decoration and the grey SaaS admin where the brand shrinks to a logo tile.

**Key Characteristics:**
- Solid FPT-orange band (56 px back office, 64 px student web and phone bar; the Android app bar) on every shell, no gradient.
- One action colour, deep orange; FPT blue and FPT green have narrow, fixed jobs; "in progress" stays in the brand family.
- Warm neutrals tinted from the orange (canvas #f7f4f0, sand #f3ede6), never cool grey.
- Be Vietnam Pro on the web, Roboto on Android; tabular figures for every number.
- Flat white panels with hairlines; shadows only for controls on the band, the primary button and floating layers.
- Work counts travel with navigation: menu items and section tabs carry their own count.

## Colors

FPT orange frames, deep orange acts, FPT blue links, FPT green confirms; warm neutrals hold the rest. The FPT palette is binding (PRODUCT.md, Brand Commitments).

### Primary
- **FPT Orange** (band): the band behind every shell and the Android app bar; orange fields and marks (chart bars, the Android row bar). Never text.
- **Band Edge** (band-line) and **Band Hover** (band-hover): the band's 1 px bottom edge and dividers on it; hover behind ink controls on the band.
- **Deep Orange** (primary): the only action colour. Primary buttons, selection, the active tab underline, the active menu glyph, done step lines, `accent-color` and caret, the Android FilledButton and selected TabStrip cell.
- **Deep Orange Hover** (primary-hover): primary button hover.
- **Orange Wash** (primary-subtle): active menu item, selected row, text-button hover, brand Tag fill, today's column in a timetable, the selected Android bottom-bar pill and feature icon squares.
- **Brand Ink** (fg-brand): orange text on white or wash (active menu label, active tab, text buttons, selected bottom-bar label).
- **In Progress** (progress, progress-bg, progress-fg): the "In progress" / "Under Review" status tag, deliberately inside the brand family.

### Secondary
- **FPT Blue** (secondary): links (`fg-link`), the focus ring (`focus`), the Info status solid, and "paid, waiting for the door code" / "next term" bed marks. Nothing else.

### Tertiary
- **FPT Green** (success, success-fg, fpt-green): done and paid only (Paid, Allocated, Resolved, available beds, the live shift, finished timeline segments).

### Neutral
- **Ink** (fg / band-fg): body text, and everything printed on the band and the Android app bar.
- **Walnut** (fg-secondary), **Taupe** (fg-tertiary), **Stone** (fg-disabled): secondary text, captions and placeholders, disabled.
- **Warm Canvas** (canvas): page background on web and Android. **Surface** (surface): panels, menu, inputs, band pills. **Sand** (subtle): table header, row hover, the floor-plan corridor, timetable headers, disabled fields.
- **Hairline** (line) and **Strong Hairline** (line-strong): dividers and panel borders; control borders.
- **Wall** (wall, gray-700): the floor plan's walls only (2 px outer wall and corridor walls, 1 px between rooms).
- Status triplets (solid · bg · fg) for success, warning, error, info, neutral back every Tag and Alert, on both platforms.

### Named Rules
**The Band Rule.** The band is one solid colour (#f37021); `band-to` equals `band`, so the gradient utility renders flat. Everything on it is ink (#1d1714) or a white control: Term, Block and search are 36 px white pills with a 10 px radius and the card shadow. White text on FPT orange fails contrast (ink reaches 6.6:1), and so does a blue focus ring, so band controls take an ink ring (`[data-band]`). On Android the app bar is the same orange with ink title and icons.

**The One Action Rule.** Deep orange (#c64f0e) is the only action colour. No blue, green or FPT-orange buttons. Destructive actions use the error red, never orange. Off the band, white text sits only on deep orange (4.9:1), never on FPT orange.

**The Narrow Blue, Narrow Green Rule.** FPT blue means "go somewhere" (links), focus or info; FPT green means done or paid. Neither decorates.

**The Not-By-Colour-Alone Rule.** Status always carries its word or a second cue. Tags are a pill with a 6 px dot plus the status label from one shared vocabulary; bed squares differ by border style (solid, dashed, dotted) and fill as well as colour, and their legend is always on screen; today's timetable column also carries a screen-reader "Today".

## Typography

**Body Font:** Be Vietnam Pro (with ui-sans-serif, system-ui, sans-serif), self-hosted via @fontsource, weights 400/500/600/700, Vietnamese and Latin subsets.
**Android Font:** Roboto, the platform face (no font download).

**Character:** One humanist sans built for Vietnamese diacritics; hierarchy comes from size and weight, not from a second family or from small caps.

### Hierarchy
- **KPI** (600 to 700, 28/36 px): stat tile values and the room title in the Rooms detail. Tabular figures.
- **H1** (700, 24/32 px, tight tracking): page titles in the back-office header (22 px in the compact header).
- **H2** (600, 20/28 px): modal titles, metric values, the phone bar title (700).
- **H3** (600, 16/24 px): panel titles, empty-state titles, detail values.
- **Body Large** (400, 16/24 px): student web default and `lg` controls.
- **Body / Label** (400 / 500, 14/22 px): back-office default; buttons, field labels, menu items, table cells.
- **Small** (400 / 500, 12/20 px): helpers, errors, table headers, Tags, captions, menu section titles, work counts.
- **Axis** (11/16 px): chart axis labels, and the letter inside a bed square.
- **Android:** 18 px / 700 app-bar title; 17 px / 600 section and card titles; 15–16 px / 500–600 rows and buttons; 12 px bottom-bar labels (600 selected, 500 idle).

### Named Rules
**The Tabular Numbers Rule.** Amounts, counts, codes, dates and room codes use `tabular` (tabular-nums).

**The Sentence-Case Heading Rule.** Headings stand on their own. There is no small uppercase tracked label above a heading; menu section titles and Android feature-group headings are sentence case, 12–15 px semibold.

## Layout

- **Back office:** 56 px band across the full width (logo at menu width, then Term and Block pills and the duty toggle; search, VI/EN, notifications at the right). Below: a 248 px white menu with a right hairline, grouped by work, user block at its foot; then the page header, section tabs when the screen belongs to a group, and the work area on the warm canvas with 24 px padding and 16 px between blocks.
- **Work area:** list beside detail; the detail panel ends with the primary action.
- **Student web:** 64 px band header from `lg` with nav pills inside; content column max 680 px on phones (16 px gutter) and 1248 px on desktop (24 px gutter). On phones a 64 px orange bar carries back, title and notifications.
- **Android:** orange app bar, warm canvas, cards in a list with 16 px side padding and 12 px between cards; Home groups features as rows inside one white card per group; a 68 px white bottom bar.
- **Rhythm:** 4 px base. Gaps of 12 and 16 px dominate, 8 px inside controls, 24 px between major blocks; panel padding 16 px (phone) and 20 px (desktop), 24 px for large detail panels.
- **Control heights:** 28 px (sm), 32 px (md, back office), 36 px (band pills), 40 px (lg, student web), 48 px (Android buttons).

## Elevation & Depth

Flat by default. Panels and tables sit on the canvas with a 1 px hairline and no shadow; depth comes from white surface against warm canvas. Shadows are warm-tinted (#3f1d0a base) and reserved for the primary button, white controls on the band, and floating layers.

### Shadow Vocabulary
- **Card** (`0 1px 2px 0 #3f1d0a0d`): primary button, band pills, language switch, the logo tile, the current pagination cell.
- **Dropdown** (`0 6px 16px -4px #3f1d0a1f, 0 2px 4px -2px #3f1d0a0f`): popovers, menus, search results, tooltips.
- **Modal** (`0 16px 32px -8px #3f1d0a29, 0 4px 8px -2px #3f1d0a0f`): dialogs and side drawers.
- **Focus** (`0 0 0 3px #0a5da833`): input focus halo with a blue border.

### Named Rules
**The Flat Card Rule.** Panels never take a shadow; a hairline does the work.

## Shapes

Gently rounded and consistent: 6 px on every control (buttons, inputs, menu items, timetable shift chips), 10 px on desktop panels, tables, popovers and band pills, 12 px on phone cards and modals, 4 px on bed squares. Pills (full) only for Tags, work counts, avatars, step markers and status chips. Borders are 1 px warm hairlines; the active tab uses a 2 px deep-orange underline. The floor plan is the one place with dark ink walls. Android uses a 10 px radius for fields and buttons and a fully rounded top (24 px) on the bottom bar.

## Components

### Buttons
- **Shape:** 6 px radius; heights 28 / 32 / 40 px with 12 / 16 / 20 px side padding; 14 px label, weight 500.
- **Primary:** deep orange fill, white semibold label, card shadow; hover darkens to primary-hover. One per view, at the foot of the detail panel; its label states the count and the amount.
- **Default:** white with strong hairline border, ink label; hover turns the border deep orange and the label brand ink.
- **Text:** brand-ink label, orange-wash hover. **Danger:** error red fill, white label; **Danger text:** error-fg on error-bg hover.
- **Disabled:** 45% opacity, no pointer events. **Focus:** 2 px blue outline offset 2 px (ink on the band).
- **Icon button:** square 28 / 32 / 40 px, ghost or outline, always with an aria-label shown as its tooltip.
- **Android:** FilledButton deep orange, OutlinedButton strong hairline, 48 px high, 10 px radius; a list's create action is a deep-orange extended pill at the bottom right.

### Chips (Tags)
- **Style:** full pill, 12 px weight-500 label, 6 px dot in the status solid, status bg fill and status fg text, a 15% current-colour hairline.
- **Tones:** neutral, warning, info, success, error, brand, and in-progress (brand family); pages pass the API status and one table maps it to a tone.

### Cards / Containers
- **Corner Style:** 12 px on phones, 10 px from `lg`.
- **Background:** surface on canvas. **Border:** 1 px hairline. **Shadow:** none.
- **Internal Padding:** 16 px, 20 px desktop (24 px for large detail panels).

### Inputs / Fields
- **Style:** white, 1 px strong hairline, 6 px radius, 12 px side padding, 32 / 40 px high; label above (14 px, 500), helper or error below (12 px).
- **Focus:** border turns FPT blue with the focus halo (Android: 2 px blue border).
- **Error:** error-red border and a red 2 px halo, error-fg message. **Disabled:** sand fill, hairline border, stone text.

### Navigation
- **Back-office menu:** 248 px white column; 14 px items, 32 px min height, 6 px radius, 18 px glyphs in taupe; hover sand; active orange wash with brand-ink semibold label and deep-orange glyph. Section titles 12 px semibold taupe, sentence case. Each item ends with its work count.
- **Work count:** a pill, 12 px semibold tabular: sand when nothing is late, warning amber when due soon, error red when overdue, with an aria-label naming waiting and overdue.
- **Section tabs:** screens joined under one menu entry switch in a tab row above the page; 14 px, 2 px deep-orange underline on the active tab with brand-ink semibold label; each tab carries its own work count.
- **Tabs (in page):** 14 px weight 500, 24 px apart over a hairline; active has the deep-orange underline.
- **Student nav (on the band):** ink labels, band-hover on hover, active becomes a white pill with brand-ink text.
- **Android bottom bar:** white, 24 px rounded top, soft upward shadow, 68 px; each item is an icon (26 px) over a 12 px label; the current one sits on an orange-wash pill with a deep-orange icon and brand-ink label.

### The Band (signature)
Full-width FPT-orange header marked `data-band`, with a band-line bottom edge. On it: the logo in band tone, white 36 px pills with a 10 px radius for Term, Block and search (card shadow, orange-wash hover), the language switch, and notifications as an ink glyph.

### Floor Plan (signature, Staff › Rooms)
A floor is drawn as its plan: the rooms in two wings along a sand corridor labelled "Corridor" with a dashed centre line, inside a 2 px wall-coloured outline; rooms are cells at least 88 px wide separated by 1 px walls, each wing one row (a long floor scrolls sideways). A room shows its code (bold, tabular), its allocated/capacity count, its beds as 20 px squares with the bed letter, and its room type. Bed states by fill and border style: unpaid (amber, 2 px dotted), paid waiting for the door code (blue wash), resident (orange wash), leaving (dashed orange), next term (dashed blue on white), available (green outline on white), out of service (sand). The named legend always sits under the plan. The selected room takes the orange wash and brand-ink code; a list view stays available.

### Timetable (signature, Staff › My schedule)
A person's week as an FAP-style timetable: shift slots as rows (the three standard shifts always present), days as columns, 1 px hairline grid, sand headers. Today's header is orange wash with brand-ink text and its column a lighter wash. A shift is a 6 px-radius chip in orange 100 with dark-orange text ("On shift"); the shift going on now turns green with a green ring ("Now"). Minimum width 760 px, scrolling sideways on narrow screens.

### Android Home rows
Features grouped under a sentence-case heading (15 px semibold), as rows inside one white card with a hairline and dividers indented past the icon: a 40 px orange-wash icon square, the name (16 px semibold), an optional one-line note, a red count pill when work waits, and a chevron. The top card (HeroCard) is solid deep orange with white text and a white button.

## Do's and Don'ts

### Do:
- **Do** use only the semantic tokens from `web/src/index.css` (and `Tokens` in `mobile/lib/ui.dart`); prefer `primary`, `fg-brand`, `line` over raw `orange-600` or `gray-200`.
- **Do** keep the band a single solid #f37021 with only ink or white controls, and mark it `data-band` so its focus ring turns ink.
- **Do** keep deep orange (#c64f0e) as the one action colour and give each view one primary button, stating the count and amount.
- **Do** show every status with its word, and every bed state with its fill, border style and legend.
- **Do** carry the work count on the menu item and on the section tab that opens the work.
- **Do** use tabular figures for amounts, counts, codes and dates.
- **Do** label every Android bottom-bar icon.

### Don't:
- **Don't** put a gradient on the band or on panels.
- **Don't** set white text on FPT orange (#f37021), or use FPT orange as a text colour.
- **Don't** use FPT blue for buttons or decoration; it is links, focus and info only.
- **Don't** use FPT green for anything except done and paid, or an off-palette colour (violet) for "in progress".
- **Don't** give panels a shadow; hairlines and the canvas carry depth.
- **Don't** introduce cool greys, a second font family on the web, or Tailwind default colours (they are reset).
- **Don't** add small uppercase tracked labels above headings.
