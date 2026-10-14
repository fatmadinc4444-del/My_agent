import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:konusma_arkadasi/avatar/avatar_controller.dart';

const _prefix = 'window.avatar && window.avatar.cmd(';

/// Extracts and decodes the command object from a generated script.
Map<String, dynamic> _decode(String js) {
  expect(js, startsWith(_prefix));
  expect(js, endsWith(')'));
  final json = js.substring(_prefix.length, js.length - 1);
  return jsonDecode(json) as Map<String, dynamic>;
}

void main() {
  late List<String> sent;
  late AvatarController controller;

  setUp(() {
    sent = [];
    controller = AvatarController(executor: (js) async => sent.add(js));
  });

  tearDown(() => controller.dispose());

  test('queues commands before ready and flushes them in order', () {
    controller.setState(AvatarState.listening);
    controller.action(AvatarAction.wave);
    controller.emotion(AvatarEmotion.happy, intensity: 0.5);
    expect(sent, isEmpty);
    expect(controller.pendingCount, 3);

    controller.handleMessage('{"event":"ready"}');

    expect(controller.isReady, isTrue);
    expect(controller.pendingCount, 0);
    expect(sent.map(_decode).toList(), [
      {'type': 'state', 'value': 'listening'},
      {'type': 'action', 'name': 'wave'},
      {'type': 'emotion', 'value': 'happy', 'intensity': 0.5},
    ]);

    controller.stopSpeaking();
    expect(sent, hasLength(4));
    expect(_decode(sent.last), {'type': 'stopSpeaking'});
  });

  test('accepts an already decoded map as ready payload', () {
    controller.pause();
    controller.handleMessage({'event': 'ready'});
    expect(sent, hasLength(1));
  });

  test('waits for an executor even when ready', () {
    final late = AvatarController();
    addTearDown(late.dispose);
    late.handleMessage('{"event":"ready"}');
    late.setState(AvatarState.idle);
    expect(late.pendingCount, 1);
    late.attachExecutor((js) async => sent.add(js));
    expect(sent, hasLength(1));
  });

  test('drops micLevel while not ready but keeps other commands', () {
    controller.micLevel(0.4);
    controller.resume();
    expect(controller.pendingCount, 1);
    controller.handleMessage('{"event":"ready"}');
    controller.micLevel(1.7);
    expect(sent.map(_decode).toList(), [
      {'type': 'resume'},
      {'type': 'micLevel', 'value': 1.0},
    ]);
  });

  test('reset queues again until the next ready', () {
    controller.handleMessage('{"event":"ready"}');
    controller.reset();
    controller.pause();
    expect(sent, isEmpty);
    controller.handleMessage('{"event":"ready"}');
    expect(sent, hasLength(1));
  });

  test('queue is bounded and drops the oldest commands', () {
    final small = AvatarController(
      executor: (js) async => sent.add(js),
      maxQueued: 2,
    );
    addTearDown(small.dispose);
    small.action(AvatarAction.wave);
    small.action(AvatarAction.walk);
    small.action(AvatarAction.stretch);
    small.handleMessage({'event': 'ready'});
    expect(sent.map((s) => _decode(s)['name']).toList(), ['walk', 'stretch']);
  });

  test('speak escapes quotes, newlines and Turkish characters', () {
    controller.handleMessage('{"event":"ready"}');
    final ls = String.fromCharCode(0x2028);
    final text =
        'Dedi ki: "Işık ğüzel, şimdi İstanbul\'a gidelim"\n'
        'ikinci satır\t\\ ı ş ğ İ ö ç ü$ls'
        'son';
    controller.speak(
      id: 'abc-1',
      text: text,
      visemes: const [Viseme(t: 0, v: 0), Viseme(t: 120, v: 7)],
    );

    final js = sent.single;
    // No raw line breaks may leak into the script.
    expect(js.contains('\n'), isFalse);
    expect(js.contains(ls), isFalse);
    final cmd = _decode(js);
    expect(cmd['type'], 'speak');
    expect(cmd['id'], 'abc-1');
    expect(cmd['lang'], 'tr');
    expect(cmd['text'], text);
    expect(cmd.containsKey('audio'), isFalse);
    expect(cmd['visemes'], [
      {'t': 0, 'v': 0},
      {'t': 120, 'v': 7},
    ]);
  });

  test('speak includes audio when given', () {
    controller.handleMessage('{"event":"ready"}');
    controller.speak(id: 'x', text: 'Merhaba', audio: 'UklGRg==');
    expect(_decode(sent.single)['audio'], 'UklGRg==');
  });

  test('speechWord and speechEnd payloads', () {
    controller.handleMessage('{"event":"ready"}');
    controller.speechWord(id: 'x', charStart: 3, charEnd: 9);
    controller.speechEnd('x');
    expect(sent.map(_decode).toList(), [
      {'type': 'speechWord', 'id': 'x', 'charStart': 3, 'charEnd': 9},
      {'type': 'speechEnd', 'id': 'x'},
    ]);
  });

  test('lookAt and quality payloads', () {
    controller.handleMessage('{"event":"ready"}');
    controller.lookAt(AvatarLookTarget.cat);
    controller.quality(AvatarQuality.low);
    expect(sent.map(_decode).toList(), [
      {'type': 'lookAt', 'target': 'cat'},
      {'type': 'quality', 'value': 'low'},
    ]);
  });

  test('enum wire names', () {
    expect(AvatarState.values.map((e) => e.wire), [
      'idle',
      'listening',
      'thinking',
      'speaking',
    ]);
    expect(AvatarAction.values.map((e) => e.wire), [
      'openWindow',
      'closeWindow',
      'callCat',
      'pickPhone',
      'putPhone',
      'playGuitar',
      'stopGuitar',
      'wave',
      'stretch',
      'walk',
    ]);
    expect(AvatarEmotion.values.map((e) => e.wire), [
      'neutral',
      'happy',
      'sad',
      'surprised',
      'thinking',
    ]);
    expect(AvatarLookTarget.values.map((e) => e.wire), [
      'camera',
      'phone',
      'window',
      'cat',
    ]);
    expect(AvatarQuality.values.map((e) => e.wire), [
      'auto',
      'low',
      'medium',
      'high',
    ]);
    expect(AvatarAction.fromWire('wave'), AvatarAction.wave);
    expect(AvatarAction.fromWire('nope'), isNull);
  });

  test('parses events from JS', () async {
    final events = <AvatarEvent>[];
    final sub = controller.events.listen(events.add);
    controller.handleMessage('{"event":"actionStart","name":"wave"}');
    controller.handleMessage('{"event":"actionEnd","name":"wave"}');
    controller.handleMessage('{"event":"speechStart","id":"a"}');
    controller.handleMessage('{"event":"speechEnd","id":"a"}');
    controller.handleMessage('{"event":"perf","fps":58.5,"quality":"high"}');
    controller.handleMessage({'event': 'tap', 'target': 'cat'});
    controller.handleMessage('not json');
    controller.handleMessage('{"event":"unknown"}');
    controller.handleMessage(42);
    await Future<void>.delayed(Duration.zero);
    await sub.cancel();

    expect(events, hasLength(6));
    expect((events[0] as AvatarActionStart).name, 'wave');
    expect((events[1] as AvatarActionEnd).name, 'wave');
    expect((events[2] as AvatarSpeechStart).id, 'a');
    expect((events[3] as AvatarSpeechEnd).id, 'a');
    expect((events[4] as AvatarPerf).fps, 58.5);
    expect((events[4] as AvatarPerf).quality, 'high');
    expect((events[5] as AvatarTap).target, 'cat');
  });

  test('executor errors do not break the controller', () async {
    final failing = AvatarController(
      executor: (js) => Future<void>.error(StateError('boom')),
    );
    addTearDown(failing.dispose);
    failing.handleMessage('{"event":"ready"}');
    failing.pause();
    await Future<void>.delayed(Duration.zero);
    expect(failing.isReady, isTrue);
  });
}
