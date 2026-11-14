import 'package:flutter/material.dart';

import 'common.dart';

// The web's design system on the phone (web/src/index.css, components/ui): colours, tags, alerts, cards and rows.
// `common.dart` exports this file, so every screen has it.

// ---------------------------------------------------------------- design tokens

/// The web's colours: one action colour (orange 600), FPT orange for marks, warm greys, and the four tones.
class Tokens {
  Tokens._();

  static const primary = Color(0xFFC64F0E);
  static const accent = Color(0xFFF37021);
  static const brandSubtle = Color(0xFFFFF1E6);
  static const brandLine = Color(0xFFFECDAA);
  static const fgBrand = Color(0xFFB8490D);
  static const link = Color(0xFF0A5DA8);
  static const canvas = Color(0xFFFBF8F5);
  static const surface = Colors.white;
  static const subtle = Color(0xFFF5F0EB);
  static const fg = Color(0xFF1D1714);
  static const fgSecondary = Color(0xFF5C4F46);
  static const fgTertiary = Color(0xFF75665B);
  static const line = Color(0xFFEBE3DB);
  static const lineStrong = Color(0xFFD9CEC4);
}

/// A tag's or alert's tone, as on the web (`Tag tone`, `Alert type`).
enum Tone {
  neutral(Tokens.fgSecondary, Tokens.subtle, Tokens.lineStrong),
  success(Color(0xFF226B2D), Color(0xFFEEF8EF), Color(0xFF2E8A3C)),
  warning(Color(0xFF92400E), Color(0xFFFFFBEB), Color(0xFFF59E0B)),
  error(Color(0xFFA61B1B), Color(0xFFFEF2F2), Color(0xFFC81E1E)),
  info(Color(0xFF084A86), Color(0xFFEEF5FC), Color(0xFF0A5DA8)),
  brand(Tokens.fgBrand, Tokens.brandSubtle, Tokens.primary);

  const Tone(this.fg, this.bg, this.mark);

  final Color fg;
  final Color bg;
  final Color mark;
}

/// The tone of an API status (web `StatusTag`).
Tone toneOf(String? status) => switch (status) {
  'Paid' ||
  'Resident' ||
  'Resolved' ||
  'Closed' ||
  'Approved' ||
  'Continuing' ||
  'Ready' ||
  'Checked out' ||
  'Verified' ||
  'Allocated' ||
  'Accepted' ||
  'Agreed' ||
  'Open' ||
  'Submitted' ||
  'In use' => Tone.success,
  'Overdue' ||
  'Rejected' ||
  'Void' ||
  'Not continuing' ||
  'Notice sent' ||
  'Forfeited' ||
  'Final warning' ||
  'Broken' ||
  'Terminated' => Tone.error,
  'Unpaid' ||
  'Awaiting confirmation' ||
  'Awaiting Deposit' ||
  'Awaiting Roommate' ||
  'Awaiting extension' ||
  'Awaiting consent' ||
  'Waitlisted' ||
  'Pending' ||
  'Pending verification' ||
  'Assigned – unpaid' ||
  'Warning' ||
  'Invited' ||
  'In repair' ||
  'Claimed' => Tone.warning,
  'Under Review' ||
  'In progress' ||
  'Assigned' ||
  'Opens soon' ||
  'Paid – waiting for the door code' ||
  'Profile needed' ||
  'Refunded' => Tone.info,
  _ => Tone.neutral,
};

