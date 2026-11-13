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
import type {
  MediaItem,
  SeriesDetailState,
  SeriesEpisode,
  SeriesSummary,
  ViewTarget,
  XtreamConfig,
} from '../types';
import { errorMessage } from '../services/errors';
import { configKey } from '../services/config';
import { resolveVodPlaybackSource } from '../services/player';
import { fetchSeriesInfo } from '../services/xtream';

interface SeriesDetailProps {
  config: XtreamConfig;
  series: SeriesSummary;
  /** Back with nothing playing returns to the series list. */
  onBack: () => void;
  onNavigate: (target: ViewTarget) => void;
}

/**
 * Seasons sidebar plus episode list for one series. It renders *instead of*
 * the series list (which unmounts), so exactly one `SpatialNavigation` owns
 * Back at a time: player -> season list -> series list -> Home.
 */
export function SeriesDetail({
  config,
  series,
  onBack,
  onNavigate,
}: SeriesDetailProps) {
  const [state, setState] = useState<SeriesDetailState>({
    status: 'loading',
    series,
  });
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [playing, setPlaying] = useState<SeriesEpisode | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading', series });
    setSeasonId(null);

    const load = async () => {
      try {
        const data = await fetchSeriesInfo(config, series.id);
        if (cancelled) {
          return;
        }

        setState({ status: 'ready', series, data });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          series,
          message: errorMessage(error),
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
    // Mount/retry only: the detail is keyed by series id and config is fixed
    // per mount.
  }, [config, series.id, reload]);

  const seasons = state.status === 'ready' ? state.data.seasons : [];
  const effectiveSeason =
    seasonId || (seasons.length > 0 ? seasons[0].id : null);
  const episodes =
    state.status === 'ready' && effectiveSeason
      ? state.data.episodesBySeason[effectiveSeason] || []
      : [];
  const activeSeason =
    seasons.find((candidate) => candidate.id === effectiveSeason) || null;

  const playEpisode = useCallback(
    (item: MediaItem) => {
      const active = document.activeElement;
      restoreFocus.current = active instanceof HTMLElement ? active : null;
      setPlaying(item as SeriesEpisode);
    },
    []
  );

  const closePlayer = useCallback(() => {
    setPlaying(null);
  }, []);

  // Return focus to the episode row that opened the player once it unmounts.
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

    onBack();
  }, [playing, closePlayer, onBack]);

  // The seasons sidebar renders with the same commit as the ready state, so
  // landing focus on its first pill before paint keeps the remote usable
  // without a visible focus jump.
  useLayoutEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const firstSeason = document.querySelector('[data-spatial="sidebar"]');
    if (firstSeason instanceof HTMLElement) {
      firstSeason.focus();
    }
  }, [state.status]);

  const retry = () => setReload((value) => value + 1);
  const navStatus =
    state.status === 'ready'
      ? 'ready'
      : state.status === 'loading'
        ? 'loading'
        : 'error';
  const listStatus =
    state.status === 'ready'
      ? 'ready'
      : state.status === 'loading'
        ? 'loading'
        : 'error';
  const errorText = state.status === 'error' ? state.message : null;

  return (
    <main class="app">
      <SpatialNavigation onBack={handleBack} />
      <TopNav active="series" config={config} onNavigate={onNavigate} />

      <div class="app__body">
        <CategoryNav
          categories={seasons}
          activeId={effectiveSeason}
          status={navStatus}
          error={errorText}
          title="Seasons"
          showAll={false}
          onSelect={setSeasonId}
          onRetry={retry}
        />
        <ChannelList
          title={activeSeason ? activeSeason.name : series.name}
          eyebrow={series.name}
          countNoun="episode"
          itemLabel="Play"
          items={episodes}
          status={listStatus}
          error={errorText}
          idleText="Select a season to load episodes."
          emptyText="No episodes in this season."
          onRetry={retry}
          onActivate={playEpisode}
        />
      </div>

      {playing ? (
        <PlayerOverlay
          key={playing.id}
          item={playing}
          sub={`Season ${playing.season} · Episode ${playing.number}`}
          source={resolveVodPlaybackSource(config, 'series', playing)}
          skipIntro={{
            panelKey: configKey(config),
            seriesId: series.id,
          }}
          onClose={closePlayer}
        />
      ) : null}
    </main>
  );
}
