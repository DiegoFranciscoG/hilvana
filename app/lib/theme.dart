import 'package:flutter/material.dart';

/// Paleta de taller: lino crudo, tinta índigo e hilo terracota (sin degradados ni brillos).
/// El hilo (#B5502B) sobre lino tiene contraste 4,3:1: se usa en acentos, íconos y texto grande;
/// el texto normal va en tinta (contraste > 11:1).
class HilvanaColors {
  static const lino = Color(0xFFF2ECE1);
  static const papel = Color(0xFFFBF8F3);
  static const tinta = Color(0xFF1E2B45);
  static const tintaSuave = Color(0xFF4A5468);
  static const hilo = Color(0xFFB5502B);
  static const hiloClaro = Color(0xFFD9825F);
  static const hilvan = Color(0xFFE3D7C3);
  static const error = Color(0xFF9F2A1F);
}

class HilvanaTheme {
  static const brandFont = 'Fraunces';
  static const textFont = 'IBM Plex Sans';

  static TextTheme _text(Color color) {
    TextStyle brand(double size, double weight) => TextStyle(
          fontFamily: brandFont,
          fontSize: size,
          height: 1.15,
          color: color,
          fontWeight: weight >= 600 ? FontWeight.w600 : FontWeight.w400,
          fontVariations: [FontVariation('wght', weight), const FontVariation('opsz', 48)],
        );
    TextStyle body(double size, double weight) => TextStyle(
          fontFamily: textFont,
          fontSize: size,
          height: 1.4,
          color: color,
          fontWeight: weight >= 600 ? FontWeight.w600 : weight >= 500 ? FontWeight.w500 : FontWeight.w400,
          fontVariations: [FontVariation('wght', weight)],
        );
    return TextTheme(
      displaySmall: brand(34, 560),
      headlineMedium: brand(28, 560),
      headlineSmall: brand(24, 540),
      titleLarge: brand(20, 600),
      titleMedium: body(16, 600),
      titleSmall: body(14, 600),
      bodyLarge: body(16, 400),
      bodyMedium: body(14, 400),
      bodySmall: body(12.5, 400),
      labelLarge: body(14, 600),
      labelMedium: body(12.5, 500),
      labelSmall: body(11.5, 500),
    );
  }

  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: HilvanaColors.tinta,
      onPrimary: HilvanaColors.lino,
      secondary: HilvanaColors.hilo,
      onSecondary: Colors.white,
      tertiary: HilvanaColors.tintaSuave,
      onTertiary: Colors.white,
      error: HilvanaColors.error,
      onError: Colors.white,
      surface: HilvanaColors.papel,
      onSurface: HilvanaColors.tinta,
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: HilvanaColors.papel,
      surfaceContainer: HilvanaColors.lino,
      surfaceContainerHigh: HilvanaColors.hilvan,
      outline: HilvanaColors.tintaSuave,
      outlineVariant: HilvanaColors.hilvan,
    );
    return _base(scheme);
  }

  static ThemeData dark() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: HilvanaColors.lino,
      onPrimary: HilvanaColors.tinta,
      secondary: HilvanaColors.hiloClaro,
      onSecondary: HilvanaColors.tinta,
      tertiary: HilvanaColors.hilvan,
      onTertiary: HilvanaColors.tinta,
      error: Color(0xFFE59A90),
      onError: HilvanaColors.tinta,
      surface: Color(0xFF172238),
      onSurface: HilvanaColors.lino,
      surfaceContainerLowest: Color(0xFF111A2C),
      surfaceContainerLow: Color(0xFF1A2640),
      surfaceContainer: HilvanaColors.tinta,
      surfaceContainerHigh: Color(0xFF2A3956),
      outline: HilvanaColors.hilvan,
      outlineVariant: Color(0xFF34446A),
    );
    return _base(scheme);
  }

  static ThemeData _base(ColorScheme scheme) {
    final text = _text(scheme.onSurface);
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      fontFamily: textFont,
      textTheme: text,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: text.titleLarge,
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: text.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          side: BorderSide(color: scheme.outline),
          textStyle: text.labelLarge,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLowest,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: scheme.secondary, width: 2),
        ),
      ),
      chipTheme: ChipThemeData(
        side: BorderSide(color: scheme.outlineVariant),
        labelStyle: text.labelMedium,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: scheme.tertiary,
        titleTextStyle: text.titleMedium,
        subtitleTextStyle: text.bodyMedium?.copyWith(color: scheme.tertiary),
      ),
    );
  }
}