/// The app's theme: the web's colours on a warm canvas, 12 px radii, outlined fields.
ThemeData campusTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Tokens.accent,
    primary: Tokens.primary,
    onPrimary: Colors.white,
    primaryContainer: Tokens.brandSubtle,
    onPrimaryContainer: Tokens.fgBrand,
    secondaryContainer: Tokens.brandSubtle,
    onSecondaryContainer: Tokens.fgBrand,
    surface: Tokens.surface,
    onSurface: Tokens.fg,
    onSurfaceVariant: Tokens.fgSecondary,
    outline: Tokens.lineStrong,
    outlineVariant: Tokens.line,
    error: Tone.error.mark,
  );
  final radius = BorderRadius.circular(10);
  return ThemeData(
    fontFamily: 'Roboto',
    colorScheme: scheme,
    scaffoldBackgroundColor: Tokens.canvas,
    appBarTheme: const AppBarTheme(
      backgroundColor: Tokens.surface,
      foregroundColor: Tokens.fg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: TextStyle(fontFamily: 'Roboto', fontSize: 18, fontWeight: FontWeight.w600, color: Tokens.fg),
      shape: Border(bottom: BorderSide(color: Tokens.line)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Tokens.surface,
      indicatorColor: Tokens.brandSubtle,
      surfaceTintColor: Colors.transparent,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? Tokens.fgBrand : Tokens.fgSecondary),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? Tokens.fgBrand : Tokens.fgSecondary,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Tokens.surface,
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: Tokens.lineStrong),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: Tokens.lineStrong),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: Tokens.link, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'Roboto', fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        foregroundColor: Tokens.fg,
        side: const BorderSide(color: Tokens.lineStrong),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'Roboto', fontWeight: FontWeight.w500, fontSize: 15),
      ),
    ),
    dividerTheme: const DividerThemeData(color: Tokens.line, space: 1),
    tabBarTheme: const TabBarThemeData(
      labelColor: Tokens.fgBrand,
      unselectedLabelColor: Tokens.fgSecondary,
      indicatorColor: Tokens.primary,
      dividerColor: Tokens.line,
    ),
    dialogTheme: const DialogThemeData(backgroundColor: Tokens.surface, surfaceTintColor: Colors.transparent),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: Tokens.surface, surfaceTintColor: Colors.transparent),
    snackBarTheme: const SnackBarThemeData(backgroundColor: Tokens.fg, behavior: SnackBarBehavior.floating),
  );
}

// ---------------------------------------------------------------- feedback and navigation

/// The app's snack bar host (set on the MaterialApp).
final messenger = GlobalKey<ScaffoldMessengerState>();

/// A short message at the bottom of the screen (the web's toast).
void toast(String text, {bool error = false}) {
  messenger.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), backgroundColor: error ? Tone.error.mark : null));
}

/// Opens [page] on top of the current screen; resolves when it is closed.
Future<T?> push<T>(BuildContext context, Widget page) =>
    Navigator.push<T>(context, MaterialPageRoute<T>(builder: (_) => page));

/// A yes/no question; [danger] paints the confirm button red; [content] goes under the text.
Future<bool> confirm(
  BuildContext context, {
  required String title,
  String? body,
  String? yes,
  String? no,
  bool danger = false,
  Widget? content,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [if (body != null) Text(body), ?content],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(no ?? t('Cancel', 'Huỷ'))),
        FilledButton(
          style: danger
              ? FilledButton.styleFrom(backgroundColor: Tone.error.mark, minimumSize: const Size(0, 40))
              : FilledButton.styleFrom(minimumSize: const Size(0, 40)),
          onPressed: () => Navigator.pop(context, true),
          child: Text(yes ?? t('Confirm', 'Xác nhận')),
        ),
      ],
    ),
  );
  return ok == true;
}

/// Runs [action] and shows its error as a toast ([success] when it worked); returns the result, or null on error.
Future<T?> attempt<T>(Future<T> Function() action, {String? success}) async {
  try {
    final result = await action();
    if (success != null) toast(success);
    return result;
  } catch (e) {
    toast('$e', error: true);
    return null;
  }
}

// ---------------------------------------------------------------- text helpers

