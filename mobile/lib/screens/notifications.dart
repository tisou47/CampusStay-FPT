// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../links.dart';
import 'home.dart' show showAnnouncement;

/// Whether an instant falls on today in campus time (UTC+7).
bool isToday(String? iso) {
  final at = DateTime.tryParse(iso ?? '');
  if (at == null) return false;
  final campus = at.toUtc().add(const Duration(hours: 7));
  final now = DateTime.now().toUtc().add(const Duration(hours: 7));
  return campus.year == now.year && campus.month == now.month && campus.day == now.day;
}

/// Marks every notification read (`POST /notifications/read-all`).
Future<void> markAllRead() async {
  await attempt(() => Api.post('/notifications/read-all'));
}

/// Notifications (web MOB-NTF-01; on the phone, Home's "Notifications" and the bell open it): today's and earlier ones,
/// each with an icon for what it is about; unread ones have a dot and bold text; opening one marks it read and goes
/// where it points. `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: t('Notifications', 'Thông báo'),
      body: Loader<Json>(
        fetch: () => Api.get('/notifications?limit=50'),
        builder: (context, d, reload) {
          final items = d.objects('items');
          final today = items.where((n) => isToday(n.str('createdAt'))).toList();
          final earlier = items.where((n) => !isToday(n.str('createdAt'))).toList();
          final markAll = (d.number('unread') ?? 0) > 0
              ? SmallAction(
                  t('Mark all as read', 'Đánh dấu đã đọc'),
                  onPressed: () async {
                    await markAllRead();
                    await reload();
                  },
                )
              : null;

          Widget group(String title, List<Json> list, Widget? action) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 8,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Tokens.fgTertiary),
                    ),
                  ),
                  ?action,
                ],
              ),
              StatusList(
                children: [for (final n in list) NotificationRow(n: n, reload: reload)],
              ),
            ],
          );

          return Cards(
            children: [
              if (items.isEmpty)
                EmptyState(icon: Icons.notifications_none, title: t('No notifications yet', 'Chưa có thông báo'))
              else ...[
                if (today.isNotEmpty) group(t('Today', 'Hôm nay'), today, markAll),
                if (earlier.isNotEmpty) group(t('Earlier', 'Trước đó'), earlier, today.isEmpty ? markAll : null),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Shows the board announcement a notification stands for: the board's entry when it is still there (category,
/// old → new values), otherwise the notification's own title and text.
Future<void> _openAnnouncement(BuildContext context, Json n, Future<void> Function() reload) async {
  Json item = n;
  try {
    final board = await Api.get('/students/me/board');
    item = board.objects('items').firstWhere((a) => a.str('id') == n.str('id'), orElse: () => n);
  } on ApiException {
    // the notification's own text is enough
  }
  if (context.mounted) await showAnnouncement(context, item, reload: reload);
}

/// One notification: an icon for what it is about (an unread dot on it), the title, the text and the time.
class NotificationRow extends StatelessWidget {
  const NotificationRow({super.key, required this.n, required this.reload, this.compact = false});

  final Json n;
  final Future<void> Function() reload;

  /// One line of text (Home's card).
  final bool compact;

  /// What the notification is about, from the web page it links to.
  static IconData icon(String? link) {
    final l = link ?? '';
    if (l.contains('/invoices')) return Icons.credit_card;
    if (l.contains('/family-days')) return Icons.family_restroom;
    if (l.contains('/requests')) return Icons.build_outlined;
    if (l.contains('/applications') || l.contains('/apply') || l.contains('round-2') || l.contains('roommate')) {
      return Icons.description_outlined;
    }
    if (l.contains('/room')) return Icons.bed_outlined;
    return Icons.notifications_none;
  }

  @override
  Widget build(BuildContext context) {
    final read = n.flag('read');
    final at = moment(n.str('createdAt'));
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () async {
        if (!read) await attempt(() => Api.post('/notifications/${Uri.encodeComponent(n.text('id'))}/read'));
        if (!context.mounted) return;
        if (n.str('kind') == 'announcement') {
          // An announcement of the board opens here, in its sheet; its link is Home (`/student`), and following it would
          // close this page and rebuild Home.
          await _openAnnouncement(context, n, reload);
        } else if (n.str('link') != null) {
          await openLink(context, n.str('link'));
        }
        await reload();
      },
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 4, vertical: compact ? 10 : 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [
            Badge(
              isLabelVisible: !read,
              smallSize: 10,
              backgroundColor: Tokens.primary,
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: read ? Tokens.subtle : Tokens.brandSubtle, shape: BoxShape.circle),
                child: Icon(icon(n.str('link')), size: 18, color: read ? Tokens.fgSecondary : Tokens.fgBrand),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 2,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          n.text('title'),
                          maxLines: compact ? 1 : 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 15, fontWeight: read ? FontWeight.w500 : FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isToday(n.str('createdAt')) ? at.split(' ').last : at.split(' ').first,
                        style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
                      ),
                    ],
                  ),
                  if (n.str('body') != null)
                    Text(
                      n.text('body'),
                      maxLines: compact ? 1 : 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13.5, color: Tokens.fgSecondary),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
