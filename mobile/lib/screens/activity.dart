import 'package:flutter/material.dart';

import '../common.dart';
import 'applications.dart';
import 'payments.dart';
import 'requests.dart';

// The pages Home's feature tiles open: each list of the app on a page of its own with the top bar's back arrow.

/// My applications (web SCR-APP-02).
class ApplicationsPage extends StatelessWidget {
  const ApplicationsPage({super.key});

  @override
  Widget build(BuildContext context) =>
      SubPage(title: t('Applications', 'Đơn đăng ký'), body: const ApplicationsList());
}

/// Maintenance and room-change requests (web SCR-MNT-01).
class RequestsPage extends StatelessWidget {
  const RequestsPage({super.key, this.kind = 'maintenance'});

  /// `maintenance` or `room-changes`.
  final String kind;

  @override
  Widget build(BuildContext context) => SubPage(
    title: t('Requests', 'Yêu cầu'),
    body: RequestsList(initial: kind),
  );
}

/// Payments: Invoices, refunds (web SCR-BIL-01).
class PaymentsPage extends StatelessWidget {
  const PaymentsPage({super.key});

  @override
  Widget build(BuildContext context) => SubPage(title: t('Payments', 'Thanh toán'), body: const PaymentsScreen());
}
