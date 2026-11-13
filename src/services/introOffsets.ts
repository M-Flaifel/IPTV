/**
 * Learned "Skip intro" offsets.
 *
 * Xtream exposes no intro metadata, so the offset is learned from the first
 * skip on a series and reused for later episodes. Offsets live on the device
 * in `localStorage`, keyed by panel (`baseUrl|username`) and series id, so two
 * playlists never share them. Nothing is sent to the network.
 */

const STORAGE_KEY = 'iptv-intro-offsets';

/** Forward jump used the first time a series has no learned offset. */
export const DEFAULT_SKIP_SECONDS = 85;

/** How long into an episode the Skip intro action is offered. */
export const INTRO_WINDOW_SECONDS = 120;

interface StoredIntroOffset {
  seriesId: string;
  /** Absolute position from the episode start, in seconds. */
  offsetSeconds: number;
  updatedAt: number;
}

/** panelKey -> seriesId -> record. */
type IntroOffsetStore = Record<string, Record<string, StoredIntroOffset>>;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Non-fatal: the button still works for this playback.
  }
}

function readAll(): IntroOffsetStore {
  const raw = safeGet(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  return parsed as IntroOffsetStore;
}

function isUsableOffset(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

/** Learned intro offset for one panel + series, or null when not set yet. */
export function loadIntroOffset(
  panelKey: string,
  seriesId: string
): number | null {
  const all = readAll();
  const panel = all[panelKey];

  if (!panel || typeof panel !== 'object') {
    return null;
  }

  const record = panel[seriesId];
  if (!record || typeof record !== 'object') {
    return null;
  }

  return isUsableOffset(record.offsetSeconds)
    ? Math.round(record.offsetSeconds)
    : null;
}

/** Store (or replace) the learned offset for one panel + series. */
export function saveIntroOffset(
  panelKey: string,
  seriesId: string,
  offsetSeconds: number
): void {
  if (!isUsableOffset(offsetSeconds)) {
    return;
  }

  const all = readAll();
  const panel =
    all[panelKey] && typeof all[panelKey] === 'object' ? all[panelKey] : {};

  panel[seriesId] = {
    seriesId,
    offsetSeconds: Math.round(offsetSeconds),
    updatedAt: Date.now(),
  };
  all[panelKey] = panel;

  safeSet(STORAGE_KEY, JSON.stringify(all));
}
