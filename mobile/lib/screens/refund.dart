import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';

/// The bank account a student's refunds are paid to (A-62, R-22): asked when they withdraw from the waitlist, decline a
/// Round-2 offer or cancel an Application with a paid Invoice, and shown on Payments.
/// `GET/PUT /students/me/refund-account` `{ holder, number, bankCode, accepted }` → `{ holder, number, bank, bankCode,
/// acceptedAt, updatedAt }`; the bank is chosen from `GET /banks` (`[{ bin, shortName, name }]`).
class RefundAccount extends ChangeNotifier {
  final holder = TextEditingController();
  final number = TextEditingController();
  String bankCode = '';
  bool accepted = false;
  Json? saved;
  List<Json> banks = const [];
  Map<String, String> errors = const {};
  String? error;
  bool saving = false;
  bool loaded = false;

  /// Loads the saved account and the banks; errors leave the fields empty.
  Future<void> load() async {
    try {
      final results = await Future.wait([Api.get('/students/me/refund-account'), Api.get('/banks')]);
      saved = results[0];
      banks = results[1].objects('items');
      holder.text = saved?.text('holder') ?? '';
      number.text = saved?.text('number') ?? '';
      bankCode = saved?.text('bankCode') ?? '';
    } on ApiException catch (e) {
      error = e.message;
    }
    loaded = true;
    notifyListeners();
  }

  bool get has => saved?.str('number') != null;

  /// Chosen from the list and accepted: nothing to save when it did not change.
  bool get complete =>
      saved?.str('number') != null && saved?.str('bankCode') != null && saved?.str('acceptedAt') != null;

  bool get unchanged =>
      complete &&
      holder.text == saved!.text('holder') &&
      number.text == saved!.text('number') &&
      bankCode == saved!.text('bankCode');

  /// Whether the dialog's button can go: the account is saved and unchanged, or the student accepted the new one.
  bool get ready => unchanged || accepted;

  void changed() => notifyListeners();

  /// Saves the draft (nothing when unchanged); true when it is saved.
  Future<bool> save() async {
    if (unchanged) return true;
    saving = true;
    error = null;
    errors = const {};
    notifyListeners();
    try {
      saved = await Api.put('/students/me/refund-account', {
        'holder': holder.text.trim(),
        'number': number.text.trim(),
        'bankCode': bankCode,
        'accepted': accepted,
      });
      accepted = false;
      return true;
    } on ApiException catch (e) {
      errors = e.fields;
      error = e.fields.isEmpty ? e.message : null;
      return false;
    } finally {
      saving = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    holder.dispose();
    number.dispose();
    super.dispose();
  }
}

/// The three fields and the commitment (web `RefundAccountFields`).
class RefundAccountFields extends StatelessWidget {
  const RefundAccountFields({super.key, required this.account});

  final RefundAccount account;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: account,
      builder: (context, _) {
        if (!account.loaded) return const Center(child: CircularProgressIndicator());
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [
            Text(
              t('Bank account for the refund', 'Tài khoản nhận hoàn tiền'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (account.error != null) Note(account.error!, error: true),
            Input(
              controller: account.holder,
              label: t('Account holder', 'Chủ tài khoản'),
              helper: t('As the bank shows it', 'Đúng như ngân hàng hiển thị'),
              error: account.errors['holder'],
              capitalize: true,
              onChanged: (_) => account.changed(),
            ),
            Input(
              controller: account.number,
              label: t('Account number', 'Số tài khoản'),
              keyboard: TextInputType.number,
              error: account.errors['number'],
              onChanged: (_) => account.changed(),
            ),
            Choice<String>(
              name: t('Bank', 'Ngân hàng'),
              values: [for (final b in account.banks) b.text('bin')],
              text: (bin) {
                final b = account.banks.firstWhere((x) => x.text('bin') == bin);
                return '${b.text('shortName')} · ${b.text('name')}';
              },
              value: account.bankCode.isEmpty ? null : account.bankCode,
              error: account.errors['bankCode'],
              onChanged: (v) {
                account.bankCode = v ?? '';
                account.changed();
              },
            ),
            if (!account.unchanged) ...[
              Check(
                value: account.accepted,
                label: t(
                  'I checked the holder, number and bank. A refund sent to a wrong account is my responsibility and cannot be taken back.',
                  'Tôi đã kiểm tra chủ tài khoản, số tài khoản và ngân hàng. Khoản hoàn tiền chuyển nhầm do thông tin sai là trách nhiệm của tôi và không thể lấy lại.',
                ),
                onChanged: (v) {
                  account.accepted = v;
                  account.changed();
                },
              ),
              if (account.errors['accepted'] != null) Note(account.errors['accepted']!, error: true),
            ],
          ],
        );
      },
    );
  }
}

