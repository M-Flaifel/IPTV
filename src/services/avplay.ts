import type {
  PlaybackProgress,
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
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(
    milliseconds: number,
    successCallback?: () => void,
    errorCallback?: (error: unknown) => void
  ): void;
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
      /\/(live|movie|series)\/[^/]+\/[^/]+\//,
      '/$1/***/***/'
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
  /** The DOM element whose rect the video plane should cover. */
  private host: HTMLElement | null = null;

  constructor(avplay: AvPlayApi) {
    this.avplay = avplay;
  }

  async open(
    source: PlaybackSource,
    host: HTMLElement,
    listener: PlayerListener
  ): Promise<void> {
    this.listener = listener;
    this.closed = false;
    this.failed = false;
    this.prepareSettled = false;
    this.host = host;
    listener.onStateChange('opening');

    const avplay = this.avplay;

    console.info(`avplay: open ${describeUrl(source.url)}`);

    try {
      avplay.open(absoluteUrl(source.url));
      this.applyDisplayRect();
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

  getProgress(): PlaybackProgress | null {
    if (this.closed) {
      return null;
    }

    try {
      const currentMs = Number(this.avplay.getCurrentTime());
      const durationMs = Number(this.avplay.getDuration());

      if (!Number.isFinite(currentMs) || !Number.isFinite(durationMs)) {
        return null;
      }

      const duration = durationMs > 0 ? durationMs / 1000 : 0;
      const current = currentMs > 0 ? currentMs / 1000 : 0;

      return {
        current: duration > 0 ? Math.min(current, duration) : current,
        duration,
        seekable: duration > 0,
      };
    } catch {
      return null;
    }
  }

  seekTo(seconds: number): void {
    if (this.closed) {
      return;
    }

    const state = this.state();
    // seekTo() only belongs to prepared states; IDLE/NONE throw.
    if (state !== 'READY' && state !== 'PLAYING' && state !== 'PAUSED') {
      return;
    }

    const target = Math.max(0, Math.round(seconds * 1000));

    try {
      this.avplay.seekTo(target);
    } catch {
      // Best-effort: the progress poll re-syncs the displayed time.
    }
  }

  /**
   * AVPlay paints below the web layer, so the host element is a transparent
   * hole in the layout: measure it and move the hardware plane there. The
   * fullscreen overlay's stage covers the viewport, and the mini pane covers
   * only its reserved cell.
   */
  setSurface(host: HTMLElement | null): void {
    this.host = host;

    if (!host || this.closed) {
      return;
    }

    this.applyDisplayRect();
  }

  private applyDisplayRect(): void {
    const host = this.host;

    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    // Samsung documents setDisplayRect in a fixed 1920x1080 space regardless
    // of the app's CSS viewport (960x540 on 2018 models).
    const viewportWidth = window.innerWidth || screen.width || 1920;
    const viewportHeight = window.innerHeight || screen.height || 1080;
    const scaleX = 1920 / viewportWidth;
    const scaleY = 1080 / viewportHeight;

    const left = rect.width > 0 ? Math.round(rect.left * scaleX) : 0;
    const top = rect.height > 0 ? Math.round(rect.top * scaleY) : 0;
    const width = rect.width > 0 ? Math.round(rect.width * scaleX) : 1920;
    const height = rect.height > 0 ? Math.round(rect.height * scaleY) : 1080;

    console.info(
      `avplay: display rect ${left},${top} ${width}x${height} ` +
        `screen ${viewportWidth}x${viewportHeight}`
    );

    try {
      this.avplay.setDisplayRect(left, top, width, height);
    } catch {
      // Older firmware rejects a rect while the player is not ready; the next
      // setSurface call (resize or mode change) retries.
    }
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
