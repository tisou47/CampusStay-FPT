import 'dart:convert';

import 'package:campusstay_student/api.dart';
import 'package:campusstay_student/common.dart';
import 'package:campusstay_student/links.dart';
import 'package:campusstay_student/screens/account.dart';
import 'package:campusstay_student/screens/activity.dart';
import 'package:campusstay_student/screens/notifications.dart';
import 'package:campusstay_student/screens/applications.dart';
import 'package:campusstay_student/screens/assistant.dart';
import 'package:campusstay_student/screens/checkout.dart';
import 'package:campusstay_student/screens/family_day.dart';
import 'package:campusstay_student/screens/apply.dart';
import 'package:campusstay_student/screens/handover.dart';
import 'package:campusstay_student/screens/home.dart';
import 'package:campusstay_student/screens/payments.dart';
import 'package:campusstay_student/screens/registration.dart';
import 'package:campusstay_student/screens/requests.dart';
import 'package:campusstay_student/screens/room.dart';
import 'package:campusstay_student/session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// Widget tests of the student screens against a fake API (fictional data only). The test machine's language is
// English, so the English texts are checked.

final _future = DateTime.now().toUtc().add(const Duration(days: 5)).toIso8601String();
final _past = DateTime.now().toUtc().subtract(const Duration(days: 5)).toIso8601String();

/// Answers by path; the requests are recorded in [calls].
final calls = <String>[];
Map<String, Object?> routes = {};

void useApi(Map<String, Object?> answers) {
  calls.clear();
  routes = answers;
  Api.client = MockClient((request) async {
    final path = request.url.path.replaceFirst(RegExp(r'^/api'), '');
    calls.add('${request.method} $path');
    final answer = routes['${request.method} $path'] ?? routes[path];
    if (answer == null) return http.Response(jsonEncode({'message': 'Not found'}), 404);
    return http.Response.bytes(utf8.encode(jsonEncode(answer)), 200, headers: {'content-type': 'application/json'});
  });
}

Future<void> show(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(1080, 4000);
  tester.view.devicePixelRatio = 2.6;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: campusTheme(),
      scaffoldMessengerKey: messenger,
      home: screen is SubPage || screen is RegistrationPeriodScreen || screen is ApplyScreen
          ? screen
          : Scaffold(body: screen),
    ),
  );
  await tester.pumpAndSettle();
}

const session = Session('token', 'Nguyễn Văn Demo', 'demo@fpt.edu.vn', 'SE000001', true, 'Verified');

