---
name: CampusStay FPT
description: Dormitory operations for FPT University, framed in FPT campus orange.
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
  canvas: "#fbf8f5"
  surface: "#ffffff"
  subtle: "#f5f0eb"
  fg: "#1d1714"
  fg-secondary: "#5c4f46"
  fg-tertiary: "#75665b"
  fg-disabled: "#a8998d"
  line: "#ebe3db"
  line-strong: "#d9cec4"
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
typography:
  kpi:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "36px"
  h1:
    fontFamily: "Be Vietnam Pro, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
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
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
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
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
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
---

# Design System: CampusStay FPT

Source of truth: the `@theme` block in `web/src/index.css`. Tailwind's default palette, type scale and shadows are reset there, so screens can only use these tokens.

## Overview

**Creative North Star: "FPT Orange Campus"**

The app signs itself the way an FPT University building does: a solid FPT-orange band runs the full width of every shell, and the work happens below it on warm white. Back office (Staff, Manager, Admin) is dense and desktop-first at 1366 px and up; the student portal is phone-first and shows the same orange frame.

Everything else is quiet so the band and one action can speak: white side menu, warm-white canvas, warm hairlines, flat cards. Colour carries a single job each.

**Key Characteristics:**
- Full-width FPT-orange band (56 px back office, 64 px phone bar) on every shell.
- One action colour, deep orange; blue and green have narrow, fixed jobs.
- Warm neutrals tinted from the orange, never cool grey.
- Be Vietnam Pro throughout (Vietnamese and Latin subsets, 400 to 700), tabular figures for numbers.
- Flat surfaces with hairline borders; shadows only for floating layers and band controls.

## Colors

FPT orange frames, deep orange acts, FPT blue links, FPT green confirms; warm neutrals hold the rest.

### Primary
- **FPT Orange** (band): the band behind the top of every shell, and orange fields and marks (logo tile off the band, chart bars). Never used as text.
- **Deep Orange** (primary): the only action colour. Primary buttons, selection, active tab underline, active menu glyph, completed step lines, `accent-color` and caret.
- **Deep Orange Hover** (primary-hover): primary button hover.
- **Orange Wash** (primary-subtle): active menu item, selected table row, text-button hover, brand Tag fill.
- **Brand Ink** (fg-brand): orange text on white or wash (active menu label, active tab, text buttons, Avatar initials).

### Secondary
- **FPT Blue** (secondary): links (`fg-link`), the focus ring (`focus`), and the Info status solid. Nothing else.

### Tertiary
- **FPT Green** (success, success-fg, fpt-green): done and paid only (Paid, Allocated, Resolved, Completed, Resident, on-duty toggle, finished timeline segments).

### Neutral
- **Ink** (fg / band-fg): body text, and everything printed on the band.
- **Walnut** (fg-secondary), **Taupe** (fg-tertiary), **Stone** (fg-disabled): secondary text, captions and placeholders, disabled.
- **Warm Canvas** (canvas): page background. **Surface** (surface): cards, menu, inputs, band pills. **Sand** (subtle): table header, hover, disabled fields.
- **Hairline** (line) and **Strong Hairline** (line-strong): dividers and card borders; control borders.
- Status triplets (solid · bg · fg) for success, warning, error, info, neutral back every Tag and Alert.

