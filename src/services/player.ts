import type { Channel, XtreamConfig } from '../types';

export type PlaybackKind = 'mp4' | 'hls' | 'ts';

export interface PlaybackSource {
  url: string;
  kind: PlaybackKind;
  /** True when the URL is the bundled preview clip rather than a real stream. */
  preview: boolean;
}

export type PlaybackMode = 'mock' | 'xtream';

/**
 * Option C: the player shell is validated against a bundled MP4 before an HLS
 * or native engine is chosen. Native AVPlay (option B) will pass `'xtream'`
 * once it is installed; the overlay does not need to change.
 */
export const DEFAULT_PLAYBACK_MODE: PlaybackMode = 'mock';

const MOCK_SOURCE_URL = '/mock-stream.mp4';

/**
 * Xtream live streams are served from `/live/<user>/<pass>/<id>.<ext>`.
 * `.m3u8` is the container a native TV player or a future hls.js build expects.
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

export function resolvePlaybackSource(
  config: XtreamConfig,
  channel: Channel,
  mode: PlaybackMode = DEFAULT_PLAYBACK_MODE
): PlaybackSource {
  if (mode === 'xtream') {
    return {
      url: buildLiveStreamUrl(config, channel.id),
      kind: 'hls',
      preview: false,
    };
  }

  return { url: MOCK_SOURCE_URL, kind: 'mp4', preview: true };
}
