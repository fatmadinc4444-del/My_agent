import 'dart:async';

import 'package:flutter/foundation.dart';

import '../avatar/avatar_controller.dart';
import 'conversation_backend.dart';
import 'speech_service.dart';

/// What the conversation is doing right now.
enum TalkPhase { idle, listening, thinking, speaking }

/// Orchestrates one conversation: mic -> speech recognition -> backend ->
/// avatar animation + speech output.
///
/// UI listens to this [ChangeNotifier] (coarse state) and to [micLevel]
/// (fine-grained, ~15 Hz) separately so the WebView never has to rebuild.
class TalkSession extends ChangeNotifier {
  TalkSession({
    required this.avatar,
    required this.speech,
    required this.backend,
  }) {
    _readySub = avatar.events.listen(_onAvatarEvent);
  }

  final AvatarController avatar;
  final SpeechService speech;
  final ConversationBackend backend;

  /// Normalised microphone level 0..1 while listening.
  final ValueNotifier<double> micLevel = ValueNotifier<double>(0);

  final List<Turn> _history = [];
  StreamSubscription<AvatarEvent>? _readySub;
  Completer<void>? _webSpeechDone;
  String? _webSpeechId;
  final Stopwatch _levelClock = Stopwatch()..start();

  TalkPhase _phase = TalkPhase.idle;
  String _botText = '';
  String _userText = '';
  String? _notice;
  bool _greeted = false;
  bool _disposed = false;
  int _turn = 0;
  int _speechCounter = 0;

  TalkPhase get phase => _phase;
  String get botText => _botText;
  String get userText => _userText;

  /// Short hint or error shown under the transcript (e.g. mic denied).
  String? get notice => _notice;

  static const Duration _levelInterval = Duration(milliseconds: 66);

  void _onAvatarEvent(AvatarEvent event) {
    if (event is AvatarReady && !_greeted) {
      _greeted = true;
      unawaited(
        _say(
          const BotReply(
            text: DemoBackend.greeting,
            emotion: 'happy',
            action: 'wave',
          ),
        ),
      );
    } else if (event is AvatarSpeechEnd && event.id == _webSpeechId) {
      final done = _webSpeechDone;
      if (done != null && !done.isCompleted) done.complete();
    }
  }

  /// Tap-toggle microphone behaviour.
  Future<void> toggleMic() async {
    switch (_phase) {
      case TalkPhase.listening:
        await speech.stopListening();
      case TalkPhase.speaking:
        await interruptSpeech();
        await _startListening();
      case TalkPhase.thinking:
        break;
      case TalkPhase.idle:
        await _startListening();
    }
  }

  Future<void> _startListening() async {
    final turn = ++_turn;
    _userText = '';
    _notice = null;
    final started = await speech.startListening(
      onResult: (words, isFinal) => _onSpeechResult(turn, words, isFinal),
      onLevel: (level) => _onLevel(turn, level),
      onDone: () => _onListenDone(turn),
      onError: (message) => _onListenError(turn, message),
    );
    if (_disposed || turn != _turn) return;
    if (!started) {
      _notice =
          'Mikrofon veya konuşma tanıma kullanılamıyor. İzinleri kontrol et.';
      _setPhase(TalkPhase.idle);
      return;
    }
    _setPhase(TalkPhase.listening);
    avatar.setState(AvatarState.listening);
    avatar.lookAt(AvatarLookTarget.camera);
  }

  void _onLevel(int turn, double level) {
    if (turn != _turn || _phase != TalkPhase.listening) return;
    if (_levelClock.elapsed < _levelInterval) return;
    _levelClock.reset();
    micLevel.value = level;
    avatar.micLevel(level);
  }

  void _onSpeechResult(int turn, String words, bool isFinal) {
    if (_disposed || turn != _turn || _phase != TalkPhase.listening) return;
    _userText = words;
    if (isFinal) {
      _finishListening(turn, words);
    } else {
      notifyListeners();
    }
  }

