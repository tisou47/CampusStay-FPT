import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../links.dart';

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

/// Home's notifications card: the newest few, the unread count and "See all".
class NotificationsCard extends StatelessWidget {
  const NotificationsCard({super.key, required this.data, required this.reload, required this.seeAll});

  /// The answer of `GET /notifications?limit=…`.
  final Json data;
  final Future<void> Function() reload;
  final VoidCallback seeAll;

  @override
  Widget build(BuildContext context) {
    final items = data.objects('items').take(3).toList();
    final unread = (data.number('unread') ?? 0).toInt();
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 8,
            children: [
              const Icon(Icons.notifications_none, size: 20, color: Tokens.fg),
              Expanded(
                child: Text(
                  t('Notifications', 'Thông báo'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                ),
              ),
              if (unread > 0) Tag(t('$unread new', '$unread mới'), tone: Tone.brand, dot: false),
              SmallAction(t('See all', 'Xem tất cả'), onPressed: seeAll),
            ],
          ),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                t('No notifications yet.', 'Chưa có thông báo.'),
                style: const TextStyle(color: Tokens.fgTertiary),
              ),
            )
          else
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) const Divider(height: 1, indent: 52),
              NotificationRow(n: items[i], reload: reload, compact: true),
            ],
        ],
      ),
    );
  }
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
        if (context.mounted && n.str('link') != null) await openLink(context, n.str('link'));
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