/// "3 days" / "5 hours" until [iso]; null once it passed (web `timeLeft`).
String? timeLeft(String? iso, [DateTime? now]) {
  final at = iso == null ? null : DateTime.tryParse(iso);
  if (at == null) return null;
  final ms = at.difference(now ?? DateTime.now()).inMilliseconds;
  if (ms <= 0) return null;
  final hours = (ms / 3600000).ceil();
  if (hours < 24) return hours == 1 ? t('1 hour', '1 giờ') : t('$hours hours', '$hours giờ');
  final days = (ms / 86400000).ceil();
  return days == 1 ? t('1 day', '1 ngày') : t('$days days', '$days ngày');
}

/// "Due in 3 days", "Due today" or "Overdue" (web Student Home).
String? dueIn(String? iso, [DateTime? now]) {
  final at = iso == null ? null : DateTime.tryParse(iso);
  if (at == null) return null;
  final d = (at.difference(now ?? DateTime.now()).inMilliseconds / 86400000).ceil();
  if (d < 0) return t('Overdue', 'Quá hạn');
  if (d == 0) return t('Due today', 'Hạn hôm nay');
  return d == 1 ? t('Due in 1 day', 'Còn 1 ngày') : t('Due in $d days', 'Còn $d ngày');
}

/// `5 Oct 2026 – 20 Oct 2026`, or `—`.
String range(String? from, String? to) => from == null ? '—' : (to == null ? day(from) : '${day(from)} – ${day(to)}');

/// `A101 · Bed 2`.
String roomBed(String? room, String? bed) => '${room ?? '—'} · ${t('Bed', 'Giường')} ${bed ?? '—'}';

/// Several parts joined with ` · `, blanks left out.
String joinDot(Iterable<String?> parts) => parts.where((p) => p != null && p.isNotEmpty).join(' · ');

/// `1 Term` / `3 Terms`.
String terms(num? n) {
  final v = (n ?? 1).toInt();
  return v == 1 ? t('1 Term', '1 kỳ') : t('$v Terms', '$v kỳ');
}

/// A furniture type in the phone's language (`type`/`typeVi` of an item, `name`/`nameVi` of a catalogue line).
String furnitureName(Json f) =>
    (isVietnamese() ? (f.str('typeVi') ?? f.str('nameVi')) : null) ?? f.str('type') ?? f.text('name');

/// `4 × Bed, Desk` from catalogue lines `[{ name, quantity }]` or from items, one per piece.
String countLines(List<Json> items) {
  final counts = <String, int>{};
  for (final i in items) {
    final name = furnitureName(i);
    counts[name] = (counts[name] ?? 0) + (i.number('quantity')?.toInt() ?? 1);
  }
  return counts.entries.map((e) => e.value > 1 ? '${e.value} × ${e.key}' : e.key).join(', ');
}

/// `+15%` of a surcharge rate `0.15`.
String surcharge(num? rate) => '+${((rate ?? 0) * 100).round()}%';

/// The `timeline` of `GET /registration-periods/{termId}` as rows (web `scheduleRows`): the registration opening and
/// closing become one window; the first row not over yet is current.
List<(String, String?, String)> scheduleRows(List<Json> timeline, [DateTime? now]) {
  final today = now ?? DateTime.now();
  final opens = timeline.where((m) => m.str('key') == 'registrationOpensAt').firstOrNull;
  final closes = timeline.where((m) => m.str('key') == 'registrationClosesAt').firstOrNull;
  final rows = <(String, String?, DateTime?)>[];
  if (opens != null || closes != null) {
    final text = opens != null && closes != null
        ? '${day(opens.str('at'))} – ${moment(closes.str('at'))}'
        : moment((opens ?? closes)!.str('at'));
    rows.add((t('Registration', 'Đăng ký'), text, DateTime.tryParse((closes ?? opens)!.text('at'))));
  }
  for (final m in timeline) {
    if (identical(m, opens) || identical(m, closes)) continue;
    final at = m.str('at');
    final date = m.str('date');
    final until = m.str('until');
    if (at == null && date == null) continue;
    final text = at != null ? moment(at) : (until != null ? range(date, until) : day(date));
    final end = at != null ? DateTime.tryParse(at) : DateTime.tryParse(until ?? date!)?.add(const Duration(days: 1));
    rows.add((label(m.text('label')), text, end));
  }
  final current = rows.indexWhere((r) => r.$3 == null || r.$3!.isAfter(today));
  return [
    for (var i = 0; i < rows.length; i++)
      (
        rows[i].$1,
        rows[i].$2,
        i == current
            ? 'current'
            : (current == -1 || i < current)
            ? 'done'
            : 'upcoming',
      ),
  ];
}