/// Asks [title] with the refund account under [body]; when the student confirms, saves the account (when
/// [needsAccount]) and runs [action]. Resolves true when the action went through.
Future<bool> confirmWithRefundAccount(
  BuildContext context, {
  required String title,
  required String body,
  required String yes,
  required String no,
  required bool needsAccount,
  required Future<void> Function() action,
  Widget? extra,
}) async {
  final account = RefundAccount();
  if (needsAccount) account.load();
  var busy = false;
  final done = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: ListenableBuilder(
          listenable: account,
          builder: (context, _) => SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 12,
              children: [
                Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                Text(body, style: const TextStyle(color: Tokens.fgSecondary)),
                ?extra,
                if (needsAccount) RefundAccountFields(account: account),
                BusyButton(
                  label: yes,
                  danger: true,
                  busy: busy || account.saving,
                  onPressed: needsAccount && (!account.loaded || !account.ready)
                      ? null
                      : () async {
                          setState(() => busy = true);
                          if (needsAccount && !await account.save()) {
                            setState(() => busy = false);
                            return;
                          }
                          try {
                            await action();
                            if (context.mounted) Navigator.pop(context, true);
                          } on ApiException catch (e) {
                            toast(e.message, error: true);
                            setState(() => busy = false);
                          }
                        },
                ),
                BusyButton(label: no, outlined: true, onPressed: () => Navigator.pop(context, false)),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  account.dispose();
  return done == true;
}

/// The Payments card: the account refunds go to, editable at any time (web `RefundAccountCard`).
class RefundAccountCard extends StatefulWidget {
  const RefundAccountCard({super.key});

  @override
  State<RefundAccountCard> createState() => _RefundAccountCardState();
}

class _RefundAccountCardState extends State<RefundAccountCard> {
  final _account = RefundAccount();
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _account.load();
  }

  @override
  void dispose() {
    _account.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _account,
      builder: (context, _) {
        final saved = _account.saved;
        if (saved == null) return const SizedBox.shrink();
        return Section(
          title: t('Refund account', 'Tài khoản hoàn tiền'),
          trailing: _editing
              ? null
              : SmallAction(
                  _account.has ? t('Change', 'Đổi') : t('Enter account', 'Nhập tài khoản'),
                  onPressed: () => setState(() => _editing = true),
                ),
          children: [
            Text(
              _account.has
                  ? joinDot([saved.str('holder'), saved.str('number'), saved.str('bank')])
                  : t(
                      'Not entered yet. A Manager can only transfer a refund to you once you enter it.',
                      'Chưa nhập. Quản lý chỉ chuyển được khoản hoàn tiền khi bạn đã nhập tài khoản.',
                    ),
              style: const TextStyle(color: Tokens.fgSecondary),
            ),
            if (_account.has && !_account.complete)
              Text(
                t(
                  'Choose your bank from the list again and confirm the account.',
                  'Hãy chọn lại ngân hàng trong danh sách và xác nhận tài khoản.',
                ),
                style: TextStyle(color: Tone.warning.fg),
              ),
            if (_editing) ...[
              RefundAccountFields(account: _account),
              Row(
                spacing: 8,
                children: [
                  Expanded(
                    child: BusyButton(
                      label: t('Cancel', 'Huỷ'),
                      outlined: true,
                      onPressed: () => setState(() => _editing = false),
                    ),
                  ),
                  Expanded(
                    child: BusyButton(
                      label: t('Save', 'Lưu'),
                      busy: _account.saving,
                      onPressed: _account.ready
                          ? () async {
                              if (await _account.save()) {
                                setState(() => _editing = false);
                                toast(t('Refund account saved.', 'Đã lưu tài khoản hoàn tiền.'));
                              }
                            }
                          : null,
                    ),
                  ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}
