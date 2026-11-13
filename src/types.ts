export interface XtreamConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/** A saved, named Xtream playlist. The active one feeds `XtreamConfig`. */
export interface Playlist {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

export interface Category {
  id: string;
  name: string;
}

/**
 * One row of any section's list. `badge` is the right-edge marker: channels
 * omit it so the row renders the Live dot, movies and series carry a rating
 * (or an empty string when unrated), episodes carry none. `extension` feeds
 * VOD playback URLs; channels build their HLS URL from the id alone.
 */
export interface MediaItem {
  id: string;
  name: string;
  /** Left-column number; 0 renders an empty column. */
  number: number;
  badge?: string;
  extension?: string;
  /**
   * Set only on global-search results, so the browser can route a movie to
   * playback and a series to its detail screen. Catalog rows omit it.
   */
  section?: 'movie' | 'series';
}

export interface Channel extends MediaItem {
  logo: string;
  categoryId: string;
}

/** A movie row from `get_vod_streams`. */
export interface Movie extends MediaItem {
  extension: string;
}

/** A series row from `get_series`. */
export type SeriesSummary = MediaItem;

/** One episode from `get_series_info`. */
export interface SeriesEpisode extends MediaItem {
  extension: string;
  season: number;
}

/** Seasons plus episodes per season id, from one `get_series_info` call. */
export interface SeriesDetailData {
  seasons: Category[];
  episodesBySeason: Record<string, SeriesEpisode[]>;
}

/** Lifecycle of the series detail screen. */
export type SeriesDetailState =
  | { status: 'loading'; series: SeriesSummary }
  | { status: 'ready'; series: SeriesSummary; data: SeriesDetailData }
  | { status: 'error'; series: SeriesSummary; message: string };

export const ALL_CATEGORY_ID = 'all';

export const ALL_CATEGORY: Category = {
  id: ALL_CATEGORY_ID,
  name: 'All',
};

export type Section = 'live' | 'movies' | 'series';

export type ViewTarget = 'home' | 'playlists' | Section;