// ---------------------------------------------------------------- pieces

/// A sub-page with its own top bar and back arrow.
class SubPage extends StatelessWidget {
  const SubPage({super.key, required this.title, required this.body, this.actions, this.bottom});

  final String title;
  final Widget body;
  final List<Widget>? actions;

  /// Buttons pinned under the content (web wizard actions).
  final Widget? bottom;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title), actions: actions),
    body: SafeArea(top: false, child: body),
    bottomNavigationBar: bottom == null
        ? null
        : SafeArea(
            child: Container(
              decoration: const BoxDecoration(
                color: Tokens.surface,
                border: Border(top: BorderSide(color: Tokens.line)),
              ),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: bottom,
            ),
          ),
  );
}

/// A list of cards with the screens' spacing.
class Cards extends StatelessWidget {
  const Cards({super.key, required this.children, this.bottom = 24});

  final List<Widget> children;
  final double bottom;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 12, 16, bottom),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, i) => children[i],
    );
  }
}

/// A white card with a 1 px line and a 12 px radius (web `Card`).
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color, this.border});

  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    // A Material, so the ink of rows and expansion tiles inside shows on the card.
    // A soft shadow lifts the white cards off the warm canvas; tinted cards (alerts, banners) stay flat.
    return Material(
      color: color ?? Tokens.surface,
      clipBehavior: Clip.antiAlias,
      elevation: color == null ? 1 : 0,
      shadowColor: const Color(0x331D1714),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: border ?? Tokens.line.withValues(alpha: 0.7)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: padding,
        child: SizedBox(width: double.infinity, child: child),
      ),
    );
  }
}

/// A titled card; [trailing] sits right of the title (a tag, a count).
class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.children, this.trailing, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Tokens.fg),
                    ),
                    if (subtitle != null)
                      Text(subtitle!, style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary)),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            ],
          ),
          for (final child in children) Padding(padding: const EdgeInsets.only(top: 10), child: child),
        ],
      ),
    );
  }
}

/// A name and its value on one line (web `DetailRows`).
class Line extends StatelessWidget {
  const Line(this.name, this.value, {super.key, this.strong = false});

  final String name;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    // Name left, value right-aligned: on a phone the two columns share the width, and long values wrap on the right.
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: Text(name, style: const TextStyle(color: Tokens.fgTertiary)),
        ),
        const SizedBox(width: 12),
        Expanded(
          flex: 3,
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: TextStyle(fontWeight: strong ? FontWeight.w600 : FontWeight.w500, color: Tokens.fg),
          ),
        ),
      ],
    );
  }
}

/// A small coloured tag (web `Tag`).
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.tone = Tone.neutral, this.dot = true});

  final String text;
  final Tone tone;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          if (dot)
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: tone.mark, shape: BoxShape.circle),
            ),
          Flexible(
            child: Text(
              text,
              style: TextStyle(color: tone.fg, fontWeight: FontWeight.w500, fontSize: 12.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// An API status as a tag in its tone (web `StatusTag`).
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key, this.tone});

  final String? status;
  final Tone? tone;

  @override
  Widget build(BuildContext context) {
    final value = status;
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    return Align(
      alignment: Alignment.centerLeft,
      widthFactor: 1,
      child: Tag(label(value), tone: tone ?? toneOf(value)),
    );
  }
}

