import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../data/models.dart';
import '../data/repositories.dart';
import '../strings.dart';
import '../widgets/stitch.dart';
import 'conversation_view.dart';

/// Bandeja en tiempo real. En pantallas anchas muestra lista y conversación lado a lado.
class InboxPage extends StatefulWidget {
  const InboxPage({super.key, required this.inbox});

  final InboxRepository inbox;

  @override
  State<InboxPage> createState() => _InboxPageState();
}

class _InboxPageState extends State<InboxPage> {
  List<Workspace> _workspaces = const [];
  Workspace? _current;
  String? _selected;

  @override
  void initState() {
    super.initState();
    widget.inbox.workspaces().then((list) {
      if (!mounted) return;
      setState(() {
        _workspaces = list;
        _current = list.isEmpty ? null : list.first;
      });
    });
  }

  void _open(BuildContext context, String id, bool wide) {
    widget.inbox.markRead(id);
    if (wide) {
      setState(() => _selected = id);
    } else {
      context.push('/c/$id');
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        final list = _current == null
            ? StitchEmptyState(message: strings.t('emptyInbox'))
            : StreamBuilder<List<ConversationSummary>>(
                stream: widget.inbox.conversations(_current!.id),
                builder: (context, snapshot) {
                  final items = [...?snapshot.data]..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
                  if (snapshot.connectionState == ConnectionState.waiting && items.isEmpty) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final waiting = items.where((c) => c.needsPerson).length;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                        child: Text(strings.waiting(waiting), key: const Key('inbox-waiting'), style: theme.textTheme.titleMedium),
                      ),
                      const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: StitchDivider()),
                      Expanded(
                        child: items.isEmpty
                            ? StitchEmptyState(message: strings.t('emptyInbox'))
                            : ListView.separated(
                                itemCount: items.length,
                                separatorBuilder: (_, _) => const Divider(height: 1, indent: 20, endIndent: 20),
                                itemBuilder: (context, i) => _ConversationTile(
                                  conversation: items[i],
                                  selected: wide && items[i].id == _selected,
                                  onTap: () => _open(context, items[i].id, wide),
                                ),
                              ),
                      ),
                    ],
                  );
                },
              );

        return Scaffold(
          appBar: AppBar(
            title: Text(strings.t('inboxTitle')),
            actions: [
              if (_workspaces.length > 1)
                PopupMenuButton<Workspace>(
                  tooltip: strings.t('workspace'),
                  initialValue: _current,
                  onSelected: (ws) => setState(() {
                    _current = ws;
                    _selected = null;
                  }),
                  itemBuilder: (_) => [for (final ws in _workspaces) PopupMenuItem(value: ws, child: Text(ws.name))],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(children: [Text(_current?.name ?? ''), const Icon(Icons.arrow_drop_down)]),
                  ),
                )
              else if (_current != null)
                Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Center(child: Text(_current!.name))),
              IconButton(
                key: const Key('open-settings'),
                tooltip: strings.t('settings'),
                icon: const Icon(Icons.tune),
                onPressed: () => context.push('/settings'),
              ),
            ],
          ),
          body: wide
              ? Row(
                  children: [
                    SizedBox(width: 380, child: list),
                    const VerticalDivider(width: 1),
                    Expanded(
                      child: _selected == null
                          ? StitchEmptyState(message: strings.t('pickConversation'))
                          : ConversationView(key: ValueKey(_selected), inbox: widget.inbox, conversationId: _selected!),
                    ),
                  ],
                )
              : list,
        );
      },
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.selected, required this.onTap});

  final ConversationSummary conversation;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    final status = switch (conversation.status) {
      ConversationStatus.agent => strings.t('statusAgent'),
      ConversationStatus.human => strings.t('statusHuman'),
      ConversationStatus.closed => strings.t('statusClosed'),
    };
    final time = DateFormat.Hm().format(conversation.lastMessageAt);
    return ListTile(
      selected: selected,
      selectedTileColor: theme.colorScheme.surfaceContainer,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: theme.colorScheme.surfaceContainerHigh,
        foregroundColor: theme.colorScheme.onSurface,
        child: Icon(switch (conversation.channelType) {
          'instagram' => Icons.camera_alt_outlined,
          'messenger' => Icons.forum_outlined,
          _ => Icons.chat_bubble_outline,
        }, size: 20),
      ),
      title: Row(
        children: [
          Expanded(child: Text(conversation.contactName, overflow: TextOverflow.ellipsis)),
          Text(time, style: theme.textTheme.bodySmall),
        ],
      ),
      subtitle: Row(
        children: [
          Expanded(child: Text(conversation.preview, maxLines: 1, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 8),
          _StatusChip(label: status, highlight: conversation.status == ConversationStatus.human),
          if (conversation.unreadCount > 0) ...[
            const SizedBox(width: 6),
            Badge(label: Text('${conversation.unreadCount}'), backgroundColor: theme.colorScheme.secondary),
          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.highlight});

  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: highlight ? scheme.secondary : scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: highlight ? scheme.onSecondary : scheme.onSurface),
      ),
    );
  }
}
