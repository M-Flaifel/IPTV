import type {
  PlaybackSource,
  PlayerAdapter,
  PlayerListener,
} from './player';

/** The subset of the Tizen AVPlay API this adapter uses. */
export interface AvPlayListener {
  onerror?: () => void;
  onstreamcompleted?: () => void;
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

export class AvPlayAdapter implements PlayerAdapter {
  readonly engine = 'avplay';

  private readonly avplay: AvPlayApi;
  private listener: PlayerListener | null = null;
  private closed = false;
  private failed = false;

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
    listener.onStateChange('opening');

    const avplay = this.avplay;
    const rect = host.getBoundingClientRect();

    try {
      avplay.open(absoluteUrl(source.url));
      avplay.setDisplayRect(
        Math.max(0, Math.round(rect.left)),
        Math.max(0, Math.round(rect.top)),
        Math.max(0, Math.round(rect.width)),
        Math.max(0, Math.round(rect.height))
      );
      avplay.setListener({
        onerror: () => this.fail(STREAM_ERROR),
        onstreamcompleted: () => {
          if (!this.closed) {
            this.listener?.onStateChange('paused');
          }
        },
      });

      await new Promise<void>((resolve, reject) => {
        avplay.prepareAsync(() => {
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
        }, reject);
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
      const state = this.state();
      if (state !== 'IDLE' && state !== 'STOPPED') {
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