/// A coloured message box with a title (web `Alert`); [action] sits under the text.
class Alert extends StatelessWidget {
  const Alert({super.key, required this.tone, required this.title, this.body, this.action});

  final Tone tone;
  final String title;
  final String? body;
  final Widget? action;

  IconData get _icon => switch (tone) {
    Tone.success => Icons.check_circle_outline,
    Tone.warning => Icons.warning_amber_rounded,
    Tone.error => Icons.error_outline,
    _ => Icons.info_outline,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: tone.bg,
        border: Border.all(color: tone.mark.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 10,
        children: [
          Icon(_icon, size: 20, color: tone.mark),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w600, color: tone.fg),
                ),
                if (body != null && body!.isNotEmpty) Text(body!, style: const TextStyle(color: Tokens.fgSecondary)),
                // Full width, like every main button of a card.
                if (action != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: SizedBox(width: double.infinity, child: action!),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The "next action" banner of Student Home (web `NextAction`): deadline, title, text, full-width button.
class NextAction extends StatelessWidget {
  const NextAction({super.key, required this.icon, required this.title, this.body, this.deadline, this.action});

  final IconData icon;
  final String title;
  final String? body;
  final String? deadline;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Panel(
      color: Tokens.brandSubtle,
      border: Tokens.brandLine,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 4,
        children: [
          Row(
            spacing: 12,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(color: Tokens.surface, shape: BoxShape.circle),
                child: Icon(icon, size: 22, color: Tokens.fgBrand),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Tokens.fg),
                    ),
                    if (deadline != null)
                      Text(
                        deadline!,
                        style: const TextStyle(fontSize: 13, color: Tokens.fgBrand, fontWeight: FontWeight.w600),
                      ),
                    if (body != null && body!.trim().isNotEmpty)
                      Text(body!, style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary)),
                  ],
                ),
              ),
            ],
          ),
          if (action != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SizedBox(width: double.infinity, child: action!),
            ),
        ],
      ),
    );
  }
}

/// A grid of shortcuts (icon, label, optional count badge), three per row: the phone's way to reach every part of the
/// app from Home without listing their details.
class QuickGrid extends StatelessWidget {
  const QuickGrid({super.key, required this.items, this.columns = 3});

  /// Shortcuts per row.
  final int columns;

  /// (icon, label, badge count or null, onTap)
  final List<(IconData, String, int?, VoidCallback)> items;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: LayoutBuilder(
        builder: (context, box) {
          final width = box.maxWidth / columns;
          return Wrap(
            children: [
              for (final (icon, text, badge, onTap) in items)
                SizedBox(
                  width: width,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: onTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                      child: Column(
                        spacing: 6,
                        children: [
                          Badge(
                            isLabelVisible: (badge ?? 0) > 0,
                            label: Text('$badge'),
                            backgroundColor: Tokens.primary,
                            child: Container(
                              width: 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: Tokens.brandSubtle,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(icon, color: Tokens.fgBrand, size: 24),
                            ),
                          ),
                          Text(
                            text,
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Tokens.fg),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// One tappable line in a card: icon, text, a short note on the right and a chevron (a banner that leads somewhere).
class LinkBar extends StatelessWidget {
  const LinkBar({
    super.key,
    required this.icon,
    required this.text,
    this.note,
    required this.onTap,
    this.tone = Tone.neutral,
  });

  final IconData icon;
  final String text;
  final String? note;
  final VoidCallback onTap;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final colored = tone != Tone.neutral;
    return Panel(
      padding: EdgeInsets.zero,
      color: colored ? tone.bg : null,
      border: colored ? tone.mark.withValues(alpha: 0.3) : null,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            spacing: 10,
            children: [
              Icon(icon, size: 20, color: colored ? tone.mark : Tokens.fgSecondary),
              Expanded(
                child: Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w500, color: colored ? tone.fg : Tokens.fg),
                ),
              ),
              if (note != null)
                Text(
                  note!,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: colored ? tone.fg : Tokens.fgBrand,
                  ),
                ),
              Icon(Icons.chevron_right, size: 20, color: colored ? tone.fg : Tokens.fgTertiary),
            ],
          ),
        ),
      ),
    );
  }
}

/// A card of [StatusRow]s (web `StatusList`).
class StatusList extends StatelessWidget {
  const StatusList({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[if (i > 0) const Divider(height: 1, indent: 56), children[i]],
        ],
      ),
    );
  }
}

