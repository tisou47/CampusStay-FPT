import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';
import '../files.dart';
import 'apply.dart';

/// Registration period details (web SCR-HOME-05 `RegistrationPeriod`, spec §6.5, R-09, R-14), in four tabs like the
/// web's: the schedule (numbered steps with a date track and today), the prices explorer (Room Type › Room Class › fee
/// breakdown and furniture, with the places for the student's gender), the house rules with the key money rules and
/// the documents, and the questions. `GET /registration-periods/{termId}`.
class RegistrationPeriodScreen extends StatefulWidget {
  const RegistrationPeriodScreen({super.key, required this.termId});

  final String termId;

  @override
  State<RegistrationPeriodScreen> createState() => _RegistrationPeriodScreenState();
}

class _RegistrationPeriodScreenState extends State<RegistrationPeriodScreen> {
  String _tab = 'timeline';
  String? _type;
  String? _tier;
  int _faq = 0;
  bool _opened = false;

  static Map<String, List<Json>> _groups(Json d) {
    final groups = <String, List<Json>>{};
    for (final p in d.objects('prices')) {
      groups.putIfAbsent(p.text('roomType'), () => []).add(p);
    }
    return groups;
  }

  static String _tierKey(Json p) => '${p.str('roomTypeId')}:${p.str('roomClassId')}';