  void _onListenDone(int turn) {
    if (_disposed || turn != _turn || _phase != TalkPhase.listening) return;
    // Recognition ended without a final result: use what we heard, if any.
    _finishListening(turn, _userText);
  }

  void _onListenError(int turn, String message) {
    if (_disposed || turn != _turn || _phase != TalkPhase.listening) return;
    _turn++;
    _notice = 'Seni duyamadım, tekrar dener misin?';
    _toIdle();
  }

  void _finishListening(int turn, String words) {
    final text = words.trim();
    _turn++;
    micLevel.value = 0;
    if (text.isEmpty) {
      _notice = 'Seni duyamadım, tekrar dener misin?';
      _toIdle();
      return;
    }
    unawaited(_respond(text));
  }

  Future<void> _respond(String text) async {
    final turn = _turn;
    _userText = text;
    _history.add(Turn(Speaker.user, text));
    _setPhase(TalkPhase.thinking);
    avatar.setState(AvatarState.thinking);
    avatar.emotion(AvatarEmotion.thinking, intensity: 0.7);
    BotReply reply;
    try {
      reply = await backend.reply(text, List.unmodifiable(_history));
    } catch (_) {
      reply = const BotReply(
        text: 'Bir sorun oldu, tekrar dener misin?',
        emotion: 'sad',
      );
    }
    if (_disposed || turn != _turn) return;
    await _say(reply);
  }

  /// Applies [reply] to the avatar and speaks it, via the web scene when it
  /// carries audio, otherwise through the device TTS.
  Future<void> _say(BotReply reply) async {
    final turn = ++_turn;
    final id = 'sp-${++_speechCounter}';
    _botText = reply.text;
    _history.add(Turn(Speaker.bot, reply.text));
    _setPhase(TalkPhase.speaking);

    final emotion = AvatarEmotion.fromWire(reply.emotion);
    if (emotion != null) avatar.emotion(emotion);
    final action = AvatarAction.fromWire(reply.action);
    if (action != null) avatar.action(action);
    avatar.setState(AvatarState.speaking);

    final audio = reply.audioBase64;
    if (audio != null) {
      final done = Completer<void>();
      _webSpeechDone = done;
      _webSpeechId = id;
      avatar.speak(
        id: id,
        text: reply.text,
        audio: audio,
        visemes: reply.visemes,
      );
      await done.future.timeout(const Duration(minutes: 2), onTimeout: () {});
      _webSpeechDone = null;
      _webSpeechId = null;
    } else {
      avatar.speak(id: id, text: reply.text);
      try {
        await speech.speak(
          reply.text,
          onWord: (start, end) =>
              avatar.speechWord(id: id, charStart: start, charEnd: end),
        );
      } catch (_) {
        // Device TTS failed; the scene still finishes via its own timing.
      }
      if (turn == _turn) avatar.speechEnd(id);
    }
    if (_disposed || turn != _turn) return;
    _toIdle();
  }

  /// Stops the character mid-sentence.
  Future<void> interruptSpeech() async {
    if (_phase != TalkPhase.speaking) return;
    _turn++;
    final done = _webSpeechDone;
    if (done != null && !done.isCompleted) done.complete();
    avatar.stopSpeaking();
    await speech.stopSpeaking();
    _toIdle();
  }

  void _toIdle() {
    micLevel.value = 0;
    avatar.setState(AvatarState.idle);
    avatar.emotion(AvatarEmotion.neutral, intensity: 0.5);
    _setPhase(TalkPhase.idle);
  }

  void _setPhase(TalkPhase phase) {
    _phase = phase;
    if (!_disposed) notifyListeners();
  }

  /// Plays a scene action directly (demo chips).
  void playAction(AvatarAction action) => avatar.action(action);

  @override
  void dispose() {
    _disposed = true;
    _readySub?.cancel();
    micLevel.dispose();
    unawaited(speech.dispose());
    super.dispose();
  }
}
