import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Category } from '../types';

interface CategoryCacheEntry {
  categories: Category[];
  updatedAt: number;
}

interface IptvDB extends DBSchema {
  categories: {
    key: string;
    value: CategoryCacheEntry;
  };
}

const DB_NAME = 'iptv';
const DB_VERSION = 1;
const STORE = 'categories';

let dbPromise: Promise<IDBPDatabase<IptvDB>> | null = null;

function getDb(): Promise<IDBPDatabase<IptvDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IptvDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

export async function readCachedCategories(
  accountKey: string
): Promise<Category[] | null> {
  try {
    const db = await getDb();
    const entry = await db.get(STORE, accountKey);
    return entry ? entry.categories : null;
  } catch (error) {
    // IndexedDB can be unavailable in private windows and some webviews.
    return null;
  }
}

export async function writeCachedCategories(
  accountKey: string,
  categories: Category[]
): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, {
      categories,
      updatedAt: Date.now(),
    }, accountKey);
  } catch (error) {
    // Caching is best-effort; the network copy remains the source of truth.
  }
}
