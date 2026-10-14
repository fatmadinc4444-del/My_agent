import '../avatar/avatar_controller.dart';

/// Who said a line in the conversation.
enum Speaker { user, bot }

/// One line of the conversation history.
class Turn {
  const Turn(this.speaker, this.text);

  final Speaker speaker;
  final String text;
}

/// What the character should say and do next.
class BotReply {
  const BotReply({
    required this.text,
    this.emotion,
    this.action,
    this.audioBase64,
    this.visemes,
  });

  /// Text shown in the UI and spoken.
  final String text;

  /// An [AvatarEmotion] wire name (happy, sad, ...), or null to keep the mood.
  final String? emotion;

  /// An [AvatarAction] wire name (playGuitar, callCat, ...), or null.
  final String? action;

  /// Optional pre-rendered speech (base64 wav/mp3 or an http url). When set,
  /// the web scene plays it itself and the native TTS is skipped.
  final String? audioBase64;

  /// Optional lip-sync keyframes that go with [audioBase64].
  final List<Viseme>? visemes;
}

/// Produces the character's replies.
///
/// Implement this to plug in a real brain. A typical production backend sends
/// [userText] and [history] to an LLM server, then asks a TTS service for the
/// spoken audio (for example Azure Speech with viseme events enabled), and
/// returns it as a [BotReply] with [BotReply.audioBase64] and
/// [BotReply.visemes] filled in so the web scene can play the voice and sync
/// the lips precisely. Backends that only return text make the app fall back
/// to the device TTS.
abstract class ConversationBackend {
  Future<BotReply> reply(String userText, List<Turn> history);
}

/// Offline backend with a few canned Turkish practice dialogs.
class DemoBackend implements ConversationBackend {
  DemoBackend({this.delay = const Duration(milliseconds: 700)});

  /// Simulated thinking time.
  final Duration delay;

  static const String greeting =
      'Merhaba! Ben senin konuşma arkadaşınım. Bugün nasılsın?';

  static const List<BotReply> _generic = [
    BotReply(
      text: 'Anladım, çok güzel. Peki bugün neler yaptın?',
      emotion: 'happy',
    ),
    BotReply(
      text: 'Vay canına, ilginç! Biraz daha anlatır mısın?',
      emotion: 'surprised',
    ),
    BotReply(
      text: 'Hmm, düşünmem lazım. Hafta sonu için planın var mı?',
      emotion: 'thinking',
    ),
    BotReply(
      text: 'Harika konuşuyorsun! Şimdi en sevdiğin yemeği anlat bana.',
      emotion: 'happy',
    ),
  ];

  int _genericIndex = 0;

  /// Maps keywords in a (lower-cased, Turkish aware) sentence to a scene
  /// action reply. Returns null when no keyword matches.
  static BotReply? keywordReply(String userText) {
    final t = turkishLower(userText);
    if (t.contains('gitar')) {
      return const BotReply(
        text: 'Gitar mı dedin? Hemen bir şarkı çalayım!',
        emotion: 'happy',
        action: 'playGuitar',
      );
    }
    if (t.contains('kedi')) {
      return const BotReply(
        text: 'Kedimizi çağırıyorum! Gel bakalım minnoş.',
        emotion: 'happy',
        action: 'callCat',
      );
    }
    if (t.contains('pencere')) {
      return const BotReply(
        text: 'Biraz temiz hava iyi gelir, pencereyi açıyorum.',
        emotion: 'neutral',
        action: 'openWindow',
      );
    }
    if (t.contains('telefon')) {
      return const BotReply(
        text: 'Telefon çalıyor galiba, bir bakayım.',
        emotion: 'surprised',
        action: 'pickPhone',
      );
    }
    return null;
  }

  /// Lower-cases Turkish text correctly (I -> ı, İ -> i).
  static String turkishLower(String s) =>
      s.replaceAll('İ', 'i').replaceAll('I', 'ı').toLowerCase();

  @override
  Future<BotReply> reply(String userText, List<Turn> history) async {
    await Future<void>.delayed(delay);
    final keyword = keywordReply(userText);
    if (keyword != null) return keyword;

    final t = turkishLower(userText);
    if (t.contains('merhaba') || t.contains('selam')) {
      return const BotReply(
        text: 'Merhaba! Seni gördüğüme sevindim. Bugün nasılsın?',
        emotion: 'happy',
        action: 'wave',
      );
    }
    if (t.contains('iyi') || t.contains('güzel') || t.contains('harika')) {
      return const BotReply(
        text: 'Buna sevindim! Günün nasıl geçti, anlatır mısın?',
        emotion: 'happy',
      );
    }
    if (t.contains('kötü') || t.contains('yorgun') || t.contains('üzgün')) {
      return const BotReply(
        text: 'Üzüldüm. İstersen biraz gerinelim, sonra konuşuruz.',
        emotion: 'sad',
        action: 'stretch',
      );
    }
    final reply = _generic[_genericIndex % _generic.length];
    _genericIndex++;
    return reply;
  }
}
