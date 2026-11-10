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
import { SectionScreen } from './components/SectionScreen';
import { TopNav } from './components/TopNav';
import { SpatialNavigation } from './hooks/useSpatialNavigation';
import { ALL_CATEGORY, ALL_CATEGORY_ID } from './types';
import type { Category, Channel, Section, ViewTarget, XtreamConfig } from './types';
import {
  configKey,
  loadConfig,
  saveConfig,
} from './services/config';
import {
  fetchLiveCategories,
  fetchLiveStreams,
} from './services/xtream';
import {
  readCachedCategories,
  writeCachedCategories,
} from './services/categoryCache';
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

type View = 'home' | Section;

export function App() {
  const [config, setConfig] = useState<XtreamConfig | null>(loadConfig);
  const [view, setView] = useState<View>('home');
  const [lastSection, setLastSection] = useState<Section>('live');

  const handleSave = useCallback((next: XtreamConfig) => {
    saveConfig(next);
    setConfig(next);
  }, []);

  const openSection = useCallback((section: Section) => {
    setLastSection(section);
    setView(section);
  }, []);

  const goHome = useCallback(() => {
    setView('home');
  }, []);

  const navigate = useCallback(
    (target: ViewTarget) => {
      if (target === 'home') {
        setView('home');
        return;
      }

      setLastSection(target);
      setView(target);
    },
    []
  );

  if (!config || view === 'home') {
    return (
      <HomeScreen
        config={config}
        lastSection={lastSection}
        onSave={handleSave}
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
      <SpatialNavigation onBack={onHome} />
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
        />
      </div>
    </main>
  );
}