/// A list row: 40 px icon disc, title, note, then [trailing] or a chevron (web `StatusRow`); [below] sits under the
/// note (a status tag, small buttons).
class StatusRow extends StatelessWidget {
  const StatusRow({
    super.key,
    required this.icon,
    required this.title,
    this.note,
    this.trailing,
    this.below,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String? note;
  final Widget? trailing;
  final List<Widget>? below;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        child: Row(
          crossAxisAlignment: below == null ? CrossAxisAlignment.center : CrossAxisAlignment.start,
          spacing: 12,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(color: Tokens.subtle, shape: BoxShape.circle),
              child: Icon(icon, size: 20, color: Tokens.fgSecondary),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 2,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w500, color: Tokens.fg, fontSize: 15),
                  ),
                  if (note != null && note!.isNotEmpty)
                    Text(note!, style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
                  if (below != null && below!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: below!,
                      ),
                    ),
                ],
              ),
            ),
            if (trailing != null)
              trailing!
            else if (onTap != null)
              const Icon(Icons.chevron_right, color: Tokens.fgSecondary),
          ],
        ),
      ),
    );
  }
}

/// An empty list: icon, title, text and an action (web `EmptyBlock`).
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 28),
      child: Column(
        spacing: 8,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(color: Tokens.subtle, shape: BoxShape.circle),
            child: Icon(icon, color: Tokens.fgSecondary),
          ),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
          ),
          if (body != null)
            Text(
              body!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Tokens.fgSecondary),
            ),
          if (action != null) Padding(padding: const EdgeInsets.only(top: 4), child: action!),
        ],
      ),
    );
  }
}

/// A short message under an action (web `Note`).
class Note extends StatelessWidget {
  const Note(this.text, {super.key, this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(color: error ? Tone.error.fg : Tokens.fgTertiary, fontSize: 13.5));
}

/// A selectable card for one choice of a group (web `OptionCard`, `Radio`); disabled without [onTap].
class OptionTile extends StatelessWidget {
  const OptionTile({
    super.key,
    required this.selected,
    required this.title,
    required this.onTap,
    this.trailing,
    this.lines = const [],
  });

  final bool selected;
  final String title;
  final String? trailing;
  final List<String> lines;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.all(selected ? 13 : 14),
          decoration: BoxDecoration(
            color: selected ? Tokens.brandSubtle : Tokens.surface,
            border: Border.all(color: selected ? Tokens.primary : Tokens.line, width: selected ? 2 : 1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 10,
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                size: 20,
                color: disabled ? Tokens.lineStrong : (selected ? Tokens.primary : Tokens.fgTertiary),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(
                      title,
                      style: TextStyle(fontWeight: FontWeight.w500, color: disabled ? Tokens.fgTertiary : Tokens.fg),
                    ),
                    for (final line in lines)
                      Text(line, style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
                  ],
                ),
              ),
              if (trailing != null)
                Text(
                  trailing!,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fg),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A checkbox with a wrapping label (web `Checkbox`).
class Check extends StatelessWidget {
  const Check({super.key, required this.value, required this.label, required this.onChanged});

  final bool value;
  final String label;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Checkbox(value: value, onChanged: (v) => onChanged(v ?? false)),
          Expanded(
            child: Padding(padding: const EdgeInsets.only(top: 12), child: Text(label)),
          ),
        ],
      ),
    );
  }
}

