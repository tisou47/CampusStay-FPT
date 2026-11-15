import 'package:flutter/material.dart';

import 'common.dart';
import 'files.dart';
import 'screens/account.dart';
import 'screens/applications.dart';
import 'screens/apply.dart';
import 'screens/family_day.dart';
import 'screens/notifications.dart';
import 'screens/payments.dart';
import 'screens/registration.dart';
import 'screens/requests.dart';

/// Opens a tab of the shell (0 Home, 1 My Room, 2 Payments, 3 Activity with its segment); set by the shell.
void Function(int tab, [String? segment])? openTab;

/// Opens the screen a web link of the API points to (a notification's or announcement's `link`, e.g.
/// `/student/invoices/INV-SP27-000123/pay`); a web address opens in the browser. Resolves when that screen is closed.
Future<void> openLink(BuildContext context, String? link) async {
  if (link == null || link.isEmpty) return;
  if (link.startsWith('http://') || link.startsWith('https://')) return openUrl(link);
  final uri = Uri.tryParse(link);
  if (uri == null) return;
  final parts = uri.pathSegments.where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty || parts.first != 'student') return;
  final p = parts.skip(1).toList();
  String at(int i) => i < p.length ? Uri.decodeComponent(p[i]) : '';

  void tab(int index, [String? segment]) {
    Navigator.of(context).popUntil((route) => route.isFirst);
    openTab?.call(index, segment);
  }

  final Widget? page = switch (at(0)) {
    '' => null,
    'applications' when p.length > 1 => ApplicationScreen(id: at(1)),
    'apply' => const ApplyScreen(),
    'roommate-invitation' => const RoommateInvitationScreen(),
    'round-2-offer' => const Round2OfferScreen(),
    'invoices' when p.length > 2 && at(2) == 'pay' => InvoiceScreen(id: at(1)),
    'invoices' when p.length > 1 => InvoiceDetailScreen(id: at(1)),
    'requests' when at(1) == 'maintenance' && at(2) == 'new' => const NewMaintenanceScreen(),
    'requests' when at(1) == 'room-change' => const NewRoomChangeScreen(),
    'requests' when at(1) == 'room-class' => const NewRoomClassChangeScreen(),
    'requests' when at(1) == 'swap' && at(2) == 'invitations' && p.length > 3 => SwapInvitationScreen(id: at(3)),
    'requests' when at(1) == 'swap' => SwapScreen(board: at(2) == 'board'),
    'family-days' when p.length > 1 => FamilyDayScreen(id: at(1)),
    'family-days' => const FamilyDaysScreen(),
    'notifications' => const NotificationsScreen(),
    'verification' => const VerificationScreen(),
    'registration-periods' when p.length > 1 => RegistrationPeriodScreen(termId: at(1)),
    _ => null,
  };
  if (page != null) {
    await push(context, page);
    return;
  }
  switch (at(0)) {
    case '':
      tab(0);
    case 'room':
      tab(1);
    case 'invoices':
      tab(2);
    case 'applications':
      tab(3, 'applications');
    case 'requests':
      tab(3, 'requests');
  }
}
