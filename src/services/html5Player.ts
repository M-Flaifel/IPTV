import type {
  PlaybackSource,
  PlayerAdapter,
  PlayerListener,
} from './player';

/**
 * Browser fallback: the standard `<video>` element driving the bundled mock
 * MP4. It mirrors the AVPlay adapter so the overlay never knows which engine
 * is active.
 */
export class Html5PlayerAdapter implements PlayerAdapter {
  readonly engine = 'html5';

  private video: HTMLVideoElement | null = null;
  private listener: PlayerListener | null = null;
  private closed = false;

  async open(
    source: PlaybackSource,
    host: HTMLElement,
    listener: PlayerListener
  ): Promise<void> {
    this.listener = listener;
    this.closed = false;
    listener.onStateChange('opening');

    const video = document.createElement('video');
    video.className = 'player__video';
    video.src = source.url;
    video.loop = source.preview;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.addEventListener('playing', this.handlePlaying);
    video.addEventListener('pause', this.handlePause);
    video.addEventListener('error', this.handleError);
    host.appendChild(video);
    this.video = video;

    try {
      await video.play();
    } catch {
      if (!this.closed) {
        listener.onError('Press Play to start the preview.');
      }
    }
  }

  play(): void {
    const video = this.video;
    if (!video || this.closed) {
      return;
    }

    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        if (!this.closed) {
          this.listener?.onError('This preview could not play.');
        }
      });
    }
  }

  pause(): void {
    this.video?.pause();
  }

  isPlaying(): boolean {
    return this.video ? !this.video.paused : false;
  }

  close(): void {
    this.closed = true;
    this.listener = null;

    const video = this.video;
    this.video = null;
    if (!video) {
      return;
    }

    video.removeEventListener('playing', this.handlePlaying);
    video.removeEventListener('pause', this.handlePause);
    video.removeEventListener('error', this.handleError);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  private readonly handlePlaying = () => {
    if (!this.closed) {
      this.listener?.onStateChange('playing');
    }
  };

  private readonly handlePause = () => {
    if (!this.closed) {
      this.listener?.onStateChange('paused');
    }
  };

  private readonly handleError = () => {
    if (this.closed) {
      return;
    }

    this.listener?.onStateChange('error');
    this.listener?.onError('This preview could not be loaded.');
  };
}
