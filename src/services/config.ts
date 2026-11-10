import type { XtreamConfig } from '../types';

const STORAGE_KEY = 'iptv-xtream-config';

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

export function loadConfig(): XtreamConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<XtreamConfig> | null;
    if (!parsed) {
      return null;
    }

    const config: XtreamConfig = {
      baseUrl: normalizeBaseUrl(String(parsed.baseUrl || '')),
      username: String(parsed.username || '').trim(),
      password: String(parsed.password || ''),
    };

    return isValidConfig(config) ? config : null;
  } catch (error) {
    return null;
  }
}

export function saveConfig(config: XtreamConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    // Non-fatal: the app still works for this session.
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Ignore storage failures.
  }
}

export function configKey(config: XtreamConfig): string {
  return `${config.baseUrl}|${config.username}`;
}
