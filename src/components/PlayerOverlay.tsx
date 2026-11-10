import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Channel } from '../types';
import type { PlaybackSource } from '../services/player';
import './PlayerOverlay.css';

interface PlayerOverlayProps {
  channel: Channel;
  source: PlaybackSource;
  onClose: () => void;
}

export function PlayerOverlay({
  channel,
  source,
  onClose,
}: PlayerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The overlay owns the screen, so focus starts on its primary control.
  useLayoutEffect(() => {
    playRef.current?.focus();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        setMessage('Press Play to start the preview.');
      });
    }
  }, [source.url]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(() => {
          setMessage('This preview could not play.');
        });
      }
      return;
    }

    video.pause();
  };

  return (
    <div
      class="player"
      role="dialog"
      aria-modal="true"
      aria-label={`${channel.name} player`}
      data-spatial-scope="player"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div class="player__panel">
        <div class="player__stage">
          <video
            ref={videoRef}
            class="player__video"
            src={source.url}
            playsInline
            loop={source.preview}
            preload="auto"
            onPlay={() => {
              setPlaying(true);
              setMessage(null);
            }}
            onPause={() => setPlaying(false)}
            onError={() => setMessage('This preview could not be loaded.')}
          />

          {source.preview ? (
            <p class="player__preview" aria-hidden="true">
              Preview
            </p>
          ) : null}

          {message ? (
            <p class="player__notice" role="alert">
              {message}
            </p>
          ) : null}
        </div>

        <div class="player__chrome">
          <div class="player__meta">
            <p class="player__eyebrow">Now playing</p>
            <h2 class="player__title">{channel.name}</h2>
            <p class="player__sub">
              {channel.number > 0 ? `Live · #${channel.number}` : 'Live'}
            </p>
          </div>

          <div class="player__actions">
            <button
              ref={playRef}
              type="button"
              class="player__button"
              data-spatial="player"
              onClick={togglePlay}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              class="player__button player__button--ghost"
              data-spatial="player"
              onClick={onClose}
            >
              Back to channels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
