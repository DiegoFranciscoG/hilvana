import 'dart:convert';

import 'package:flutter/widgets.dart';

/// Textos de la interfaz, cargados desde `assets/l10n/<idioma>.json` (no quemados en el código).
class Strings {
  Strings(this._values);

  final Map<String, String> _values;

  static Future<Strings> load(AssetBundle bundle, [String locale = 'es']) async {
    final raw = await bundle.loadString('assets/l10n/$locale.json');
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    return Strings(decoded.map((key, value) => MapEntry(key, value.toString())));
  }

  String t(String key, [Map<String, Object> args = const {}]) {
    var value = _values[key] ?? key;
    args.forEach((name, arg) => value = value.replaceAll('{$name}', '$arg'));
    return value;
  }

  String waiting(int count) {
    if (count == 0) return t('waitingNone');
    if (count == 1) return t('waitingOne');
    return t('waitingMany', {'count': count});
  }
}

class StringsScope extends InheritedWidget {
  const StringsScope({super.key, required this.strings, required super.child});

  final Strings strings;

  static Strings of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<StringsScope>();
    assert(scope != null, 'StringsScope no encontrado');
    return scope!.strings;
  }

  @override
  bool updateShouldNotify(StringsScope oldWidget) => oldWidget.strings != strings;
}
