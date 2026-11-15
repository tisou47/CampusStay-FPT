import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'apply.dart';

/// Registration period details (web SCR-HOME-05, spec §6.5, R-09, R-14): the schedule, the prices per Room Type and
/// Class with the places for the student's gender and the furniture, the house rules and documents, and the questions.
/// `GET /registration-periods/{termId}`.
class RegistrationPeriodScreen extends StatefulWidget {
  const RegistrationPeriodScreen({super.key, required this.termId});

  final String termId;

  @override
  State<RegistrationPeriodScreen> createState() => _RegistrationPeriodScreenState();
}

class _RegistrationPeriodScreenState extends State<RegistrationPeriodScreen> {
  String _tab = 'timeline';

  @override
  Widget build(BuildContext context) {
    return Loader<Json>(
      fetch: () => Api.get('/registration-periods/${Uri.encodeComponent(widget.termId)}'),
      builder: (context, d, reload) => SubPage(
        title: d.text('name'),
        bottom: d.str('status') == 'Open'
            ? BusyButton(label: t('Apply now', 'Đăng ký ngay'), onPressed: () => push(context, const ApplyScreen()))
            : null,
        body: Cards(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    t('Stay ', 'Thời gian ở ') + range(d.str('stayStart'), d.str('stayEnd')),
                    style: const TextStyle(color: Tokens.fgSecondary),
                  ),
                ),
                Tag(
                  label(d.str('status')),
                  tone: switch (d.str('status')) {
                    'Open' => Tone.success,
                    'Opens soon' => Tone.info,
                    _ => Tone.neutral,
                  },
                ),
              ],
            ),
            Segments(
              value: _tab,
              onChanged: (v) => setState(() => _tab = v),
              items: [
                ('timeline', t('Timeline', 'Lịch')),
                ('prices', t('Prices', 'Giá')),
                ('rules', t('Rules', 'Nội quy')),
                ('faq', t('FAQ', 'Hỏi đáp')),
              ],
            ),
            ...switch (_tab) {
              'timeline' => _timeline(d),
              'prices' => _prices(d),
              'rules' => _rules(d),
              _ => _faq(d),
            },
          ],
        ),
      ),
    );
  }

  List<Widget> _timeline(Json d) {
    final closes = d.objects('timeline').where((m) => m.str('key') == 'registrationClosesAt').firstOrNull;
    final left = d.str('status') == 'Open' ? timeLeft(closes?.str('at')) : null;
    final rows = scheduleRows(d.objects('timeline'));
    return [
      Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [
            if (left != null)
              Text(
                t('Registration closes in $left.', 'Đăng ký đóng sau $left.'),
                style: const TextStyle(color: Tokens.fgBrand, fontWeight: FontWeight.w500),
              ),
            if (rows.isEmpty)
              Text(t('The dates of this Term are not published yet.', 'Lịch của kỳ này chưa được công bố.'))
            else
              Timeline(items: rows),
          ],
        ),
      ),
    ];
  }

  List<Widget> _prices(Json d) {
    final groups = <String, List<Json>>{};
    for (final p in d.objects('prices')) {
      groups.putIfAbsent(p.text('roomType'), () => []).add(p);
    }
    return [
      Note(
        t(
          'The price is per Bed for the whole Term. The Deposit is ${d.number('depositPercent')}% of it; the Utility Deposit (${money(d.number('utilityDeposit'))}) is added to the Balance and held until you check out.',
          'Giá tính theo giường cho cả kỳ. Tiền cọc là ${d.number('depositPercent')}% giá; cọc điện nước (${money(d.number('utilityDeposit'))}) được cộng vào tiền phòng và giữ tới khi trả phòng.',
        ),
      ),
      for (final MapEntry(key: type, value: lines) in groups.entries)
        Section(
          title: label(type),
          children: [
            for (final p in lines)
              Container(
                padding: const EdgeInsets.only(top: 8),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Tokens.line)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(label(p.str('roomClass')), style: const TextStyle(fontWeight: FontWeight.w500)),
                        ),
                        Text(money(p.number('price')), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                    Text(
                      '${t('Deposit ', 'Cọc ')}${money(p.number('deposit'))} · ${(p.number('places') ?? 0) > 0 ? t('${p.number('places')} places', '${p.number('places')} chỗ') : t('No places for you', 'Không còn chỗ cho bạn')}',
                      style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                    ),
                    if (p.objects('furniture').isNotEmpty)
                      Text(
                        countLines(p.objects('furniture')),
                        style: const TextStyle(fontSize: 13, color: Tokens.fgTertiary),
                      ),
                  ],
                ),
              ),
          ],
        ),
      Note(
        t(
          'Places are the Beds this Term offers to students of your gender. These prices stay the same for the whole Term.',
          'Số chỗ là số giường kỳ này dành cho sinh viên cùng giới tính với bạn. Giá giữ nguyên trong cả kỳ.',
        ),
      ),
    ];
  }

  List<Widget> _rules(Json d) {
    final docs = d.objects('documents');
    return [
      Panel(
        child: Text(
          d.str('houseRules') ??
              t('The house rules of this Term are not published yet.', 'Nội quy của kỳ này chưa được công bố.'),
          style: TextStyle(color: d.str('houseRules') == null ? Tokens.fgTertiary : Tokens.fg),
        ),
      ),
      if (docs.isNotEmpty)
        StatusList(
          children: [
            for (final doc in docs)
              StatusRow(
                icon: Icons.description_outlined,
                title: doc.text('title'),
                trailing: const Icon(Icons.open_in_new, size: 18, color: Tokens.link),
                onTap: () => openUrl(doc.text('url')),
              ),
          ],
        ),
    ];
  }

  List<Widget> _faq(Json d) {
    final faq = d.objects('faq');
    if (faq.isEmpty) {
      return [
        EmptyState(
          icon: Icons.help_outline,
          title: t('No questions yet. Ask the dormitory office.', 'Chưa có câu hỏi. Hãy hỏi văn phòng KTX.'),
        ),
      ];
    }
    return [
      Panel(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            for (final f in faq)
              ExpansionTile(
                shape: const Border(),
                title: Text(f.text('question'), style: const TextStyle(fontWeight: FontWeight.w500)),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(f.text('answer'), style: const TextStyle(color: Tokens.fgSecondary))],
              ),
          ],
        ),
      ),
    ];
  }
}
