import 'dart:async';
import 'dart:convert';

/// Runs a JavaScript snippet inside the avatar WebView.
typedef JsExecutor = Future<void> Function(String js);

/// High level character state.
enum AvatarState {
  idle('idle'),
  listening('listening'),
  thinking('thinking'),
  speaking('speaking');

  const AvatarState(this.wire);
  final String wire;
}

/// One-shot scene actions the character can perform.
enum AvatarAction {
  openWindow('openWindow'),
  closeWindow('closeWindow'),
  callCat('callCat'),
  pickPhone('pickPhone'),
  putPhone('putPhone'),
  playGuitar('playGuitar'),
  stopGuitar('stopGuitar'),
  wave('wave'),
  stretch('stretch'),
  walk('walk');

  const AvatarAction(this.wire);
  final String wire;

  static AvatarAction? fromWire(String? name) {
    for (final a in values) {
      if (a.wire == name) return a;
    }
    return null;
  }
}

enum AvatarEmotion {
  neutral('neutral'),
  happy('happy'),
  sad('sad'),
  surprised('surprised'),
  thinking('thinking');

  const AvatarEmotion(this.wire);
  final String wire;

  static AvatarEmotion? fromWire(String? name) {
    for (final e in values) {
      if (e.wire == name) return e;
    }
    return null;
  }
}

enum AvatarLookTarget {
  camera('camera'),
  phone('phone'),
  window('window'),
  cat('cat');

  const AvatarLookTarget(this.wire);
  final String wire;
}

enum AvatarQuality {
  auto('auto'),
  low('low'),
  medium('medium'),
  high('high');

  const AvatarQuality(this.wire);
  final String wire;
}

/// A mouth shape keyframe: [t] in milliseconds, [v] is an Azure viseme id.
class Viseme {
  const Viseme({required this.t, required this.v});

  final int t;
  final int v;

  Map<String, Object> toJson() => {'t': t, 'v': v};
}

/// Events sent from the web scene to Flutter.
sealed class AvatarEvent {
  const AvatarEvent();

  /// Parses a decoded JSON map; returns null when it is not a known event.
  static AvatarEvent? fromJson(Map<String, dynamic> json) {
    switch (json['event']) {
      case 'ready':
        return const AvatarReady();
      case 'actionStart':
        return AvatarActionStart('${json['name']}');
      case 'actionEnd':
        return AvatarActionEnd('${json['name']}');
      case 'speechStart':
        return AvatarSpeechStart('${json['id']}');
      case 'speechEnd':
        return AvatarSpeechEnd('${json['id']}');
      case 'perf':
        return AvatarPerf(
          fps: (json['fps'] as num?)?.toDouble() ?? 0,
          quality: '${json['quality'] ?? ''}',
        );
      case 'tap':
        return AvatarTap('${json['target']}');
    }
    return null;
  }
}

class AvatarReady extends AvatarEvent {
  const AvatarReady();
}

class AvatarActionStart extends AvatarEvent {
  const AvatarActionStart(this.name);
  final String name;
}

class AvatarActionEnd extends AvatarEvent {
  const AvatarActionEnd(this.name);
  final String name;
}

class AvatarSpeechStart extends AvatarEvent {
  const AvatarSpeechStart(this.id);
  final String id;
}

class AvatarSpeechEnd extends AvatarEvent {
  const AvatarSpeechEnd(this.id);
  final String id;
}

class AvatarPerf extends AvatarEvent {
  const AvatarPerf({required this.fps, required this.quality});
  final double fps;
  final String quality;
}

/// [target] is one of cat, window, phone, guitar, character.
class AvatarTap extends AvatarEvent {
  const AvatarTap(this.target);
  final String target;
}

/// Typed wrapper around the `window.avatar.cmd(...)` JS bridge.
///
/// Commands issued before the scene reports `ready` (or before an executor is
/// attached) are queued and flushed in order. High-frequency `micLevel`
/// commands are dropped instead of queued, since stale values are useless.
///
/// The class is pure Dart: inject a [JsExecutor] to drive it from a WebView
/// or from a fake in tests.
class AvatarController {
  AvatarController({this._executor, this.maxQueued = 256});

  /// Upper bound for commands buffered while the scene is not ready.
  final int maxQueued;

  JsExecutor? _executor;
  bool _ready = false;
  final List<String> _queue = [];
  final StreamController<AvatarEvent> _events =
      StreamController<AvatarEvent>.broadcast();

