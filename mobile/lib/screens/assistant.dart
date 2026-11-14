import 'package:flutter/material.dart';

import '../api.dart';
import '../common.dart';

/// Whether the server has a model for the students' AI assistant (ADR-28, A-68): `GET /students/me/assistant`.
Future<bool> assistantEnabled() async {
  try {
    return (await Api.get('/students/me/assistant')).flag('enabled');
  } on ApiException {
    return false;
  }
}

/// The CampusStay Assistant (web `AssistantChat`): answers from the user guide and the student's own records. The
/// conversation lasts while the app runs; each question sends the last 20 turns.
/// `POST /students/me/assistant/chat { messages: [{ role, content }] }` → `{ reply }`.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  /// The conversation, kept while the app runs (the web keeps it in the browser tab).
  static final List<({String role, String content, bool error})> messages = [];

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  bool _pending = false;

  List<({String role, String content, bool error})> get _messages => AssistantScreen.messages;

  @override
  void dispose() {
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
  });

  Future<void> _ask(String text) async {
    final question = text.trim();
    if (question.isEmpty || _pending) return;
    final turns = [
      for (final m in _messages)
        if (!m.error) {'role': m.role, 'content': m.content},
      {'role': 'user', 'content': question},
    ];
    setState(() {
      _messages.add((role: 'user', content: question, error: false));
      _draft.clear();
      _pending = true;
    });
    _toEnd();
    try {
      final r = await Api.post('/students/me/assistant/chat', {
        'messages': turns.sublist(turns.length > 20 ? turns.length - 20 : 0),
      });
      _messages.add((role: 'assistant', content: r.text('reply'), error: false));
    } on ApiException catch (e) {
      _messages.add((role: 'assistant', content: e.message, error: true));
    }
    if (mounted) setState(() => _pending = false);
    _toEnd();
  }

  @override
  Widget build(BuildContext context) {
    final suggestions = [
      t('When is the registration deadline?', 'Khi nào hết hạn đăng ký?'),
      t('Which Invoices do I still have to pay?', 'Tôi còn hoá đơn nào phải trả?'),
      t('How do I report a broken item in my Room?', 'Làm sao để báo đồ hỏng trong phòng?'),
    ];
    return SubPage(
      title: t('CampusStay Assistant', 'Trợ lý CampusStay'),
      actions: [
        if (_messages.isNotEmpty)
          IconButton(
            tooltip: t('New conversation', 'Cuộc trò chuyện mới'),
            onPressed: _pending ? null : () => setState(_messages.clear),
            icon: const Icon(Icons.restart_alt),
          ),
      ],
      bottom: Row(
        spacing: 8,
        children: [
          Expanded(
            child: TextField(
              controller: _draft,
              minLines: 1,
              maxLines: 4,
              maxLength: 2000,
              textInputAction: TextInputAction.send,
              onSubmitted: _ask,
              decoration: InputDecoration(hintText: t('Ask a question', 'Đặt câu hỏi'), counterText: ''),
            ),
          ),
          IconButton.filled(
            tooltip: t('Send', 'Gửi'),
            onPressed: _pending ? null : () => _ask(_draft.text),
            icon: const Icon(Icons.send),
          ),
        ],
      ),
      body: ListView(
        controller: _scroll,
        padding: const EdgeInsets.all(16),
        children: [
          Note(
            t(
              'Answers from the user guide and your own records. It can make mistakes.',
              'Trả lời dựa trên hướng dẫn sử dụng và dữ liệu của bạn. Trợ lý có thể sai.',
            ),
          ),
          const SizedBox(height: 12),
          if (_messages.isEmpty) ...[
            Text(
              t(
                'Hello! Ask me how to use CampusStay or about your Application, Room, Invoices and requests.',
                'Xin chào! Hãy hỏi cách dùng CampusStay hoặc về đơn, phòng, hoá đơn và yêu cầu của bạn.',
              ),
            ),
            const SizedBox(height: 8),
            for (final s in suggestions)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: ActionChip(label: Text(s), onPressed: () => _ask(s)),
                ),
              ),
          ],
          for (final m in _messages) _Bubble(role: m.role, content: m.content, error: m.error),
          if (_pending)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
              ),
            ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.role, required this.content, required this.error});

  final String role;
  final String content;
  final bool error;

  /// The model writes light Markdown: keep the line breaks and the bold text.
  List<InlineSpan> _spans() {
    final spans = <InlineSpan>[];
    final lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i].replaceFirst(RegExp(r'^\s*[-*]\s'), '• ');
      final parts = line.split(RegExp(r'\*\*'));
      for (var j = 0; j < parts.length; j++) {
        spans.add(
          TextSpan(
            text: parts[j],
            style: j.isOdd ? const TextStyle(fontWeight: FontWeight.w700) : null,
          ),
        );
      }
      if (i < lines.length - 1) spans.add(const TextSpan(text: '\n'));
    }
    return spans;
  }

  @override
  Widget build(BuildContext context) {
    final mine = role == 'user';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.85),
        decoration: BoxDecoration(
          color: mine ? Tokens.primary : (error ? Tone.warning.bg : Tokens.subtle),
          borderRadius: BorderRadius.circular(12),
        ),
        child: mine
            ? Text(content, style: const TextStyle(color: Colors.white))
            : Text.rich(
                TextSpan(children: _spans()),
                style: TextStyle(color: error ? Tone.warning.fg : Tokens.fg),
              ),
      ),
    );
  }
}
