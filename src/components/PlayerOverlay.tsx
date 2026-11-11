import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Channel } from '../types';
import { createPlayerAdapter } from '../services/player';
import type { PlaybackSource, PlayerAdapter } from '../services/player';
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
  const stageRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const adapterRef = useRef<PlayerAdapter | null>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!adapterRef.current) {
    adapterRef.current = createPlayerAdapter();
  }

  // AVPlay renders video on a hardware plane below every web layer, so the
  // overlay's AVPlay mode must stop the page from painting over the video
  // area. The rules live in PlayerOverlay.css, keyed off these classes.
  const isAvPlay = adapterRef.current.engine === 'avplay';

  // The overlay owns the screen, so focus starts on its primary control.
  useLayoutEffect(() => {
    playRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isAvPlay) {
      return;
    }

    document.documentElement.classList.add('avplay-stage');
    return () => {
      document.documentElement.classList.remove('avplay-stage');
    };
  }, [isAvPlay]);

  useEffect(() => {
    const adapter = adapterRef.current;
    const host = stageRef.current;
    if (!adapter || !host) {
      return;
    }

    void adapter.open(source, host, {
      onStateChange: (state) => {
        setPlaying(state === 'playing');
        if (state === 'playing') {
          setMessage(null);
        }
      },
      onError: (text) => setMessage(text),
    });

    return () => {
      adapter.close();
    };
    // The overlay is keyed by channel, so the source is fixed for this mount.
  }, []);

  const togglePlay = () => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }

    if (adapter.isPlaying()) {
      adapter.pause();
    } else {
      adapter.play();
    }
  };

  return (
    <div
      class={isAvPlay ? 'player player--avplay' : 'player'}
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
        <div class="player__stage" ref={stageRef}>
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
