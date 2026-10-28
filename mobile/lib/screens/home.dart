import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../session.dart';

/// Student Home (spec §11.4): the registration period card and the dormitory board, the Room card, the Invoice due
/// and the open requests (`/students/me/home`, `/students/me/board`, `/registration-periods/current`).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session, required this.openPayments, required this.openRoom});

  final Session session;
  final VoidCallback openPayments;
  final VoidCallback openRoom;

  static Future<(Json, Json, Json?)> _fetch() async {
    final results = await Future.wait([Api.get('/students/me/home'), Api.get('/students/me/board')]);
    Json? period;
    try {
      period = (await Api.get('/registration-periods/current')).obj('card');
    } on ApiException {
      period = null;
    }
    return (results[0], results[1], period);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Loader<(Json, Json, Json?)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (home, board, card) = data;
        final allocation = home.obj('allocation');
        final due = home.obj('dueInvoice');
        final announcements = board.objects('items');
        return Cards(children: [
          Text(t('Hello, ', 'Xin chào, ') + (home.str('firstName') ?? session.name),
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          if (card != null)
            Section(title: '${t('Registration period', 'Đợt đăng ký')} · ${card.text('name')}', children: [
              StatusChip(card.str('status')),
              Line(t('Opens', 'Mở'), moment(card.str('opensAt'))),
              Line(t('Closes', 'Đóng'), moment(card.str('closesAt'))),
              Line(t('Stay', 'Thời gian ở'), '${day(card.str('stayStart'))} – ${day(card.str('stayEnd'))}'),
              if (card.number('fromPrice') != null) Line(t('From', 'Giá từ'), money(card.number('fromPrice'))),
            ]),
          Section(title: t('Your Room', 'Phòng của bạn'), children: [
            if (allocation == null)
              Text(t('You have no Room this Term.', 'Bạn chưa có phòng trong kỳ này.'))
            else ...[
              Text('${t('Room ', 'Phòng ')}${allocation.text('room')} · ${t('Bed ', 'Giường ')}${allocation.text('bed')}',
                  style: const TextStyle(fontWeight: FontWeight.w500)),
              Text(label(allocation.str('block')), style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(onPressed: openRoom, child: Text(t('Open My Room', 'Mở Phòng của tôi'))),
              ),
            ],
          ]),
          if (due != null)
            Section(title: t('Invoice due', 'Hoá đơn cần thanh toán'), children: [
              Text(due.text('title')),
              Line(t('Amount', 'Số tiền'), money(due.number('amount'))),
              Line(t('Due', 'Hạn'), moment(due.str('dueAt'))),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(onPressed: openPayments, child: Text(t('Pay', 'Thanh toán'))),
              ),
            ]),
          if (announcements.isNotEmpty) Text(t('Dormitory board', 'Bảng tin KTX'), style: theme.textTheme.titleMedium),
          for (final a in announcements)
            Section(title: (a.flag('pinned') ? '📌 ' : '') + a.text('title'), children: [
              Text(a.text('body')),
              Text(moment(a.str('createdAt')),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ]),
        ]);
      },
    );
  }
}
