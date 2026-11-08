import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Channel } from '../types';
import './ChannelGrid.css';

type ChannelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ChannelGridProps {
  title: string;
  channels: Channel[];
  status: ChannelStatus;
  error: string | null;
  onRetry: () => void;
}

const CARD_MIN_REM = 13;
const GAP_REM = 0.75;
const CARD_HEIGHT_REM = 4.75;
const ROW_HEIGHT_REM = CARD_HEIGHT_REM + GAP_REM;

interface GridLayout {
  columns: number;
  rowHeight: number;
}

function channelInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  if (parts.length === 0) {
    return 'TV';
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function chunkRows(channels: Channel[], columns: number): Channel[][] {
  const rows: Channel[][] = [];

  for (let i = 0; i < channels.length; i += columns) {
    rows.push(channels.slice(i, i + columns));
  }

  return rows;
}

export function ChannelGrid({
  title,
  channels,
  status,
  error,
  onRetry,
}: ChannelGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<GridLayout>({
    columns: 1,
    rowHeight: ROW_HEIGHT_REM * 16,
  });

  const rows = useMemo(
    () => chunkRows(channels, layout.columns),
    [channels, layout.columns]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => layout.rowHeight,
    overscan: 2,
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
      const gap = rem * GAP_REM;
      const minCard = rem * CARD_MIN_REM;
      const innerWidth = Math.max(0, element.clientWidth - 12);
      const columns = Math.max(
        1,
        Math.floor((innerWidth + gap) / (minCard + gap))
      );
      const rowHeight = rem * ROW_HEIGHT_REM;

      setLayout((current) =>
        current.columns === columns && current.rowHeight === rowHeight
          ? current
          : { columns, rowHeight }
      );
    };

    update();
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    virtualizer.measure();
  }, [layout.columns, layout.rowHeight, virtualizer]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [channels]);

  const virtualRows = virtualizer.getVirtualItems();
  const showGrid = status === 'ready' && channels.length > 0;

  return (
    <section class="channels" aria-labelledby="channels-title">
      <header class="channels__header">
        <h2 class="channels__title" id="channels-title">
          {title}
        </h2>
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

      {showGrid ? (
        <div class="channel-grid" ref={scrollRef}>
          <div class="channel-grid__spacer" ref={virtualizer.containerRef}>
            {virtualRows.map((row) => {
              const startIndex = row.index * layout.columns;
              const items = rows[row.index];
              const fillers = layout.columns - items.length;

              return (
                <div
                  class="channel-grid__row"
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  key={row.key}
                  style={{ height: `${layout.rowHeight}px` }}
                >
                  {items.map((channel, column) => (
                    <button
                      type="button"
                      class="channel-card"
                      data-spatial="channels"
                      key={`${channel.id}-${startIndex + column}`}
                    >
                      <span class="channel-card__logo" aria-hidden="true">
                        {channelInitials(channel.name)}
                      </span>
                      <span class="channel-card__body">
                        <span class="channel-card__name">{channel.name}</span>
                        <span class="channel-card__meta">
                          {channel.number > 0
                            ? `Live · #${channel.number}`
                            : 'Live'}
                        </span>
                      </span>
                    </button>
                  ))}
                  {fillers > 0
                    ? Array.from({ length: fillers }, (_, index) => (
                        <span
                          class="channel-grid__filler"
                          aria-hidden="true"
                          key={`filler-${index}`}
                        />
                      ))
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
