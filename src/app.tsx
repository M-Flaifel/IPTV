import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';
import { CategoryNav } from './components/CategoryNav';
import { ChannelGrid } from './components/ChannelGrid';
import { HomeScreen } from './components/HomeScreen';
import { PlayerOverlay } from './components/PlayerOverlay';
import { PlaylistsScreen } from './components/PlaylistsScreen';
import { SectionScreen } from './components/SectionScreen';
import { TopNav } from './components/TopNav';
import { SpatialNavigation } from './hooks/useSpatialNavigation';
import { ALL_CATEGORY, ALL_CATEGORY_ID } from './types';
import type {
  Category,
  Channel,
  Playlist,
  Section,
  ViewTarget,
  XtreamConfig,
} from './types';
import { configKey } from './services/config';
import {
  loadActivePlaylistId,
  loadPlaylists,
  saveActivePlaylistId,
  savePlaylists,
  toXtreamConfig,
} from './services/playlistStore';
import {
  fetchLiveCategories,
  fetchLiveStreams,
} from './services/xtream';
import {
  readCachedCategories,
  writeCachedCategories,
} from './services/categoryCache';
import { resolvePlaybackSource } from './services/player';
import './app.css';

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check the address and your connection.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

type View = 'home' | 'playlists' | Section;

export function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists);
  const [activeId, setActiveId] = useState<string | null>(
    loadActivePlaylistId
  );
  const [view, setView] = useState<View>('home');
  const [lastSection, setLastSection] = useState<Section>('live');

  // The active playlist is the single source of truth for the panel config.
  const activePlaylist =
    playlists.find((playlist) => playlist.id === activeId) || null;
  const config = activePlaylist ? toXtreamConfig(activePlaylist) : null;

  // A newly saved playlist (or a re-save of the active one) becomes active;
  // editing a different playlist keeps the current active.
  const savePlaylist = (playlist: Playlist) => {
    const index = playlists.findIndex(
      (candidate) => candidate.id === playlist.id
    );
    const next =
      index < 0
        ? [...playlists, playlist]
        : playlists.map((candidate) =>
            candidate.id === playlist.id ? playlist : candidate
          );

    setPlaylists(next);
    savePlaylists(next);

    if (index < 0 || playlist.id === activeId) {
      setActiveId(playlist.id);
      saveActivePlaylistId(playlist.id);
    }
  };

  const activatePlaylist = (id: string) => {
    setActiveId(id);
    saveActivePlaylistId(id);
  };

  // Deleting the active playlist clears the selection; sections that need a
  // config fall back to the home screen.
  const deletePlaylist = (id: string) => {
    const next = playlists.filter(
      (playlist) => playlist.id !== id
    );

    setPlaylists(next);
    savePlaylists(next);

    if (id === activeId) {
      setActiveId(null);
      saveActivePlaylistId(null);
    }
  };

  const openSection = useCallback((section: Section) => {
    setLastSection(section);
    setView(section);
  }, []);

  const goHome = useCallback(() => {
    setView('home');
  }, []);

  const navigate = useCallback(
    (target: ViewTarget) => {
      if (target === 'home' || target === 'playlists') {
        setView(target);
        return;
      }

      setLastSection(target);
      setView(target);
    },
    []
  );

  if (view === 'playlists') {
    return (
      <PlaylistsScreen
        playlists={playlists}
        activeId={activeId}
        config={config}
        onActivate={activatePlaylist}
        onSave={savePlaylist}
        onDelete={deletePlaylist}
        onHome={goHome}
        onNavigate={navigate}
      />
    );
  }

  if (!config || view === 'home') {
    return (
      <HomeScreen
        config={config}
        activePlaylist={activePlaylist}
        hasPlaylists={playlists.length > 0}
        lastSection={lastSection}
        onSelect={openSection}
        onNavigate={navigate}
      />
    );
  }

  if (view === 'live') {
    return (
      <Browser
        key={configKey(config)}
        config={config}
        onHome={goHome}
        onNavigate={navigate}
      />
    );
  }

  return (
    <SectionScreen
      section={view}
      config={config}
      onHome={goHome}
      onNavigate={navigate}
    />
  );
}

interface BrowserProps {
  config: XtreamConfig;
  onHome: () => void;
  onNavigate: (target: ViewTarget) => void;
}

function Browser({ config, onHome, onNavigate }: BrowserProps) {
  const accountKey = configKey(config);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryStatus, setCategoryStatus] =
    useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoriesReload, setCategoriesReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelStatus, setChannelStatus] =
    useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [channelError, setChannelError] = useState<string | null>(null);

  const streamCache = useRef(new Map<string, Channel[]>());
  const streamRequest = useRef(0);

  const [playing, setPlaying] = useState<Channel | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const openPlayer = useCallback((channel: Channel) => {
    const active = document.activeElement;
    restoreFocus.current = active instanceof HTMLElement ? active : null;
    setPlaying(channel);
  }, []);

  const closePlayer = useCallback(() => {
    setPlaying(null);
  }, []);

  // Return focus to the card that opened the overlay once it unmounts.
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

    onHome();
  }, [playing, closePlayer, onHome]);

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
        const fresh = await fetchLiveCategories(config);
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
  }, [accountKey, config, categoriesReload]);

  const loadStreams = useCallback(
    async (categoryId: string | null) => {
      const cacheKey = categoryId || ALL_CATEGORY_ID;
      const cached = streamCache.current.get(cacheKey);
      const requestId = ++streamRequest.current;

      if (cached) {
        setChannels(cached);
        setChannelError(null);
        setChannelStatus('ready');
        return;
      }

      setChannels([]);
      setChannelError(null);
      setChannelStatus('loading');

      try {
        const streams = await fetchLiveStreams(
          config,
          categoryId || undefined
        );

        if (requestId !== streamRequest.current) {
          return;
        }

        streamCache.current.set(cacheKey, streams);
        setChannels(streams);
        setChannelStatus('ready');
      } catch (error) {
        if (requestId !== streamRequest.current) {
          return;
        }

        setChannelError(errorMessage(error));
        setChannelStatus('error');
      }
    },
    [config]
  );

  const selectCategory = (id: string) => {
    setActiveId(id);
    void loadStreams(id === ALL_CATEGORY_ID ? null : id);
  };

  const retryStreams = () => {
    if (!activeId) {
      return;
    }

    void loadStreams(
      activeId === ALL_CATEGORY_ID ? null : activeId
    );
  };

  const activeCategory =
    activeId === ALL_CATEGORY_ID
      ? ALL_CATEGORY
      : categories.find((category) => category.id === activeId) || null;

  const title =
    activeCategory === ALL_CATEGORY
      ? 'All Channels'
      : activeCategory
        ? activeCategory.name
        : 'Channels';

  return (
    <main class="app">
      <SpatialNavigation onBack={handleBack} />
      <TopNav active="live" config={config} onNavigate={onNavigate} />

      <div class="app__body">
        <CategoryNav
          categories={categories}
          activeId={activeId}
          status={categoryStatus}
          error={categoryError}
          onSelect={selectCategory}
          onRetry={() => setCategoriesReload((value) => value + 1)}
        />
        <ChannelGrid
          title={title}
          channels={channels}
          status={channelStatus}
          error={channelError}
          onRetry={retryStreams}
          onPlay={openPlayer}
        />
      </div>

      {playing ? (
        <PlayerOverlay
          key={playing.id}
          channel={playing}
          source={resolvePlaybackSource(config, playing)}
          onClose={closePlayer}
        />
      ) : null}
    </main>
  );
}
