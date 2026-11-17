/// Modelos de la bandeja. Se arman desde las filas que devuelve la API (PostgREST/Realtime).
class Workspace {
  const Workspace({required this.id, required this.slug, required this.name});

  final String id;
  final String slug;
  final String name;

  factory Workspace.fromJson(Map<String, dynamic> json) =>
      Workspace(id: json['id'] as String, slug: json['slug'] as String, name: json['name'] as String);
}

enum ConversationStatus { agent, human, closed }

ConversationStatus statusFrom(String value) => switch (value) {
  'human' => ConversationStatus.human,
  'closed' => ConversationStatus.closed,
  _ => ConversationStatus.agent,
};

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.status,
    required this.contactName,
    required this.channelType,
    required this.preview,
    required this.lastMessageAt,
    required this.unreadCount,
    this.windowExpiresAt,
  });

  final String id;
  final ConversationStatus status;
  final String contactName;
  final String channelType;
  final String preview;
  final DateTime lastMessageAt;
  final int unreadCount;
  final DateTime? windowExpiresAt;

  bool get windowOpen => windowExpiresAt != null && windowExpiresAt!.isAfter(DateTime.now());
  bool get needsPerson => status == ConversationStatus.human && unreadCount > 0;
}

enum MessageAuthor { contact, agent, human, system }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.author,
    required this.body,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final MessageAuthor author;
  final String body;
  final String status;
  final DateTime createdAt;

  bool get inbound => author == MessageAuthor.contact;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String,
    author: switch (json['author'] as String) {
      'agent' => MessageAuthor.agent,
      'human' => MessageAuthor.human,
      'system' => MessageAuthor.system,
      _ => MessageAuthor.contact,
    },
    body: (json['body'] as String?) ?? '',
    status: json['status'] as String,
    createdAt: DateTime.parse(json['created_at'] as String).toLocal(),
  );
}

enum ReplyOutcome { sent, windowClosed, failed }
