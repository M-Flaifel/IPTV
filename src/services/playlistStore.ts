/**
 * Saved playlist storage.
 *
 * Multiple named playlists live in `localStorage` as a list under
 * `iptv-playlists`, with the selected one's id in `iptv-active-playlist`.
 * The pre-0.3 single-credential storage (`iptv-xtream-config`) is migrated
 * into one playlist on first load, so an update never loses the saved
 * credentials.
 */

import type { Playlist, XtreamConfig } from '../types';
import { normalizeBaseUrl } from './config';

const LIST_KEY = 'iptv-playlists';
const ACTIVE_KEY = 'iptv-active-playlist';
const LEGACY_KEY = 'iptv-xtream-config';

export function generatePlaylistId(): string {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parsePlaylist(value: unknown): Playlist | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const playlist: Playlist = {
    id: typeof record.id === 'string' ? record.id : '',
    name: typeof record.name === 'string' ? record.name.trim() : '',
    baseUrl: normalizeBaseUrl(
      typeof record.baseUrl === 'string' ? record.baseUrl : ''
    ),
    username:
      typeof record.username === 'string' ? record.username.trim() : '',
    password: typeof record.password === 'string' ? record.password : '',
  };

  if (
    !playlist.id ||
    !playlist.name ||
    !playlist.baseUrl ||
    !playlist.username ||
    !playlist.password
  ) {
    return null;
  }

  return playlist;
}

function readList(): Playlist[] {
  const stored = safeGet(LIST_KEY);
  if (!stored) {
    return [];
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const playlists: Playlist[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const playlist = parsePlaylist(parsed[i]);
    if (playlist) {
      playlists.push(playlist);
    }
  }

  return playlists;
}

/** Default name for a migrated playlist: its panel host. */
function legacyName(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).host;
    return host || 'My playlist';
  } catch (error) {
    return 'My playlist';
  }
}

export function loadPlaylists(): Playlist[] {
  const playlists = readList();
  if (playlists.length > 0) {
    return playlists;
  }

  // First run on 0.3+: adopt the pre-0.3 single-config storage.
  const legacy = safeGet(LEGACY_KEY);
  if (!legacy) {
    return [];
  }

  let parsedLegacy: unknown = null;
  try {
    parsedLegacy = JSON.parse(legacy);
  } catch (error) {
    safeRemove(LEGACY_KEY);
    return [];
  }

  const record =
    parsedLegacy && typeof parsedLegacy === 'object'
      ? (parsedLegacy as Record<string, unknown>)
      : {};

  const playlist = parsePlaylist({
    id: generatePlaylistId(),
    name:
      typeof record.name === 'string' && record.name.trim()
        ? record.name
        : legacyName(normalizeBaseUrl(String(record.baseUrl || ''))),
    baseUrl: record.baseUrl,
    username: record.username,
    password: record.password,
  });

  // Drop the legacy key either way, so a deleted playlist cannot resurrect.
  safeRemove(LEGACY_KEY);

  if (!playlist) {
    return [];
  }

  savePlaylists([playlist]);
  saveActivePlaylistId(playlist.id);
  return [playlist];
}

export function savePlaylists(playlists: Playlist[]): void {
  safeSet(LIST_KEY, JSON.stringify(playlists));
}

export function loadActivePlaylistId(): string | null {
  return safeGet(ACTIVE_KEY);
}

export function saveActivePlaylistId(id: string | null): void {
  if (id === null) {
    safeRemove(ACTIVE_KEY);
    return;
  }

  safeSet(ACTIVE_KEY, id);
}

export function toXtreamConfig(playlist: Playlist): XtreamConfig {
  return {
    baseUrl: playlist.baseUrl,
    username: playlist.username,
    password: playlist.password,
  };
}

export function playlistHost(playlist: Playlist): string {
  try {
    const host = new URL(playlist.baseUrl).host;
    return host || playlist.baseUrl;
  } catch (error) {
    return playlist.baseUrl;
  }
}

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
    // Non-fatal: the app still works for this session.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage failures.
  }
}
