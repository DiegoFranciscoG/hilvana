import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hilvana/pages/settings_page.dart';
import 'package:hilvana/strings.dart';

import 'helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Strings strings;

  setUpAll(() async => strings = await loadStrings());

  testWidgets('T-11 eliminar la cuenta pide confirmación, llama al servidor y vuelve a la entrada', (tester) async {
    final auth = FakeAuth(signedIn: true);
    final inbox = FakeInbox();
    var deleted = false;
    await tester.pumpWidget(wrap(SettingsPage(auth: auth, inbox: inbox, onDeleted: () => deleted = true), strings));

    await tester.tap(find.byKey(const Key('delete-account')));
    await tester.pumpAndSettle();
    expect(find.text(strings.t('deleteAccountTitle')), findsOneWidget);
    expect(find.textContaining('todos tus dispositivos'), findsOneWidget);

    await tester.tap(find.byKey(const Key('confirm-delete')));
    await tester.pumpAndSettle();
    expect(inbox.deleteCalls, 1);
    expect(deleted, isTrue);
    expect(find.text(strings.t('deleted')), findsOneWidget);
  });

  testWidgets('cancelar no borra nada', (tester) async {
    final inbox = FakeInbox();
    var deleted = false;
    await tester.pumpWidget(wrap(SettingsPage(auth: FakeAuth(signedIn: true), inbox: inbox, onDeleted: () => deleted = true), strings));
    await tester.tap(find.byKey(const Key('delete-account')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(strings.t('cancel')));
    await tester.pumpAndSettle();
    expect(inbox.deleteCalls, 0);
    expect(deleted, isFalse);
  });

  testWidgets('si el servidor falla, avisa y no sale de la pantalla', (tester) async {
    final inbox = FakeInbox(failDelete: true);
    var deleted = false;
    await tester.pumpWidget(wrap(SettingsPage(auth: FakeAuth(signedIn: true), inbox: inbox, onDeleted: () => deleted = true), strings));
    await tester.tap(find.byKey(const Key('delete-account')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-delete')));
    await tester.pumpAndSettle();
    expect(deleted, isFalse);
    expect(find.text(strings.t('deleteFailed')), findsOneWidget);
  });
}
