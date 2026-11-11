import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Channel } from '../types';
import './ChannelList.css';

type ChannelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ChannelListProps {
  title: string;
  channels: Channel[];
  status: ChannelStatus;
  error: string | null;
  onRetry: () => void;
  onPlay: (channel: Channel) => void;
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

export function ChannelList({
  title,
  channels,
  status,
  error,
  onRetry,
  onPlay,
}: ChannelListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ListLayout>({
    rowHeight: ROW_CYCLE_REM * 16,
    overscan: MAX_OVERSCAN,
  });

  const virtualizer = useVirtualizer({
    count: channels.length,
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
    // status or channel list changes to pick up the mounted scroll element.
  }, [status, channels.length]);

  useEffect(() => {
    virtualizer.measure();
  }, [layout.rowHeight, virtualizer]);

  // Layout effect: cached categories swap channels without a loading state,
  // so the scroll element survives; resetting before paint avoids one frame
  // at the previous category's scroll offset.
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [channels]);

  const virtualRows = virtualizer.getVirtualItems();
  const showList = status === 'ready' && channels.length > 0;

  return (
    <section class="channels" aria-labelledby="channels-title">
      <header class="channels__header">
        <div class="channels__heading">
          <p class="channels__eyebrow">Live TV</p>
          <h2 class="channels__title" id="channels-title">
            {title}
          </h2>
        </div>
        <p class="channels__count">
          {status === 'ready'
            ? `${channels.length} ${channels.length === 1 ? 'channel' : 'channels'}`
            : ''}
        </p>
      </header>

      {status === 'idle' ? (
        <p class="channels__status">Select a category to load channels.</p>
      ) : null}

      {status === 'loading' ? (
        <p class="channels__status" role="status">
          Loading channels…
        </p>
      ) : null}

      {status === 'error' ? (
        <div class="channels__status">
          <p role="alert">{error || 'Could not load channels.'}</p>
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

      {status === 'ready' && channels.length === 0 ? (
        <p class="channels__status">No channels in this category.</p>
      ) : null}

      {showList ? (
        <div class="channel-list" ref={scrollRef}>
          <div class="channel-list__spacer" ref={virtualizer.containerRef}>
            {virtualRows.map((row) => {
              const channel = channels[row.index];

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
                    aria-label={`Play ${channel.name}`}
                    onClick={() => onPlay(channel)}
                  >
                    <span class="channel-list__number">
                      {channel.number > 0 ? channel.number : ''}
                    </span>
                    <span class="channel-list__name">{channel.name}</span>
                    <span class="channel-list__live">Live</span>
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