  @override
  Widget build(BuildContext context) {
    return Loader<Json>(
      fetch: () => Api.get('/registration-periods/${Uri.encodeComponent(widget.termId)}'),
      builder: (context, d, reload) {
        final groups = _groups(d);
        // The first Room Type and its first tier start open, as on the web.
        if (!_opened && groups.isNotEmpty) {
          _opened = true;
          _type = groups.keys.first;
          _tier = _tierKey(groups.values.first.first);
        }
        final closes = d.objects('timeline').where((m) => m.str('key') == 'registrationClosesAt').firstOrNull;
        final left = d.str('status') == 'Open' ? timeLeft(closes?.str('at')) : null;
        final faq = d.objects('faq');
        return SubPage(
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
                      t(
                        'Stay ${day(d.str('stayStart'))} – ${day(d.str('stayEnd'))}',
                        'Ở từ ${day(d.str('stayStart'))} đến ${day(d.str('stayEnd'))}',
                      ),
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
              if (left != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Tokens.brandSubtle,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Tokens.primary.withValues(alpha: 0.25)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 6,
                      children: [
                        const Icon(Icons.event_available_outlined, size: 15, color: Tokens.fgBrand),
                        Flexible(
                          child: Text(
                            t('Registration closes in $left.', 'Đăng ký đóng sau $left.'),
                            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Tokens.fgBrand),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              TabStrip(
                value: _tab,
                onChanged: (v) => setState(() => _tab = v),
                items: [
                  (
                    key: 'timeline',
                    text: t('Timeline', 'Lịch trình'),
                    icon: Icons.event_note_outlined,
                    count: null,
                    dot: false,
                  ),
                  (
                    key: 'prices',
                    text: t('Prices', 'Giá'),
                    icon: Icons.bed_outlined,
                    count: groups.isEmpty ? null : groups.length,
                    dot: false,
                  ),
                  (
                    key: 'rules',
                    text: t('House rules', 'Nội quy'),
                    icon: Icons.verified_user_outlined,
                    count: null,
                    dot: false,
                  ),
                  (
                    key: 'faq',
                    text: t('FAQ', 'Hỏi đáp'),
                    icon: Icons.help_outline,
                    count: faq.isEmpty ? null : faq.length,
                    dot: false,
                  ),
                ],
              ),
              Panel(
                child: switch (_tab) {
                  'prices' => _prices(d, groups),
                  'rules' => _rules(d),
                  'faq' => _questions(faq),
                  _ =>
                    termSteps(d.objects('timeline')).isEmpty
                        ? Text(
                            t(
                              'The dates of this Term are not published yet.',
                              'Lịch của học kỳ này chưa được công bố.',
                            ),
                            style: const TextStyle(color: Tokens.fgTertiary),
                          )
                        : RegistrationSteps(timeline: d.objects('timeline')),
                },
              ),
            ],
          ),
        );
      },
    );
  }

  /// The prices explorer (web `PricesExplorer`): a Room Type opens its Room Classes; a Class opens its fee breakdown
  /// and furniture.
  Widget _prices(Json d, Map<String, List<Json>> groups) {
    if (groups.isEmpty) {
      return Text(
        t('The prices of this Term are not published yet.', 'Giá của học kỳ này chưa được công bố.'),
        style: const TextStyle(color: Tokens.fgTertiary),
      );
    }
    final percent = d.number('depositPercent');
    String places(num? n) => (n ?? 0) > 0 ? t('$n places', '$n chỗ') : t('No places for you', 'Không có chỗ cho bạn');

    Widget feeLine(String name, String value, {Color? color, bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(name, style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
          ),
          Text(
            value,
            style: TextStyle(fontSize: 13, fontWeight: strong ? FontWeight.w600 : FontWeight.w500, color: color),
          ),
        ],
      ),
    );

    Widget caption(IconData icon, String text) => Row(
      spacing: 6,
      children: [
        Icon(icon, size: 14, color: Tokens.fgBrand),
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
              color: Tokens.fgTertiary,
            ),
          ),
        ),
      ],
    );

    Widget tier(Json p) {
      final open = _tier == _tierKey(p);
      final n = p.number('places') ?? 0;
      final furniture = p.objects('furniture');
      return Column(
        children: [
          InkWell(
            onTap: () => setState(() => _tier = open ? null : _tierKey(p)),
            child: Container(
              color: open ? Tokens.subtle.withValues(alpha: 0.6) : null,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Row(
                spacing: 10,
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: open ? Tokens.brandSubtle : Tokens.subtle,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      Icons.auto_awesome_outlined,
                      size: 16,
                      color: open ? Tokens.fgBrand : Tokens.fgSecondary,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 3,
                      children: [
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(label(p.str('roomClass')), style: const TextStyle(fontWeight: FontWeight.w600)),
                            Tag(places(n), tone: n > 0 ? Tone.success : Tone.neutral, dot: false),
                          ],
                        ),
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: money(p.number('price')),
                                style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fg),
                              ),
                              TextSpan(
                                text:
                                    ' · ${t('Deposit ${money(p.number('deposit'))}', 'Cọc ${money(p.number('deposit'))}')}',
                              ),
                            ],
                          ),
                          style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        open ? t('Hide details', 'Thu gọn') : t('View details', 'Xem chi tiết'),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: open ? Tokens.fgBrand : Tokens.link,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (open)
            Container(
              width: double.infinity,
              color: Tokens.subtle.withValues(alpha: 0.4),
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              child: Column(
                spacing: 10,
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                    decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        caption(Icons.payments_outlined, t('Fee breakdown', 'Chi tiết biểu phí')),
                        feeLine(
                          t('Full Term Bed price', 'Giá giường trọn học kỳ'),
                          money(p.number('price')),
                          strong: true,
                        ),
                        const Divider(height: 1),
                        feeLine(
                          t('Deposit ($percent%)', 'Tiền đặt cọc ($percent%)'),
                          money(p.number('deposit')),
                          color: Tokens.fgBrand,
                        ),
                        const Divider(height: 1),
                        feeLine(
                          t('Remaining balance', 'Tiền phòng còn lại'),
                          money(((p.number('price') ?? 0) - (p.number('deposit') ?? 0)).clamp(0, double.infinity)),
                        ),
                        const Divider(height: 1),
                        feeLine(
                          t('Utility Deposit (refundable)', 'Cọc điện nước (hoàn lại khi trả phòng)'),
                          money(d.number('utilityDeposit')),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Tokens.surface, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 8,
                      children: [
                        caption(
                          Icons.inventory_2_outlined,
                          t('Included furniture & amenities', 'Nội thất & tiện nghi trang bị'),
                        ),
                        if (furniture.isNotEmpty)
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final f in furniture)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: Tokens.brandSubtle,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    spacing: 5,
                                    children: [
                                      const Icon(Icons.inventory_2_outlined, size: 13, color: Tokens.fgBrand),
                                      Text(
                                        (f.number('quantity') ?? 1) > 1
                                            ? '${f.number('quantity')} × ${furnitureName(f)}'
                                            : furnitureName(f),
                                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        Text(
                          t(
                            'Standard dormitory bed, desk, wardrobe and shared room fixtures.',
                            'Trang bị tiêu chuẩn gồm giường, bàn học, tủ quần áo và thiết bị chung của phòng.',
                          ),
                          style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 8,
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Tokens.fgBrand),
                  Expanded(
                    child: Text(
                      t(
                        'Select a Room Type to view its Room tiers, then a tier to see its furniture and fee breakdown.',
                        'Bấm chọn loại phòng để xem các hạng phòng, sau đó bấm vào hạng phòng để xem nội thất và biểu phí.',
                      ),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
              Text(
                '${t('Deposit ($percent%)', 'Tiền đặt cọc ($percent%)')} · '
                '${t('Utility Deposit (refundable)', 'Cọc điện nước (hoàn lại khi trả phòng)')}: ${money(d.number('utilityDeposit'))}',
                style: const TextStyle(fontSize: 12, color: Tokens.fgTertiary),
              ),
            ],
          ),
        ),
        for (final MapEntry(key: type, value: lines) in groups.entries)
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Tokens.line),
            ),
            child: Column(
              children: [
                Material(
                  color: _type == type ? Tokens.brandSubtle : Tokens.subtle.withValues(alpha: 0.3),
                  child: InkWell(
                    onTap: () => setState(() {
                      if (_type == type) {
                        _type = null;
                      } else {
                        _type = type;
                        _tier = _tierKey(lines.first);
                      }
                    }),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        spacing: 10,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: _type == type ? Tokens.primary : Tokens.surface,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              Icons.bed_outlined,
                              size: 20,
                              color: _type == type ? Colors.white : Tokens.fgBrand,
                            ),
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 2,
                              children: [
                                Text(label(type), style: const TextStyle(fontWeight: FontWeight.w600)),
                                Text(
                                  '${t('${lines.length} tiers', '${lines.length} hạng phòng')} · '
                                  '${places(lines.fold<num>(0, (s, l) => s + (l.number('places') ?? 0)))}',
                                  style: const TextStyle(fontSize: 12, color: Tokens.fgSecondary),
                                ),
                                Text(
                                  '${t('From', 'Từ')} ${money(lines.map((l) => l.number('price') ?? 0).reduce((a, b) => a < b ? a : b))} '
                                  '${t('per Bed · Term', 'mỗi giường · kỳ')}',
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                    color: Tokens.fgBrand,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            _type == type ? Icons.expand_less : Icons.expand_more,
                            color: _type == type ? Tokens.fgBrand : Tokens.fgSecondary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (_type == type)
                  for (var i = 0; i < lines.length; i++) ...[const Divider(height: 1), tier(lines[i])],
              ],
            ),
          ),
        Note(
          t(
            'Places are the Beds this Term offers to students of your gender. These prices stay the same for the whole Term.',
            'Số chỗ là số giường học kỳ này dành cho sinh viên cùng giới tính với bạn. Giá giữ nguyên trong suốt học kỳ.',
          ),
        ),
      ],
    );
  }

  /// House rules (web `RulesAndDocumentsTab`): one numbered line per rule, the key money rules, and the documents.
  Widget _rules(Json d) {
    final lines = (d.str('houseRules') ?? '').split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).map((l) {
      final cleaned = l.replaceFirst(RegExp(r'^[•\-*\d.)\s]+'), '').trim();
      return cleaned.isEmpty ? l : cleaned;
    }).toList();
    final docs = d.objects('documents');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Row(
          spacing: 8,
          children: [
            const Icon(Icons.verified_user_outlined, size: 18, color: Tokens.fgBrand),
            Expanded(
              child: Text(
                t('Dormitory house rules', 'Nội quy lưu trú ký túc xá'),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
        if (lines.isEmpty)
          Text(
            t('The house rules of this Term are not published yet.', 'Nội quy của học kỳ này chưa được công bố.'),
            style: const TextStyle(color: Tokens.fgTertiary),
          )
        else
          for (var i = 0; i < lines.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Tokens.subtle.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(color: Tokens.brandSubtle, shape: BoxShape.circle),
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Tokens.fgBrand),
                    ),
                  ),
                  Expanded(child: Text(lines[i], style: const TextStyle(fontSize: 13.5, height: 1.45))),
                ],
              ),
            ),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Tokens.brandSubtle, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 8,
            children: [
              Text(
                t('Key financial rules', 'Quy định tài chính cốt lõi'),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t('Deposit due on submit', 'Tiền đặt cọc khi nộp đơn'),
                      style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                    ),
                  ),
                  Text(
                    '${d.number('depositPercent') ?? '—'}%',
                    style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fgBrand),
                  ),
                ],
              ),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t('Utility Deposit before check-in', 'Cọc điện nước trước khi nhận phòng'),
                      style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary),
                    ),
                  ),
                  Text(money(d.number('utilityDeposit')), style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Tokens.subtle.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Text(
                t('Documents & attachments', 'Tài liệu & văn bản đính kèm'),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              if (docs.isEmpty)
                Text(
                  t('No documents attached for this Term.', 'Học kỳ này chưa có tài liệu đính kèm.'),
                  style: const TextStyle(fontSize: 12.5, color: Tokens.fgTertiary),
                )
              else
                for (final doc in docs)
                  Material(
                    color: Tokens.surface,
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => openUrl(doc.text('url')),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Row(
                          spacing: 8,
                          children: [
                            const Icon(Icons.description_outlined, size: 16, color: Tokens.fgBrand),
                            Expanded(
                              child: Text(
                                doc.text('title'),
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontWeight: FontWeight.w500, color: Tokens.link),
                              ),
                            ),
                            const Icon(Icons.open_in_new, size: 15, color: Tokens.link),
                          ],
                        ),
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }

  /// The questions (web `FaqAccordionTab`): one opens at a time, the first one open.
  Widget _questions(List<Json> faq) {
    if (faq.isEmpty) {
      return Text(
        t('No questions yet. Ask the dormitory office.', 'Chưa có câu hỏi. Hãy hỏi văn phòng ký túc xá.'),
        style: const TextStyle(color: Tokens.fgTertiary),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Text(
          t('Frequently asked questions', 'Câu hỏi thường gặp'),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        Text(
          t(
            'Tap a question to see the answer from the dormitory office.',
            'Bấm vào từng câu hỏi để xem giải đáp chi tiết từ văn phòng ký túc xá.',
          ),
          style: const TextStyle(fontSize: 12.5, color: Tokens.fgSecondary),
        ),
        for (var i = 0; i < faq.length; i++)
          Material(
            color: Tokens.subtle.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                InkWell(
                  onTap: () => setState(() => _faq = _faq == i ? -1 : i),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
                    child: Row(
                      spacing: 10,
                      children: [
                        const Icon(Icons.help_outline, size: 17, color: Tokens.fgBrand),
                        Expanded(
                          child: Text(faq[i].text('question'), style: const TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        Icon(
                          _faq == i ? Icons.expand_less : Icons.expand_more,
                          color: _faq == i ? Tokens.fgBrand : Tokens.fgSecondary,
                        ),
                      ],
                    ),
                  ),
                ),
                if (_faq == i) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(39, 10, 14, 12),
                    child: Text(
                      faq[i].text('answer'),
                      style: const TextStyle(fontSize: 13.5, height: 1.45, color: Tokens.fgSecondary),
                    ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/// One step of a Term's schedule: the timeline key, its name, its dates as text, and the campus days it spans.
typedef TermStep = ({String key, String label, String text, DateTime start, DateTime? end});

/// The campus day (UTC+7) an instant or date falls on, as its start.
DateTime? _campusDay(String? iso) {
  final at = DateTime.tryParse(iso ?? '');
  if (at == null) return null;
  final campus = at.isUtc || iso!.length > 10 ? at.toUtc().add(const Duration(hours: 7)) : at;
  return DateTime.utc(campus.year, campus.month, campus.day);
}

/// The `timeline` of `GET /registration-periods/{termId}` as steps (web `scheduleRows`): the registration opening and
/// closing become one window; a range of days ends at the end of its last day.
List<TermStep> termSteps(List<Json> timeline) {
  final opens = timeline.where((m) => m.str('key') == 'registrationOpensAt').firstOrNull;
  final closes = timeline.where((m) => m.str('key') == 'registrationClosesAt').firstOrNull;
  final rows = <TermStep>[];
  if (opens != null || closes != null) {
    final start = _campusDay((opens ?? closes)!.str('at'));
    if (start != null) {
      rows.add((
        key: 'registration',
        label: t('Registration', 'Đăng ký'),
        text: opens != null && closes != null
            ? '${day(opens.str('at'))} – ${moment(closes.str('at'))}'
            : moment((opens ?? closes)!.str('at')),
        start: start,
        end: closes != null ? _campusDay(closes.str('at')) : null,
      ));
    }
  }
  for (final m in timeline) {
    if (identical(m, opens) || identical(m, closes)) continue;
    final start = _campusDay(m.str('at') ?? m.str('date'));
    if (start == null) continue;
    final until = _campusDay(m.str('until'));
    rows.add((
      key: m.text('key'),
      label: label(m.text('label')),
      text: m.str('at') != null
          ? moment(m.str('at'))
          : (m.str('until') != null ? range(m.str('date'), m.str('until')) : day(m.str('date'))),
      start: start,
      end: until?.add(const Duration(days: 1)),
    ));
  }
  return rows;
}

/// The four steps from registration to check-in (web `HorizontalRegistrationStepper`): done ones ticked, the current
/// one ringed; tapping a step explains it in the banner under the line.
class RegistrationSteps extends StatefulWidget {
  const RegistrationSteps({super.key, required this.timeline});

  final List<Json> timeline;

  @override
  State<RegistrationSteps> createState() => _RegistrationStepsState();
}

class _RegistrationStepsState extends State<RegistrationSteps> {
  int? _picked;

  /// Short name, full title and what happens, per timeline key (web `STEP_META`).
  static (String, String, String)? _meta(String key) => switch (key) {
    'registration' => (
      t('Registration', 'Đăng ký'),
      t('Dormitory registration', 'Đăng ký chỗ ở ký túc xá'),
      t(
        'Choose your Room Type and Room tier, then pay the deposit to submit your Application.',
        'Chọn loại phòng, hạng phòng và đóng tiền đặt cọc để gửi đơn đăng ký.',
      ),
    ),
    'resultsPublishedAt' => (
      t('Results', 'Kết quả'),
      t('Assignment results published', 'Công bố kết quả xếp phòng'),
      t(
        'The dormitory office reviews applications and publishes Room and Bed assignments.',
        'Văn phòng ký túc xá xét duyệt đơn và công bố kết quả xếp phòng, giường.',
      ),
    ),
    'balanceDueAt' => (
      t('Payment', 'Thanh toán'),
      t('Balance due', 'Hạn tiền phòng còn lại'),
      t(
        'Pay the remaining room fee and Utility Deposit to confirm your assigned Bed.',
        'Hoàn tất thanh toán tiền phòng còn lại và cọc điện nước để giữ giường đã xếp.',
      ),
    ),
    'checkIn' || 'checkInStart' => (
      t('Check-in', 'Nhận phòng'),
      t('Check-in', 'Nhận phòng'),
      t(
        'Receive your door code and check in at your Block reception desk.',
        'Nhận mã cửa trên hệ thống và làm thủ tục nhận phòng tại quầy lễ tân tòa nhà.',
      ),
    ),
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    final all = termSteps(widget.timeline);
    final core = all.where((r) => r.key != 'termStarts').take(4).toList();
    final steps = core.isNotEmpty ? core : all.take(4).toList();
    if (steps.isEmpty) return const SizedBox.shrink();
    final now = DateTime.now();
    final current = steps.indexWhere((r) => (r.end ?? r.start).isAfter(now));
    final active = current == -1 ? steps.length - 1 : current;
    final picked = _picked ?? active;
    String state(int i) =>
        i == current ? 'current' : (!(steps[i].end ?? steps[i].start).isAfter(now) ? 'done' : 'upcoming');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 14,
      children: [
        // The steps on a line: done ones ticked, the current one ringed; tapping one explains it below.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < steps.length; i++)
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => setState(() => _picked = i),
                  child: Column(
                    spacing: 6,
                    children: [
                      SizedBox(
                        height: 36,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Container(
                                    height: 2,
                                    color: i == 0
                                        ? Colors.transparent
                                        : (i <= active || current == -1 ? Tokens.primary : Tokens.line),
                                  ),
                                ),
                                Expanded(
                                  child: Container(
                                    height: 2,
                                    color: i == steps.length - 1
                                        ? Colors.transparent
                                        : (i < active || current == -1 ? Tokens.primary : Tokens.line),
                                  ),
                                ),
                              ],
                            ),
                            Container(
                              width: 36,
                              height: 36,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: switch (state(i)) {
                                  'done' => Tokens.primary,
                                  'current' => Tokens.brandSubtle,
                                  _ => Tokens.surface,
                                },
                                border: Border.all(
                                  color: state(i) == 'upcoming' ? Tokens.lineStrong : Tokens.primary,
                                  width: 2,
                                ),
                                boxShadow: i == picked
                                    ? [BoxShadow(color: Tokens.primary.withValues(alpha: 0.18), spreadRadius: 4)]
                                    : null,
                              ),
                              child: switch (state(i)) {
                                'done' => const Icon(Icons.check, size: 18, color: Colors.white),
                                'current' => Container(
                                  width: 10,
                                  height: 10,
                                  decoration: const BoxDecoration(color: Tokens.primary, shape: BoxShape.circle),
                                ),
                                _ => Text(
                                  '${i + 1}',
                                  style: const TextStyle(fontWeight: FontWeight.w600, color: Tokens.fgTertiary),
                                ),
                              },
                            ),
                          ],
                        ),
                      ),
                      Text(
                        t('Step ${i + 1}', 'Bước ${i + 1}').toUpperCase(),
                        style: const TextStyle(fontSize: 10.5, letterSpacing: 0.4, color: Tokens.fgTertiary),
                      ),
                      Text(
                        _meta(steps[i].key)?.$1 ?? steps[i].label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: state(i) == 'current'
                              ? Tokens.fgBrand
                              : (state(i) == 'upcoming' && i != picked ? Tokens.fgSecondary : Tokens.fg),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: state(picked) == 'current' ? Tokens.brandSubtle : Tokens.subtle.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 6,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  switch (state(picked)) {
                    'current' => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: Tokens.primary, borderRadius: BorderRadius.circular(999)),
                      child: Text(
                        t('In progress', 'Đang diễn ra'),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
                      ),
                    ),
                    'done' => Tag(t('Completed', 'Đã hoàn thành'), tone: Tone.success, dot: false),
                    _ => Tag(t('Upcoming', 'Sắp tới'), dot: false),
                  },
                  Text(
                    '${t('Step ${picked + 1}', 'Bước ${picked + 1}')}: ${_meta(steps[picked].key)?.$2 ?? steps[picked].label}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              Row(
                spacing: 6,
                children: [
                  const Icon(Icons.event_outlined, size: 15, color: Tokens.fgBrand),
                  Expanded(
                    child: Text(
                      steps[picked].text,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Tokens.fgBrand),
                    ),
                  ),
                ],
              ),
              if (_meta(steps[picked].key) != null)
                Text(_meta(steps[picked].key)!.$3, style: const TextStyle(fontSize: 13, color: Tokens.fgSecondary)),
            ],
          ),
        ),
      ],
    );
  }
}
