import 'models.dart';

/// Sesión del usuario (Supabase Auth en la app real; dobles en las pruebas).
abstract class AuthRepository {
  bool get isSignedIn;
  String? get email;
  Stream<bool> get signedInChanges;
  Future<void> signIn(String email, String password);
  Future<void> signOut();
}

/// Datos de la bandeja. Las lecturas pasan por RLS; las acciones sensibles por RPC o por el Telar.
abstract class InboxRepository {
  Future<List<Workspace>> workspaces();
  Stream<List<ConversationSummary>> conversations(String workspaceId);
  Stream<List<ChatMessage>> messages(String conversationId);
  Future<ReplyOutcome> reply(String conversationId, String text);
  Future<void> take(String conversationId);
  Future<void> release(String conversationId);
  Future<void> close(String conversationId);
  Future<void> markRead(String conversationId);

  /// Elimina la cuenta en el servidor (datos y usuario de Auth) y cierra la sesión en todos los
  /// dispositivos (Apple 5.1.1(v), Google Play).
  Future<void> deleteAccount();

  /// Destino de avisos push de este dispositivo (el FID de Firebase).
  Future<void> registerDeviceToken(String token, String platform);
  Future<void> unregisterDeviceToken(String token);
}
