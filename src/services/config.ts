import type { XtreamConfig } from '../types';

/**
 * Pure playlist/config helpers. Persistence lives in
 * `services/playlistStore.ts`; the derived `XtreamConfig` feeds the data and
 * playback services.
 */

export function normalizeBaseUrl(input: string): string {
  let value = input.trim();

  if (!value) {
    return '';
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  return value.replace(/\/+$/, '');
}

export function isValidConfig(
  config: XtreamConfig | null
): config is XtreamConfig {
  if (!config) {
    return false;
  }

  return Boolean(
    config.baseUrl && config.username && config.password
  );
}

/**
 * Cache/remount key for a playlist's data. Two playlists with the same
 * server and username share the same key by design.
 */
export function configKey(config: XtreamConfig): string {
  return `${config.baseUrl}|${config.username}`;
}
