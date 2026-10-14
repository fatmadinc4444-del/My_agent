/**
 * Flutter <-> WebView bridge.
 *  Flutter -> JS : window.avatar.cmd({...})   (object or JSON string)
 *  JS -> Flutter : flutter_inappwebview.callHandler('avatar', json)
 * Also works inside an <iframe> (postMessage) and in a plain browser (console).
 */

export type Command =
  | { type: 'state'; value: 'idle' | 'listening' | 'thinking' | 'speaking' }
  | { type: 'action'; name: string }
  | { type: 'speak'; id: string; text: string; lang?: string; audio?: string; visemes?: { t: number; v: number }[]; rate?: number }
  | { type: 'speechWord'; id: string; charStart: number; charEnd?: number }
  | { type: 'speechEnd'; id: string }
  | { type: 'stopSpeaking' }
  | { type: 'emotion'; value: 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking'; intensity?: number }
  | { type: 'lookAt'; target: 'camera' | 'phone' | 'window' | 'cat' }
  | { type: 'micLevel'; value: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'quality'; value: 'auto' | 'low' | 'medium' | 'high' };

declare global {
  interface Window {
    avatar: { cmd(c: Command | string): void; version: string };
    flutter_inappwebview?: { callHandler(name: string, ...args: unknown[]): Promise<unknown> };
  }
}

export class Bridge {
  private queue: Command[] = [];
  private handler: ((c: Command) => void) | null = null;

  constructor() {
    window.avatar = {
      version: '1.0.0',
      cmd: (c) => {
        let parsed: Command;
        try {
          parsed = typeof c === 'string' ? JSON.parse(c) : c;
        } catch (e) {
          console.warn('bad command', c, e);
          return;
        }
        if (this.handler) this.handler(parsed);
        else this.queue.push(parsed);
      },
    };
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && 'type' in e.data) window.avatar.cmd(e.data as Command);
    });
  }

  onCommand(h: (c: Command) => void) {
    this.handler = h;
    for (const c of this.queue.splice(0)) h(c);
  }

  emit(event: string, data: Record<string, unknown> = {}) {
    const payload = JSON.stringify({ event, ...data });
    const f = window.flutter_inappwebview;
    if (f?.callHandler) f.callHandler('avatar', payload).catch(() => {});
    else if (window.parent !== window) window.parent.postMessage({ event, ...data }, '*');
    window.dispatchEvent(new CustomEvent('avatar-event', { detail: { event, ...data } }));
  }
}
