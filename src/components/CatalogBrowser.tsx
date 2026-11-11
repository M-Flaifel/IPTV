import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import { CategoryNav } from './CategoryNav';
import { ChannelList } from './ChannelList';
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
  itemSource?: (config: XtreamConfig, item: MediaItem) => PlaybackSource;
  /** Context line under the player title; omit when rows drill in. */
  itemSub?: (item: MediaItem) => string;
  /** Rows that drill in (series) instead of playing. */
  onActivate?: (item: MediaItem) => void;
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
const ROWS_CACHE_LIMIT = 60;

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

  const [playing, setPlaying] = useState<MediaItem | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const handleActivate = useCallback(
    (item: MediaItem) => {
      if (onActivate) {
        onActivate(item);
        return;
      }

      const active = document.activeElement;
      restoreFocus.current = active instanceof HTMLElement ? active : null;
      setPlaying(item);
    },
    [onActivate]
  );

  const closePlayer = useCallback(() => {
    setPlaying(null);
  }, []);

  // Return focus to the row that opened the overlay once it unmounts.
  useEffect(() => {
    if (playing) {
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
  }, [playing]);

  const handleBack = useCallback(() => {
    if (playing) {
      closePlayer();
      return;
    }

    onExit();
  }, [playing, closePlayer, onExit]);

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
      } catch (error) {
        if (requestId !== itemRequest.current) {
          return;
        }

        setItemError(errorMessage(error));
        setItemStatus('error');
      }
    },
    [accountKey, config, loadItems]
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

  return (
    <main class="app">
      <SpatialNavigation onBack={handleBack} />
      <TopNav active={navActive} config={config} onNavigate={onNavigate} />

      <div class="app__body">
        <CategoryNav
          categories={categories}
          activeId={activeId}
          status={categoryStatus}
          error={categoryError}
          onSelect={selectCategory}
          onRetry={() => setCategoriesReload((value) => value + 1)}
        />
        <ChannelList
          title={title}
          eyebrow={eyebrow}
          countNoun={countNoun}
          itemLabel={itemLabel}
          items={items}
          status={itemStatus}
          error={itemError}
          idleText={idleText}
          emptyText={emptyText}
          onRetry={retryItems}
          onActivate={handleActivate}
        />
      </div>

      {playing && itemSource ? (
        <PlayerOverlay
          key={playing.id}
          item={playing}
          sub={itemSub ? itemSub(playing) : ''}
          source={itemSource(config, playing)}
          onClose={closePlayer}
        />
      ) : null}
    </main>
  );
}
