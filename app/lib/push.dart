import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'data/repositories.dart';

/// Avisos push con Firebase Cloud Messaging. Es opcional: sin configuración de Firebase no hace nada.
///
/// El dispositivo se registra con su ID de instalación de Firebase (FID), que el Telar usa en el campo
/// `fid` de la API HTTP v1. La inicialización automática de FCM está desactivada (AndroidManifest e
/// Info.plist): nada se registra hasta que la persona activa los avisos, y mientras sigan activos la app
/// vuelve a llamar a `register()` al abrir la bandeja. En iOS, FCM entrega por APNs.
class PushService {
  PushService(this._config, this._inbox);

  static const _enabledKey = 'push_enabled';

  final FirebaseConfig? _config;
  final InboxRepository _inbox;
  StreamSubscription<String>? _registered;
  StreamSubscription<String>? _unregistered;
  Completer<String>? _pending;
  String? _fid;
  bool _restored = false;

  bool get available => _config != null && !kIsWeb;

  String get _platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  Future<bool> isEnabled() async =>
      available && (await SharedPreferences.getInstance()).getBool(_enabledKey) == true;

  /// Una vez por arranque: si los avisos siguen activos y el permiso sigue concedido, renueva el registro.
  Future<void> restore() async {
    if (_restored || !await isEnabled()) return;
    _restored = true;
    final messaging = await _messaging();
    final settings = await messaging.getNotificationSettings();
    final allowed = settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
    if (!allowed || !await _register(messaging)) await _setEnabled(false);
  }

  Future<bool> enable() async {
    if (!available) return false;
    final messaging = await _messaging();
    final settings = await messaging.requestPermission();
    final ok = settings.authorizationStatus != AuthorizationStatus.denied && await _register(messaging);
    await _setEnabled(ok);
    return ok;
  }

  /// Apaga los avisos de este dispositivo: lo quita del servidor y de FCM.
  Future<void> disable() async {
    await _setEnabled(false);
    if (!available || Firebase.apps.isEmpty) return;
    final fid = _fid;
    _fid = null;
    if (fid != null) await _inbox.unregisterDeviceToken(fid);
    await FirebaseMessaging.instance.unregister();
  }

  Future<void> _setEnabled(bool value) async => (await SharedPreferences.getInstance()).setBool(_enabledKey, value);

  Future<FirebaseMessaging> _messaging() async {
    final config = _config!;
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: config.apiKey,
          appId: config.appId,
          messagingSenderId: config.senderId,
          projectId: config.projectId,
        ),
      );
    }
    final messaging = FirebaseMessaging.instance;
    // La guía de FCM pide escuchar antes de llamar a register().
    _registered ??= messaging.onRegistered.listen((fid) {
      final pending = _pending;
      _pending = null;
      if (pending != null) {
        pending.complete(fid);
      } else if (fid != _fid) {
        // FID renovado por FCM: se intenta al momento y, si falla, en el próximo arranque.
        _fid = fid;
        _inbox.registerDeviceToken(fid, _platform).ignore();
      }
    });
    _unregistered ??= messaging.onUnregistered.listen((fid) => _inbox.unregisterDeviceToken(fid).ignore());
    return messaging;
  }

  Future<bool> _register(FirebaseMessaging messaging) async {
    final pending = _pending = Completer<String>();
    try {
      await messaging.register();
      final fid = await pending.future.timeout(const Duration(seconds: 30));
      await _inbox.registerDeviceToken(fid, _platform);
      _fid = fid;
      return true;
    } on Object {
      _pending = null;
      return false;
    }
  }
}
