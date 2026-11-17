import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import 'data/repositories.dart';
import 'pages/conversation_view.dart';
import 'pages/inbox_page.dart';
import 'pages/login_page.dart';
import 'pages/settings_page.dart';
import 'push.dart';
import 'strings.dart';
import 'theme.dart';

/// Avisa al router cuando cambia la sesión.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Stream<bool> changes) {
    _subscription = changes.listen((_) => notifyListeners());
  }

  late final StreamSubscription<bool> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

class HilvanaApp extends StatefulWidget {
  const HilvanaApp({super.key, required this.auth, required this.inbox, required this.strings, this.push});

  final AuthRepository auth;
  final InboxRepository inbox;
  final Strings strings;
  final PushService? push;

  @override
  State<HilvanaApp> createState() => _HilvanaAppState();
}

class _HilvanaAppState extends State<HilvanaApp> {
  late final _AuthListenable _refresh = _AuthListenable(widget.auth.signedInChanges);
  late final GoRouter _router = GoRouter(
    initialLocation: '/',
    refreshListenable: _refresh,
    redirect: (context, state) {
      final signedIn = widget.auth.isSignedIn;
      final atLogin = state.matchedLocation == '/login';
      if (!signedIn && !atLogin) return '/login';
      if (signedIn && atLogin) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginPage(auth: widget.auth),
      ),
      GoRoute(
        path: '/',
        builder: (context, state) => InboxPage(inbox: widget.inbox),
      ),
      GoRoute(
        path: '/c/:id',
        builder: (context, state) => Scaffold(
          appBar: AppBar(title: state.extra is String ? Text(state.extra! as String) : null),
          body: ConversationView(inbox: widget.inbox, conversationId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => SettingsPage(
          auth: widget.auth,
          inbox: widget.inbox,
          push: widget.push,
          onDeleted: () => _router.go('/login'),
        ),
      ),
    ],
  );

  @override
  void initState() {
    super.initState();
    _refresh.addListener(_restorePush);
    _restorePush();
  }

  /// Con sesión abierta, renueva el registro de avisos si la persona los dejó activos.
  void _restorePush() {
    if (widget.auth.isSignedIn) widget.push?.restore().ignore();
  }

  @override
  void dispose() {
    _refresh.removeListener(_restorePush);
    _router.dispose();
    _refresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StringsScope(
      strings: widget.strings,
      child: MaterialApp.router(
        title: widget.strings.t('appTitle'),
        debugShowCheckedModeBanner: false,
        theme: HilvanaTheme.light(),
        darkTheme: HilvanaTheme.dark(),
        routerConfig: _router,
      ),
    );
  }
}
