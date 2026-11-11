import { useLayoutEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Playlist, Section, ViewTarget, XtreamConfig } from '../types';
import { SpatialNavigation } from '../hooks/useSpatialNavigation';
import { TopNav } from './TopNav';
import { playlistHost } from '../services/playlistStore';
import './HomeScreen.css';

interface HomeScreenProps {
  config: XtreamConfig | null;
  activePlaylist: Playlist | null;
  hasPlaylists: boolean;
  lastSection: Section;
  onSelect: (section: Section) => void;
  onNavigate: (target: ViewTarget) => void;
}

interface SectionItem {
  id: Section;
  title: string;
  description: string;
  badge: string;
  mark: string;
  icon: JSX.Element;
}

const SECTION_TITLES: Record<Section, string> = {
  live: 'Live TV',
  movies: 'Movies',
  series: 'Series',
};

const SECTION_ITEMS: SectionItem[] = [
  {
    id: 'live',
    title: 'Live TV',
    description: 'Instant channels across every category.',
    badge: '24/7',
    mark: 'LIVE',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 18v3" />
      </svg>
    ),
  },
  {
    id: 'movies',
    title: 'Movies',
    description: 'Your movie library, ready when you are.',
    badge: 'On demand',
    mark: 'FILM',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" />
      </svg>
    ),
  },
  {
    id: 'series',
    title: 'Series',
    description: 'Shows and episodes worth binging.',
    badge: 'Box sets',
    mark: 'SHOW',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="8" width="18" height="11" rx="2" />
        <path d="M7 4h10M9 2h6" />
      </svg>
    ),
  },
];

const HERO_TILES = [0, 1, 2, 3, 4, 5];

export function HomeScreen({
  config,
  activePlaylist,
  hasPlaylists,
  lastSection,
  onSelect,
  onNavigate,
}: HomeScreenProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Remote users land on the main action, mirroring how TV streaming apps
  // place focus on the billboard CTA.
  useLayoutEffect(() => {
    if (
      document.documentElement.getAttribute('data-input-mode') !== 'keyboard'
    ) {
      return;
    }

    primaryRef.current?.focus();
  }, []);

  const connected = Boolean(config);

  return (
    <main class="home">
      <SpatialNavigation />
      <TopNav active="home" config={config} onNavigate={onNavigate} />

      <section class="home__hero" aria-labelledby="home-title">
        <div class="home__hero-art" aria-hidden="true">
          {HERO_TILES.map((tile) => (
            <span class="home__hero-tile" key={tile} />
          ))}
        </div>

        <div class="home__hero-inner">
          <p class="home__kicker">
            {connected ? (
              <span class="home__kicker-dot" aria-hidden="true" />
            ) : null}
            {connected ? 'Live now' : 'Welcome'}
          </p>

          <h1 class="home__title" id="home-title">
            {connected
              ? 'Your next watch starts here.'
              : 'Bring your playlist.'}
          </h1>

          <p class="home__meta">
            <span>Live TV</span>
            <span class="home__meta-dot" aria-hidden="true">
              ·
            </span>
            <span>Movies</span>
            <span class="home__meta-dot" aria-hidden="true">
              ·
            </span>
            <span>Series</span>
          </p>

          <p class="home__intro">
            {connected
              ? 'Live channels, movies, and series — all from your own playlist, all on this device.'
              : 'Add an Xtream playlist to unlock Live TV, Movies, and Series.'}
          </p>

          <div class="home__hero-actions">
            <button
              ref={primaryRef}
              type="button"
              class="home__cta"
              data-spatial="home"
              onClick={
                connected
                  ? () => onSelect(lastSection)
                  : () => onNavigate('playlists')
              }
            >
              <span class="home__cta-icon" aria-hidden="true">
                {connected ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : null}
              </span>
              {connected
                ? `Continue to ${SECTION_TITLES[lastSection]}`
                : hasPlaylists
                  ? 'Choose a playlist'
                  : 'Set up your playlist'}
            </button>

            <button
              type="button"
              class="home__cta home__cta--ghost"
              data-spatial="home"
              onClick={() => onNavigate('playlists')}
            >
              {connected ? 'Manage playlists' : 'Add a playlist'}
            </button>
          </div>
        </div>
      </section>

      <div class="home__content">
        <section class="home__row" aria-labelledby="home-browse-title">
          <div class="home__row-header">
            <h2 class="home__row-title" id="home-browse-title">
              Browse
            </h2>
            <p class="home__row-meta">
              {connected
                ? 'Pick a section to start'
                : 'Add a playlist below to unlock'}
            </p>
          </div>

          <div class="home__sections">
            {SECTION_ITEMS.map((item) => (
              <button
                type="button"
                class={`home__section home__section--${item.id}`}
                data-spatial="home"
                disabled={!config}
                onClick={() => onSelect(item.id)}
                key={item.id}
              >
                <span
                  class={`home__section-art home__section-art--${item.id}`}
                  aria-hidden="true"
                >
                  <span class="home__section-badge">{item.badge}</span>
                  <span class="home__section-icon">{item.icon}</span>
                  <span class="home__section-mark">{item.mark}</span>
                </span>

                <span class="home__section-body">
                  <span class="home__section-name">{item.title}</span>
                  <span class="home__section-desc">{item.description}</span>
                  <span class="home__section-cta">
                    Browse
                    <span class="home__section-arrow" aria-hidden="true">
                      →
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          class="home__row home__playlist"
          id="playlist"
          aria-labelledby="home-playlist-title"
        >
          <div class="home__playlist-copy">
            <h2 class="home__row-title" id="home-playlist-title">
              Your playlist
            </h2>
            {activePlaylist ? (
              <>
                <p class="home__playlist-name">{activePlaylist.name}</p>
                <p class="home__playlist-meta">
                  Connected to{' '}
                  <strong>{playlistHost(activePlaylist)}</strong> as{' '}
                  <strong>{activePlaylist.username}</strong>.
                </p>
              </>
            ) : (
              <p class="home__playlist-meta">
                {hasPlaylists
                  ? 'No playlist selected. Choose one to start watching.'
                  : 'No playlists saved yet.'}
              </p>
            )}
            <p class="home__playlist-note">
              Credentials stay on this device. They are only sent to your
              Xtream server.
            </p>
          </div>

          <button
            type="button"
            class="home__playlist-manage"
            data-spatial="home"
            onClick={() => onNavigate('playlists')}
          >
            {activePlaylist
              ? 'Manage playlists'
              : hasPlaylists
                ? 'Choose a playlist'
                : 'Add a playlist'}
          </button>
        </section>
      </div>
    </main>
  );
}
