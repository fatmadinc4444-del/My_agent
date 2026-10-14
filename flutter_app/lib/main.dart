import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'avatar/avatar_view.dart';
import 'screens/talk_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  // Warm up the local asset server so the page loads without delay.
  unawaited(AvatarView.ensureServer().catchError((Object _) {}));
  runApp(const KonusmaApp());
}

class KonusmaApp extends StatelessWidget {
  const KonusmaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Konuşma Arkadaşı',
      debugShowCheckedModeBanner: false,
      theme: buildNightTheme(),
      home: const TalkScreen(),
    );
  }
}