/// A list to choose one value from.
class Choice<V> extends StatelessWidget {
  const Choice({
    super.key,
    required this.name,
    required this.values,
    required this.text,
    required this.value,
    required this.onChanged,
    this.error,
    this.enabled = true,
  });

  final String name;
  final List<V> values;
  final String Function(V value) text;
  final V? value;
  final String? error;
  final bool enabled;
  final ValueChanged<V?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<V>(
      key: ValueKey('$name|$value|${values.length}|$enabled'),
      initialValue: values.contains(value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: name, errorText: error),
      items: [
        for (final v in values)
          DropdownMenuItem(
            value: v,
            child: Text(text(v), overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: enabled ? onChanged : null,
    );
  }
}

/// A text field with a label and an error (multi-line when [lines] > 1).
class Input extends StatelessWidget {
  const Input({
    super.key,
    required this.controller,
    required this.label,
    this.error,
    this.helper,
    this.lines = 1,
    this.keyboard,
    this.maxLength,
    this.hint,
    this.obscure = false,
    this.capitalize = false,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String? error;
  final String? helper;
  final String? hint;
  final int lines;
  final TextInputType? keyboard;
  final int? maxLength;
  final bool obscure;
  final bool capitalize;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      minLines: lines,
      maxLines: obscure ? 1 : (lines > 1 ? lines + 3 : 1),
      maxLength: maxLength,
      obscureText: obscure,
      keyboardType: keyboard ?? (lines > 1 ? TextInputType.multiline : null),
      textCapitalization: capitalize ? TextCapitalization.characters : TextCapitalization.none,
      onChanged: onChanged,
      // The character counter only for long texts; a short field's limit needs no counter on a small screen.
      decoration: InputDecoration(
        labelText: label,
        errorText: error,
        helperText: helper,
        hintText: hint,
        helperMaxLines: 3,
        counterText: (maxLength ?? 0) >= 500 ? null : '',
      ),
    );
  }
}

/// A full-width button that shows a spinner while [busy]; [outlined] for the secondary one, [danger] in red.
class BusyButton extends StatelessWidget {
  const BusyButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.danger = false,
    this.outlined = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final bool danger;
  final bool outlined;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = busy
        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 8,
            children: [
              if (icon != null) Icon(icon, size: 18),
              Flexible(child: Text(label, textAlign: TextAlign.center)),
            ],
          );
    return SizedBox(
      width: double.infinity,
      child: outlined
          ? OutlinedButton(
              style: danger ? OutlinedButton.styleFrom(foregroundColor: Tone.error.mark) : null,
              onPressed: busy ? null : onPressed,
              child: child,
            )
          : FilledButton(
              style: danger ? FilledButton.styleFrom(backgroundColor: Tone.error.mark) : null,
              onPressed: busy ? null : onPressed,
              child: child,
            ),
    );
  }
}

/// A text button aligned left, in the link colour (web `Button variant="text"`).
class LinkButton extends StatelessWidget {
  const LinkButton(this.label, {super.key, required this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton.icon(
        style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 4), foregroundColor: Tokens.link),
        onPressed: onPressed,
        icon: Icon(icon ?? Icons.chevron_right, size: 18),
        iconAlignment: icon == null ? IconAlignment.end : IconAlignment.start,
        label: Text(label),
      ),
    );
  }
}

/// A small text action in a card's header (Change, Edit).
class SmallAction extends StatelessWidget {
  const SmallAction(this.label, {super.key, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => TextButton(
    style: TextButton.styleFrom(
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      minimumSize: const Size(0, 32),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    ),
    onPressed: onPressed,
    child: Text(label),
  );
}

/// A row of filter chips (a second-level choice under a segmented switch).
class Filters extends StatelessWidget {
  const Filters({super.key, required this.items, required this.value, required this.onChanged});

  final List<(String, String)> items;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: [
        for (final (key, text) in items)
          ChoiceChip(
            label: Text(text),
            selected: key == value,
            showCheckmark: false,
            selectedColor: Tokens.brandSubtle,
            labelStyle: TextStyle(
              color: key == value ? Tokens.fgBrand : Tokens.fgSecondary,
              fontWeight: FontWeight.w500,
            ),
            side: BorderSide(color: key == value ? Tokens.brandLine : Tokens.lineStrong),
            onSelected: (_) => onChanged(key),
          ),
      ],
    );
  }
}

