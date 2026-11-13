import { createPlayerAdapter, hasAvPlay } from './player';
import type {
  PlaybackProgress,
  PlaybackSource,
  PlayerAdapter,
  PlayerEngine,
  PlayerState,
} from './player';

/**
 * One playback session for the whole app.
 *
 * AVPlay is a single global instance and the mini preview has to become
 * fullscreen without reloading the stream, so both views drive the same
 * adapter. The session owns that adapter: `open()` reuses it when the URL is
 * unchanged, and only the owner of the preview lifecycle calls `close()`.
 */

export interface PlayerSessionListener {
  onStateChange: (state: PlayerState) => void;
  onError: (message: string) => void;
}

class PlayerSession {
  private adapter: PlayerAdapter | null = null;
  private source: PlaybackSource | null = null;

  get engine(): PlayerEngine {
    return this.adapter ? this.adapter.engine : hasAvPlay() ? 'avplay' : 'html5';
  }

  /** The stream currently assigned to the adapter, if any. */
  get currentSource(): PlaybackSource | null {
    return this.source;
  }

  get hasSource(): boolean {
    return this.source !== null;
  }

  /**
   * Start `source` in `host`, or keep the existing stream when the URL is the
   * same. Re-targeting the surface is enough for mini → fullscreen.
   */
  async open(
    source: PlaybackSource,
    host: HTMLElement,
    listener: PlayerSessionListener
  ): Promise<void> {
    if (this.adapter && this.source && this.source.url === source.url) {
      this.adapter.setSurface(host);

      if (!this.adapter.isPlaying()) {
        this.adapter.play();
      }

      listener.onStateChange(this.adapter.isPlaying() ? 'playing' : 'paused');
      return;
    }

    this.releaseAdapter();

    const adapter = createPlayerAdapter();
    this.adapter = adapter;
    this.source = source;

    await adapter.open(source, host, listener);
  }

  /** Move the rendering surface without touching playback. */
  setSurface(host: HTMLElement | null): void {
    this.adapter?.setSurface(host);
  }

  play(): void {
    this.adapter?.play();
  }

  pause(): void {
    this.adapter?.pause();
  }

  isPlaying(): boolean {
    return this.adapter ? this.adapter.isPlaying() : false;
  }

  getProgress(): PlaybackProgress | null {
    return this.adapter ? this.adapter.getProgress() : null;
  }

  seekTo(seconds: number): void {
    this.adapter?.seekTo(seconds);
  }

  /** Stop playback and drop the stream; safe to call repeatedly. */
  close(): void {
    this.releaseAdapter();
    this.source = null;
  }

  private releaseAdapter(): void {
    const adapter = this.adapter;
    this.adapter = null;

    if (adapter) {
      adapter.close();
    }
  }
}

export const playerSession = new PlayerSession();
