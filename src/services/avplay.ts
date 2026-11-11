import type {
  PlaybackSource,
  PlayerAdapter,
  PlayerListener,
} from './player';

/** The subset of the Tizen AVPlay API this adapter uses. */
export interface AvPlayListener {
  onerror?: (error?: unknown) => void;
  onstreamcompleted?: () => void;
  onbufferingstart?: () => void;
  onbufferingcomplete?: () => void;
}

export interface AvPlayApi {
  open(url: string): void;
  close(): void;
  prepareAsync(
    success: () => void,
    error?: (error: unknown) => void
  ): void;
  setDisplayRect(
    left: number,
    top: number,
    width: number,
    height: number
  ): void;
  setListener(listener: AvPlayListener): void;
  getState(): string;
  play(): void;
  pause(): void;
  stop(): void;
}

declare global {
  interface Window {
    webapis?: {
      avplay?: AvPlayApi;
    };
  }
}

const STREAM_ERROR = 'This stream could not be played.';

/**
 * Tizen exposes AVPlay through the `webapis` global provided by the packaged
 * web runtime. The browser build never defines it, so this returns null and
 * `player.ts` falls back to the HTML5 adapter.
 */
export function getAvPlay(): AvPlayApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const avplay = window.webapis && window.webapis.avplay;
  return avplay && typeof avplay.open === 'function' ? avplay : null;
}

function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

/** Compact one-line description of an AVPlay event/error, for the debug log. */
function describeAvPlayEvent(event: unknown): string {
  if (event && typeof event === 'object') {
    const record = event as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ['name', 'type', 'code', 'message'] as const) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') {
        parts.push(`${key}=${String(value)}`);
      }
    }
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  return String(event);
}

/** Logs a stream URL without the embedded Xtream credentials. */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(
      /\/live\/[^/]+\/[^/]+\//,
      '/live/***/***/'
    )}`;
  } catch {
    return '<invalid url>';
  }
}

export class AvPlayAdapter implements PlayerAdapter {
  readonly engine = 'avplay';

  private readonly avplay: AvPlayApi;
  private listener: PlayerListener | null = null;
  private closed = false;
  private failed = false;
  /** True once prepareAsync has settled (success or failure). */
  private prepareSettled = false;

  constructor(avplay: AvPlayApi) {
    this.avplay = avplay;
  }

  async open(
    source: PlaybackSource,
    _host: HTMLElement,
    listener: PlayerListener
  ): Promise<void> {
    this.listener = listener;
    this.closed = false;
    this.failed = false;
    this.prepareSettled = false;
    listener.onStateChange('opening');

    const avplay = this.avplay;

    // The player overlay is a fullscreen takeover, so the video rect is the
    // whole screen. Samsung documents setDisplayRect coordinates as
    // 1920x1080-based regardless of the app's own resolution, which makes
    // this constant even on the 960x540 CSS viewport of 2018 models. The
    // host element is only used by the HTML5 engine to mount its <video>.
    const LEFT = 0;
    const TOP = 0;
    const WIDTH = 1920;
    const HEIGHT = 1080;

    console.info(
      `avplay: open ${describeUrl(source.url)} fullscreen ${WIDTH}x${HEIGHT} ` +
        `screen ${screen.width}x${screen.height}`
    );

    try {
      avplay.open(absoluteUrl(source.url));
      avplay.setDisplayRect(LEFT, TOP, WIDTH, HEIGHT);
      avplay.setListener({
        onerror: (error) => {
          console.error(`avplay: onerror ${describeAvPlayEvent(error)}`);
          // 2018 firmware emits a non-fatal error event while the first
          // segments buffer and then recovers; playback continues. Hard
          // prepare failures still surface through prepareAsync's error
          // callback below, so events before it settles are logged only.
          if (!this.prepareSettled) {
            return;
          }
          this.fail(STREAM_ERROR);
        },
        onbufferingstart: () => console.info('avplay: buffering start'),
        onbufferingcomplete: () => console.info('avplay: buffering complete'),
        onstreamcompleted: () => {
          if (!this.closed) {
            this.listener?.onStateChange('paused');
          }
        },
      });

      await new Promise<void>((resolve, reject) => {
        avplay.prepareAsync(
          () => {
            this.prepareSettled = true;
            if (this.closed) {
              resolve();
              return;
            }

            try {
              avplay.play();
              this.listener?.onStateChange('playing');
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          (error) => {
            this.prepareSettled = true;
            console.error(
              `avplay: prepare failed ${describeAvPlayEvent(error)}`
            );
            reject(error);
          }
        );
      });
    } catch {
      this.fail(STREAM_ERROR);
      this.release();
    }
  }

  play(): void {
    if (this.closed || this.state() === 'PLAYING') {
      return;
    }

    try {
      this.avplay.play();
      this.listener?.onStateChange('playing');
    } catch {
      this.fail(STREAM_ERROR);
    }
  }

  pause(): void {
    if (this.closed || this.state() !== 'PLAYING') {
      return;
    }

    try {
      this.avplay.pause();
      this.listener?.onStateChange('paused');
    } catch {
      this.fail(STREAM_ERROR);
    }
  }

  isPlaying(): boolean {
    return this.state() === 'PLAYING';
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.listener = null;
    this.release();
  }

  private state(): string {
    try {
      return this.avplay.getState();
    } catch {
      return 'IDLE';
    }
  }

  private fail(message: string): void {
    if (this.closed || this.failed) {
      return;
    }

    this.failed = true;
    this.listener?.onStateChange('error');
    this.listener?.onError(message);
  }

  private release(): void {
    try {
      // AVPlay has exactly five states: NONE, IDLE, READY, PLAYING, PAUSED.
      // stop() belongs to the prepared states; calling it in IDLE or NONE is
      // at best redundant and at worst throws on 2018 firmware.
      const state = this.state();
      if (state === 'READY' || state === 'PLAYING' || state === 'PAUSED') {
        this.avplay.stop();
      }
    } catch {
      // The native player is already gone.
    }

    try {
      this.avplay.close();
    } catch {
      // Nothing left to release.
    }
  }
}