### Named Rules
**The Band Rule.** Everything on the orange band is ink (#1d1714) or a white control (Term, Block, search, language, user as white pills with the card shadow). White text on FPT orange fails contrast, and so does a blue focus ring: band controls take an ink focus ring (`[data-band]`). Band hover is the lighter orange (band-hover); the band's bottom edge is band-line.

**The One Action Rule.** Deep orange (#C64F0E) is the only action colour. No blue, green or FPT-orange buttons. Destructive actions use the error red, never orange.

**The Narrow Blue, Narrow Green Rule.** FPT blue means "go somewhere" (links) or focus; FPT green means done or paid. Neither decorates.

**The Not-By-Colour-Alone Rule.** Status always carries its word: Tag is a pill with a 6 px dot plus the status label from one shared vocabulary (`toneForStatus`). A coloured dot or fill never stands alone.

## Typography

**Body Font:** Be Vietnam Pro (with ui-sans-serif, system-ui, sans-serif), self-hosted via @fontsource, weights 400/500/600/700, Vietnamese and Latin subsets.

**Character:** One humanist sans built for Vietnamese diacritics; hierarchy comes from size and weight steps, not from a second family.

### Hierarchy
- **KPI** (600, 28/36 px): stat tile values only. Tabular figures.
- **H1** (600 to 700, 24/32 px): page titles in the back-office header; door codes (monospace, tracked) are the one exception to the family.
- **H2** (600, 20/28 px): modal titles, phone bar title (700).
- **H3** (600, 16/24 px): card titles, empty-state titles.
- **Body Large** (400, 16/24 px): student web default and `lg` controls.
- **Body / Label** (400 / 500, 14/22 px): back-office default; buttons, field labels, menu items, table cells.
- **Small** (400 / 500, 12/20 px): helpers, errors, table headers, Tags, captions, menu section titles.
- **Axis** (11/16 px): chart axis labels only.

### Named Rules
**The Tabular Numbers Rule.** Amounts, counts, codes and dates in tables and tiles use `tabular` (tabular-nums).

## Layout

- **Back office:** 56 px band across the full width (logo at menu width, then Term and Block pills and duty toggle; search, VI/EN, notifications at the right). Below: a 248 px white menu with a right hairline, grouped by work, user block at its foot; then page header and work area on the warm canvas.
- **Student web:** band header on desktop (`lg` and up) with nav pills inside; content column max 680 px on phones (16 px gutter) and 1248 px on desktop (24 px gutter). On phones a 64 px orange bar carries back, title and notifications.
- **Rhythm:** 4 px base. Gaps of 12 and 16 px dominate, 8 px inside controls, 24 px between major blocks; card padding 16 px (phone) and 20 px (desktop).
- **Control heights:** 28 px (sm), 32 px (md, back office), 40 px (lg, student web).

## Elevation & Depth

Flat by default. Cards and tables sit on the canvas with a 1 px hairline and no shadow; depth comes from the white surface against warm canvas. Shadows are warm-tinted (#3f1d0a base) and reserved for primary buttons, white controls on the band, and floating layers.

### Shadow Vocabulary
- **Card** (`0 1px 2px 0 #3f1d0a0d`): primary button, band pills, logo tile on the band.
- **Dropdown** (`0 6px 16px -4px #3f1d0a1f, 0 2px 4px -2px #3f1d0a0f`): popovers, menus, search results.
- **Modal** (`0 16px 32px -8px #3f1d0a29, 0 4px 8px -2px #3f1d0a0f`): dialogs and side drawers, over a gray-900 scrim at 45%.
- **Focus** (`0 0 0 3px #0a5da833`): input focus halo with a blue border.

### Named Rules
**The Flat Card Rule.** Cards never take a shadow; a hairline does the work.

## Shapes

Gently rounded and consistent: 6 px on every control (buttons, inputs, menu items, band pills), 8 px on desktop cards, tables and popovers, 12 px on phone cards and modals. Pills (full) only for Tags, avatars, step markers and the language/status chips. Borders are 1 px warm hairlines; the active tab uses a 2 px deep-orange underline.

## Components

### Buttons
- **Shape:** 6 px radius; heights 28 / 32 / 40 px with 12 / 16 / 20 px side padding; 14 px label, weight 500.
- **Primary:** deep orange fill, white semibold label, card shadow; hover darkens to primary-hover. One per view.
- **Default:** white with strong hairline border, ink label; hover turns the border deep orange and the label brand ink.
- **Text:** brand-ink label, orange-wash hover. **Danger:** error red fill, white label; **Danger text:** error-fg on error-bg hover.
- **Disabled:** 45% opacity, no pointer events. **Focus:** 2 px blue outline offset 2 px (ink on the band).
- **Icon button:** square 28 / 32 / 40 px, ghost or outline, always with an aria-label.

### Chips (Tags)
- **Style:** full pill, 12 px weight-500 label, 6 px dot in the status solid, status bg fill and status fg text.
- **Tones:** neutral, warning, info, success, error, brand; the mapping from status word to tone lives in one table shared with Android.

### Cards / Containers
- **Corner Style:** 12 px on phones, 8 px from `lg`.
- **Background:** surface on canvas. **Border:** 1 px hairline. **Shadow:** none.
- **Internal Padding:** 16 px, 20 px desktop (24 px for the large variant). Stat tiles: small label with 16 px glyph, KPI value, small note.

### Inputs / Fields
- **Style:** white, 1 px strong hairline, 6 px radius, 12 px side padding, 32 / 40 px high; label above (14 px, 500), helper or error below (12 px).
- **Focus:** border turns FPT blue with the focus halo.
- **Error:** error-red border and a red 2 px halo, error-fg message. **Disabled:** sand fill, hairline border, stone text.

### Navigation
- **Back-office menu:** 14 px items, 32 px min height, 6 px radius, 18 px glyphs in taupe; hover sand; active orange wash with brand-ink semibold label and deep-orange glyph. Section titles 12 px semibold taupe, sentence case.
- **Tabs:** 14 px weight 500, 24 px apart over a hairline; active has a 2 px deep-orange underline and brand-ink label; counts follow as "Label · n".
- **Student nav (on the band):** ink labels, band-hover on hover, active becomes a white pill with brand-ink text.

### The Band (signature)
Full-width FPT-orange header marked `data-band`, with a band-line bottom edge. On it: the logo in band tone (white tile with brand-ink "CS", ink wordmark and subtitle), white 32 px pills for Term, Block, search and user (card shadow, orange-wash hover), the language switch, and notifications as an ink glyph.

## Do's and Don'ts

### Do:
- **Do** use only the semantic tokens from `web/src/index.css`; prefer `primary`, `fg-brand`, `line` over raw `orange-600` or `gray-200`.
- **Do** put only ink or white controls on the band, and mark the band with `data-band` so its focus ring turns ink.
- **Do** keep deep orange (#C64F0E) as the one action colour and give each view one primary button.
- **Do** show every status as a Tag with its word; colour reinforces, never replaces.
- **Do** use tabular figures for amounts, counts and codes.

### Don't:
- **Don't** set white text on FPT orange (#F37021), or use FPT orange as a text colour anywhere.
- **Don't** use FPT blue for buttons or decoration; it is links, focus and Info only.
- **Don't** use FPT green for anything except done and paid.
- **Don't** give cards a shadow; hairlines and the canvas carry depth.
- **Don't** introduce cool greys, a second font family, or Tailwind default colours (they are reset).
- **Don't** add small uppercase tracked labels above headings; menu section titles are sentence case.
