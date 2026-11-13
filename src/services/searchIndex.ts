import { SEARCH_INDEX_VERSION } from './search';
import type { SearchEntry, SearchSection } from './search';
import { SEARCH_STORE, getDb } from './db';
import { fetchSeries, fetchVodStreams } from './xtream';
import type { MediaItem, XtreamConfig } from '../types';

/**
 * One-time full-catalog search index.
 *
 * The README's lazy-row rule is relaxed here on purpose: search needs the
 * whole movie + series catalog once. The result is cached in IndexedDB keyed
 * by `baseUrl|username` with a schema version, so the TV does not re-download
 * it on every launch. Normal per-category browsing never touches this.
 */

/** Beyond this the payload is not worth holding on a 2018 TV. */
const MAX_INDEX_ENTRIES = 60000;

/** Rows kept from categories browsed this session, for the failure fallback. */
const MAX_VISITED_PER_ACCOUNT = 4000;

export interface SearchIndexResult {
  entries: SearchEntry[];
  /** True when the full fetch failed and only visited rows are indexed. */
  partial: boolean;
  fetchedAt: number;
}

const buildPromises = new Map<string, Promise<SearchIndexResult>>();

/** Visited rows per account, as a fallback when the full fetch fails. */
const visitedEntries = new Map<string, SearchEntry[]>();

export function searchIndexKey(config: XtreamConfig): string {
  return `${config.baseUrl}|${config.username}`;
}

function toEntry(
  item: MediaItem,
  section: SearchSection
): SearchEntry {
  return {
    id: item.id,
    name: item.name,
    section,
    extension: section === 'movie' ? item.extension || 'mp4' : '',
    badge: item.badge || '',
    number: item.number,
  };
}

/**
 * Remember one loaded category's rows. This is not the index; it only feeds
 * the partial fallback when the full-catalog request fails.
 */
export function rememberVisitedRows(
  config: XtreamConfig,
  section: SearchSection,
  items: MediaItem[]
): void {
  if (items.length === 0) {
    return;
  }

  const key = searchIndexKey(config);
  const entries = items.map((item) => toEntry(item, section));
  const existing = visitedEntries.get(key);

  if (!existing) {
    visitedEntries.set(key, entries);
    return;
  }

  // Merge by id + section so re-visiting a category replaces its rows.
  const seen: Record<string, true> = {};
  const merged: SearchEntry[] = [];

  const push = (entry: SearchEntry) => {
    const marker = `${entry.section}|${entry.id}`;

    if (seen[marker]) {
      return;
    }

    seen[marker] = true;
    merged.push(entry);
  };

  for (let i = 0; i < entries.length; i++) {
    push(entries[i]);
  }

  for (let i = 0; i < existing.length; i++) {
    push(existing[i]);
  }

  visitedEntries.set(
    key,
    merged.length > MAX_VISITED_PER_ACCOUNT
      ? merged.slice(0, MAX_VISITED_PER_ACCOUNT)
      : merged
  );
}

async function readStoredIndex(
  key: string
): Promise<SearchIndexResult | null> {
  try {
    const db = await getDb();
    const record = await db.get(SEARCH_STORE, key);

    if (!record || record.version !== SEARCH_INDEX_VERSION) {
      return null;
    }

    return {
      entries: record.entries,
      partial: false,
      fetchedAt: record.fetchedAt,
    };
  } catch (error) {
    // A missing/unavailable cache only costs one rebuild.
    return null;
  }
}

async function writeStoredIndex(
  key: string,
  entries: SearchEntry[]
): Promise<number> {
  const fetchedAt = Date.now();

  try {
    const db = await getDb();
    await db.put(
      SEARCH_STORE,
      {
        version: SEARCH_INDEX_VERSION,
        fetchedAt,
        entries,
      },
      key
    );
  } catch (error) {
    // Search still works from memory; persistence is best-effort.
  }

  return fetchedAt;
}

async function buildIndex(
  config: XtreamConfig,
  key: string
): Promise<SearchIndexResult> {
  try {
    const [movies, series] = await Promise.all([
      fetchVodStreams(config),
      fetchSeries(config),
    ]);

    const entries: SearchEntry[] = [];

    for (let i = 0; i < movies.length; i++) {
      entries.push(toEntry(movies[i], 'movie'));
    }

    for (let i = 0; i < series.length; i++) {
      entries.push(toEntry(series[i], 'series'));
    }

    if (entries.length > MAX_INDEX_ENTRIES) {
      throw new Error('This catalog is too large to index on this device.');
    }

    const fetchedAt = await writeStoredIndex(key, entries);
    return { entries, partial: false, fetchedAt };
  } catch (error) {
    const fallback = visitedEntries.get(key);

    if (fallback && fallback.length > 0) {
      return { entries: fallback, partial: true, fetchedAt: Date.now() };
    }

    throw error;
  }
}

/**
 * Return the cached index, or build it once. Concurrent callers share the
 * same in-flight build. `refresh` ignores the cache and refetches.
 */
export async function ensureSearchIndex(
  config: XtreamConfig,
  refresh: boolean = false
): Promise<SearchIndexResult> {
  const key = searchIndexKey(config);

  if (!refresh) {
    const stored = await readStoredIndex(key);

    if (stored) {
      return stored;
    }
  }

  const inFlight = buildPromises.get(key);

  if (inFlight) {
    return inFlight;
  }

  const promise = buildIndex(config, key).then(
    (result) => {
      buildPromises.delete(key);
      return result;
    },
    (error) => {
      buildPromises.delete(key);
      throw error;
    }
  );

  buildPromises.set(key, promise);
  return promise;
}