  bool get isReady => _ready;

  /// Number of commands waiting for the scene to become ready.
  int get pendingCount => _queue.length;

  Stream<AvatarEvent> get events => _events.stream;

  /// Attaches (or replaces) the JS executor. Flushes the queue if ready.
  void attachExecutor(JsExecutor executor) {
    _executor = executor;
    _flush();
  }

  /// Detaches the executor, e.g. when the WebView is disposed.
  void detachExecutor() {
    _ready = false;
    _executor = null;
  }

  /// Marks the scene as not ready, e.g. when the page reloads. Commands
  /// issued afterwards are queued until the next `ready` event.
  void reset() {
    _ready = false;
  }

  /// Feeds a raw message coming from the `avatar` JS handler. Accepts a JSON
  /// string or an already decoded map.
  void handleMessage(Object? payload) {
    Object? decoded = payload;
    if (payload is String) {
      try {
        decoded = jsonDecode(payload);
      } on FormatException {
        return;
      }
    }
    if (decoded is! Map) return;
    final event = AvatarEvent.fromJson(Map<String, dynamic>.from(decoded));
    if (event == null) return;
    if (event is AvatarReady) {
      _ready = true;
      _flush();
    }
    if (!_events.isClosed) _events.add(event);
  }

  // --- Typed commands -------------------------------------------------------

  void setState(AvatarState state) =>
      send({'type': 'state', 'value': state.wire});

  void action(AvatarAction action) =>
      send({'type': 'action', 'name': action.wire});

  /// Starts a speech. Without [audio] the scene animates the mouth from the
  /// text alone; [audio] may be base64 wav/mp3 or an http url.
  void speak({
    required String id,
    required String text,
    String lang = 'tr',
    String? audio,
    List<Viseme>? visemes,
  }) {
    send({
      'type': 'speak',
      'id': id,
      'text': text,
      'lang': lang,
      'audio': ?audio,
      if (visemes != null) 'visemes': [for (final v in visemes) v.toJson()],
    });
  }

  void speechWord({
    required String id,
    required int charStart,
    required int charEnd,
  }) => send({
    'type': 'speechWord',
    'id': id,
    'charStart': charStart,
    'charEnd': charEnd,
  });

  void speechEnd(String id) => send({'type': 'speechEnd', 'id': id});

  void stopSpeaking() => send({'type': 'stopSpeaking'});

  void emotion(AvatarEmotion emotion, {double intensity = 1}) => send({
    'type': 'emotion',
    'value': emotion.wire,
    'intensity': intensity.clamp(0.0, 1.0),
  });

  void lookAt(AvatarLookTarget target) =>
      send({'type': 'lookAt', 'target': target.wire});

  void micLevel(double value) =>
      send({'type': 'micLevel', 'value': value.clamp(0.0, 1.0)});

  void pause() => send({'type': 'pause'});

  void resume() => send({'type': 'resume'});

  void quality(AvatarQuality quality) =>
      send({'type': 'quality', 'value': quality.wire});

  // --- Plumbing -------------------------------------------------------------

  static final String _lineSep = String.fromCharCode(0x2028);
  static final String _paraSep = String.fromCharCode(0x2029);

  /// Builds the JS snippet for a command object.
  static String buildScript(Map<String, Object?> cmd) {
    // U+2028/2029 are legal in JSON but historically broke JS string literals.
    final json = jsonEncode(cmd)
        .replaceAll(_lineSep, '\\u2028')
        .replaceAll(_paraSep, '\\u2029');
    return 'window.avatar && window.avatar.cmd($json)';
  }

  /// Sends a raw command, queueing it until the scene is ready.
  void send(Map<String, Object?> cmd) {
    final executor = _executor;
    if (_ready && executor != null) {
      _run(executor, buildScript(cmd));
      return;
    }
    if (cmd['type'] == 'micLevel') return;
    if (_queue.length >= maxQueued) _queue.removeAt(0);
    _queue.add(buildScript(cmd));
  }

  void _flush() {
    final executor = _executor;
    if (!_ready || executor == null || _queue.isEmpty) return;
    final pending = List<String>.of(_queue);
    _queue.clear();
    for (final js in pending) {
      _run(executor, js);
    }
  }

  void _run(JsExecutor executor, String js) {
    // Platform channel calls keep their order, so no awaiting between sends.
    unawaited(executor(js).catchError((Object _) {}));
  }

  Future<void> dispose() => _events.close();
}
