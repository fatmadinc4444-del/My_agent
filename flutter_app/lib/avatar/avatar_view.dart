import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'avatar_controller.dart';

/// Hosts the Three.js avatar scene in a WebView.
///
/// The bundle in `assets/avatar/` is served over http from a local server
/// (file:// breaks module loading and WebGL texture CORS rules). The WebView
/// is created exactly once per [State]; fade-in and error UI wrap it without
/// rebuilding it.
class AvatarView extends StatefulWidget {
  const AvatarView({super.key, required this.controller});

  final AvatarController controller;

  static const int port = 8723;
  static const String documentRoot = 'assets/avatar';
  static final WebUri url = WebUri('http://localhost:$port/index.html');
  static const Color background = Color(0xFF0D0B1A);

  static Future<void>? _serverStart;
  static InAppLocalhostServer? _server;

  /// Starts the local asset server once per process.
  static Future<void> ensureServer() {
    return _serverStart ??= _startServer();
  }

  static Future<void> _startServer() async {
    final server = InAppLocalhostServer(
      documentRoot: documentRoot,
      port: port,
      shared: true,
    );
    try {
      await server.start().timeout(const Duration(seconds: 5));
      _server = server;
    } catch (_) {
      _serverStart = null;
      rethrow;
    }
  }

  /// Stops the local server (mainly for tests and hot restarts).
  static Future<void> stopServer() async {
    await _server?.close();
    _server = null;
    _serverStart = null;
  }

  @override
  State<AvatarView> createState() => _AvatarViewState();
}

class _AvatarViewState extends State<AvatarView> with WidgetsBindingObserver {
  static final InAppWebViewSettings _settings = InAppWebViewSettings(
    javaScriptEnabled: true,
    mediaPlaybackRequiresUserGesture: false,
    allowsInlineMediaPlayback: true,
    transparentBackground: false,
    supportZoom: false,
    builtInZoomControls: false,
    displayZoomControls: false,
    disableVerticalScroll: true,
    disableHorizontalScroll: true,
    verticalScrollBarEnabled: false,
    horizontalScrollBarEnabled: false,
    overScrollMode: OverScrollMode.NEVER,
    disallowOverScroll: true,
    disableContextMenu: true,
    allowsLinkPreview: false,
    allowsBackForwardNavigationGestures: false,
    useHybridComposition: true,
    hardwareAcceleration: true,
    underPageBackgroundColor: AvatarView.background,
    isInspectable: kDebugMode,
  );

  StreamSubscription<AvatarEvent>? _sub;
  InAppWebViewController? _web;
  Widget? _webView;
  bool _ready = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _sub = widget.controller.events.listen((event) {
      if (event is AvatarReady && mounted && !_ready) {
        setState(() => _ready = true);
      }
    });
    _boot();
  }

  Future<void> _boot() async {
    try {
      await AvatarView.ensureServer();
    } catch (_) {
      if (mounted) setState(() => _failed = true);
      return;
    }
    if (!mounted) return;
    setState(() {
      _failed = false;
      _webView = _buildWebView();
    });
  }

  Widget _buildWebView() {
    return InAppWebView(
      initialUrlRequest: URLRequest(url: AvatarView.url),
      initialSettings: _settings,
      onWebViewCreated: (web) {
        _web = web;
        web.addJavaScriptHandler(
          handlerName: 'avatar',
          callback: (args) {
            if (args.isNotEmpty) widget.controller.handleMessage(args.first);
            return null;
          },
        );
        widget.controller.attachExecutor((js) async {
          await web.evaluateJavascript(source: js);
        });
      },
      onLoadStart: (web, url) => widget.controller.reset(),
      onReceivedError: (web, request, error) {
        if (request.isForMainFrame ?? false) {
          if (mounted) setState(() => _failed = true);
        }
      },
      onRenderProcessGone: (web, detail) => web.reload(),
      onWebContentProcessDidTerminate: (web) => web.reload(),
    );
  }

  Future<void> _retry() async {
    setState(() => _failed = false);
    if (_web != null) {
      await _web!.loadUrl(urlRequest: URLRequest(url: AvatarView.url));
    } else {
      await _boot();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
        widget.controller.pause();
      case AppLifecycleState.resumed:
        widget.controller.resume();
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    widget.controller.detachExecutor();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AvatarView.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (!_ready && !_failed)
            const Center(
              child: SizedBox.square(
                dimension: 32,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            ),
          if (_webView != null)
            RepaintBoundary(
              child: AnimatedOpacity(
                opacity: _ready ? 1 : 0,
                duration: const Duration(milliseconds: 400),
                curve: Curves.easeOut,
                child: _webView,
              ),
            ),
          if (_failed && !_ready) _LoadError(onRetry: _retry),
        ],
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Karakter yüklenemedi'),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Tekrar dene')),
        ],
      ),
    );
  }
}
