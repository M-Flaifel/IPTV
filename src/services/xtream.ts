import type {
  Category,
  Channel,
  Movie,
  SeriesDetailData,
  SeriesEpisode,
  SeriesSummary,
  XtreamConfig,
} from '../types';
import { httpGetText, httpGetTextResult } from './http';

const API_FILE = 'player_api.php';
const DEV_PROXY_PATH = '/xtream/player_api.php';

interface RawCategory {
  category_id?: string | number;
  category_name?: string;
}

interface RawStream {
  stream_id?: string | number;
  name?: string;
  num?: string | number;
  stream_icon?: string;
  category_id?: string | number;
}

interface RawVodStream {
  stream_id?: string | number;
  name?: string;
  num?: string | number;
  rating?: string | number;
  container_extension?: string;
}

interface RawSeries {
  series_id?: string | number;
  name?: string;
  num?: string | number;
  rating?: string | number;
}

interface RawSeason {
  season?: string | number;
}

interface RawEpisode {
  id?: string | number;
  episode_num?: string | number;
  title?: string;
  container_extension?: string;
}

interface RawSeriesInfo {
  seasons?: unknown;
  episodes?: unknown;
}

function buildQuery(
  config: XtreamConfig,
  params: Record<string, string>
): string {
  const search = new URLSearchParams();
  search.set('username', config.username);
  search.set('password', config.password);

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      search.set(key, params[key]);
    }
  }

  return search.toString();
}

async function request(
  config: XtreamConfig,
  params: Record<string, string>
): Promise<unknown> {
  const query = buildQuery(config, params);

  // In development the Vite server proxies the panel, so the browser stays
  // same-origin and CORS does not apply. Production calls the panel directly;
  // native shells install their own HTTP transport via services/http.
  const url = import.meta.env.DEV
    ? `${DEV_PROXY_PATH}?${query}`
    : `${config.baseUrl}/${API_FILE}?${query}`;

  const headers = import.meta.env.DEV
    ? { 'x-xtream-base': config.baseUrl }
    : undefined;

  const text = await httpGetText(url, headers);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('The Xtream server returned an invalid response.');
  }
}

/** Shared category normalizer for every `get_*_categories` action. */
function toCategories(data: unknown): Category[] {
  if (!Array.isArray(data)) {
    throw new Error(
      'Could not load categories. Check the server URL and credentials.'
    );
  }

  const seen: Record<string, true> = {};
  const categories: Category[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawCategory;
    const id = String(raw.category_id || '');
    const name = String(raw.category_name || '').trim();

    if (!id || !name || seen[id]) {
      continue;
    }

    seen[id] = true;
    categories.push({ id, name });
  }

  return categories;
}

/** Star rating for the row badge; empty string when the panel has none. */
function ratingBadge(value: unknown): string {
  const rating = Number(value);

  if (!Number.isFinite(rating) || rating <= 0) {
    return '';
  }

  return `★ ${rating.toFixed(1)}`;
}

/** `container_extension` feeds the VOD playback URL; mp4 is the safe default. */
function toExtension(value: unknown): string {
  return String(value || 'mp4').replace(/^\.+/, '');
}

export async function fetchLiveCategories(
  config: XtreamConfig
): Promise<Category[]> {
  const data = await request(config, { action: 'get_live_categories' });
  return toCategories(data);
}

export async function fetchVodCategories(
  config: XtreamConfig
): Promise<Category[]> {
  const data = await request(config, { action: 'get_vod_categories' });
  return toCategories(data);
}

export async function fetchSeriesCategories(
  config: XtreamConfig
): Promise<Category[]> {
  const data = await request(config, { action: 'get_series_categories' });
  return toCategories(data);
}

export async function fetchLiveStreams(
  config: XtreamConfig,
  categoryId?: string
): Promise<Channel[]> {
  const params: Record<string, string> = { action: 'get_live_streams' };

  if (categoryId) {
    params.category_id = categoryId;
  }

  const data = await request(config, params);

  if (!Array.isArray(data)) {
    throw new Error('Could not load channels for this category.');
  }

  const channels: Channel[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawStream;
    const id = String(raw.stream_id || '');
    const name = String(raw.name || '').trim();

    if (!id || !name) {
      continue;
    }

    const number = Number(raw.num);

    channels.push({
      id,
      name,
      number: Number.isFinite(number) ? number : 0,
      logo: typeof raw.stream_icon === 'string' ? raw.stream_icon : '',
      categoryId: String(raw.category_id || ''),
    });
  }

  return channels;
}

