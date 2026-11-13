/**
 * Global library search: Arabic-aware normalization, ranked matching, and a
 * bounded typo-tolerant fallback. Pure functions only, so the same code runs
 * in the browser, the TV, and a test harness.
 *
 * Search is deliberately script-local: an Arabic query matches Arabic titles
 * and a Latin query matches Latin titles. Titles are not transliterated.
 */

export type SearchSection = 'movie' | 'series';

export interface SearchEntry {
  id: string;
  name: string;
  section: SearchSection;
  /** Movie container extension; empty for series. */
  extension: string;
  /** Right-edge badge (a rating string); empty when the panel has none. */
  badge: string;
  number: number;
}

/** Bump when the stored entry shape or normalization changes. */
export const SEARCH_INDEX_VERSION = 1;

/** Upper bound keeps the virtualizer and the TV's memory comfortable. */
export const SEARCH_RESULT_LIMIT = 150;

/* ==========================================================================
   Normalization
   ========================================================================== */

// Tashkeel (harakat), Quranic marks, and tatweel are noise for matching.
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
const ARABIC_PUNCTUATION = /[\u060C\u061B\u061F\u066A-\u066D\u06D4]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
// Chromium 56 has no Unicode property escapes, so the keep-set is explicit:
// Latin letters/digits plus Arabic letters and Arabic-Indic digits.
const NOT_SEARCHABLE = /[^a-z0-9\u0621-\u064A\u0660-\u0669\u06F0-\u06F9]+/g;

/**
 * Fold a title or query to its matchable form:
 * - Latin lowercased and stripped of diacritics.
 * - Arabic stripped of tashkeel/tatweel, with alef/yeh/teh-marbuta variants
 *   unified so `أ إ آ` match `ا`, `ى` matches `ي`, and `ة` matches `ه`.
 * - Punctuation and symbols collapse to spaces.
 */
export function normalizeText(value: string): string {
  if (!value) {
    return '';
  }

  let text = value.toLowerCase();

  if (typeof text.normalize === 'function') {
    text = text.normalize('NFD').replace(COMBINING_MARKS, '');
  }

  text = text
    .replace(ARABIC_MARKS, '')
    .replace(TATWEEL, '')
    .replace(ARABIC_PUNCTUATION, ' ');

  text = text
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A');

  return text.replace(NOT_SEARCHABLE, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(' ') : [];
}

/* ==========================================================================
   Fuzzy primitives
   ========================================================================== */

/**
 * Damerau-Levenshtein distance with an upper bound. Returns `max + 1` as soon
 * as a row cannot come back under the bound, so most candidates are cheap.
 */
export function editDistance(a: string, b: string, max: number): number {
  const aLength = a.length;
  const bLength = b.length;

  if (Math.abs(aLength - bLength) > max) {
    return max + 1;
  }

  let prevPrev: number[] = [];
  let prev: number[] = [];
  let current: number[] = [];

  for (let j = 0; j <= bLength; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= aLength; i++) {
    current = [i];
    let rowMin = i;

    for (let j = 1; j <= bLength; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(
        prev[j] + 1,
        current[j - 1] + 1,
        prev[j - 1] + cost
      );

      // Transposition (two adjacent swapped letters) costs one edit.
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }

      current[j] = value;
      if (value < rowMin) {
        rowMin = value;
      }
    }

    if (rowMin > max) {
      return max + 1;
    }

    prevPrev = prev;
    prev = current;
  }

  return prev[bLength];
}

function trigramSet(value: string): Record<string, true> {
  const grams: Record<string, true> = {};
  const text = ` ${value} `;

  for (let i = 0; i < text.length - 2; i++) {
    grams[text.slice(i, i + 3)] = true;
  }

  return grams;
}

/** Dice coefficient over trigrams; 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  if (a.length < 3 || b.length < 3) {
    return 0;
  }

  const left = trigramSet(a);
  const right = trigramSet(b);
  let shared = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (const gram in left) {
    if (Object.prototype.hasOwnProperty.call(left, gram)) {
      leftCount += 1;
      if (right[gram]) {
        shared += 1;
      }
    }
  }

  for (const gram in right) {
    if (Object.prototype.hasOwnProperty.call(right, gram)) {
      rightCount += 1;
    }
  }

  return (2 * shared) / (leftCount + rightCount);
}

/**
 * Does one query token match one name token? Exact, prefix, and substring
 * come first; short tokens also try trigram similarity, longer ones a
 * length-scaled edit distance (1 edit under 5 characters, 2 above).
 */
function tokenScore(queryToken: string, nameToken: string): number {
  if (nameToken === queryToken) {
    return 100;
  }

  if (nameToken.indexOf(queryToken) === 0) {
    return 80;
  }

  if (queryToken.length >= 3 && nameToken.indexOf(queryToken) !== -1) {
    return 60;
  }

  if (queryToken.length < 3) {
    return 0;
  }

  const maxEdits = queryToken.length < 5 ? 1 : 2;

  if (editDistance(queryToken, nameToken, maxEdits) <= maxEdits) {
    return 40;
  }

  if (queryToken.length <= 5 && trigramSimilarity(queryToken, nameToken) >= 0.5) {
    return 30;
  }

  return 0;
}

/* ==========================================================================
   Ranking
   ========================================================================== */

interface PreparedEntry {
  entry: SearchEntry;
  normalizedName: string;
  tokens: string[];
}

function prepare(entry: SearchEntry): PreparedEntry {
  const normalizedName = normalizeText(entry.name);
  return {
    entry,
    normalizedName,
    tokens: tokenize(normalizedName),
  };
}

/**
 * Every query token must match at least one name token; the entry's score is
 * the sum of its best per-token matches plus a whole-name bonus. A shorter
 * name wins ties, so "Alien" outranks "Alien Resurrection" for "alien".
 */
function scoreEntry(
  prepared: PreparedEntry,
  query: string,
  queryTokens: string[]
): number {
  let score = 0;

  for (let i = 0; i < queryTokens.length; i++) {
    const queryToken = queryTokens[i];
    let best = 0;

    for (let j = 0; j < prepared.tokens.length; j++) {
      const value = tokenScore(queryToken, prepared.tokens[j]);

      if (value > best) {
        best = value;
        if (best === 100) {
          break;
        }
      }
    }

    if (best === 0) {
      return 0;
    }

    score += best;
  }

  if (prepared.normalizedName === query) {
    score += 500;
  } else if (prepared.normalizedName.indexOf(query) === 0) {
    score += 300;
  } else if (prepared.normalizedName.indexOf(query) !== -1) {
    score += 100;
  }

  return score;
}

/**
 * Rank `entries` against `query` and return at most `limit` matches.
 * Matching is over the normalized title only (no category or description),
 * which keeps the index small and the ranking predictable.
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
  limit: number = SEARCH_RESULT_LIMIT
): SearchEntry[] {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const queryTokens = tokenize(normalizedQuery);
  const scored: Array<{ entry: SearchEntry; score: number; length: number }> = [];

  for (let i = 0; i < entries.length; i++) {
    const prepared = prepare(entries[i]);
    const score = scoreEntry(prepared, normalizedQuery, queryTokens);

    if (score > 0) {
      scored.push({
        entry: entries[i],
        score,
        length: prepared.normalizedName.length,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (a.length !== b.length) {
      return a.length - b.length;
    }

    return a.entry.name.localeCompare(b.entry.name);
  });

  const results: SearchEntry[] = [];
  const cap = Math.min(limit, scored.length);

  for (let i = 0; i < cap; i++) {
    results.push(scored[i].entry);
  }

  return results;
}
