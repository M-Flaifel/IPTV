import { CATEGORY_STORE, getDb } from './db';
import type { Category } from '../types';

/**
 * Category headers cached per section (the key embeds the account and
 * section). The database handle and version live in `services/db.ts`.
 */

export async function readCachedCategories(
  accountKey: string
): Promise<Category[] | null> {
  try {
    const db = await getDb();
    const entry = await db.get(CATEGORY_STORE, accountKey);
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
    await db.put(
      CATEGORY_STORE,
      {
        categories,
        updatedAt: Date.now(),
      },
      accountKey
    );
  } catch (error) {
    // Caching is best-effort; the network copy remains the source of truth.
  }
}
