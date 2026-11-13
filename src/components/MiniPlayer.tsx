import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { playerSession } from '../services/playerSession';
import type { PlaybackSource } from '../services/player';
import type { MediaItem } from '../types';
import './MiniPlayer.css';

interface MiniPlayerProps {
  item: MediaItem;
  source: PlaybackSource;
  /** Enter/click on the pane expands to fullscreen. */
  onExpand: () => void;
}

/**
 * Reserved preview pane for live TV.
 *
 * AVPlay paints on a hardware plane below every web layer, so a floating
 * picture-in-picture would be hidden. Instead the catalog layout gives this
 * pane its own grid cell; the pane is transparent, and the adapter targets it
 * (setDisplayRect on Tizen, the shared <video> element in the browser). The
 * pane holds no focusable controls: the channel list keeps focus, so arrows
 * keep moving rows and Enter expands the preview.
 */
export function MiniPlayer({ item, source, onExpand }: MiniPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isAvPlay = playerSession.engine === 'avplay';

  // Open once per previewed item (the parent keys this component by id).
  useLayoutEffect(() => {
    const host = hostRef.current;
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
    // source.url is the identity; the parent keys this component by item id.
  }, []);

  // The pane's size changes with the window; AVPlay needs the new rect.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const update = () => playerSession.setSurface(host);
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  // On Tizen the page must not paint behind the pane, or the video plane is
  // covered. This class makes the shell transparent and paints each region
  // around the reserved hole.
  useEffect(() => {
    if (!isAvPlay) {
      return;
    }

    document.documentElement.classList.add('avplay-mini');
    return () => {
      document.documentElement.classList.remove('avplay-mini');
    };
  }, [isAvPlay]);

  return (
    <aside
      class={isAvPlay ? 'mini-player mini-player--avplay' : 'mini-player'}
      aria-label={`Preview: ${item.name}`}
      onClick={onExpand}
    >
      <div class="mini-player__surface" ref={hostRef} />

      <div class="mini-player__meta">
        <span class="mini-player__badge">
          {playing ? 'Preview' : 'Opening'}
        </span>
        <span class="mini-player__title">{item.name}</span>
        <span class="mini-player__hint">Enter for fullscreen</span>
      </div>

      {message ? (
        <p class="mini-player__notice" role="alert">
          {message}
        </p>
      ) : null}
    </aside>
  );
}