export async function fetchVodStreams(
  config: XtreamConfig,
  categoryId?: string
): Promise<Movie[]> {
  const params: Record<string, string> = { action: 'get_vod_streams' };

  if (categoryId) {
    params.category_id = categoryId;
  }

  const data = await request(config, params);

  if (!Array.isArray(data)) {
    throw new Error('Could not load movies for this category.');
  }

  const movies: Movie[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawVodStream;
    const id = String(raw.stream_id || '');
    const name = String(raw.name || '').trim();

    if (!id || !name) {
      continue;
    }

    const number = Number(raw.num);

    movies.push({
      id,
      name,
      number: Number.isFinite(number) ? number : 0,
      badge: ratingBadge(raw.rating),
      extension: toExtension(raw.container_extension),
    });
  }

  return movies;
}

export async function fetchSeries(
  config: XtreamConfig,
  categoryId?: string
): Promise<SeriesSummary[]> {
  const params: Record<string, string> = { action: 'get_series' };

  if (categoryId) {
    params.category_id = categoryId;
  }

  const data = await request(config, params);

  if (!Array.isArray(data)) {
    throw new Error('Could not load series for this category.');
  }

  const series: SeriesSummary[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawSeries;
    const id = String(raw.series_id || '');
    const name = String(raw.name || '').trim();

    if (!id || !name) {
      continue;
    }

    const number = Number(raw.num);

    series.push({
      id,
      name,
      number: Number.isFinite(number) ? number : 0,
      badge: ratingBadge(raw.rating),
    });
  }

  return series;
}

/**
 * In-memory `get_series_info` cache, keyed by panel and series so switching
 * playlists can never leak one panel's episodes into another. The Map's
 * insertion order doubles as an LRU list with a soft cap.
 */
const seriesInfoCache = new Map<string, SeriesDetailData>();
const SERIES_INFO_CACHE_LIMIT = 60;

function seriesInfoCacheKey(
  config: XtreamConfig,
  seriesId: string
): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  return `${base}|${config.username}|${seriesId}`;
}

function readSeriesInfo(key: string): SeriesDetailData | null {
  const cached = seriesInfoCache.get(key);

  if (!cached) {
    return null;
  }

  // Re-insert to refresh recency; the oldest entry sits first.
  seriesInfoCache.delete(key);
  seriesInfoCache.set(key, cached);

  return cached;
}

function storeSeriesInfo(key: string, data: SeriesDetailData): void {
  seriesInfoCache.delete(key);
  seriesInfoCache.set(key, data);

  while (seriesInfoCache.size > SERIES_INFO_CACHE_LIMIT) {
    const oldest = seriesInfoCache.keys().next().value;

    if (oldest === undefined) {
      break;
    }

    seriesInfoCache.delete(oldest);
  }
}

function seasonName(seasonId: string): string {
  const n = Number(seasonId);

  if (Number.isFinite(n)) {
    return n === 0 ? 'Specials' : `Season ${n}`;
  }

  return `Season ${seasonId}`;
}

function sortSeasonIds(ids: string[]): void {
  ids.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
  });
}

