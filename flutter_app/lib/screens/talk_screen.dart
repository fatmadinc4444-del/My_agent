import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../avatar/avatar_controller.dart';
import '../avatar/avatar_view.dart';
import '../conversation/conversation_backend.dart';
import '../conversation/speech_service.dart';
import '../conversation/talk_session.dart';
import '../theme.dart';

/// Avatar on top, conversation controls at the bottom.
class TalkScreen extends StatefulWidget {
  const TalkScreen({super.key, this.backend});

  /// Defaults to the offline [DemoBackend].
  final ConversationBackend? backend;

  @override
  State<TalkScreen> createState() => _TalkScreenState();
}

class _TalkScreenState extends State<TalkScreen> {
  late final AvatarController _avatar = AvatarController();
  late final TalkSession _session = TalkSession(
    avatar: _avatar,
    speech: SpeechService(),
    backend: widget.backend ?? DemoBackend(),
  );

  @override
  void dispose() {
    _session.dispose();
    _avatar.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Palette.night,
        body: Column(
          children: [
            // The avatar never rebuilds: it only depends on the controller.
            Expanded(flex: 13, child: AvatarView(controller: _avatar)),
            Expanded(flex: 7, child: _ControlPanel(session: _session)),
          ],
        ),
      ),
    );
  }
}

class _ControlPanel extends StatelessWidget {
  const _ControlPanel({required this.session});

  final TalkSession session;

  static const _demoActions = <(String, AvatarAction)>[
    ('Pencereyi aç', AvatarAction.openWindow),
    ('Kediyi çağır', AvatarAction.callCat),
    ('Telefon', AvatarAction.pickPhone),
    ('Gitar çal', AvatarAction.playGuitar),
    ('El salla', AvatarAction.wave),
    ('Gerin', AvatarAction.stretch),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Column(
          children: [
            Expanded(child: _Messages(session: session)),
            const SizedBox(height: 8),
            _MicButton(session: session),
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _demoActions.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final (label, action) = _demoActions[i];
                  return ActionChip(
                    label: Text(label),
                    onPressed: () => session.playAction(action),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Messages extends StatelessWidget {
  const _Messages({required this.session});

  final TalkSession session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final dim = Theme.of(context).textTheme.bodyMedium
            ?.copyWith(color: Palette.textDim);
        return SingleChildScrollView(
          reverse: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (session.botText.isNotEmpty) _BotBubble(text: session.botText),
              if (session.userText.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    session.userText,
                    textAlign: TextAlign.right,
                    style: dim?.copyWith(fontStyle: FontStyle.italic),
                  ),
                ),
              if (session.notice != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    session.notice!,
                    textAlign: TextAlign.center,
                    style: dim?.copyWith(color: Palette.rose),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _BotBubble extends StatelessWidget {
  const _BotBubble({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Palette.surface,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomRight: Radius.circular(20),
            bottomLeft: Radius.circular(4),
          ),
        ),
        child: Text(
          text,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.3),
        ),
      ),
    );
  }
}

class _MicButton extends StatelessWidget {
  const _MicButton({required this.session});

  final TalkSession session;

  static const double _size = 64;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final phase = session.phase;
        final (icon, color, label) = switch (phase) {
          TalkPhase.idle => (
            Icons.mic_rounded,
            Palette.violet,
            'Konuşmak için dokun',
          ),
          TalkPhase.listening => (
            Icons.stop_rounded,
            Palette.rose,
            'Dinliyorum...',
          ),
          TalkPhase.thinking => (
            Icons.more_horiz_rounded,
            Palette.surfaceHigh,
            'Düşünüyorum...',
          ),
          TalkPhase.speaking => (
            Icons.volume_up_rounded,
            Palette.mint,
            'Susturmak için dokun',
          ),
        };
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: _size + 28,
              height: _size + 28,
              child: Center(
                child: ValueListenableBuilder<double>(
                  valueListenable: session.micLevel,
                  builder: (context, level, child) {
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 90),
                      width: _size + 28 * level,
                      height: _size + 28 * level,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: color.withValues(alpha: 0.18 + 0.2 * level),
                      ),
                      child: child,
                    );
                  },
                  child: Center(
                    child: Semantics(
                      button: true,
                      label: label,
                      child: Material(
                        color: color,
                        shape: const CircleBorder(),
                        elevation: 4,
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: session.toggleMic,
                          child: SizedBox.square(
                            dimension: _size,
                            child: Icon(icon, size: 32, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Text(
              label,
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: Palette.textDim),
            ),
          ],
        );
      },
    );
  }
}
