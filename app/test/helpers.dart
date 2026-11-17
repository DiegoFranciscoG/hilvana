import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:hilvana/data/models.dart';
import 'package:hilvana/data/repositories.dart';
import 'package:hilvana/strings.dart';
import 'package:hilvana/theme.dart';

class FakeAuth implements AuthRepository {
  FakeAuth({this.signedIn = false, this.failSignIn = false});

  bool signedIn;
  bool failSignIn;
  final _changes = StreamController<bool>.broadcast();
  final List<String> signInCalls = [];

  @override
  bool get isSignedIn => signedIn;

  @override
  String? get email => signedIn ? 'demo@hilvana.test' : null;

  @override
  Stream<bool> get signedInChanges => _changes.stream;

  @override
  Future<void> signIn(String email, String password) async {
    signInCalls.add(email);
    if (failSignIn) throw StateError('credenciales inválidas');
    signedIn = true;
    _changes.add(true);
  }

  @override
  Future<void> signOut() async {
    signedIn = false;
    _changes.add(false);
  }
}

class FakeInbox implements InboxRepository {
  FakeInbox({this.items = const [], this.replyOutcome = ReplyOutcome.sent, this.failDelete = false});

  final List<ConversationSummary> items;
  final ReplyOutcome replyOutcome;
  final bool failDelete;
  int deleteCalls = 0;
  final List<String> actions = [];

  @override
  Future<List<Workspace>> workspaces() async => const [
    Workspace(id: 'w1', slug: 'panaderia', name: 'Panadería La Espiga'),
  ];

  @override
  Stream<List<ConversationSummary>> conversations(String workspaceId) => Stream.value(items);

  @override
  Stream<List<ChatMessage>> messages(String conversationId) => Stream.value([
    ChatMessage(
      id: 'm1',
      author: MessageAuthor.contact,
      body: '¿Tienen humitas?',
      status: 'received',
      createdAt: DateTime(2026, 11, 16, 9, 30),
    ),
  ]);

  @override
  Future<ReplyOutcome> reply(String conversationId, String text) async {
    actions.add('reply:$text');
    return replyOutcome;
  }

  @override
  Future<void> take(String conversationId) async => actions.add('take');

  @override
  Future<void> release(String conversationId) async => actions.add('release');

  @override
  Future<void> close(String conversationId) async => actions.add('close');

  @override
  Future<void> markRead(String conversationId) async => actions.add('read');

  @override
  Future<void> deleteAccount() async {
    deleteCalls++;
    if (failDelete) throw StateError('falló');
  }

  @override
  Future<void> registerDeviceToken(String token, String platform) async {}

  @override
  Future<void> unregisterDeviceToken(String token) async {}
}

ConversationSummary conversation(String id, {ConversationStatus status = ConversationStatus.agent, int unread = 0}) =>
    ConversationSummary(
      id: id,
      status: status,
      contactName: 'Cliente $id',
      channelType: 'whatsapp',
      preview: 'Mensaje de $id',
      lastMessageAt: DateTime(2026, 11, 16, 10, 0),
      unreadCount: unread,
      windowExpiresAt: DateTime.now().add(const Duration(hours: 3)),
    );

Future<Strings> loadStrings() => Strings.load(rootBundle);

Widget wrap(Widget child, Strings strings) => StringsScope(
  strings: strings,
  child: MaterialApp(theme: HilvanaTheme.light(), home: child),
);
