import type { XtreamConfig } from '../types';
import { AvPlayAdapter, getAvPlay } from './avplay';
import { Html5PlayerAdapter } from './html5Player';

export type PlaybackKind = 'mp4' | 'hls' | 'ts';

export interface PlaybackSource {
  url: string;
  kind: PlaybackKind;
  /** True when the URL is the bundled preview clip rather than a real stream. */
  preview: boolean;
}

export type PlaybackMode = 'auto' | 'mock' | 'xtream';

export type PlayerEngine = 'avplay' | 'html5';

export type PlayerState = 'opening' | 'playing' | 'paused' | 'error';

export interface PlayerListener {
  onStateChange: (state: PlayerState) => void;
  onError: (message: string) => void;
}

export interface PlayerAdapter {
  readonly engine: PlayerEngine;
  open(
    source: PlaybackSource,
    host: HTMLElement,
    listener: PlayerListener
  ): Promise<void>;
  play(): void;
  pause(): void;
  close(): void;
  isPlaying(): boolean;
}

const MOCK_SOURCE_URL = '/mock-stream.mp4';

/**
 * Xtream live streams are served from `/live/<user>/<pass>/<id>.<ext>`.
 * `.m3u8` is the container AVPlay expects on Tizen.
 */
export function buildLiveStreamUrl(
  config: XtreamConfig,
  streamId: string,
  extension: 'm3u8' | 'ts' = 'm3u8'
): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  const user = encodeURIComponent(config.username);
  const pass = encodeURIComponent(config.password);
  const id = encodeURIComponent(streamId);

  return `${base}/live/${user}/${pass}/${id}.${extension}`;
}

export function hasAvPlay(): boolean {
  return getAvPlay() !== null;
}

/**
 * Xtream VOD streams are served from `/movie/<user>/<pass>/<id>.<ext>` and
 * `/series/<user>/<pass>/<id>.<ext>`, where the extension comes from the
 * catalog's `container_extension`.
 */
export function buildVodStreamUrl(
  config: XtreamConfig,
  section: 'movie' | 'series',
  streamId: string,
  extension: string
): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  const user = encodeURIComponent(config.username);
  const pass = encodeURIComponent(config.password);
  const id = encodeURIComponent(streamId);

  return `${base}/${section}/${user}/${pass}/${id}.${extension}`;
}

/**
 * A packaged Tizen app exposes `window.webapis.avplay`, so the real Xtream
 * stream is used. Everywhere else the browser has no HLS engine yet, so the
 * bundled MP4 keeps the preview overlay functional.
 */
export function resolvePlaybackSource(
  config: XtreamConfig,
  channel: { id: string },
  mode: PlaybackMode = 'auto'
): PlaybackSource {
  const useXtream = mode === 'xtream' || (mode === 'auto' && hasAvPlay());

  if (useXtream) {
    return {
      url: buildLiveStreamUrl(config, channel.id),
      kind: 'hls',
      preview: false,
    };
  }

  return { url: MOCK_SOURCE_URL, kind: 'mp4', preview: true };
}

/**
 * Same policy as `resolvePlaybackSource` for VOD items. `.m3u8` files are
 * HLS; anything else (mp4, mkv, avi…) is a progressive file.
 */
export function resolveVodPlaybackSource(
  config: XtreamConfig,
  section: 'movie' | 'series',
  item: { id: string; extension?: string },
  mode: PlaybackMode = 'auto'
): PlaybackSource {
  const useXtream = mode === 'xtream' || (mode === 'auto' && hasAvPlay());

  if (useXtream) {
    const extension = item.extension || 'mp4';
    return {
      url: buildVodStreamUrl(config, section, item.id, extension),
      kind: extension === 'm3u8' ? 'hls' : 'mp4',
      preview: false,
    };
  }

  return { url: MOCK_SOURCE_URL, kind: 'mp4', preview: true };
}

export function createPlayerAdapter(): PlayerAdapter {
  const avplay = getAvPlay();
  return avplay ? new AvPlayAdapter(avplay) : new Html5PlayerAdapter();
}
