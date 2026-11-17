import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config.dart';
import 'data/supabase_repositories.dart';
import 'push.dart';
import 'strings.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Intl.defaultLocale = 'es';
  await initializeDateFormatting('es');
  final config = await AppConfig.load();
  await Supabase.initialize(url: config.supabaseUrl, publishableKey: config.supabaseAnonKey);
  final client = Supabase.instance.client;
  final inbox = SupabaseInboxRepository(client, config.telarUrl);
  final strings = await Strings.load(rootBundle);
  runApp(
    HilvanaApp(
      auth: SupabaseAuthRepository(client),
      inbox: inbox,
      strings: strings,
      push: PushService(config.firebase, inbox),
    ),
  );
}
