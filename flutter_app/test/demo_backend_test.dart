import 'package:flutter_test/flutter_test.dart';
import 'package:konusma_arkadasi/avatar/avatar_controller.dart';
import 'package:konusma_arkadasi/conversation/conversation_backend.dart';

void main() {
  final backend = DemoBackend(delay: Duration.zero);

  Future<BotReply> ask(String text) => backend.reply(text, const []);

  test('keywords map to scene actions', () async {
    expect((await ask('Gitar çalar mısın?')).action, 'playGuitar');
    expect((await ask('kedi nerede')).action, 'callCat');
    expect((await ask('Pencereyi açalım mı')).action, 'openWindow');
    expect((await ask('telefonum çaldı')).action, 'pickPhone');
  });

  test('keyword match is case and Turkish-İ insensitive', () async {
    expect((await ask('GİTAR')).action, 'playGuitar');
    expect((await ask('KEDİ')).action, 'callCat');
    expect((await ask('PENCERE')).action, 'openWindow');
    expect((await ask('TELEFON')).action, 'pickPhone');
  });

  test('greetings wave, sad words stretch', () async {
    expect((await ask('Merhaba')).action, 'wave');
    expect((await ask('Biraz yorgunum')).action, 'stretch');
    expect((await ask('Biraz yorgunum')).emotion, 'sad');
  });

  test('other text gets a generic reply without audio', () async {
    final reply = await ask('Bugün hava çok sıcaktı');
    expect(reply.text, isNotEmpty);
    expect(reply.action, isNull);
    expect(reply.audioBase64, isNull);
  });

  test('keywordReply returns null without a match', () {
    expect(DemoBackend.keywordReply('hiçbir şey'), isNull);
  });

  test('every canned action and emotion is a valid wire name', () async {
    final replies = [
      for (final t in [
        'gitar',
        'kedi',
        'pencere',
        'telefon',
        'merhaba',
        'iyi',
        'yorgun',
        'xyz',
        'xyz',
        'xyz',
        'xyz',
      ])
        await ask(t),
    ];
    final actions = AvatarAction.values.map((a) => a.wire).toSet();
    final emotions = AvatarEmotion.values.map((e) => e.wire).toSet();
    for (final r in replies) {
      if (r.action != null) expect(actions, contains(r.action));
      if (r.emotion != null) expect(emotions, contains(r.emotion));
    }
  });
}
