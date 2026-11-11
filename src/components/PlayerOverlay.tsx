import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPlayerAdapter } from '../services/player';
import type { PlaybackSource, PlayerAdapter } from '../services/player';
import './PlayerOverlay.css';

interface PlayerOverlayProps {
  /** What is playing; `sub` is the caller's context line ("Live · #5"). */
  item: { id: string; name: string };
  sub: string;
  source: PlaybackSource;
  onClose: () => void;
}

/** Milliseconds without input before the control bar hides during playback. */
const CONTROLS_HIDE_MS = 4000;

type MediaAction = 'play' | 'pause' | 'toggle' | 'stop';

/**
 * Samsung remotes report their media keys as numeric keyCodes, usually with
 * no `key` string, so both spellings are matched.
 */
function mediaAction(event: KeyboardEvent): MediaAction | null {
  switch (event.key) {
    case 'MediaPlay':
      return 'play';
    case 'MediaPause':
      return 'pause';
    case 'MediaPlayPause':
      return 'toggle';
    case 'MediaStop':
      return 'stop';
  }

  switch (event.keyCode) {
    case 415:
      return 'play';
    case 19:
      return 'pause';
    case 10252:
      return 'toggle';
    case 413:
      return 'stop';
  }

  return null;
}

/** Back stays owned by spatial navigation, which closes the overlay. */
function isBackKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Escape' ||
    event.key === 'Backspace' ||
    event.key === 'BrowserBack' ||
    event.keyCode === 10009
  );
}

/**
 * Key codes the player already understands. Anything else arriving while the
 * player is open is logged with its code so an unmapped remote button (a
 * play/pause variant, for example) can be identified in the Apps2Samsung
 * debug console and mapped.
 */
const KNOWN_KEY_CODES: Record<number, string> = {
  8: 'Backspace',
  13: 'Enter',
  19: 'MediaPause',
  27: 'Escape',
  32: 'Space',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown',
  413: 'MediaStop',
  415: 'MediaPlay',
  10009: 'TizenBack',
  10252: 'MediaPlayPause',
};

function logUnknownKey(event: KeyboardEvent): void {
  if (event.keyCode === 0 || event.keyCode in KNOWN_KEY_CODES) {
    return;
  }

  console.info(
    `player: unhandled key code=${event.keyCode} key="${event.key}"`
  );
}

export function PlayerOverlay({
  item,
  sub,
  source,
  onClose,
}: PlayerOverlayProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const adapterRef = useRef<PlayerAdapter | null>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  if (!adapterRef.current) {
    adapterRef.current = createPlayerAdapter();
  }

  // AVPlay renders video on a hardware plane below every web layer, so the
  // overlay's AVPlay mode must stop the page from painting over the video
  // area. The rules live in PlayerOverlay.css, keyed off these classes.
  const isAvPlay = adapterRef.current.engine === 'avplay';

  // Mirrors of state for the window key handler, so the listener does not
  // need to re-bind on every change.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;

  const hideTimer = useRef<number | null>(null);

  const disarmHide = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const armHide = useCallback(() => {
    disarmHide();
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      // Only an actually playing stream hides its controls; paused or
      // error states keep them on screen.
      if (playingRef.current) {
        setControlsVisible(false);
      }
    }, CONTROLS_HIDE_MS);
  }, [disarmHide]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    armHide();
  }, [armHide]);

  useEffect(() => () => disarmHide(), [disarmHide]);

  // Paused or failed playback brings the bar back and keeps it there.
  useEffect(() => {
    if (playing) {
      armHide();
      return;
    }

    disarmHide();
    setControlsVisible(true);
  }, [playing, armHide, disarmHide]);

  const togglePlay = useCallback(() => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }

    if (adapter.isPlaying()) {
      adapter.pause();
    } else {
      adapter.play();
    }
  }, []);

  const applyMediaAction = useCallback(
    (action: MediaAction) => {
      if (action === 'stop') {
        onClose();
        return;
      }

      const adapter = adapterRef.current;
      if (!adapter) {
        return;
      }

      if (action === 'play') {
        adapter.play();
      } else if (action === 'pause') {
        adapter.pause();
      } else {
        togglePlay();
      }
    },
    [onClose, togglePlay]
  );

  // The overlay owns the screen, so focus starts on its primary control.
  useLayoutEffect(() => {
    playRef.current?.focus();
  }, []);

  useEffect(() => {
    // Capture phase: this must run before spatial navigation, so that while
    // the bar is hidden a key press reveals it instead of focusing buttons
    // that cannot be focused. Swallowed presses are intentional - the first
    // press after auto-hide only brings the controls back.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isBackKey(event)) {
        return;
      }

      const media = mediaAction(event);
      if (media) {
        event.preventDefault();
        event.stopPropagation();
        applyMediaAction(media);
        revealControls();
        return;
      }

      // Space toggles, like every desktop player.
      if (event.key === ' ' || event.keyCode === 32) {
        event.preventDefault();
        event.stopPropagation();
        togglePlay();
        revealControls();
        return;
      }

      // Diagnostics first: if a remote button arrives with an unmapped code,
      // it is visible in the debug console even while the bar is hidden.
      logUnknownKey(event);

      if (!controlsVisibleRef.current) {
        event.preventDefault();
        event.stopPropagation();
        revealControls();
        return;
      }

      // While the bar is on screen, any activity pushes the timer back.
      armHide();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [applyMediaAction, revealControls, togglePlay, armHide]);

  // Hiding the bar blurs its buttons (invisible elements cannot hold
  // focus); when it comes back, land focus on the primary control so Enter
  // works again.
  useEffect(() => {
    if (!controlsVisible) {
      return;
    }

    const active = document.activeElement;
    const inPlayer =
      active instanceof HTMLElement &&
      Boolean(active.closest('[data-spatial-scope="player"]'));

    if (!inPlayer) {
      playRef.current?.focus();
    }
  }, [controlsVisible]);

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
    // The overlay is keyed by item, so the source is fixed for this mount.
  }, []);

  // Mouse convenience for the browser preview: clicking the video toggles
  // the control bar. The TV has no pointer, so this costs nothing there.
  const onStageClick = () => {
    if (controlsVisibleRef.current) {
      setControlsVisible(false);
    } else {
      revealControls();
    }
  };

  return (
    <div
      class={isAvPlay ? 'player player--avplay' : 'player'}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} player`}
      data-spatial-scope="player"
    >
      <div class="player__stage" ref={stageRef} onClick={onStageClick}>
        {source.preview ? (
          <p class="player__chip" aria-hidden="true">
            Preview
          </p>
        ) : null}

        {message ? (
          <p class="player__notice" role="alert">
            {message}
          </p>
        ) : null}
      </div>

      <div
        class={
          controlsVisible
            ? 'player__controls'
            : 'player__controls player__controls--hidden'
        }
      >
        <div class="player__meta">
          <p class="player__eyebrow">Now playing</p>
          <h2 class="player__title">{item.name}</h2>
          <p class="player__sub">{sub}</p>
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
  );
}
