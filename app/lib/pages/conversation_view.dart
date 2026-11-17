import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';

import '../data/models.dart';
import '../data/repositories.dart';
import '../strings.dart';

/// Conversación con el cliente: mensajes en tiempo real, responder, tomar y devolver al asistente.
class ConversationView extends StatefulWidget {
  const ConversationView({super.key, required this.inbox, required this.conversationId});

  final InboxRepository inbox;
  final String conversationId;

  @override
  State<ConversationView> createState() => _ConversationViewState();
}

class _ConversationViewState extends State<ConversationView> {
  final _composer = TextEditingController();
  late final Stream<List<ChatMessage>> _messages = widget.inbox.messages(widget.conversationId);
  bool _sending = false;
  String? _notice;

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _composer.text.trim();
    if (text.isEmpty) return;
    final strings = StringsScope.of(context);
    setState(() {
      _sending = true;
      _notice = null;
    });
    final outcome = await widget.inbox.reply(widget.conversationId, text).catchError((_) => ReplyOutcome.failed);
    if (!mounted) return;
    setState(() {
      _sending = false;
      switch (outcome) {
        case ReplyOutcome.sent:
          _composer.clear();
        case ReplyOutcome.windowClosed:
          _notice = strings.t('windowClosed');
        case ReplyOutcome.failed:
          _notice = strings.t('sendFailed');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: LayoutBuilder(
            builder: (context, constraints) {
              // En anchos chicos las acciones son íconos con su nombre en el tooltip (y en la semántica).
              final compact = constraints.maxWidth < 520;
              Widget action(Key? key, VoidCallback onPressed, IconData icon, String label) => compact
                  ? IconButton.outlined(key: key, onPressed: onPressed, icon: Icon(icon), tooltip: label)
                  : OutlinedButton.icon(key: key, onPressed: onPressed, icon: Icon(icon, size: 18), label: Text(label));
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  action(
                    const Key('take'),
                    () => widget.inbox.take(widget.conversationId),
                    Icons.pan_tool_outlined,
                    strings.t('take'),
                  ),
                  action(
                    const Key('release'),
                    () => widget.inbox.release(widget.conversationId),
                    Icons.auto_mode_outlined,
                    strings.t('release'),
                  ),
                  action(null, () => widget.inbox.close(widget.conversationId), Icons.check, strings.t('close')),
                ],
              );
            },
          ),
        ),
        Expanded(
          child: StreamBuilder<List<ChatMessage>>(
            stream: _messages,
            builder: (context, snapshot) {
              final items = snapshot.data ?? const <ChatMessage>[];
              return ListView.builder(
                padding: const EdgeInsets.all(16),
                reverse: true,
                itemCount: items.length,
                itemBuilder: (context, i) => _Bubble(message: items[items.length - 1 - i]),
              );
            },
          ),
        ),
        if (_notice != null)
          Container(
            key: const Key('reply-notice'),
            width: double.infinity,
            color: theme.colorScheme.surfaceContainer,
            padding: const EdgeInsets.all(12),
            child: Text(_notice!, style: theme.textTheme.bodyMedium),
          ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('composer'),
                    controller: _composer,
                    minLines: 1,
                    maxLines: 5,
                    maxLength: 4096,
                    decoration: InputDecoration(hintText: strings.t('replyHint'), counterText: ''),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  key: const Key('send'),
                  tooltip: strings.t('send'),
                  onPressed: _sending ? null : _send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final inbound = message.inbound;
    final label = switch (message.author) {
      MessageAuthor.contact => strings.t('customerLabel'),
      MessageAuthor.agent => strings.t('automatedLabel'),
      _ => strings.t('teamLabel'),
    };
    final problem = message.status == 'blocked'
        ? strings.t('blockedLabel')
        : message.status == 'failed'
        ? strings.t('failedLabel')
        : null;
    return Align(
      alignment: inbound ? Alignment.centerLeft : Alignment.centerRight,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          decoration: BoxDecoration(
            color: inbound ? scheme.surfaceContainerLowest : scheme.surfaceContainer,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: problem != null ? scheme.error : scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('$label · ${DateFormat.Hm().format(message.createdAt)}', style: theme.textTheme.labelSmall),
              const SizedBox(height: 4),
              Text(message.body, style: theme.textTheme.bodyLarge),
              if (problem != null) ...[
                const SizedBox(height: 4),
                Text(problem, style: theme.textTheme.labelSmall?.copyWith(color: scheme.error)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