void main() {
  group('helpers', () {
    test('the schedule joins the registration window and marks the current row', () {
      final now = DateTime.utc(2026, 11, 13);
      final rows = scheduleRows([
        {'key': 'registrationOpensAt', 'label': 'Registration opens', 'at': '2026-11-01T01:00:00Z'},
        {'key': 'registrationClosesAt', 'label': 'Registration closes', 'at': '2026-11-10T16:59:00Z'},
        {'key': 'resultsPublishedAt', 'label': 'Results published', 'at': '2026-11-20T03:00:00Z'},
        {'key': 'checkIn', 'label': 'Check-in', 'date': '2026-12-01', 'until': '2026-12-05'},
      ], now);
      expect(rows.map((r) => r.$1), ['Registration', 'Results published', 'Check-in']);
      expect(rows.map((r) => r.$3), ['done', 'current', 'upcoming']);
      expect(rows[2].$2, '1 Dec 2026 – 5 Dec 2026');
    });

    test('time left, due dates and furniture lines read like the web', () {
      final now = DateTime.utc(2026, 11, 13, 12);
      expect(timeLeft('2026-11-13T15:00:00Z', now), '3 hours');
      expect(timeLeft('2026-11-16T12:00:00Z', now), '3 days');
      expect(timeLeft('2026-11-12T12:00:00Z', now), isNull);
      expect(dueIn('2026-11-12T12:00:00Z', now), 'Overdue');
      expect(
        countLines([
          {'name': 'Bed', 'quantity': 2},
          {'name': 'Desk', 'quantity': 1},
        ]),
        '2 × Bed, Desk',
      );
      expect(surcharge(0.15), '+15%');
      expect(toneOf('Overdue'), Tone.error);
      expect(toneOf('Paid'), Tone.success);
    });
  });

  testWidgets('Home: a new student sees the next action, the board and the status rows', (tester) async {
    useApi({
      '/students/me/home': {
        'firstName': 'Demo',
        'term': {'id': 'SP27', 'name': 'Spring 2027', 'registrationOpen': true, 'registrationClosesAt': _future},
        'application': null,
        'allocation': null,
        'invoices': {'due': 0, 'total': 0},
        'openRequests': 0,
      },
      '/students/me/board': {
        'items': [
          {
            'id': 'ann-1',
            'category': 'Registration',
            'title': 'Spring registration opens',
            'body': 'Apply now.',
            'pinned': true,
            'read': false,
            'createdAt': _past,
          },
        ],
        'unread': 1,
      },
      '/registration-periods/current': {
        'card': {
          'termId': 'SP27',
          'name': 'Spring 2027',
          'status': 'Open',
          'countdownTo': _future,
          'stayStart': '2027-01-04',
          'stayEnd': '2027-05-01',
          'fromPrice': 3000000,
        },
      },
      '/registration-periods/SP27': {'timeline': <Object>[]},
      '/students/me/roommate-invitation': {'invitation': null},
      '/notifications': {'items': <Object>[], 'unread': 0},
    });
    await show(tester, HomeScreen(session: session, openTab: (_, [_]) {}));
    expect(find.text('Apply for a Bed for Spring 2027'), findsOneWidget);
    expect(find.text('Start application'), findsOneWidget);
    // The features as tiles: notifications, applications, registration period, board, requests, Family Days, payments.
    for (final tile in [
      'Notifications',
      'Applications',
      'Registration period',
      'Dormitory board',
      'Requests',
      'Family Days',
      'Payments',
    ]) {
      expect(find.text(tile), findsOneWidget, reason: tile);
    }
  });

  testWidgets('Home: a student with a Room has a Check-in tile that opens the inventory', (tester) async {
    useApi({
      '/students/me/home': {
        'firstName': 'Demo',
        'allocation': {'room': 'A902', 'bed': 'A', 'status': 'Resident'},
        'invoices': {'due': 0, 'total': 0},
        'openRequests': 0,
      },
      '/notifications': {'items': <Object>[], 'unread': 0},
      '/students/me/handover': {
        'id': 'H1',
        'status': 'Draft',
        'room': 'A902',
        'dueAt': '2026-12-31T10:00:00Z',
        'items': <Object>[],
        'meterPhotos': <Object>[],
      },
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
    });
    await show(tester, HomeScreen(session: session, openTab: (_, [_]) {}));
    expect(find.text('Check-in'), findsOneWidget);
    expect(find.textContaining('Due '), findsOneWidget);
    await tester.tap(find.text('Check-in'));
    await tester.pumpAndSettle();
    expect(find.text('Check-in inventory · Room A902'), findsOneWidget);
  });

  testWidgets('Payments: outstanding, the invoices and an Invoice opening its detail', (tester) async {
    useApi({
      '/students/me/invoices': {
        'items': [
          {
            'id': 'INV-1',
            'typeLabel': 'Deposit',
            'title': 'Deposit',
            'amount': 900000,
            'dueAt': _future,
            'status': 'Unpaid',
          },
        ],
        'summary': {
          'outstanding': 900000,
          'dueCount': 1,
          'nextDueAt': _future,
          'paidTotal': 0,
          'paidCount': 0,
          'awaitingCount': 1,
        },
      },
      '/students/me/refunds': {'items': <Object>[]},
      '/students/me/refund-account': {'holder': null, 'number': null},
      '/banks': [
        {
          'bin': '970415',
          'shortName': 'VietinBank',
          'name': 'Vietnam Joint Stock Commercial Bank for Industry and Trade',
        },
      ],
      '/invoices/INV-1': {
        'id': 'INV-1',
        'title': 'Deposit',
        'type': 'deposit',
        'amount': 900000,
        'status': 'Unpaid',
        'dueAt': _future,
        'lines': [
          {'label': 'Deposit', 'amount': 900000},
        ],
      },
    });
    await show(tester, const PaymentsScreen());
    expect(find.text('900,000 VND'), findsWidgets);
    expect(find.text('Transfers waiting for a Manager'), findsOneWidget);
    expect(find.text('Refund account'), findsOneWidget);
    expect(find.text('Invoices & fees (1)'), findsOneWidget);
    // The Refund items tab lists the refunds (none here).
    await tester.tap(find.text('Refund items (0)'));
    await tester.pumpAndSettle();
    expect(find.text('No refunds yet'), findsOneWidget);
    await tester.tap(find.text('Invoices & fees (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Deposit').last);
    await tester.pumpAndSettle();
    expect(find.text('Pay with VietQR'), findsOneWidget);
  });

  testWidgets('Invoice payment: the transfer content and "I have transferred"', (tester) async {
    useApi({
      '/invoices/INV-1/payment': {
        'invoice': {'id': 'INV-1', 'title': 'Deposit', 'amount': 900000, 'status': 'Unpaid', 'dueAt': _future},
        'qr': null,
        'bank': {'name': 'VietinBank', 'accountName': 'KTX DEMO', 'accountNumber': '0000000000'},
        'transferContent': 'CS INV1',
        'claim': null,
        'canClaim': true,
      },
      'POST /invoices/INV-1/claim': <String, Object>{},
    });
    await show(tester, const InvoiceScreen(id: 'INV-1'));
    expect(find.text('CS INV1'), findsOneWidget);
    expect(find.text('OR TRANSFER MANUALLY'), findsOneWidget);
    await tester.tap(find.text('I have transferred'));
    await tester.pumpAndSettle();
    // The student checks the amount and the transfer content before the claim is sent.
    expect(find.text('Confirm transfer submission'), findsOneWidget);
    expect(calls, isNot(contains('POST /invoices/INV-1/claim')), reason: 'asks first (MOB-25)');
    await tester.tap(find.text('Yes, I have transferred'));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /invoices/INV-1/claim'));
  });

  testWidgets('My Room: no Room offers to start an application', (tester) async {
    useApi({
      '/students/me/allocation': {
        'allocation': null,
        'application': null,
        'term': {'name': 'Spring 2027'},
      },
    });
    await show(tester, const RoomScreen());
    expect(find.text('No Room assigned yet'), findsOneWidget);
    expect(find.text('Start application'), findsOneWidget);
  });

  testWidgets('My Room: the Room, the door code, the next Term and its requests', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayStart': '2026-09-01', 'stayEnd': '2026-12-31'},
        'allocation': {
          'room': 'A101',
          'bed': '1',
          'block': 'Block A',
          'roomTypeName': '2-bed',
          'roomClassName': 'Standard',
          'status': 'Resident',
          'allocatedAt': _past,
        },
        'roommates': [
          {'name': 'Trần Thị Mẫu', 'bed': '2'},
        ],
        'roommateCapacity': 1,
        'stay': {'committedTerms': 2, 'termsUsed': 1, 'termsLeft': 1},
        'nextTerm': {
          'term': {'name': 'Spring 2027'},
          'state': 'Continuing',
          'room': 'A101',
          'bed': '1',
          'termPrice': 3000000,
          'termsLeft': 0,
          'window': {'closesAt': _future, 'filing': true, 'checkOutBy': '2026-12-31'},
        },
      },
      '/students/me/door-code': {'room': 'A101', 'status': 'Ready', 'changedAt': _past},
      'POST /students/me/door-code/reveal': {'code': '4821'},
      '/students/me/furniture': {
        'items': [
          {'assetCode': 'F-1', 'type': 'Bed', 'status': 'In use'},
        ],
      },
      '/students/me/late-check-in': {'request': null, 'canRequest': false},
    });
    await show(tester, const RoomScreen());
    // Room overview: the Room, its details and the roommates.
    expect(find.text('A101 · Bed 1'), findsWidgets);
    expect(find.text('Trần Thị Mẫu'), findsOneWidget);
    expect(find.text('1 × Bed'), findsOneWidget);
    // Furniture & equipment: one tile per type, its count, and the report button.
    await tester.tap(find.text('Furniture & equipment (1)'));
    await tester.pumpAndSettle();
    expect(find.text('× 1'), findsOneWidget);
    expect(find.text('Report broken equipment'), findsOneWidget);
    // Contract & utilities: the contract, the milestones, the next Term with its requests, and the door code.
    await tester.tap(find.text('Contract & utilities'));
    await tester.pumpAndSettle();
    expect(find.text('Dormitory stay contract'), findsOneWidget);
    expect(find.text('Stay milestones & activity'), findsOneWidget);
    expect(find.text('Extend my stay'), findsOneWidget);
    expect(find.text('Change Room next Term'), findsOneWidget);
    expect(find.text('Change the Room Class'), findsNothing);
    await tester.scrollUntilVisible(find.text('Show door code'), 300);
    await tester.tap(find.text('Show door code'));
    await tester.pumpAndSettle();
    expect(find.text('4821'), findsOneWidget);
  });

  testWidgets('Activity: applications, requests with their actions, and notifications', (tester) async {
    useApi({
      '/students/me/applications': {
        'items': [
          {
            'id': 'APP-1',
            'termName': 'Spring 2027',
            'roomTypeName': '2-bed',
            'roomClassName': 'Standard',
            'status': 'Awaiting Deposit',
          },
        ],
        'activeTermName': 'Spring 2027',
      },
      '/students/me/requests': {
        'items': [
          {
            'id': 'SW-1',
            'typeLabel': 'Swap',
            'summary': 'Swap with Room A-605 · Bed B',
            'status': 'Invited',
            'invitationId': 'SW-1',
          },
        ],
        'counts': {'maintenance': 0, 'roomChanges': 1},
      },
      '/notifications': {
        'items': [
          {
            'id': 'n1',
            'title': 'Deposit due',
            'body': 'Pay by Friday.',
            'createdAt': _past,
            'read': false,
            'link': '/student/invoices',
          },
        ],
        'unread': 1,
      },
    });
    await show(tester, const ApplicationsPage());
    expect(find.text('Spring 2027'), findsOneWidget);
    expect(find.textContaining('One Application per Term'), findsOneWidget);

    await show(tester, const RequestsPage());
    await tester.tap(find.text('Room changes (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Swap'), findsOneWidget);
    expect(find.text('Agree'), findsNothing);
    expect(find.text('New request'), findsOneWidget);
  });

  testWidgets('Notifications: a page grouped by day, with mark all as read', (tester) async {
    useApi({
      '/notifications': {
        'items': [
          {
            'id': 'n1',
            'title': 'Deposit due',
            'body': 'Pay by Friday.',
            'createdAt': _past,
            'read': false,
            'link': '/student/invoices',
          },
        ],
        'unread': 1,
      },
    });
    await show(tester, const NotificationsScreen());
    expect(find.text('Earlier'), findsOneWidget);
    expect(find.text('Deposit due'), findsOneWidget);
    expect(find.text('Mark all as read'), findsOneWidget);
  });

  testWidgets('Notifications: an announcement opens in a sheet and the page stays', (tester) async {
    useApi({
      '/notifications': {
        'items': [
          {
            'id': 'a1',
            'title': 'Room prices of Spring',
            'body': 'Prices are 5% higher.',
            'createdAt': _past,
            'read': false,
            'link': '/student',
            'kind': 'announcement',
          },
        ],
        'unread': 1,
      },
      'POST /notifications/a1/read': <String, Object>{},
      '/students/me/board': {
        'items': [
          {
            'id': 'a1',
            'category': 'Finance',
            'title': 'Room prices of Spring',
            'body': 'Prices are 5% higher.',
            'createdAt': _past,
            'read': true,
            'changes': [
              {'field': 'Price', 'type': 'MONEY', 'before': 9000000, 'after': 9450000},
            ],
          },
        ],
      },
    });
    await show(tester, const NotificationsScreen());
    await tester.tap(find.text('Room prices of Spring'));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /notifications/a1/read'));
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.textContaining('450', findRichText: true), findsOneWidget);
    // the notifications page is still under the sheet
    expect(find.text('Notifications'), findsOneWidget);
  });

  testWidgets('Application detail: an Application awaiting its deposit can be paid or cancelled', (tester) async {
    useApi({
      '/applications/APP-1': {
        'id': 'APP-1',
        'status': 'Awaiting Deposit',
        'termName': 'Spring 2027',
        'roomTypeName': '4-bed',
        'roomClassName': 'Standard',
        'twoBed': false,
        'stayTerms': 2,
        'events': [
          {'title': 'Submitted', 'at': _past, 'state': 'done'},
        ],
        'invoices': [
          {
            'id': 'INV-1',
            'type': 'deposit',
            'title': 'Deposit',
            'amount': 900000,
            'status': 'Unpaid',
            'dueAt': _future,
          },
        ],
        'canCancel': true,
      },
    });
    await show(tester, const ApplicationScreen(id: 'APP-1'));
    expect(find.text('Pay the deposit to send your Application'), findsOneWidget);
    expect(find.text('Pay deposit'), findsOneWidget);
    expect(find.text('2 Terms'), findsOneWidget);
    expect(find.text('Cancel application'), findsOneWidget);
  });

  testWidgets('Apply: the wizard goes from eligibility to the Room choice', (tester) async {
    useApi({
      '/applications/eligibility': {
        'term': {'id': 'SP27', 'name': 'Spring 2027', 'depositWindowHours': 48},
        'eligible': true,
        'maxStayTerms': 3,
        'checks': [
          {'title': 'Enrolled this Term', 'passed': true},
        ],
      },
      '/catalog': {
        'roomTypes': [
          {'id': 'T4', 'name': '4-bed', 'beds': 4},
        ],
        'roomClasses': [
          {'id': 'STD', 'name': 'Standard', 'surchargeRate': 0},
        ],
        'prices': [
          {'roomTypeId': 'T4', 'roomClassId': 'STD', 'termPrice': 3000000},
        ],
        'depositRate': 0.3,
        'utilityDeposit': 500000,
      },
      '/students/me/profile': {'name': 'Nguyễn Văn Demo', 'studentCode': 'SE000001'},
      '/registration-periods/SP27': {'timeline': <Object>[]},
    });
    await show(tester, const ApplyScreen());
    expect(find.text('Eligible'), findsOneWidget);
    expect(find.textContaining('Step 1 of 4'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Step 2 of 4'), findsOneWidget);
    final next = find.widgetWithText(FilledButton, 'Continue');
    expect(tester.widget<FilledButton>(next).onPressed, isNull);
    await tester.tap(find.text('4-bed'));
    await tester.tap(find.text('Standard  +0%'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(next).onPressed, isNotNull);
    expect(find.textContaining('deposit 900,000 VND', findRichText: true), findsOneWidget);
  });

  testWidgets('Swap invitation: an open invitation can be accepted', (tester) async {
    useApi({
      '/swap-invitations/SW-1': {
        'id': 'SW-1',
        'status': 'Invited',
        'expiresAt': _future,
        'termName': 'Spring 2027',
        'give': {'room': 'A101', 'bed': '1', 'roomTypeName': '2-bed', 'roomClassName': 'Standard', 'block': 'A'},
        'get': {'room': 'B202', 'bed': '2', 'roomTypeName': '2-bed', 'roomClassName': 'Standard', 'block': 'B'},
      },
      'POST /swap-invitations/SW-1/respond': <String, Object>{},
    });
    await show(tester, const SwapInvitationScreen(id: 'SW-1'));
    expect(find.text('B202 · Bed 2'), findsOneWidget);
    await tester.tap(find.text('Accept swap'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accept swap').last);
    await tester.pumpAndSettle();
    expect(calls, contains('POST /swap-invitations/SW-1/respond'));
  });

  testWidgets('Verification: the form is sent only when every field is filled', (tester) async {
    useApi({
      '/students/me/verification': {
        'status': 'Profile needed',
        'locked': false,
        'form': {
          'studentCode': 'SE000001',
          'name': 'Nguyễn Văn Demo',
          'gender': 'M',
          'dateOfBirth': '2006-01-02',
          'major': 'SE',
          'cohort': 'K20',
          'phone': '',
        },
        'options': {
          'genders': [
            {'value': 'M', 'label': 'Male'},
            {'value': 'F', 'label': 'Female'},
          ],
          'majors': [
            {'value': 'SE', 'label': 'Software Engineering'},
          ],
        },
      },
    });
    await show(tester, const VerificationScreen());
    expect(find.text('Your account was not found in the student list'), findsOneWidget);
    final send = find.widgetWithText(FilledButton, 'Send for verification');
    expect(tester.widget<FilledButton>(send).onPressed, isNull);
    await tester.enterText(find.widgetWithText(TextField, 'Phone'), '0900000000');
    await tester.pump();
    expect(tester.widget<FilledButton>(send).onPressed, isNotNull);
  });

  testWidgets('Links of notifications open their screens', (tester) async {
    useApi({
      '/invoices/INV-9/payment': {
        'invoice': {'id': 'INV-9', 'title': 'Balance', 'amount': 2100000, 'status': 'Paid', 'paidAt': _past},
        'transferContent': 'CS INV9',
        'canClaim': false,
      },
    });
    late BuildContext context;
    await show(
      tester,
      Builder(
        builder: (c) {
          context = c;
          return const SizedBox();
        },
      ),
    );
    var opened = -1;
    openTab = (tab, [_]) => opened = tab;
    openLink(context, '/student/invoices/INV-9/pay');
    await tester.pumpAndSettle();
    expect(find.text('Payment confirmed'), findsOneWidget);
    Navigator.of(context).pop();
    await tester.pumpAndSettle();
    await openLink(context, '/student/room');
    expect(opened, 1);
    openTab = null;
  });

  testWidgets('Registration period details: tabs for the timeline, prices, rules and FAQ', (tester) async {
    useApi({
      '/registration-periods/SP27': {
        'id': 'SP27',
        'name': 'Spring 2027',
        'status': 'Open',
        'stayStart': '2027-01-04',
        'stayEnd': '2027-05-01',
        'timeline': [
          {'key': 'resultsPublishedAt', 'label': 'Results published', 'at': _future},
        ],
        'prices': [
          {
            'roomTypeId': 'T4',
            'roomType': '4-bed',
            'roomClassId': 'STD',
            'roomClass': 'Standard',
            'price': 3000000,
            'deposit': 900000,
            'places': 12,
          },
        ],
        'depositPercent': 30,
        'utilityDeposit': 500000,
        'houseRules': 'Quiet hours from 23:00.',
        'faq': [
          {'question': 'Can I cook?', 'answer': 'In the shared kitchen.'},
        ],
      },
    });
    await show(tester, const RegistrationPeriodScreen(termId: 'SP27'));
    // The steps of the period; the only date here is the results.
    expect(find.text('Results'), findsOneWidget);
    expect(find.text('Apply now'), findsOneWidget);
    // Prices: the first Room Type and its first tier are open, with the fee breakdown.
    await tester.tap(find.text('Prices (1)'));
    await tester.pumpAndSettle();
    expect(find.text('3,000,000 VND'), findsWidgets);
    expect(find.text('Fee breakdown'.toUpperCase()), findsOneWidget);
    expect(find.text('2,100,000 VND'), findsOneWidget);
    await tester.tap(find.text('House rules'));
    await tester.pumpAndSettle();
    expect(find.text('Quiet hours from 23:00.'), findsOneWidget);
    expect(find.text('Key financial rules'), findsOneWidget);
    await tester.tap(find.text('FAQ (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Can I cook?'), findsOneWidget);
    expect(find.text('In the shared kitchen.'), findsOneWidget);
  });

  testWidgets('New maintenance request: category, title and description are required', (tester) async {
    useApi({
      '/maintenance-requests/options': {
        'categories': ['Electrical', 'Plumbing'],
        'locations': ['Bathroom'],
        'furniture': <Object>[],
      },
    });
    await show(tester, const NewMaintenanceScreen());
    await tester.tap(find.text('Submit request'));
    await tester.pumpAndSettle();
    expect(find.text('Choose a category.'), findsOneWidget);
    expect(find.text('Enter a short title.'), findsOneWidget);
    expect(calls.where((c) => c.startsWith('POST')), isEmpty);
  });

  testWidgets('Family Days: the list opens a Family Day where guests are registered for a slot', (tester) async {
    useApi({
      '/students/me/family-days': {
        'resident': true,
        'items': [
          {
            'id': 'FD-1',
            'block': 'A',
            'title': 'Family Day – Spring',
            'area': 'Lobby A',
            'status': 'Registration open',
            'startsAt': _future,
            'endsAt': _future,
            'registration': null,
          },
        ],
      },
      '/students/me/family-days/FD-1': {
        'id': 'FD-1',
        'block': 'A',
        'title': 'Family Day – Spring',
        'area': 'Lobby A',
        'status': 'Registration open',
        'startsAt': _future,
        'endsAt': _future,
        'registrationOpensAt': _past,
        'registrationClosesAt': _future,
        'maxGuests': 2,
        'adultAge': 18,
        'slots': [
          {'id': 'S1', 'startsAt': _future, 'endsAt': _future, 'remaining': 5},
          {'id': 'S2', 'startsAt': _future, 'endsAt': _future, 'remaining': 0},
        ],
        'canRegister': true,
        'registration': null,
      },
      'POST /students/me/family-days/FD-1/registration': <String, Object>{},
    });
    await show(tester, const FamilyDaysScreen());
    expect(find.text('Registration open'), findsOneWidget);
    await tester.tap(find.text('Family Day – Spring'));
    await tester.pumpAndSettle();
    expect(find.text('5 places left'), findsOneWidget);
    expect(find.text('Full'), findsOneWidget);
    final register = find.widgetWithText(FilledButton, 'Register guests');
    expect(tester.widget<FilledButton>(register).onPressed, isNull);
    await tester.tap(find.text('5 places left'));
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Nguyễn Văn Khách');
    await tester.enterText(find.widgetWithText(TextField, 'Year of birth'), '1970');
    await tester.pump();
    await tester.ensureVisible(register);
    await tester.tap(register);
    await tester.pumpAndSettle();
    expect(calls, contains('POST /students/me/family-days/FD-1/registration'));
  });

  testWidgets('Family Day: a registration shows each guest pass and can be cancelled', (tester) async {
    useApi({
      '/students/me/family-days/FD-1': {
        'id': 'FD-1',
        'block': 'A',
        'title': 'Family Day – Spring',
        'area': 'Lobby A',
        'status': 'Registration open',
        'startsAt': _future,
        'endsAt': _future,
        'slots': <Object>[],
        'canRegister': false,
        'registration': {
          'id': 'R1',
          'status': 'Approved',
          'slotStartsAt': _future,
          'slotEndsAt': _future,
          'canCancel': true,
          'guests': [
            {
              'id': 'G1',
              'fullName': 'Nguyễn Văn Khách',
              'relationship': 'Father',
              'birthYear': 1970,
              'status': 'Not arrived',
              'passToken': 'PASS-1',
            },
          ],
        },
      },
    });
    await show(tester, const FamilyDayScreen(id: 'FD-1'));
    expect(find.text('Nguyễn Văn Khách'), findsOneWidget);
    expect(find.text('Not arrived'), findsOneWidget);
    expect(find.text('Cancel registration'), findsOneWidget);
  });

  testWidgets('Assistant: a suggestion is sent and the reply shown', (tester) async {
    AssistantScreen.messages.clear();
    useApi({
      'POST /students/me/assistant/chat': {'reply': 'You have **one** Invoice to pay.'},
    });
    await show(tester, const AssistantScreen());
    await tester.tap(find.text('Which Invoices do I still have to pay?'));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /students/me/assistant/chat'));
    expect(find.textContaining('Invoice to pay'), findsOneWidget);
  });

  testWidgets('Assistant: the question field stays above the keyboard', (tester) async {
    AssistantScreen.messages.clear();
    useApi({});
    await show(tester, const AssistantScreen());
    // a keyboard over the lower 900 physical pixels of the 4000-pixel screen
    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    final keyboardTop = (4000 - 900) / tester.view.devicePixelRatio;
    expect(tester.getRect(find.byType(TextField)).bottom, lessThanOrEqualTo(keyboardTop));
  });

  testWidgets('Check-in inventory: conditions as chips, the guide, the count and photos', (tester) async {
    useApi({
      '/students/me/handover': {
        'id': 'H1',
        'status': 'Draft',
        'room': 'A101',
        'bed': '1',
        'dueAt': _future,
        'items': [
          {
            'itemId': 'i1',
            'assetCode': 'CH-1',
            'type': 'Chair',
            'typeVi': 'Ghế',
            'bed': '1',
            'personal': true,
            'condition': null,
            'photos': <Object>[],
          },
          {
            'itemId': 'i2',
            'assetCode': 'AC-1',
            'type': 'Air conditioner',
            'typeVi': 'Điều hoà',
            'personal': false,
            'condition': 'Good',
            'photos': [
              {'id': 'p1', 'url': 'http://localhost/files/1'},
            ],
          },
        ],
        'meterPhotos': <Object>[],
        'photosRequired': true,
        'maxPhotos': 3,
      },
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
    });
    await show(tester, const HandoverScreen());
    expect(find.textContaining('1 of 2 items answered'), findsOneWidget);
    // The guide explains each level for the item; picking there answers it.
    await tester.tap(find.text('Which condition?').first);
    await tester.pumpAndSettle();
    expect(find.text('E.g. A loose or cracked leg, a broken seat or back.'), findsOneWidget);
    await tester.tap(find.text('Broken or not working properly: it needs a repair.'));
    await tester.pumpAndSettle();
    expect(find.textContaining('2 of 2 items answered'), findsOneWidget);
    expect(find.text('What do you see?'), findsOneWidget);
    // The photo shows as a thumbnail with a remove mark.
    expect(find.byTooltip('Remove photo'), findsOneWidget);
  });

  testWidgets('Check-in inventory: the final record with its steps and what Staff checked', (tester) async {
    useApi({
      '/students/me/handover': {
        'id': 'H1',
        'status': 'Final',
        'room': 'A101',
        'source': 'Checked in the Room',
        'openedAt': _past,
        'submittedAt': _past,
        'visitAt': _past,
        'finalizedAt': _past,
        'utilityFrom': _past,
        'electricity': 120,
        'water': 30,
        'staffElectricity': 121,
        'staffWater': 30,
        'items': [
          {
            'itemId': 'i1',
            'assetCode': 'CH-1',
            'type': 'Chair',
            'personal': true,
            'bed': '1',
            'condition': 'Good',
            'staffCondition': 'Worn',
            'staffNote': 'Scratches',
            'photos': <Object>[],
          },
        ],
        'meterPhotos': <Object>[],
      },
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
    });
    await show(tester, const HandoverScreen());
    expect(find.text('Final report: your handover record until check-out'), findsOneWidget);
    expect(find.text('Room visit with Staff'), findsOneWidget);
    expect(find.text('Checked with Staff'), findsOneWidget);
    expect(find.text('Worn'), findsOneWidget);
    expect(find.text('Checked with Staff: 121'), findsOneWidget);
  });

  testWidgets('Check-in inventory: My Room keeps the way back to a final inventory', (tester) async {
    useApi({
      '/students/me/handover': {'status': 'Final', 'finalizedAt': _past},
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
    });
    await show(tester, const HandoverCard());
    expect(find.text('Check-in inventory final'), findsOneWidget);
    expect(find.text('View inventory'), findsOneWidget);
  });

  testWidgets('My Room: declaring an item opens the Check-out page, where photos are taken', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026'},
        'allocation': {'room': 'A101', 'bed': '1', 'status': 'Resident', 'allocatedAt': _past},
      },
      '/students/me/door-code': {'room': 'A101', 'status': 'Ready', 'changedAt': _past},
      '/students/me/late-check-in': {'request': null, 'canRequest': false},
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
      '/students/me/furniture': {
        'items': [
          {'itemId': '7', 'type': 'Chair', 'status': 'In use', 'bed': '1', 'personal': true, 'reportable': true},
        ],
      },
      'PUT /students/me/furniture/report': {
        'items': [
          {
            'itemId': '7',
            'type': 'Chair',
            'status': 'In use',
            'bed': '1',
            'personal': true,
            'reportable': true,
            'reportedCondition': 'Missing',
            'reportedNote': 'Gone',
          },
        ],
      },
    });
    await show(tester, const RoomScreen());
    await tester.tap(find.textContaining('Furniture & equipment ('));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Declare damaged / missing'));
    await tester.pumpAndSettle();
    expect(find.text('Check-out furniture report'), findsOneWidget);
    expect(calls, isNot(contains('PUT /students/me/furniture/report')));
  });

  testWidgets('My Room: the check-out card leads to the furniture charges to answer', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026'},
        'allocation': {'room': 'A101', 'bed': '1', 'status': 'Resident', 'allocatedAt': _past},
        'termination': {'status': 'Terminated', 'reason': 'Manager decision', 'moveOutBy': '2026-12-31'},
      },
      '/students/me/door-code': {'room': 'A101', 'status': 'Ready', 'changedAt': _past},
      '/students/me/late-check-in': {'request': null, 'canRequest': false},
      '/students/me/furniture': {'items': <Object>[]},
      '/students/me/check-out': {
        'saved': true,
        'studentPresent': true,
        'total': 200000,
        'items': <Object>[],
        'claims': [
          {
            'id': 'c1',
            'status': 'Pending',
            'type': 'Fridge',
            'assetCode': 'FR-1',
            'condition': 'Damaged',
            'amount': 200000,
            'dueAt': _future,
          },
        ],
      },
      '/students/me/handover': {'status': 'Not needed'},
    });
    await show(tester, const RoomScreen());
    await tester.tap(find.textContaining('Contract & utilities'));
    await tester.pumpAndSettle();
    expect(find.text('Check-out'), findsOneWidget);
    expect(find.text('Confirm or decline the damage'), findsOneWidget);
    await tester.tap(find.text('View furniture charges'));
    await tester.pumpAndSettle();
    expect(find.text('Did you damage Fridge FR-1?'), findsOneWidget);
  });

  testWidgets(
    'Home: Check-in and Check-out are two tiles; Check-out asks for an answer once Staff record the charges',
    (tester) async {
      useApi({
        '/students/me/home': {
          'firstName': 'Demo',
          'allocation': {'room': 'A902', 'bed': 'A', 'status': 'Resident'},
          'invoices': {'due': 0, 'total': 0},
          'openRequests': 0,
        },
        '/notifications': {'items': <Object>[], 'unread': 0},
        '/students/me/handover': {'status': 'Final', 'finalizedAt': _past},
        '/students/me/check-out': {'saved': true, 'studentPresent': true, 'claims': <Object>[]},
      });
      await show(tester, HomeScreen(session: session, openTab: (_, [_]) {}));
      expect(find.text('Check-out'), findsOneWidget);
      expect(find.text('Check-in'), findsOneWidget);
      expect(find.text('Answer now'), findsOneWidget);
    },
  );

  testWidgets('Check-out: the period, the furniture report Good by default, and a photo before saving', (tester) async {
    final items = [
      {'itemId': 'i1', 'assetCode': 'BED-1', 'type': 'Bed', 'personal': true, 'bed': '1', 'reportable': true},
      {'itemId': 'i2', 'assetCode': 'CH-1', 'type': 'Chair', 'personal': false, 'reportable': true},
    ];
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayStart': '2026-09-01', 'stayEnd': '2026-12-31'},
        'room': 'A101',
        'bed': '1',
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {'items': items},
      '/students/me/check-out': {'saved': false, 'claims': <Object>[], 'items': <Object>[]},
      'PUT /students/me/furniture/report': {
        'items': [
          items[0],
          {...items[1], 'reportedCondition': 'Damaged', 'reportedNote': 'Broken leg'},
        ],
      },
    });
    await show(tester, const CheckOutScreen());
    expect(find.text('Check-out period'), findsWidgets);
    expect(find.text('Check out at the desk by'), findsOneWidget);
    expect(find.text('Your Bed'), findsOneWidget);
    expect(find.text('Shared items'), findsOneWidget);
    expect(find.textContaining('Take the photos still missing'), findsOneWidget);
    expect(find.text("Waiting for Staff's check"), findsOneWidget);

    await tester.ensureVisible(find.text('Damaged').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Damaged').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Broken leg');
    await tester.pumpAndSettle();
    expect(find.text('Take at least one photo of this item.'), findsNWidgets(2));
    await tester.ensureVisible(find.text('Save declaration (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save declaration (1)'));
    await tester.pumpAndSettle();
    expect(calls, isNot(contains('PUT /students/me/furniture/report')));
  });

  testWidgets('Check-out: a declared item shows its photos and a camera button', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {
        'items': [
          {'itemId': 'i1', 'assetCode': 'BED-1', 'type': 'Bed', 'personal': true, 'bed': '1', 'reportable': true},
          {
            'itemId': 'i2',
            'assetCode': 'CH-1',
            'type': 'Chair',
            'reportable': true,
            'reportedCondition': 'Damaged',
            'reportedNote': 'Broken leg',
            'reportedPhotos': [
              {'id': 'p1', 'url': 'http://localhost/files/p1'},
            ],
          },
        ],
      },
      '/students/me/check-out': {'saved': false, 'claims': <Object>[], 'items': <Object>[]},
      'PUT /students/me/furniture/report': {'items': <Object>[]},
    });
    await show(tester, const CheckOutScreen());
    await tester.ensureVisible(find.text('Take another photo'));
    await tester.pumpAndSettle();
    expect(find.text('Take another photo'), findsOneWidget);
    expect(find.byType(PhotoThumbs), findsOneWidget);
    expect(find.text('Take a photo'), findsOneWidget); // the Bed, Good, needs one too
    await tester.enterText(find.byType(TextField).first, 'Broken leg and seat');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save declaration (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save declaration (1)'));
    await tester.pumpAndSettle();
    expect(calls, contains('PUT /students/me/furniture/report'));
  });

  testWidgets('Check-out: the student enters the meter readings', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {'items': <Object>[]},
      '/students/me/check-out': {
        'saved': false,
        'claims': <Object>[],
        'items': <Object>[],
        'studentMeters': {
          'photos': [
            {'id': 'm1', 'url': 'http://localhost/files/m1'},
          ],
        },
      },
      'PUT /students/me/check-out/meters': {'saved': false},
    });
    await show(tester, const CheckOutScreen());
    await tester.ensureVisible(find.text('Readings saved'));
    await tester.pumpAndSettle();
    expect(find.text('Take another photo'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(0), '1234.5');
    await tester.enterText(find.byType(TextField).at(1), '56');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save readings'));
    await tester.pumpAndSettle();
    expect(calls, contains('PUT /students/me/check-out/meters'));
    expect(find.text('Readings saved'), findsOneWidget);
  });

  testWidgets('Check-out: the declaration is submitted once every item and the meters have a photo', (tester) async {
    final photo = [
      {'id': 'p1', 'url': 'http://localhost/files/p1'},
    ];
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {
        'items': [
          {'itemId': 'i1', 'type': 'Bed', 'personal': true, 'bed': '1', 'reportable': true, 'reportedPhotos': photo},
        ],
      },
      '/students/me/check-out': {
        'saved': false,
        'claims': <Object>[],
        'items': <Object>[],
        'studentMeters': {'electricity': 120, 'water': 8, 'photos': photo},
      },
      'POST /students/me/check-out/submit': {'saved': false},
    });
    await show(tester, const CheckOutScreen());
    await tester.scrollUntilVisible(
      find.text('Submit check-out declaration'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('A photo of every item (1/1)'), findsOneWidget);
    await tester.tap(find.text('Submit check-out declaration'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit').last);
    await tester.pumpAndSettle();
    expect(calls, contains('POST /students/me/check-out/submit'));
  });

  testWidgets('Check-out: the student disagrees with the charges and waits for Staff', (tester) async {
    final charges = {
      'saved': true,
      'studentPresent': true,
      'total': 480000,
      'claims': <Object>[],
      'items': [
        {'itemId': 'i1', 'type': 'Bed', 'assetCode': 'BED-1', 'personal': true, 'bed': '1', 'amount': 480000},
      ],
      'declarationSubmittedAt': _past,
    };
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {'items': <Object>[]},
      '/students/me/check-out': charges,
      'POST /students/me/check-out/dispute': {
        ...charges,
        'dispute': {
          'id': '1',
          'status': 'Open',
          'reason': 'It was there at check-in.',
          'itemIds': ['i1'],
        },
      },
    });
    await show(tester, const CheckOutScreen());
    await tester.scrollUntilVisible(find.text('Disagree'), 400, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Disagree'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send to Staff'));
    await tester.pumpAndSettle();
    expect(find.text('Write why you do not agree.'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'It was there at check-in.');
    await tester.tap(find.text('Send to Staff'));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /students/me/check-out/dispute'));
  });

  testWidgets('Check-out: an open disagreement hides Agree until Staff answer', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
      '/students/me/furniture': {'items': <Object>[]},
      '/students/me/check-out': {
        'saved': true,
        'studentPresent': true,
        'total': 480000,
        'claims': <Object>[],
        'items': <Object>[],
        'dispute': {'id': '1', 'status': 'Open', 'reason': 'It was there at check-in.', 'itemIds': <Object>[]},
      },
    });
    await show(tester, const CheckOutScreen());
    await tester.scrollUntilVisible(
      find.text('You do not agree: Staff are checking again'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Agree with the charges'), findsNothing);
    expect(find.text('Disagree'), findsNothing);
  });

  testWidgets('Check-out: once Staff record the charges the report is read-only and the charges show', (tester) async {
    useApi({
      '/students/me/allocation': {
        'term': {'name': 'Fall 2026', 'stayEnd': '2026-12-31'},
        'termination': {'status': 'Terminated', 'reason': 'Manager decision', 'moveOutBy': '2026-12-31'},
      },
      '/students/me/furniture': {
        'items': [
          {'itemId': 'i2', 'assetCode': 'CH-1', 'type': 'Chair', 'reportable': true, 'reportedCondition': 'Damaged'},
        ],
      },
      '/students/me/check-out': {
        'saved': true,
        'studentPresent': true,
        'total': 0,
        'items': <Object>[],
        'claims': <Object>[],
      },
    });
    await show(tester, const CheckOutScreen());
    expect(find.text('Read the charges and agree'), findsOneWidget);
    expect(find.textContaining('Save declaration'), findsNothing);
    expect(find.text("Waiting for Staff's check"), findsNothing);
  });

  testWidgets('Home: a student not continuing next Term sees the Check-out tile', (tester) async {
    useApi({
      '/students/me/home': {
        'firstName': 'Demo',
        'allocation': {'room': 'A902', 'bed': 'A', 'status': 'Resident'},
        'invoices': {'due': 0, 'total': 0},
        'openRequests': 0,
      },
      '/notifications': {'items': <Object>[], 'unread': 0},
      '/students/me/handover': {'status': 'Final', 'finalizedAt': _past},
      '/students/me/check-out': {'saved': false, 'claims': <Object>[]},
      '/students/me/allocation': {
        'nextTerm': {'state': 'Not continuing', 'checkOutBy': '2027-01-01'},
      },
    });
    await show(tester, HomeScreen(session: session, openTab: (_, [_]) {}));
    expect(find.text('Check-out'), findsOneWidget);
    expect(find.text('Check-in'), findsOneWidget);
  });

  testWidgets('Home: the Check-out tile stays after the check-out and says it is done', (tester) async {
    useApi({
      '/students/me/home': {'firstName': 'Demo', 'invoices': {'due': 0, 'total': 0}, 'openRequests': 0},
      '/notifications': {'items': <Object>[], 'unread': 0},
      '/students/me/check-out': {'saved': true, 'claims': <Object>[], 'checkedOutAt': _past},
    });
    await show(tester, HomeScreen(session: session, openTab: (_, [_]) {}));
    expect(find.text('Check-out'), findsOneWidget);
    expect(find.text('Checked out'), findsOneWidget);
  });

  testWidgets('Links open Family Day screens', (tester) async {
    useApi({
      '/students/me/family-days': {'resident': false, 'items': <Object>[]},
    });
    late BuildContext context;
    await show(
      tester,
      Builder(
        builder: (c) {
          context = c;
          return const SizedBox();
        },
      ),
    );
    openLink(context, '/student/family-days');
    await tester.pumpAndSettle();
    expect(find.text('Family Days are for students who live in the dormitory.'), findsOneWidget);
  });
}
