import 'dart:async';

// ignore: deprecated_member_use (MOB-26: material_ui would be a new dependency; the app still builds with 3.47)
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
/// The answer is written as it comes (`POST /students/me/assistant/chat/stream`, Server-Sent Events, D6) and can be
/// stopped; a server without the stream answers with `POST /students/me/assistant/chat`.
/// `{ messages: [{ role, content, signature? }] }` → `{ reply, signature }`.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  /// The conversation, kept while the app runs (the web keeps it in the browser tab).
  static final List<({String role, String content, bool error, String? signature})> messages = [];

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  bool _pending = false;

  /// The answer so far while it streams in.
  String _partial = '';
  StreamSubscription<(String, Json)>? _stream;
  Completer<void>? _streamDone;

  List<({String role, String content, bool error, String? signature})> get _messages => AssistantScreen.messages;

  @override
  void dispose() {
    _stream?.cancel();
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
        if (!m.error) {'role': m.role, 'content': m.content, if (m.signature != null) 'signature': m.signature},
      {'role': 'user', 'content': question},
    ];
    setState(() {
      _messages.add((role: 'user', content: question, error: false, signature: null));
      _draft.clear();
      _pending = true;
    });
    _toEnd();
    final body = {'messages': turns.sublist(turns.length > 20 ? turns.length - 20 : 0)};
    try {
      Json? r;
      try {
        r = await _streamed(body);
      } on ApiException catch (e) {
        if (e.status != 404 && e.status != 405) rethrow;
        // A server without the stream: the whole answer at once. A small model on a busy server may take over a
        // minute (MOB-04).
        r = await Api.post('/students/me/assistant/chat', body, const Duration(seconds: 100));
      }
      if (r == null) {
        // Stopped by the student: what came so far stays on screen, and is not sent back to the model.
        if (_partial.trim().isNotEmpty) {
          _messages.add((role: 'assistant', content: '$_partial …', error: true, signature: null));
        }
      } else {
        // The server signs each answer; it goes back with its signature or is ignored (BE-PLT-02).
        _messages.add((role: 'assistant', content: r.text('reply'), error: false, signature: r.str('signature')));
      }
    } on ApiException catch (e) {
      final text = e.code == 'TIMEOUT'
          ? t(
              'The assistant is still thinking and did not answer in time. Ask again in a moment.',
              'Trợ lý vẫn đang suy nghĩ và chưa trả lời kịp. Hãy hỏi lại sau ít phút.',
            )
          : e.message;
      _messages.add((role: 'assistant', content: text, error: true, signature: null));
    }
    _partial = '';
    if (mounted) setState(() => _pending = false);
    _toEnd();
  }

  /// Streams the answer into [_partial]; the `done` event's `{ reply, signature }`, or null when stopped.
  Future<Json?> _streamed(Json body) async {
    Json? done;
    ApiException? failed;
    final finished = Completer<void>();
    _streamDone = finished;
    _partial = '';
    _stream = Api.events('/students/me/assistant/chat/stream', body).listen(
      (e) {
        final (event, data) = e;
        switch (event) {
          case 'delta':
            _partial += data.text('text');
          case 'reset':
            _partial = '';
          case 'done':
            done = data;
          case 'error':
            failed = ApiException(200, data.str('code'), data.text('message'));
        }
        if (mounted) setState(() {});
        _toEnd();
      },
      onError: (Object e) {
        failed = e is ApiException ? e : ApiException(0, 'NETWORK', '$e');
        if (!finished.isCompleted) finished.complete();
      },
      onDone: () {
        if (!finished.isCompleted) finished.complete();
      },
      cancelOnError: true,
    );
    await finished.future;
    _stream = null;
    if (failed != null) throw failed!;
    return done;
  }

  /// Stops the answer being written (the web's "Stop" button).
  Future<void> _stop() async {
    await _stream?.cancel();
    _stream = null;
    final done = _streamDone;
    if (done != null && !done.isCompleted) done.complete();
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
          if (_pending && _stream != null)
            IconButton.filled(
              tooltip: t('Stop', 'Dừng'),
              onPressed: _stop,
              icon: const Icon(Icons.stop),
            )
          else
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
          if (_pending && _partial.isNotEmpty) _Bubble(role: 'assistant', content: _partial, error: false),
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
