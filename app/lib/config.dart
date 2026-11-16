import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Configuración pública de la app. En móvil y escritorio llega con --dart-define; en web se lee de
/// /config.json, que genera la pasarela al arrancar. Nada de esto es secreto: la clave anon es pública
/// por diseño y los permisos reales los imponen RLS y el Telar.
class AppConfig {
  const AppConfig({required this.supabaseUrl, required this.supabaseAnonKey, required this.telarUrl, this.firebase});

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String telarUrl;
  final FirebaseConfig? firebase;

  static const _url = String.fromEnvironment('SUPABASE_URL');
  static const _key = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const _telar = String.fromEnvironment('TELAR_URL');

  static Future<AppConfig> load() async {
    if (_url.isNotEmpty && _key.isNotEmpty && _telar.isNotEmpty) {
      return AppConfig(supabaseUrl: _url, supabaseAnonKey: _key, telarUrl: _telar, firebase: FirebaseConfig.fromEnvironment());
    }
    if (kIsWeb) {
      final response = await http.get(Uri.base.resolve('/config.json'));
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return AppConfig(
          supabaseUrl: json['supabaseUrl'] as String,
          supabaseAnonKey: json['supabaseAnonKey'] as String,
          telarUrl: json['telarUrl'] as String,
        );
      }
    }
    throw StateError('Falta la configuración: usa --dart-define SUPABASE_URL, SUPABASE_ANON_KEY y TELAR_URL');
  }
}

/// Firebase es opcional: sin estos valores la app funciona sin avisos push.
class FirebaseConfig {
  const FirebaseConfig({required this.apiKey, required this.appId, required this.senderId, required this.projectId});

  final String apiKey;
  final String appId;
  final String senderId;
  final String projectId;

  static FirebaseConfig? fromEnvironment() {
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    const appId = String.fromEnvironment('FIREBASE_APP_ID');
    const senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
    const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
    if (apiKey.isEmpty || appId.isEmpty || senderId.isEmpty || projectId.isEmpty) return null;
    return const FirebaseConfig(apiKey: apiKey, appId: appId, senderId: senderId, projectId: projectId);
  }
}
