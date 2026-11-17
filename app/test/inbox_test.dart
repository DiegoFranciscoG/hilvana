import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hilvana/data/models.dart';
import 'package:hilvana/pages/conversation_view.dart';
import 'package:hilvana/pages/inbox_page.dart';
import 'package:hilvana/pages/login_page.dart';
import 'package:hilvana/strings.dart';
import 'package:hilvana/theme.dart';

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Strings strings;

  setUpAll(() async => strings = await loadStrings());

  testWidgets('la bandeja dice cuántas conversaciones esperan a una persona, con texto humano', (tester) async {
    tester.view.physicalSize = const Size(420, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final inbox = FakeInbox(items: [
      conversation('a', status: ConversationStatus.human, unread: 2),
      conversation('b', status: ConversationStatus.human, unread: 1),
      conversation('c'),
    ]);
    await tester.pumpWidget(wrap(InboxPage(inbox: inbox), strings));
    await tester.pumpAndSettle();
    expect(find.text('Tienes 2 conversaciones esperando'), findsOneWidget);
    expect(find.text('Cliente a'), findsOneWidget);
    expect(find.text(strings.t('statusHuman')), findsNWidgets(2));
  });

  testWidgets('bandeja vacía muestra el estado de hilván', (tester) async {
    await tester.pumpWidget(wrap(InboxPage(inbox: FakeInbox()), strings));
    await tester.pumpAndSettle();
    expect(find.text(strings.t('emptyInbox')), findsOneWidget);
    expect(find.text(strings.t('waitingNone')), findsOneWidget);
  });

  testWidgets('en pantalla ancha la conversación se abre al lado de la lista', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final inbox = FakeInbox(items: [conversation('a', status: ConversationStatus.human, unread: 1)]);
    await tester.pumpWidget(wrap(InboxPage(inbox: inbox), strings));
    await tester.pumpAndSettle();
    expect(find.text(strings.t('pickConversation')), findsOneWidget);
    await tester.tap(find.text('Cliente a'));
    await tester.pumpAndSettle();
    expect(find.text('¿Tienen humitas?'), findsOneWidget);
    expect(inbox.actions, contains('read'));
  });

  testWidgets('fuera de la ventana de 24 h la respuesta no se envía y se explica por qué', (tester) async {
    final inbox = FakeInbox(replyOutcome: ReplyOutcome.windowClosed);
    await tester.pumpWidget(wrap(Scaffold(body: ConversationView(inbox: inbox, conversationId: 'a')), strings));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('composer')), 'Hola, ¿sigues ahí?');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reply-notice')), findsOneWidget);
    expect(find.textContaining('plantillas aprobadas'), findsOneWidget);
    expect(find.text('Hola, ¿sigues ahí?'), findsOneWidget, reason: 'el borrador se conserva');
  });

  testWidgets('tomar y devolver la conversación', (tester) async {
    final inbox = FakeInbox();
    await tester.pumpWidget(wrap(Scaffold(body: ConversationView(inbox: inbox, conversationId: 'a')), strings));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('take')));
    await tester.tap(find.byKey(const Key('release')));
    expect(inbox.actions, containsAllInOrder(['take', 'release']));
  });

  testWidgets('entrar con datos inválidos muestra un error claro', (tester) async {
    final auth = FakeAuth(failSignIn: true);
    await tester.pumpWidget(wrap(LoginPage(auth: auth), strings));
    await tester.enterText(find.byKey(const Key('login-email')), 'demo@hilvana.test');
    await tester.enterText(find.byKey(const Key('login-password')), 'incorrecta');
    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pumpAndSettle();
    expect(auth.signInCalls, ['demo@hilvana.test']);
    expect(find.text(strings.t('loginError')), findsOneWidget);
  });

  test('la paleta de marca está en el tema', () {
    final theme = HilvanaTheme.light();
    expect(theme.colorScheme.primary, HilvanaColors.tinta);
    expect(theme.colorScheme.secondary, HilvanaColors.hilo);
    expect(HilvanaColors.lino, const Color(0xFFF2ECE1));
    expect(theme.textTheme.headlineSmall?.fontFamily, 'Fraunces');
    expect(theme.textTheme.bodyMedium?.fontFamily, 'IBM Plex Sans');
  });
}
