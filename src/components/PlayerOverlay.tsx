import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { playerSession } from '../services/playerSession';
import {
  DEFAULT_SKIP_SECONDS,
  INTRO_WINDOW_SECONDS,
  loadIntroOffset,
  saveIntroOffset,
} from '../services/introOffsets';
import type {
  PlaybackProgress,
  PlaybackSource,
} from '../services/player';
import type { MediaItem } from '../types';
import './PlayerOverlay.css';

interface PlayerOverlayProps {
  /** What is playing; `sub` is the caller's context line ("Live · #5"). */
  item: { id: string; name: string };
  sub: string;
  source: PlaybackSource;
  onClose: () => void;
  /**
   * Leave the stream running when the overlay unmounts. The mini player
   * passes this so fullscreen → mini reuses the same adapter.
   */
  keepAlive?: boolean;
  /** Label for the exit button; "Back to preview" while a mini player runs. */
  backLabel?: string;
  /**
   * Ordered rows the remote's Channel Up/Down keys step through. Live only:
   * the caller omits this for movies and episodes.
   */
  channels?: MediaItem[];
  /** Swaps the playing channel; the caller re-renders with the new item. */
  onChannelChange?: (item: MediaItem) => void;
  /**
   * Series episodes only: enables the learned "Skip intro" action. The panel
   * key scopes offsets to one playlist, so two panels never share them.
   */
  skipIntro?: {
    panelKey: string;
    seriesId: string;
  };
}

/** Milliseconds without input before the control bar hides during playback. */
const CONTROLS_HIDE_MS = 4000;

/** Remote seek step for the timeline when it owns focus. */
const SEEK_STEP_SECONDS = 10;

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

/**
 * Channel Up/Down as Tizen reports them (427/428). Returns -1 for Up and +1
 * for Down so the caller can index into the channel list.
 */