/// The one "create" button of a list screen (New application, New request): the same pill at the bottom right on every
/// tab, so the main action of each list looks and sits alike.
class CreateButton extends StatelessWidget {
  const CreateButton({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      heroTag: label,
      backgroundColor: Tokens.primary,
      foregroundColor: Colors.white,
      elevation: 2,
      highlightElevation: 4,
      shape: const StadiumBorder(),
      onPressed: onPressed,
      icon: const Icon(Icons.add),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
    );
  }
}

/// A list with its [CreateButton] floating at the bottom right (or none).
class WithCreate extends StatelessWidget {
  const WithCreate({super.key, required this.child, this.button});

  final Widget child;
  final Widget? button;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(child: child),
      if (button != null) Positioned(right: 16, bottom: 16, child: button!),
    ],
  );
}

/// The top card of a tab (Home, My Room, Payments): white text on the brand gradient, with a soft orange shadow.
class HeroCard extends StatelessWidget {
  const HeroCard({super.key, required this.child});

  final Widget child;

  /// Text on the gradient: white, and a lighter white for secondary lines.
  static const TextStyle strong = TextStyle(color: Colors.white, fontWeight: FontWeight.w700);
  static TextStyle get soft => TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13);

  /// A white button on the gradient (its main action).
  static ButtonStyle get button => FilledButton.styleFrom(
    backgroundColor: Colors.white,
    foregroundColor: Tokens.primary,
    minimumSize: const Size(double.infinity, 48),
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Tokens.accent, Tokens.primary],
        ),
        boxShadow: const [BoxShadow(color: Color(0x33C64F0E), blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: child,
    );
  }
}

/// A heading between cards.
class Heading extends StatelessWidget {
  const Heading(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Tokens.fg),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Milestones with done / current / upcoming dots (web `ProgressTimeline`, the rows of `TermSchedule`).
class Timeline extends StatelessWidget {
  const Timeline({super.key, required this.items});

  /// (title, time text, state: done|current|upcoming)
  final List<(String, String?, String)> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < items.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                Column(
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 3),
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: switch (items[i].$3) {
                          'done' => Tone.success.mark,
                          'current' => Tokens.primary,
                          _ => Tokens.surface,
                        },
                        border: Border.all(
                          color: items[i].$3 == 'upcoming' ? Tokens.lineStrong : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    if (i < items.length - 1) Expanded(child: Container(width: 2, color: Tokens.line)),
                  ],
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 2,
                      children: [
                        Text(
                          items[i].$1,
                          style: TextStyle(
                            fontWeight: items[i].$3 == 'current' ? FontWeight.w600 : FontWeight.w500,
                            color: items[i].$3 == 'upcoming' ? Tokens.fgSecondary : Tokens.fg,
                          ),
                        ),
                        if (items[i].$2 != null)
                          Text(items[i].$2!, style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// A segmented switch (web `Tabs` on a phone, Activity › Segmented).
class Segments extends StatelessWidget {
  const Segments({super.key, required this.items, required this.value, required this.onChanged});

  final List<(String, String)> items;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: SegmentedButton<String>(
        showSelectedIcon: false,
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: Tokens.brandSubtle,
          selectedForegroundColor: Tokens.fgBrand,
          foregroundColor: Tokens.fgSecondary,
          side: const BorderSide(color: Tokens.lineStrong),
        ),
        segments: [for (final (key, text) in items) ButtonSegment(value: key, label: Text(text))],
        selected: {value},
        onSelectionChanged: (s) => onChanged(s.first),
      ),
    );
  }
}
