import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Category } from '../types';
import type { SearchEntry } from './search';

/**
 * One IndexedDB handle for every cached dataset. The database is versioned
 * here (not per feature) so a new store is a single upgrade step; opening it
 * with different versions from two modules would race.
 */

export interface CategoryCacheEntry {
  categories: Category[];
  updatedAt: number;
}

export interface SearchIndexRecord {
  /** Search index schema version; a mismatch invalidates the record. */
  version: number;
  fetchedAt: number;
  entries: SearchEntry[];
}

interface IptvDB extends DBSchema {
  categories: {
    key: string;
    value: CategoryCacheEntry;
  };
  searchIndex: {
    key: string;
    value: SearchIndexRecord;
  };
}

const DB_NAME = 'iptv';
const DB_VERSION = 2;
const CATEGORY_STORE = 'categories';
const SEARCH_STORE = 'searchIndex';

let dbPromise: Promise<IDBPDatabase<IptvDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<IptvDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IptvDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CATEGORY_STORE)) {
          db.createObjectStore(CATEGORY_STORE);
        }

        if (!db.objectStoreNames.contains(SEARCH_STORE)) {
          db.createObjectStore(SEARCH_STORE);
        }
      },
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

export { CATEGORY_STORE, SEARCH_STORE };
