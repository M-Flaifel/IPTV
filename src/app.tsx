import { useCallback, useState } from 'preact/hooks';
import { CatalogBrowser } from './components/CatalogBrowser';
import { HomeScreen } from './components/HomeScreen';
import { PlaylistsScreen } from './components/PlaylistsScreen';
import { SeriesDetail } from './components/SeriesDetail';
import type {
  MediaItem,
  Playlist,
  Section,
  SeriesSummary,
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
  resolvePlaybackSource,
  resolveVodPlaybackSource,
} from './services/player';
import {
  fetchLiveCategories,
  fetchLiveStreams,
  fetchSeries,
  fetchSeriesCategories,
  fetchVodCategories,
  fetchVodStreams,
} from './services/xtream';
import './app.css';

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

  if (view === 'movies') {
    return (
      <MovieBrowser
        key={configKey(config)}
        config={config}
        onHome={goHome}
        onNavigate={navigate}
      />
    );
  }

  return (
    <SeriesBrowser
      key={configKey(config)}
      config={config}
      onHome={goHome}
      onNavigate={navigate}
    />
  );
}

interface SectionBrowserProps {
  config: XtreamConfig;
  onHome: () => void;
  onNavigate: (target: ViewTarget) => void;
}

/** Live TV: the Phase 3 browser, now a thin CatalogBrowser wrapper. */
function Browser({ config, onHome, onNavigate }: SectionBrowserProps) {
  return (
    <CatalogBrowser
      config={config}
      accountKey={configKey(config)}
      navActive="live"
      eyebrow="Live TV"
      allTitle="All Channels"
      itemLabel="Play"
      countNoun="channel"
      idleText="Select a category to load channels."
      loadCategories={fetchLiveCategories}
      loadItems={fetchLiveStreams}
      itemSource={resolvePlaybackSource}
      itemSub={(item) => (item.number > 0 ? `Live · #${item.number}` : 'Live')}
      onExit={onHome}
      onNavigate={onNavigate}
    />
  );
}

/** Movies: VOD categories and playable movie rows. */
function MovieBrowser({ config, onHome, onNavigate }: SectionBrowserProps) {
  return (
    <CatalogBrowser
      config={config}
      accountKey={`${configKey(config)}:vod`}
      navActive="movies"
      eyebrow="Movies"
      allTitle="All Movies"
      itemLabel="Play"
      countNoun="movie"
      idleText="Select a category to load movies."
      loadCategories={fetchVodCategories}
      loadItems={fetchVodStreams}
      itemSource={(config, item) =>
        resolveVodPlaybackSource(config, 'movie', item)
      }
      itemSub={(item) => item.badge || 'Movie'}
      onExit={onHome}
      onNavigate={onNavigate}
    />
  );
}

/**
 * Series: the list level is a CatalogBrowser whose rows drill into a
 * SeriesDetail instead of playing. The detail renders *instead of* the list
 * (one SpatialNavigation per screen), so Back chains
 * player -> episodes -> series list -> Home.
 */
function SeriesBrowser({ config, onHome, onNavigate }: SectionBrowserProps) {
  const [series, setSeries] = useState<SeriesSummary | null>(null);

  const openSeries = useCallback((item: MediaItem) => {
    setSeries(item as SeriesSummary);
  }, []);

  const closeSeries = useCallback(() => {
    setSeries(null);
  }, []);

  if (series) {
    return (
      <SeriesDetail
        key={series.id}
        config={config}
        series={series}
        onBack={closeSeries}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <CatalogBrowser
      config={config}
      accountKey={`${configKey(config)}:series`}
      navActive="series"
      eyebrow="Series"
      allTitle="All Series"
      itemLabel="Open"
      countNoun="series"
      idleText="Select a category to load series."
      loadCategories={fetchSeriesCategories}
      loadItems={fetchSeries}
      onActivate={openSeries}
      onExit={onHome}
      onNavigate={onNavigate}
    />
  );
}