export async function fetchSeriesInfo(
  config: XtreamConfig,
  seriesId: string
): Promise<SeriesDetailData> {
  const cacheKey = seriesInfoCacheKey(config, seriesId);
  const cached = readSeriesInfo(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await request(config, {
    action: 'get_series_info',
    series_id: seriesId,
  });

  const info =
    data && typeof data === 'object' ? (data as RawSeriesInfo) : null;

  if (!info) {
    throw new Error('Could not load episodes for this series.');
  }

  const rawSeasons = Array.isArray(info.seasons) ? info.seasons : [];
  const rawEpisodes =
    info.episodes && typeof info.episodes === 'object'
      ? (info.episodes as Record<string, unknown>)
      : {};

  // A season can appear only in `seasons`, only as an `episodes` key, or in
  // both; the sidebar shows the union.
  const seenSeasons: Record<string, true> = {};
  const seasonIds: string[] = [];

  for (let i = 0; i < rawSeasons.length; i++) {
    const raw = rawSeasons[i] as RawSeason;
    const id = String((raw && raw.season) || '').trim();

    if (!id || seenSeasons[id]) {
      continue;
    }

    seenSeasons[id] = true;
    seasonIds.push(id);
  }

  for (const key in rawEpisodes) {
    if (
      Object.prototype.hasOwnProperty.call(rawEpisodes, key) &&
      !seenSeasons[key]
    ) {
      seenSeasons[key] = true;
      seasonIds.push(key);
    }
  }

  sortSeasonIds(seasonIds);

  const episodesBySeason: Record<string, SeriesEpisode[]> = {};
  let episodeCount = 0;

  for (let s = 0; s < seasonIds.length; s++) {
    const seasonId = seasonIds[s];
    const seasonNumber = Number(seasonId);
    const rawList = rawEpisodes[seasonId];
    const episodes: SeriesEpisode[] = [];

    if (Array.isArray(rawList)) {
      for (let i = 0; i < rawList.length; i++) {
        const raw = rawList[i] as RawEpisode;
        const id = String((raw && raw.id) || '');

        if (!id) {
          continue;
        }

        const num = Number(raw.episode_num);
        const number =
          Number.isFinite(num) && num > 0 ? num : episodes.length + 1;

        episodes.push({
          id,
          name: String(raw.title || '').trim() || `Episode ${number}`,
          number,
          badge: '',
          extension: toExtension(raw.container_extension),
          season: Number.isFinite(seasonNumber) ? seasonNumber : 0,
        });
      }
    }

    episodes.sort((a, b) => a.number - b.number);
    episodesBySeason[seasonId] = episodes;
    episodeCount += episodes.length;
  }

  if (episodeCount === 0) {
    throw new Error('This series has no episodes.');
  }

  const detail: SeriesDetailData = {
    seasons: seasonIds.map((id) => ({ id, name: seasonName(id) })),
    episodesBySeason,
  };

  storeSeriesInfo(cacheKey, detail);

  return detail;
}

/** The subset of `player_api.php`'s `user_info` the check reads. */
interface RawUserInfo {
  auth?: string | number;
  status?: string;
  exp_date?: string | number | null;
}

interface RawAccountResponse {
  user_info?: RawUserInfo;
}

export interface CredentialCheck {
  ok: boolean;
  /** Human-readable result, safe to show in the form. */
  message: string;
  /** Expiry as a locale date, when the panel reports one. */
  expiresAt: string | null;
}

function userInfo(data: unknown): RawUserInfo | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const info = (data as RawAccountResponse).user_info;
  return info && typeof info === 'object' ? info : null;
}

/**
 * Signs in against `player_api.php` with no action, which returns the
 * account's `user_info` for valid credentials. Panels answer wrong
 * credentials with HTTP 401 or an empty/`auth: 0` body, so the status and
 * the body together decide the verdict. The password echoed back by some
 * panels is never read, logged, or stored.
 */
export async function checkCredentials(
  config: XtreamConfig
): Promise<CredentialCheck> {
  const query = buildQuery(config, {});
  const url = import.meta.env.DEV
    ? `${DEV_PROXY_PATH}?${query}`
    : `${config.baseUrl}/${API_FILE}?${query}`;
  const headers = import.meta.env.DEV
    ? { 'x-xtream-base': config.baseUrl }
    : undefined;

  let result;

  try {
    result = await httpGetTextResult(url, headers);
  } catch (error) {
    return {
      ok: false,
      message:
        'Could not reach the server. Check the address and your connection.',
      expiresAt: null,
    };
  }

  let data: unknown = null;
  if (result.text) {
    try {
      data = JSON.parse(result.text);
    } catch (error) {
      data = null;
    }
  }

  const info = userInfo(data);

  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      message: 'Wrong username or password.',
      expiresAt: null,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      message: `The server answered with HTTP ${result.status}.`,
      expiresAt: null,
    };
  }

  if (!info || Number(info.auth) === 0) {
    // Panels use an empty body or auth 0 for rejected credentials.
    return {
      ok: false,
      message: 'Wrong username or password.',
      expiresAt: null,
    };
  }

  const status = String(info.status || '').toLowerCase();

  if (status === 'banned') {
    return { ok: false, message: 'This account is banned.', expiresAt: null };
  }

  if (status === 'disabled') {
    return { ok: false, message: 'This account is disabled.', expiresAt: null };
  }

  const expiresAt = expiryDate(info.exp_date);

  if (status === 'expired' || (expiresAt && expiresAt.getTime() < Date.now())) {
    return {
      ok: false,
      message: 'This account has expired.',
      expiresAt: null,
    };
  }

  return {
    ok: true,
    message: 'Signed in.',
    expiresAt: expiresAt ? expiresAt.toLocaleDateString() : null,
  };
}

/** `exp_date` is unix seconds; 0 or null means the account never expires. */
function expiryDate(value: unknown): Date | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}
