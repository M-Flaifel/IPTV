import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import { CategoryNav } from './CategoryNav';
import { ChannelList } from './ChannelList';
import { MiniPlayer } from './MiniPlayer';
import { PlayerOverlay } from './PlayerOverlay';
import { TopNav } from './TopNav';
import { SpatialNavigation } from '../hooks/useSpatialNavigation';
import { ALL_CATEGORY, ALL_CATEGORY_ID } from '../types';
import type {
  Category,
  MediaItem,
  Section,
  ViewTarget,
  XtreamConfig,
} from '../types';
import {
  readCachedCategories,
  writeCachedCategories,
} from '../services/categoryCache';
import { errorMessage } from '../services/errors';
import type { PlaybackSource } from '../services/player';
import { playerSession } from '../services/playerSession';
import { searchEntries } from '../services/search';
import type { SearchEntry, SearchSection } from '../services/search';
import {
  ensureSearchIndex,
  rememberVisitedRows,
} from '../services/searchIndex';

type ItemStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogBrowserProps {
  config: XtreamConfig;
  /**
   * Cache namespace for this catalog. It must embed the account and the
   * section (live uses the bare account key, VOD appends ":vod", series
   * ":series") so one catalog never reads another's cached categories.
   */
  accountKey: string;
  navActive: Section;
  eyebrow: string;
  /** List title while "All" (or nothing) is selected. */
  allTitle: string;
  /** Verb for the row's accessible label, e.g. "Play" or "Open". */
  itemLabel: string;
  countNoun: string;
  idleText: string;
  emptyText?: string;
  loadCategories: (config: XtreamConfig) => Promise<Category[]>;
  loadItems: (
    config: XtreamConfig,
    categoryId?: string
  ) => Promise<MediaItem[]>;
  /** Playback source for a row; omit when rows drill in instead of playing. */
  itemSource?: (
    config: XtreamConfig,
    item: MediaItem
  ) => PlaybackSource | undefined;
  /** Context line under the player title; omit when rows drill in. */
  itemSub?: (item: MediaItem) => string;
  /** Rows that drill in (series) instead of playing. */
  onActivate?: (item: MediaItem) => void;
  /**
   * Enables the global movie+series search box. The value is this catalog's
   * own section, used only for the visited-rows fallback.
   */
  searchSection?: SearchSection;
  /**
   * Live only: Enter starts a mini preview, focus changes switch it, and the
   * next Enter expands to fullscreen. Movies/episodes open directly.
   */
  previewEnabled?: boolean;
  /** Back with nothing playing exits the catalog. */
  onExit: () => void;
  onNavigate: (target: ViewTarget) => void;
}

/**
 * The shared category + list + player screen behind Live TV, Movies, and the
 * Series list. It is the Phase 3 Live browser generalized over the item type:
 * same sidebar, same virtualized rows, same request-race guards, same player
 * overlay and focus restore.
 *
 * Entering a series detail unmounts this screen, so the selected category and
 * its rows are remembered in module scope to survive the round trip. Keys
 * embed the account and section, so switching playlists or sections never
 * reads another catalog's rows; the Map's insertion order doubles as an LRU.
 */
const rememberedCategories = new Map<string, string>();
const rememberedRows = new Map<string, MediaItem[]>();
/** Last search query per catalog, so a detail round trip keeps the results. */
const rememberedSearches = new Map<string, string>();
const ROWS_CACHE_LIMIT = 60;
/** Focus dwell before the mini preview switches to the newly focused row. */
const PREVIEW_FOLLOW_MS = 400;

function rowsKey(accountKey: string, categoryId: string | null): string {
  return `${accountKey}|${categoryId || ALL_CATEGORY_ID}`;
}

function readRememberedRows(key: string): MediaItem[] | null {
  const rows = rememberedRows.get(key);

  if (!rows) {
    return null;
  }

  // Re-insert to refresh recency; the oldest entry sits first.
  rememberedRows.delete(key);
  rememberedRows.set(key, rows);

  return rows;
}

