import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';

/// Activity: the student's requests (maintenance and next-Term requests) and notifications with announcements.
class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  int _tab = 0;
  Key _requests = UniqueKey();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(children: [
        TabBar(
          onTap: (i) => setState(() => _tab = i),
          tabs: [Tab(text: t('Requests', 'Yêu cầu')), Tab(text: t('Notifications', 'Thông báo'))],
        ),
        Expanded(
          child: Stack(children: [
            Positioned.fill(child: _tab == 0 ? _Requests(key: _requests) : const _Notifications()),
            if (_tab == 0)
              Positioned(
                right: 16,
                bottom: 16,
                child: FloatingActionButton.extended(
                  onPressed: () async {
                    final sent = await Navigator.push<bool>(
                        context, MaterialPageRoute(builder: (_) => const NewMaintenanceScreen()));
                    if (sent == true) setState(() => _requests = UniqueKey());
                  },
                  label: Text(t('Report a problem', 'Báo hỏng')),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}

class _Requests extends StatelessWidget {
  const _Requests({super.key});

  static Future<(Json, Json)> _fetch() async {
    final results = await Future.wait([
      Api.get('/students/me/requests?kind=maintenance&pageSize=50'),
      Api.get('/students/me/requests?kind=room-changes&pageSize=50'),
    ]);
    return (results[0], results[1]);
  }

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Loader<(Json, Json)>(
      fetch: _fetch,
      builder: (context, data, reload) {
        final (maintenance, changes) = data;
        final items = [
          for (final r in maintenance.objects('items')) (r, true),
          for (final r in changes.objects('items')) (r, false),
        ];
        return Cards(bottom: 96, children: [
          if (items.isEmpty) Text(t('No request yet.', 'Chưa có yêu cầu nào.')),
          for (final (r, isMaintenance) in items)
            Section(
                title: isMaintenance ? r.text('title') : '${label(r.str('typeLabel'))} · ${r.text('summary')}',
                children: [
                  Row(children: [
                    Expanded(
                      child: Text('${r.text('id')} · ${moment(r.str(isMaintenance ? 'reportedAt' : 'submittedAt'))}',
                          style: muted),
                    ),
                    StatusChip(r.str('status')),
                  ]),
                  if (isMaintenance && r.str('visitWindow') != null)
                    Text(t('Visit: ', 'Lịch đến: ') + r.text('visitWindow')),
                  if (r.obj('decision')?.str('note') != null) Text(r.obj('decision')!.text('note')),
                ]),
        ]);
      },
    );
  }
}

class _Notifications extends StatelessWidget {
  const _Notifications();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Loader<Json>(
      fetch: () => Api.get('/notifications?limit=50'),
      builder: (context, d, reload) => Cards(children: [
        if ((d.number('unread') ?? 0) > 0)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () async {
                try {
                  await Api.post('/notifications/read-all');
                } on ApiException {
                  // the list below shows what is still unread
                }
                await reload();
              },
              child: Text(t('Mark all as read', 'Đánh dấu đã đọc tất cả')),
            ),
          ),
        for (final n in d.objects('items'))
          Section(title: (n.flag('read') ? '' : '● ') + n.text('title'), children: [
            Text(n.text('body')),
            Text(moment(n.str('createdAt')),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ]),
      ]),
    );
  }
}

/// Reporting a problem in the student's Room (`POST /maintenance-requests`, multipart): category, where, urgency,
/// optionally the furniture item (A-49); the API checks that the student lives in the Room. Pops `true` when sent.
class NewMaintenanceScreen extends StatelessWidget {
  const NewMaintenanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CampusStay')),
      body: Loader<Json>(
        fetch: () => Api.get('/maintenance-requests/options?for=student'),
        builder: (context, options, reload) => _MaintenanceForm(options: options),
      ),
    );
  }
}

class _MaintenanceForm extends StatefulWidget {
  const _MaintenanceForm({required this.options});

  final Json options;

  @override
  State<_MaintenanceForm> createState() => _MaintenanceFormState();
}

class _MaintenanceFormState extends State<_MaintenanceForm> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  String? _category;
  String? _location;
  bool _urgent = false;
  Json? _furniture;
  Map<String, String> _errors = const {};
  String? _message;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  static String _furnitureName(Json f) =>
      '${(isVietnamese() ? f.str('typeVi') : null) ?? f.text('type')} · ${f.text('assetCode')}';

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      final fields = {
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'category': _category ?? '',
        'location': _location ?? '',
        'urgency': _urgent ? 'Urgent' : 'Normal',
        'staffMayEnter': 'true',
        if (_furniture != null) 'furnitureItemId': _furniture!.text('id'),
      };
      await Api.multipart('/maintenance-requests', fields);
      if (mounted) Navigator.pop(context, true);
      return;
    } on ApiException catch (e) {
      _errors = e.fields;
      _message = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final furniture = widget.options.objects('furniture');
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(t('Report a problem', 'Báo hỏng'),
          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
      const SizedBox(height: 16),
      _Choice<String>(
        name: t('Category', 'Loại sự cố'),
        values: widget.options.strings('categories'),
        text: (v) => v,
        value: _category,
        error: _errors['category'],
        onChanged: (v) => setState(() => _category = v),
      ),
      _Choice<String>(
        name: t('Where in the Room', 'Vị trí trong phòng'),
        values: widget.options.strings('locations'),
        text: (v) => v,
        value: _location,
        error: _errors['location'],
        onChanged: (v) => setState(() => _location = v),
      ),
      if (furniture.isNotEmpty)
        _Choice<Json>(
          name: t('Furniture item (optional)', 'Đồ nội thất (không bắt buộc)'),
          values: furniture,
          text: _furnitureName,
          value: _furniture,
          error: _errors['furnitureItemId'],
          onChanged: (v) => setState(() => _furniture = v),
        ),
      TextField(
        controller: _title,
        decoration: InputDecoration(
            labelText: t('Title', 'Tiêu đề'), errorText: _errors['title'], border: const OutlineInputBorder()),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _description,
        minLines: 3,
        maxLines: 6,
        decoration: InputDecoration(
            labelText: t('Description', 'Mô tả'),
            errorText: _errors['description'],
            border: const OutlineInputBorder()),
      ),
      const SizedBox(height: 12),
      Wrap(spacing: 8, children: [
        ChoiceChip(label: Text(label('Normal')), selected: !_urgent, onSelected: (_) => setState(() => _urgent = false)),
        ChoiceChip(label: Text(label('Urgent')), selected: _urgent, onSelected: (_) => setState(() => _urgent = true)),
      ]),
      if (_message != null) Padding(padding: const EdgeInsets.only(top: 12), child: Note(_message!, error: true)),
      const SizedBox(height: 16),
      FilledButton(onPressed: _busy ? null : _send, child: Text(t('Send', 'Gửi'))),
    ]);
  }
}

/// A list to choose one value from.
class _Choice<V> extends StatelessWidget {
  const _Choice({
    required this.name,
    required this.values,
    required this.text,
    required this.value,
    required this.error,
    required this.onChanged,
  });

  final String name;
  final List<V> values;
  final String Function(V value) text;
  final V? value;
  final String? error;
  final ValueChanged<V?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<V>(
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: name, errorText: error, border: const OutlineInputBorder()),
        items: [for (final v in values) DropdownMenuItem(value: v, child: Text(text(v)))],
        onChanged: onChanged,
      ),
    );
  }
}
