import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'config.dart';
import 'data/repositories.dart';

/// Avisos push con Firebase Cloud Messaging. Es opcional: sin configuración de Firebase no hace nada.
/// En iOS, FCM entrega por APNs; el permiso se pide solo cuando la persona activa los avisos.
class PushService {
  PushService(this._config, this._inbox);

  final FirebaseConfig? _config;
  final InboxRepository _inbox;
  bool _ready = false;

  bool get available => _config != null && !kIsWeb;

  Future<bool> enable() async {
    final config = _config;
    if (config == null || kIsWeb) return false;
    if (!_ready) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: config.apiKey,
          appId: config.appId,
          messagingSenderId: config.senderId,
          projectId: config.projectId,
        ),
      );
      _ready = true;
    }
    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return false;
    final token = await messaging.getToken();
    if (token == null) return false;
    final platform = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
    await _inbox.registerDeviceToken(token, platform);
    messaging.onTokenRefresh.listen((fresh) => _inbox.registerDeviceToken(fresh, platform));
    return true;
  }
}