function rememberRows(key: string, rows: MediaItem[]): void {
  rememberedRows.delete(key);
  rememberedRows.set(key, rows);

  while (rememberedRows.size > ROWS_CACHE_LIMIT) {
    const oldest = rememberedRows.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    rememberedRows.delete(oldest);
  }
}

function rememberedIdFor(accountKey: string): string | null {
  return rememberedCategories.get(accountKey) || null;
}

function rowsKeyFor(accountKey: string, activeId: string): string {
  return rowsKey(accountKey, activeId === ALL_CATEGORY_ID ? null : activeId);
}

/** Focus a rendered row by item id; false when the virtualizer dropped it. */
function focusRowById(id: string): boolean {
  const rows = document.querySelectorAll('[data-item-id]');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (row instanceof HTMLElement && row.getAttribute('data-item-id') === id) {
      row.focus();
      return true;
    }
  }

  return false;
}

/**
 * The list only renders a window of rows, so a channel reached with the
 * remote's Channel keys may not be in the DOM when the player closes. Scroll
 * its slot into view first and retry focus for a few frames while the
 * virtualizer swaps its window.
 */
function revealAndFocusRow(id: string, items: MediaItem[]): void {
  const index = items.findIndex((item) => item.id === id);
  const scroller = document.querySelector('.channel-list');

  if (index < 0 || !(scroller instanceof HTMLElement)) {
    return;
  }

  const firstRow = scroller.querySelector('.channel-list__row');
  const rowHeight =
    firstRow instanceof HTMLElement && firstRow.offsetHeight > 0
      ? firstRow.offsetHeight
      : 80;

  // Leave one row above the target so its focus ring has room.
  scroller.scrollTop = Math.max(0, (index - 1) * rowHeight);
  // A programmatic scrollTop change does not always reach the virtualizer's
  // observer before the next frame; notify it explicitly.
  scroller.dispatchEvent(new Event('scroll'));

  let attempts = 0;
  const tryFocus = () => {
    if (focusRowById(id) || attempts >= 20) {
      return;
    }

    attempts += 1;
    // Mix frames with timers so a throttled background tab still resolves.
    if (attempts <= 10) {
      window.requestAnimationFrame(tryFocus);
    } else {
      window.setTimeout(tryFocus, 40);
    }
  };

  tryFocus();
}

/**
 * A search hit becomes a list row. The badge carries both the section and the
 * rating so mixed results are labelled without a second column.
 */
function toMediaItem(entry: SearchEntry): MediaItem {
  const label = entry.section === 'series' ? 'Series' : 'Movie';

  return {
    id: entry.id,
    name: entry.name,
    number: entry.number,
    badge: entry.badge ? `${label} · ${entry.badge}` : label,
    extension: entry.section === 'movie' ? entry.extension : undefined,
    section: entry.section,
  };
}

