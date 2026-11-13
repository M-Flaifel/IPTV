/**
 * Samsung Tizen media-key registration.
 *
 * The TV remote's media keys (play, pause, play/pause, stop) are blocked
 * from web apps by default: the TV's system layer consumes them and shows
 * its own overlay instead of delivering them to the page. Registering them
 * through the TV input device API routes the keys to the app as keydown
 * events with Tizen's standard key codes (415, 19, 10252, 413), which the
 * player overlay handles.
 *
 * The required `http://tizen.org/privilege/tv.inputdevice` privilege is
 * declared in `tizen/config.xml`. Browsers and runtimes without the API
 * deliver no media keys at all, so registration there is a no-op.
 */

interface TvInputDeviceApi {
  registerKey(keyName: string): void;
}

declare global {
  interface Window {
    tizen?: {
      tvinputdevice?: TvInputDeviceApi;
    };
  }
}

/** Media key names as Tizen expects them; the player handles all four. */
const MEDIA_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
];

/**
 * Channel keys are also consumed by the TV unless registered. The player
 * handles them as key codes 427 (up) and 428 (down) to step live channels.
 */
const CHANNEL_KEYS = ['ChannelUp', 'ChannelDown'];

export function registerTizenMediaKeys(): void {
  const input = window.tizen && window.tizen.tvinputdevice;

  if (!input || typeof input.registerKey !== 'function') {
    return;
  }

  const keys = MEDIA_KEYS.concat(CHANNEL_KEYS);
  let registered = 0;

  for (const key of keys) {
    try {
      input.registerKey(key);
      registered += 1;
    } catch (error) {
      // A key unsupported on this firmware stays unregistered; the rest
      // still work. Re-registering an already-registered key also lands
      // here harmlessly.
      console.warn(`tizenkeys: could not register ${key}`);
    }
  }

  if (registered > 0) {
    console.info(`tizenkeys: registered ${registered} key(s)`);
  }
}
