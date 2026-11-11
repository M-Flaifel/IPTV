import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MediaItem } from '../types';
import './ChannelList.css';

type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ChannelListProps {
  title: string;
  /** Section label above the list title, e.g. "Live TV" or "Movies". */
  eyebrow: string;
  /** Singular noun for the count and empty copy, e.g. "channel". */
  countNoun: string;
  /** Verb for the row's accessible label, e.g. "Play" or "Open". */
  itemLabel: string;
  items: MediaItem[];
  status: ListStatus;
  error: string | null;
  idleText: string;
  /** Overrides the default "No <noun> in this category." copy. */
  emptyText?: string;
  onRetry: () => void;
  onActivate: (item: MediaItem) => void;
}

const ROW_HEIGHT_REM = 4.5;
const ROW_GAP_REM = 0.5;
const ROW_CYCLE_REM = ROW_HEIGHT_REM + ROW_GAP_REM;
// Keep roughly one screen of rows plus overscan in the DOM at any viewport.
const MAX_RENDERED_ROWS = 12;
const MAX_OVERSCAN = 2;

interface ListLayout {
  rowHeight: number;
  overscan: number;
}

/** "series" is its own plural; everything else just takes an "s". */
function pluralNoun(noun: string): string {
  return noun === 'series' ? 'series' : `${noun}s`;
}

export function ChannelList({
  title,
  eyebrow,
  countNoun,
  itemLabel,
  items,
  status,
  error,
  idleText,
  emptyText,
  onRetry,
  onActivate,
}: ChannelListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ListLayout>({
    rowHeight: ROW_CYCLE_REM * 16,
    overscan: MAX_OVERSCAN,
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: layout.overscan,
    useFlushSync: false,
    // Scroll-only updates are written straight to the DOM instead of
    // re-rendering every visible row on each scroll event.
    directDomUpdates: true,
    directDomUpdatesMode: 'transform',
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const rem =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const rowHeight = rem * ROW_CYCLE_REM;
      const visibleRows = Math.max(1, Math.ceil(element.clientHeight / rowHeight));
      const overscan = Math.max(
        1,
        Math.min(
          MAX_OVERSCAN,
          Math.floor((MAX_RENDERED_ROWS - visibleRows) / 2)
        )
      );

      setLayout((current) =>
        current.rowHeight === rowHeight && current.overscan === overscan
          ? current
          : { rowHeight, overscan }
      );
    };

    update();
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
    };
    // The list only exists once a category has loaded, so re-measure when the
    // status or item list changes to pick up the mounted scroll element.
  }, [status, items.length]);

  useEffect(() => {
    virtualizer.measure();
  }, [layout.rowHeight, virtualizer]);

  // Layout effect: cached categories swap items without a loading state,
  // so the scroll element survives; resetting before paint avoids one frame
  // at the previous category's scroll offset.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [items]);

  const virtualRows = virtualizer.getVirtualItems();
  const showList = status === 'ready' && items.length > 0;
  const noun = pluralNoun(countNoun);

  return (
    <section class="channels" aria-labelledby="channels-title">
      <header class="channels__header">
        <div class="channels__heading">
          <p class="channels__eyebrow">{eyebrow}</p>
          <h2 class="channels__title" id="channels-title">
            {title}
          </h2>
        </div>
        <p class="channels__count">
          {status === 'ready'
            ? `${items.length} ${items.length === 1 ? countNoun : noun}`
            : ''}
        </p>
      </header>

      {status === 'idle' ? (
        <p class="channels__status">{idleText}</p>
      ) : null}

      {status === 'loading' ? (
        <p class="channels__status" role="status">
          Loading {noun}…
        </p>
      ) : null}

      {status === 'error' ? (
        <div class="channels__status">
          <p role="alert">{error || `Could not load ${noun}.`}</p>
          <button
            type="button"
            class="channels__retry"
            data-spatial="channels"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <p class="channels__status">
          {emptyText || `No ${noun} in this category.`}
        </p>
      ) : null}

      {showList ? (
        <div class="channel-list" ref={scrollRef}>
          <div class="channel-list__spacer" ref={virtualizer.containerRef}>
            {virtualRows.map((row) => {
              const item = items[row.index];

              return (
                <div
                  class="channel-list__row"
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  key={row.key}
                  style={{ height: `${layout.rowHeight}px` }}
                >
                  <button
                    type="button"
                    class="channel-list__item"
                    data-spatial="channels"
                    aria-label={`${itemLabel} ${item.name}`}
                    onClick={() => onActivate(item)}
                  >
                    <span class="channel-list__number">
                      {item.number > 0 ? item.number : ''}
                    </span>
                    <span class="channel-list__name">{item.name}</span>
                    {/* Channels carry no badge and render the Live dot;
                        movies and series carry a rating string, episodes
                        an empty string (no badge at all). */}
                    {item.badge === undefined ? (
                      <span class="channel-list__badge channel-list__badge--live">
                        Live
                      </span>
                    ) : item.badge ? (
                      <span class="channel-list__badge">{item.badge}</span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