export function CatalogBrowser({
  config,
  accountKey,
  navActive,
  eyebrow,
  allTitle,
  itemLabel,
  countNoun,
  idleText,
  emptyText,
  loadCategories,
  loadItems,
  itemSource,
  itemSub,
  onActivate,
  searchSection,
  previewEnabled,
  onExit,
  onNavigate,
}: CatalogBrowserProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryStatus, setCategoryStatus] =
    useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoriesReload, setCategoriesReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(() =>
    rememberedIdFor(accountKey)
  );
  const [items, setItems] = useState<MediaItem[]>(() => {
    const remembered = rememberedIdFor(accountKey);
    return remembered
      ? readRememberedRows(rowsKeyFor(accountKey, remembered)) || []
      : [];
  });
  const [itemStatus, setItemStatus] = useState<ItemStatus>(() => {
    const remembered = rememberedIdFor(accountKey);
    if (!remembered) {
      return 'idle';
    }

    return rememberedRows.has(rowsKeyFor(accountKey, remembered))
      ? 'ready'
      : 'loading';
  });
  const [itemError, setItemError] = useState<string | null>(null);

  const itemRequest = useRef(0);

  // Global search: one query per catalog, a debounced index lookup, and a
  // refresh token that forces the one-time full fetch to run again.
  const [query, setQuery] = useState<string>(
    () => rememberedSearches.get(accountKey) || ''
  );
  const [searchResults, setSearchResults] = useState<MediaItem[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<ItemStatus>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const searchRequest = useRef(0);
  const handledRefresh = useRef(0);

  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  /** The row to focus after closing; channel keys can change it mid-play. */
  const lastPlayedId = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const previewTimer = useRef<number | null>(null);

  const handleActivate = useCallback(
    (item: MediaItem) => {
      // A search hit can be a movie (play) or a series (drill in). Catalog
      // rows resolve exactly as before: no source means the row drills in.
      const source = itemSource ? itemSource(config, item) : undefined;

      if (!source) {
        onActivate?.(item);
        return;
      }

      lastPlayedId.current = item.id;

      // Live: the first Enter starts the mini preview and leaves focus in the
      // list; the next Enter (on any row) expands that row to fullscreen.
      // Either way the mini pane follows the activated row, so Back from
      // fullscreen returns to the channel that is actually playing.
      if (previewEnabled && source.live) {
        restoreFocus.current = null;
        setPreview(item);

        if (previewRef.current) {
          setPlaying(item);
        }
        return;
      }

      const active = document.activeElement;
      restoreFocus.current = active instanceof HTMLElement ? active : null;
      setPlaying(item);
    },
    [config, itemSource, onActivate, previewEnabled]
  );

  const handleChannelChange = useCallback((item: MediaItem) => {
    lastPlayedId.current = item.id;
    // Keep the mini pane on the channel that is actually playing, so Back
    // from fullscreen returns to it.
    if (previewRef.current) {
      setPreview(item);
    }
    setPlaying(item);
  }, []);

  const closePlayer = useCallback(() => {
    setPlaying(null);
  }, []);

  const stopPreview = useCallback(() => {
    setPreview(null);
  }, []);

  // A running preview claims Back before the channel-row → category step, so
  // one Back stops the audio and leaves focus on the row it was previewing.
  const handleBackFromList = useCallback(() => {
    if (!previewRef.current) {
      return false;
    }

    stopPreview();
    return true;
  }, [stopPreview]);

  // While previewing, moving focus to another row switches the stream after a
  // short debounce, so key repeat does not open one stream per row.
  const handleRowFocus = useCallback((item: MediaItem) => {
    if (!previewRef.current) {
      return;
    }

    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current);
    }

    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;

      if (previewRef.current && previewRef.current.id !== item.id) {
        lastPlayedId.current = item.id;
        setPreview(item);
      }
    }, PREVIEW_FOLLOW_MS);
  }, []);

  useEffect(() => () => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current);
    }
  }, []);

  // Track leaving fullscreen so Back can return focus to the mini preview's
  // channel. This must not run when the preview merely follows focus: the row
  // id stays in `lastPlayedId` until playback (or the preview) really ends.
  const wasPlaying = useRef(false);

  useEffect(() => {
    const nowPlaying = Boolean(playing);
    const leftFullscreen = wasPlaying.current && !nowPlaying;
    wasPlaying.current = nowPlaying;

    if (!leftFullscreen || !preview) {
      return;
    }

    // Back from fullscreen returns to the preview: focus its channel row.
    if (!focusRowById(preview.id)) {
      revealAndFocusRow(preview.id, itemsRef.current);
    }
  }, [playing, preview]);

  // Return focus to the row that opened the overlay once playback stops.
  // Channel Up/Down can move playback to another row, so the current item id
  // wins over the originally focused element.
  useEffect(() => {
    if (playing || preview) {
      return;
    }

    const playedId = lastPlayedId.current;
    lastPlayedId.current = null;

    if (playedId) {
      restoreFocus.current = null;

      if (!focusRowById(playedId)) {
        revealAndFocusRow(playedId, itemsRef.current);
      }

      return;
    }

    const target = restoreFocus.current;
    if (!target) {
      return;
    }

    restoreFocus.current = null;
    if (target.isConnected) {
      target.focus();
    }
  }, [playing, preview]);

  // The catalog owns the one shared player session: it closes only when
  // neither the fullscreen overlay nor the mini preview needs it.
  useEffect(() => {
    if (preview || playing) {
      return;
    }

    playerSession.close();
  }, [preview, playing]);

  useEffect(() => () => {
    playerSession.close();
  }, []);

  const handleBack = useCallback(() => {
    if (playing) {
      closePlayer();
      return;
    }

    if (preview) {
      stopPreview();
      return;
    }

    // A search is a layer over the catalog: the first Back clears it.
    if (query) {
      setQuery('');
      return;
    }

    onExit();
  }, [playing, closePlayer, preview, stopPreview, query, onExit]);

  // Keep the query for this catalog so a series detail round trip returns to
  // the same results (the index is cached, so they rebuild instantly).
  useEffect(() => {
    if (!searchSection) {
      return;
    }

    if (query) {
      rememberedSearches.set(accountKey, query);
    } else {
      rememberedSearches.delete(accountKey);
    }
  }, [accountKey, searchSection, query]);

  useEffect(() => {
    if (!searchSection) {
      return;
    }

    const trimmed = query.trim();

    if (!trimmed) {
      searchRequest.current += 1;
      setSearchResults(null);
      setSearchStatus('idle');
      setSearchError(null);
      setSearchNote(null);
      return;
    }

    const requestId = ++searchRequest.current;
    // Debounce typing; the index lookup itself is cheap once built.
    const timer = window.setTimeout(() => {
      setSearchStatus('loading');
      setSearchError(null);

      void (async () => {
        // Consume a refresh click exactly once.
        const force = refreshToken !== handledRefresh.current;
        if (force) {
          handledRefresh.current = refreshToken;
        }

        try {
          const index = await ensureSearchIndex(config, force);

          if (requestId !== searchRequest.current) {
            return;
          }

          const found = searchEntries(index.entries, trimmed);
          setSearchResults(found.map(toMediaItem));
          setSearchNote(
            index.partial
              ? 'Search covers only categories loaded so far.'
              : null
          );
          setSearchStatus('ready');
        } catch (error) {
          if (requestId !== searchRequest.current) {
            return;
          }

          setSearchResults([]);
          setSearchError(errorMessage(error));
          setSearchStatus('error');
        }
      })();
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [accountKey, config, query, refreshToken, searchSection]);

  // Entering the browser should not drop focus to <body>.
  useLayoutEffect(() => {
    const firstCategory = document.querySelector('[data-spatial="sidebar"]');
    if (firstCategory instanceof HTMLElement) {
      firstCategory.focus();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    setCategoryStatus('loading');
    setCategoryError(null);

    const load = async () => {
      // Paint cached headers immediately, then refresh them in the background.
      const cached = await readCachedCategories(accountKey);
      if (cancelled) {
        return;
      }

      if (cached && cached.length > 0) {
        setCategories(cached);
        setCategoryStatus('ready');
      }

      try {
        const fresh = await loadCategories(config);
        if (cancelled) {
          return;
        }

        setCategories(fresh);
        setCategoryStatus('ready');
        void writeCachedCategories(accountKey, fresh);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (!cached || cached.length === 0) {
          setCategoryError(errorMessage(error));
          setCategoryStatus('error');
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accountKey, config, loadCategories, categoriesReload]);

  const loadCategory = useCallback(
    async (categoryId: string | null) => {
      const key = rowsKey(accountKey, categoryId);
      const cached = readRememberedRows(key);
      const requestId = ++itemRequest.current;

      if (cached) {
        setItems(cached);
        setItemError(null);
        setItemStatus('ready');

        if (searchSection) {
          rememberVisitedRows(config, searchSection, cached);
        }

        return;
      }

      setItems([]);
      setItemError(null);
      setItemStatus('loading');

      try {
        const rows = await loadItems(config, categoryId || undefined);

        if (requestId !== itemRequest.current) {
          return;
        }

        rememberRows(key, rows);
        setItems(rows);
        setItemStatus('ready');

        if (searchSection) {
          rememberVisitedRows(config, searchSection, rows);
        }
      } catch (error) {
        if (requestId !== itemRequest.current) {
          return;
        }

        setItemError(errorMessage(error));
        setItemStatus('error');
      }
    },
    [accountKey, config, loadItems, searchSection]
  );

  // Returning from a drill-in restores the remembered category; refresh its
  // rows only when the LRU dropped them.
  useEffect(() => {
    const remembered = rememberedIdFor(accountKey);

    if (
      remembered &&
      !rememberedRows.has(rowsKeyFor(accountKey, remembered))
    ) {
      void loadCategory(
        remembered === ALL_CATEGORY_ID ? null : remembered
      );
    }
    // Mount-only: the browser is keyed per account, so config is fixed.
  }, []);

  const selectCategory = (id: string) => {
    setActiveId(id);
    rememberedCategories.delete(accountKey);
    rememberedCategories.set(accountKey, id);
    void loadCategory(id === ALL_CATEGORY_ID ? null : id);
  };

  const retryItems = () => {
    if (!activeId) {
      return;
    }

    rememberedRows.delete(rowsKeyFor(accountKey, activeId));
    void loadCategory(activeId === ALL_CATEGORY_ID ? null : activeId);
  };

  const activeCategory =
    activeId === ALL_CATEGORY_ID
      ? ALL_CATEGORY
      : categories.find((category) => category.id === activeId) || null;

  const title =
    activeCategory && activeCategory !== ALL_CATEGORY
      ? activeCategory.name
      : allTitle;

  const trimmedQuery = query.trim();
  const searching = Boolean(searchSection) && trimmedQuery.length > 0;

  const listItems = searching ? searchResults || [] : items;
  const listStatus: ItemStatus = searching
    ? searchStatus === 'error'
      ? 'error'
      : searchStatus === 'ready'
        ? 'ready'
        : 'loading'
    : itemStatus;
  const listError = searching ? searchError : itemError;
  const listTitle = searching ? `Results for “${trimmedQuery}”` : title;
  const listEmpty = searching
    ? `No matches for “${trimmedQuery}”.`
    : emptyText;
  const listLoading = searching
    ? searchStatus === 'loading' && searchResults === null
      ? 'Building search index…'
      : 'Searching…'
    : undefined;

  const retryList = () => {
    if (searching) {
      setRefreshToken((value) => value + 1);
      return;
    }

    retryItems();
  };

  const playingSource =
    playing && itemSource ? itemSource(config, playing) : undefined;
  const previewSource =
    preview && itemSource ? itemSource(config, preview) : undefined;
  const previewing = Boolean(preview && previewSource && !playing);

  return (
    <main class="app">
      <SpatialNavigation onBack={handleBack} onBackFromList={handleBackFromList} />
      <TopNav active={navActive} config={config} onNavigate={onNavigate} />

      <div class={previewing ? 'app__body app__body--preview' : 'app__body'}>
        <CategoryNav
          categories={categories}
          activeId={activeId}
          status={categoryStatus}
          error={categoryError}
          onSelect={selectCategory}
          onRetry={() => setCategoriesReload((value) => value + 1)}
        />
        <ChannelList
          title={listTitle}
          eyebrow={eyebrow}
          countNoun={searching ? 'result' : countNoun}
          itemLabel={itemLabel}
          items={listItems}
          status={listStatus}
          error={listError}
          idleText={idleText}
          emptyText={listEmpty}
          loadingText={listLoading}
          note={searching ? searchNote : null}
          search={
            searchSection
              ? {
                  value: query,
                  placeholder: 'Search movies and series',
                  onChange: setQuery,
                  onRefresh: () =>
                    setRefreshToken((value) => value + 1),
                }
              : undefined
          }
          onRowFocus={previewEnabled ? handleRowFocus : undefined}
          onRetry={retryList}
          onActivate={handleActivate}
        />
        {previewing && preview && previewSource ? (
          <MiniPlayer
            key={preview.id}
            item={preview}
            source={previewSource}
            onExpand={() => setPlaying(preview)}
          />
        ) : null}
      </div>

      {playing && playingSource ? (
        <PlayerOverlay
          key={playing.id}
          item={playing}
          sub={itemSub ? itemSub(playing) : ''}
          source={playingSource}
          keepAlive={Boolean(preview)}
          backLabel={preview ? 'Back to preview' : 'Back to channels'}
          channels={items}
          onChannelChange={handleChannelChange}
          onClose={closePlayer}
        />
      ) : null}
    </main>
  );
}
