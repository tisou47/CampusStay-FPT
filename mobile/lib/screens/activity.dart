import 'package:flutter/material.dart';

import '../common.dart';
import 'applications.dart';
import 'requests.dart';

/// Activity (phone menu, spec §11.2): Applications · Requests (web Activity › Segmented), as two tabs under the top
/// bar that can also be swiped. The notifications live on Home and behind the bell.
class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key, this.segment = 'requests'});

  /// `applications` or `requests`.
  final String segment;

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> with SingleTickerProviderStateMixin {
  static int _index(String segment) => segment == 'applications' ? 0 : 1;

  late final TabController _tabs = TabController(length: 2, vsync: this, initialIndex: _index(widget.segment));

  @override
  void didUpdateWidget(ActivityScreen old) {
    super.didUpdateWidget(old);
    if (old.segment != widget.segment) _tabs.animateTo(_index(widget.segment));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Material(
          color: Tokens.surface,
          child: TabBar(
            controller: _tabs,
            indicatorSize: TabBarIndicatorSize.label,
            indicatorWeight: 3,
            labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 15),
            tabs: [
              Tab(text: t('Applications', 'Đơn đăng ký')),
              Tab(text: t('Requests', 'Yêu cầu')),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(controller: _tabs, children: const [ApplicationsList(), RequestsList()]),
        ),
      ],
    );
  }
}
