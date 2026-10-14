import 'package:flutter/material.dart';

/// Night-sky palette: deep indigo surfaces, violet primary, mint accent.
abstract final class Palette {
  static const Color night = Color(0xFF0D0B1A);
  static const Color surface = Color(0xFF1B1737);
  static const Color surfaceHigh = Color(0xFF2A2352);
  static const Color violet = Color(0xFF8B6CFF);
  static const Color mint = Color(0xFF58E6A9);
  static const Color rose = Color(0xFFFF6B8A);
  static const Color textDim = Color(0xFFB7B0DB);
}

ThemeData buildNightTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: Palette.violet,
        brightness: Brightness.dark,
        surface: Palette.night,
      ).copyWith(
        primary: Palette.violet,
        secondary: Palette.mint,
        surfaceContainerHighest: Palette.surfaceHigh,
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.night,
    canvasColor: Palette.night,
    visualDensity: VisualDensity.standard,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Palette.surface,
      side: const BorderSide(color: Palette.surfaceHigh, width: 1.5),
      shape: const StadiumBorder(),
      labelStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}