function channelStep(event: KeyboardEvent): -1 | 1 | null {
  if (event.key === 'ChannelUp' || event.keyCode === 427) {
    return -1;
  }

  if (event.key === 'ChannelDown' || event.keyCode === 428) {
    return 1;
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
  427: 'ChannelUp',
  428: 'ChannelDown',
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

/** Two-digit helper: `padStart` is Chromium 57+, and the TV targets 56. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `m:ss`, or `h:mm:ss` once past an hour. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  }

  return `${minutes}:${pad2(secs)}`;
}

export function PlayerOverlay({
  item,
  sub,
  source,
  onClose,
  keepAlive = false,
  backLabel = 'Back to channels',
  channels,
  onChannelChange,
  skipIntro,
}: PlayerOverlayProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [progress, setProgress] = useState<PlaybackProgress | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  // Loaded once per episode; the first skip teaches it to later episodes.
  const [introOffset, setIntroOffset] = useState<number | null>(() =>
    skipIntro ? loadIntroOffset(skipIntro.panelKey, skipIntro.seriesId) : null
  );
  const [introSkipped, setIntroSkipped] = useState(false);

  // AVPlay renders video on a hardware plane below every web layer, so the
  // overlay's AVPlay mode must stop the page from painting over the video
  // area. The rules live in PlayerOverlay.css, keyed off these classes.
  const isAvPlay = playerSession.engine === 'avplay';

  // Mirrors of state for the window key handler, so the listener does not
  // need to re-bind on every change.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;
  const scrubbingRef = useRef(scrubbing);
  scrubbingRef.current = scrubbing;
  const scrubValueRef = useRef(scrubValue);
  scrubValueRef.current = scrubValue;

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

  // The bar's clock only runs while it is on screen; a hidden bar costs no
  // timer work on the TV.
  useEffect(() => {
    const read = () => {
      const next = playerSession.getProgress();
      if (next) {
        setProgress(next);
      }
    };

    read();

    if (!controlsVisible) {
      return;
    }

    const timer = window.setInterval(read, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [controlsVisible, playing]);

  const togglePlay = useCallback(() => {
    if (playerSession.isPlaying()) {
      playerSession.pause();
    } else {
      playerSession.play();
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const current = playerSession.getProgress();

    if (!current || !current.seekable) {
      return;
    }

    const target = Math.min(Math.max(seconds, 0), current.duration);
    playerSession.seekTo(target);
    setProgress({ ...current, current: target });
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const current = playerSession.getProgress();

      if (!current || !current.seekable) {
        return;
      }

      const target = Math.min(
        Math.max(current.current + delta, 0),
        current.duration
      );
      playerSession.seekTo(target);
      setProgress({ ...current, current: target });
      revealControls();
    },
    [revealControls]
  );

  const skipIntroAction = useCallback(() => {
    if (!skipIntro) {
      return;
    }

    const current = playerSession.getProgress();
    if (!current || !current.seekable) {
      return;
    }

    // First skip: jump a default amount and remember where it landed. Later
    // episodes go straight to that offset, which is relative to the start.
    const target =
      introOffset !== null
        ? Math.min(introOffset, current.duration)
        : Math.min(current.current + DEFAULT_SKIP_SECONDS, current.duration);

    playerSession.seekTo(target);
    setProgress({ ...current, current: target });
    setIntroSkipped(true);

    if (introOffset === null) {
      saveIntroOffset(skipIntro.panelKey, skipIntro.seriesId, target);
      setIntroOffset(target);
    }

    revealControls();
  }, [skipIntro, introOffset, revealControls]);

  // The action is offered only early in an episode, only while a learned
  // offset can still move playback forward, and only for series episodes.
  const introTime = progress ? progress.current : 0;
  const showSkipIntro =
    Boolean(skipIntro) &&
    Boolean(progress && progress.seekable && progress.duration > 0) &&
    !introSkipped &&
    introTime < INTRO_WINDOW_SECONDS &&
    (introOffset === null || introTime < introOffset - 1);

  const stepChannel = useCallback(
    (direction: -1 | 1) => {
      if (!source.live || !channels || !onChannelChange) {
        return;
      }

      const index = channels.findIndex(
        (candidate) => candidate.id === item.id
      );

      if (index < 0) {
        return;
      }

      // No wrap: the first/last channel is the end of the dial.
      const next = channels[index + direction];

      if (next) {
        onChannelChange(next);
      }
    },
    [source.live, channels, onChannelChange, item.id]
  );

  const applyMediaAction = useCallback(
    (action: MediaAction) => {
      if (action === 'stop') {
        onClose();
        return;
      }

      if (action === 'play') {
        playerSession.play();
      } else if (action === 'pause') {
        playerSession.pause();
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

      // Channel Up/Down steps live channels even while the bar is hidden.
      const step = channelStep(event);
      if (step !== null) {
        event.preventDefault();
        event.stopPropagation();
        stepChannel(step);
        revealControls();
        return;
      }

      // While the timeline owns focus, Left/Right seek instead of moving
      // spatial focus; Up/Down still leave the track for the buttons.
      if (document.activeElement === trackRef.current) {
        if (event.key === 'ArrowLeft' || event.keyCode === 37) {
          event.preventDefault();
          event.stopPropagation();
          seekBy(-SEEK_STEP_SECONDS);
          return;
        }

        if (event.key === 'ArrowRight' || event.keyCode === 39) {
          event.preventDefault();
          event.stopPropagation();
          seekBy(SEEK_STEP_SECONDS);
          return;
        }
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
  }, [applyMediaAction, revealControls, togglePlay, armHide, seekBy, stepChannel]);

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
  }, [controlsVisible, showSkipIntro]);

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
    const host = stageRef.current;
    if (!host) {
      return;
    }

    void playerSession.open(source, host, {
      onStateChange: (state) => {
        setPlaying(state === 'playing');
        if (state === 'playing') {
          setMessage(null);
        }
      },
      onError: (text) => setMessage(text),
    });

    return () => {
      // The preview owner closes the session; the overlay only stops when it
      // was a one-shot (movie/episode) view.
      if (!keepAlive) {
        playerSession.close();
      }
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

  const duration = progress && progress.duration > 0 ? progress.duration : 0;
  const canSeek = Boolean(progress && progress.seekable && duration > 0);
  const displayedCurrent = scrubbing
    ? scrubValue
    : progress
      ? progress.current
      : 0;
  const ratio =
    duration > 0 ? Math.min(1, Math.max(0, displayedCurrent / duration)) : 0;

  const timeFromPointer = (clientX: number): number => {
    const track = trackRef.current;
    if (!track || duration <= 0) {
      return 0;
    }

    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) {
      return 0;
    }

    const position = (clientX - rect.left) / rect.width;
    return Math.min(1, Math.max(0, position)) * duration;
  };

  const setScrub = (value: number) => {
    scrubValueRef.current = value;
    setScrubValue(value);
  };

  const onTrackPointerDown = (event: PointerEvent) => {
    if (!canSeek) {
      return;
    }

    const track = trackRef.current;
    if (!track) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    track.focus();
    setScrubbing(true);
    setScrub(timeFromPointer(event.clientX));
    disarmHide();

    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // Older runtimes may not support capture; dragging still works inside.
    }
  };

  const onTrackPointerMove = (event: PointerEvent) => {
    if (!scrubbingRef.current) {
      return;
    }

    event.preventDefault();
    setScrub(timeFromPointer(event.clientX));
  };

  const commitScrub = (value: number) => {
    setScrubbing(false);
    seekTo(value);
    revealControls();
  };

  const onTrackPointerUp = (event: PointerEvent) => {
    if (!scrubbingRef.current) {
      return;
    }

    event.preventDefault();

    const track = trackRef.current;
    if (track) {
      try {
        track.releasePointerCapture(event.pointerId);
      } catch {
        // Nothing to release.
      }
    }

    commitScrub(timeFromPointer(event.clientX));
  };

  const onTrackPointerCancel = () => {
    if (!scrubbingRef.current) {
      return;
    }

    commitScrub(scrubValueRef.current);
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
        <div class="player__timeline">
          {source.live ? (
            <span class="player__live">Live</span>
          ) : canSeek ? (
            <>
              <span class="player__time">{formatTime(displayedCurrent)}</span>
              <div
                ref={trackRef}
                class="player__track"
                data-spatial="player"
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(displayedCurrent)}
                onPointerDown={onTrackPointerDown}
                onPointerMove={onTrackPointerMove}
                onPointerUp={onTrackPointerUp}
                onPointerCancel={onTrackPointerCancel}
              >
                <span
                  class="player__track-fill"
                  style={{ width: `${ratio * 100}%` }}
                />
                <span
                  class="player__track-dot"
                  style={{ left: `${ratio * 100}%` }}
                />
              </div>
              <span class="player__time player__time--end">
                {formatTime(duration)}
              </span>
            </>
          ) : (
            <span class="player__time player__time--muted">Loading…</span>
          )}
        </div>

        <div class="player__bar">
          <div class="player__meta">
            <p class="player__eyebrow">Now playing</p>
            <h2 class="player__title">{item.name}</h2>
            <p class="player__sub">{sub}</p>
          </div>

          <div class="player__actions">
            <button
              type="button"
              class="player__round"
              data-spatial="player"
              aria-label={`Rewind ${SEEK_STEP_SECONDS} seconds`}
              disabled={!canSeek}
              onClick={() => seekBy(-SEEK_STEP_SECONDS)}
            >
              <span class="player__round-text" aria-hidden="true">
                −{SEEK_STEP_SECONDS}
              </span>
            </button>

            <button
              ref={playRef}
              type="button"
              class="player__round player__round--primary"
              data-spatial="player"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={togglePlay}
            >
              {playing ? (
                <span class="player__icon player__icon--pause" aria-hidden="true" />
              ) : (
                <span class="player__icon player__icon--play" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              class="player__round"
              data-spatial="player"
              aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}
              disabled={!canSeek}
              onClick={() => seekBy(SEEK_STEP_SECONDS)}
            >
              <span class="player__round-text" aria-hidden="true">
                +{SEEK_STEP_SECONDS}
              </span>
            </button>

            {showSkipIntro ? (
              <button
                type="button"
                class="player__button player__button--skip"
                data-spatial="player"
                onClick={skipIntroAction}
              >
                Skip intro
              </button>
            ) : null}

            <button
              type="button"
              class="player__button player__button--ghost"
              data-spatial="player"
              onClick={onClose}
            >
              {backLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
