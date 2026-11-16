import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'models.dart';
import 'repositories.dart';

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client);

  final SupabaseClient _client;

  @override
  bool get isSignedIn => _client.auth.currentSession != null;

  @override
  String? get email => _client.auth.currentUser?.email;

  @override
  Stream<bool> get signedInChanges => _client.auth.onAuthStateChange.map((state) => state.session != null);

  @override
  Future<void> signIn(String email, String password) async {
    await _client.auth.signInWithPassword(email: email.trim(), password: password);
  }

  @override
  Future<void> signOut() => _client.auth.signOut();
}

class SupabaseInboxRepository implements InboxRepository {
  SupabaseInboxRepository(this._client, this._telarUrl, {http.Client? httpClient}) : _http = httpClient ?? http.Client();

  final SupabaseClient _client;
  final String _telarUrl;
  final http.Client _http;
  final Map<String, ({String name, String channel})> _contacts = {};

  Map<String, String> get _authHeaders => {
        'Authorization': 'Bearer ${_client.auth.currentSession?.accessToken ?? ''}',
        'Content-Type': 'application/json',
      };

  @override
  Future<List<Workspace>> workspaces() async {
    final rows = await _client.from('workspace').select('id, slug, name').order('name');
    return rows.map(Workspace.fromJson).toList();
  }

  final Map<String, String> _channelTypes = {};

  Future<void> _loadContacts(String workspaceId, Iterable<String> contactIds) async {
    final missing = contactIds.where((id) => !_contacts.containsKey(id)).toSet().toList();
    if (missing.isEmpty) return;
    if (_channelTypes.isEmpty) {
      final channels = await _client.from('channel').select('id, type').eq('workspace_id', workspaceId);
      for (final row in channels) {
        _channelTypes[row['id'] as String] = row['type'] as String;
      }
    }
    final rows = await _client
        .from('contact')
        .select('id, display_name, external_id, channel_id')
        .eq('workspace_id', workspaceId)
        .inFilter('id', missing);
    for (final row in rows) {
      final name = (row['display_name'] as String?) ?? _mask(row['external_id'] as String);
      _contacts[row['id'] as String] = (name: name, channel: _channelTypes[row['channel_id'] as String] ?? 'whatsapp');
    }
  }

  /// Si el cliente no compartió su nombre, se muestran solo los últimos dígitos (minimización).
  static String _mask(String externalId) =>
      externalId.length <= 4 ? externalId : '••• ${externalId.substring(externalId.length - 4)}';

  @override
  Stream<List<ConversationSummary>> conversations(String workspaceId) {
    return _client
        .from('conversation')
        .stream(primaryKey: ['id'])
        .eq('workspace_id', workspaceId)
        .order('last_message_at')
        .asyncMap((rows) async {
          await _loadContacts(workspaceId, rows.map((r) => r['contact_id'] as String));
          return rows.map((row) {
            final contact = _contacts[row['contact_id'] as String];
            final window = row['window_expires_at'] as String?;
            return ConversationSummary(
              id: row['id'] as String,
              status: statusFrom(row['status'] as String),
              contactName: contact?.name ?? '—',
              channelType: contact?.channel ?? 'whatsapp',
              preview: (row['last_message_preview'] as String?) ?? '',
              lastMessageAt: DateTime.parse(row['last_message_at'] as String).toLocal(),
              unreadCount: (row['unread_count'] as num?)?.toInt() ?? 0,
              windowExpiresAt: window == null ? null : DateTime.parse(window).toLocal(),
            );
          }).toList();
        });
  }

  @override
  Stream<List<ChatMessage>> messages(String conversationId) {
    return _client
        .from('message')
        .stream(primaryKey: ['id'])
        .eq('conversation_id', conversationId)
        .order('created_at', ascending: true)
        .map((rows) => rows.map(ChatMessage.fromJson).toList());
  }

  @override
  Future<ReplyOutcome> reply(String conversationId, String text) async {
    final response = await _http.post(
      Uri.parse('$_telarUrl/api/conversations/$conversationId/messages'),
      headers: _authHeaders,
      body: jsonEncode({'text': text}),
    );
    if (response.statusCode == 202) return ReplyOutcome.sent;
    if (response.statusCode == 409) return ReplyOutcome.windowClosed;
    return ReplyOutcome.failed;
  }

  @override
  Future<void> take(String conversationId) => _client.rpc('take_conversation', params: {'p_conversation_id': conversationId});

  @override
  Future<void> release(String conversationId) =>
      _client.rpc('release_conversation', params: {'p_conversation_id': conversationId});

  @override
  Future<void> close(String conversationId) => _client.rpc('close_conversation', params: {'p_conversation_id': conversationId});

  @override
  Future<void> markRead(String conversationId) =>
      _client.rpc('mark_conversation_read', params: {'p_conversation_id': conversationId});

  @override
  Future<void> deleteAccount() async {
    final response = await _http.delete(Uri.parse('$_telarUrl/api/account'), headers: _authHeaders);
    if (response.statusCode != 200) {
      throw StateError('account deletion failed with ${response.statusCode}');
    }
    // El usuario ya no existe en Auth: sus refresh tokens se borraron en el servidor. Aquí solo se
    // limpia la sesión local de este dispositivo.
    try {
      await _client.auth.signOut(scope: SignOutScope.local);
    } catch (_) {}
  }

  @override
  Future<void> registerDeviceToken(String token, String platform) =>
      _client.rpc('register_device_token', params: {'p_token': token, 'p_platform': platform});
}
