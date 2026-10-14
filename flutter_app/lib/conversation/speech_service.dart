import 'dart:async';

import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Wraps on-device text-to-speech and speech recognition (Turkish).
class SpeechService {
  SpeechService({FlutterTts? tts, SpeechToText? stt})
    : _tts = tts ?? FlutterTts(),
      _stt = stt ?? SpeechToText();

  static const String ttsLocale = 'tr-TR';
  static const String sttLocale = 'tr_TR';

  final FlutterTts _tts;
  final SpeechToText _stt;

  bool _ttsReady = false;
  bool _sttReady = false;
  void Function(String message)? _onSttError;
  void Function()? _onSttDone;

  bool get isListening => _stt.isListening;

  /// Maps a speech_to_text sound level to 0..1. Android reports roughly
  /// -2..10 dB, iOS can report larger negative/positive values; the range is
  /// clamped to [minDb]..[maxDb].
  static double normalizeLevel(
    double db, {
    double minDb = -2,
    double maxDb = 10,
  }) {
    final n = (db - minDb) / (maxDb - minDb);
    return n.clamp(0.0, 1.0);
  }

  Future<void> _initTts() async {
    if (_ttsReady) return;
    await _tts.setLanguage(ttsLocale);
    await _tts.setSpeechRate(0.5);
    await _tts.setPitch(1.0);
    await _tts.awaitSpeakCompletion(true);
    _ttsReady = true;
  }

  /// Speaks [text] and completes when the audio has finished (or was
  /// stopped). [onWord] receives character offsets into [text] for each word
  /// as it is spoken.
  Future<void> speak(
    String text, {
    void Function(int charStart, int charEnd)? onWord,
  }) async {
    await _initTts();
    _tts.setProgressHandler((String spoken, int start, int end, String word) {
      onWord?.call(start, end);
    });
    await _tts.speak(text);
  }

  Future<void> stopSpeaking() async {
    if (!_ttsReady) return;
    await _tts.stop();
  }

  /// Initialises speech recognition (asks for permission on first use).
  /// Returns false when unavailable or permission was denied.
  Future<bool> initListening() async {
    if (_sttReady) return true;
    _sttReady = await _stt.initialize(
      onError: (e) => _onSttError?.call(e.errorMsg),
      onStatus: (s) {
        if (s == SpeechToText.doneStatus) _onSttDone?.call();
      },
    );
    return _sttReady;
  }

  /// Starts a recognition session.
  ///
  /// [onResult] gets partial transcripts (`isFinal == false`) and finally the
  /// full sentence (`isFinal == true`). [onLevel] gets 0..1 values at the
  /// rate the platform reports them. [onDone] fires when the session ends;
  /// [onError] with an error message.
  Future<bool> startListening({
    required void Function(String words, bool isFinal) onResult,
    required void Function(double level) onLevel,
    void Function()? onDone,
    void Function(String message)? onError,
  }) async {
    if (!await initListening()) return false;
    _onSttError = onError;
    _onSttDone = onDone;
    await _stt.listen(
      onResult: (r) => onResult(r.recognizedWords, r.finalResult),
      onSoundLevelChange: (db) => onLevel(normalizeLevel(db)),
      listenOptions: SpeechListenOptions(
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 3),
        localeId: sttLocale,
        partialResults: true,
        listenMode: ListenMode.dictation,
        cancelOnError: true,
      ),
    );
    return true;
  }

  /// Stops listening and lets the recognizer deliver the final result.
  Future<void> stopListening() => _stt.stop();

  Future<void> cancelListening() => _stt.cancel();

  Future<void> dispose() async {
    await _tts.stop();
    await _stt.cancel();
  }
}
