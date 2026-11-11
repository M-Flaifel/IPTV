import type { Category, Channel, XtreamConfig } from '../types';
import { httpGetText, httpGetTextResult } from './http';

const API_FILE = 'player_api.php';
const DEV_PROXY_PATH = '/xtream/player_api.php';

interface RawCategory {
  category_id?: string | number;
  category_name?: string;
}

interface RawStream {
  stream_id?: string | number;
  name?: string;
  num?: string | number;
  stream_icon?: string;
  category_id?: string | number;
}

function buildQuery(
  config: XtreamConfig,
  params: Record<string, string>
): string {
  const search = new URLSearchParams();
  search.set('username', config.username);
  search.set('password', config.password);

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      search.set(key, params[key]);
    }
  }

  return search.toString();
}

async function request(
  config: XtreamConfig,
  params: Record<string, string>
): Promise<unknown> {
  const query = buildQuery(config, params);

  // In development the Vite server proxies the panel, so the browser stays
  // same-origin and CORS does not apply. Production calls the panel directly;
  // native shells install their own HTTP transport via services/http.
  const url = import.meta.env.DEV
    ? `${DEV_PROXY_PATH}?${query}`
    : `${config.baseUrl}/${API_FILE}?${query}`;

  const headers = import.meta.env.DEV
    ? { 'x-xtream-base': config.baseUrl }
    : undefined;

  const text = await httpGetText(url, headers);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('The Xtream server returned an invalid response.');
  }
}

export async function fetchLiveCategories(
  config: XtreamConfig
): Promise<Category[]> {
  const data = await request(config, { action: 'get_live_categories' });

  if (!Array.isArray(data)) {
    throw new Error(
      'Could not load categories. Check the server URL and credentials.'
    );
  }

  const seen: Record<string, true> = {};
  const categories: Category[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawCategory;
    const id = String(raw.category_id || '');
    const name = String(raw.category_name || '').trim();

    if (!id || !name || seen[id]) {
      continue;
    }

    seen[id] = true;
    categories.push({ id, name });
  }

  return categories;
}

export async function fetchLiveStreams(
  config: XtreamConfig,
  categoryId?: string
): Promise<Channel[]> {
  const params: Record<string, string> = { action: 'get_live_streams' };

  if (categoryId) {
    params.category_id = categoryId;
  }

  const data = await request(config, params);

  if (!Array.isArray(data)) {
    throw new Error('Could not load channels for this category.');
  }

  const channels: Channel[] = [];

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] as RawStream;
    const id = String(raw.stream_id || '');
    const name = String(raw.name || '').trim();

    if (!id || !name) {
      continue;
    }

    const number = Number(raw.num);

    channels.push({
      id,
      name,
      number: Number.isFinite(number) ? number : 0,
      logo: typeof raw.stream_icon === 'string' ? raw.stream_icon : '',
      categoryId: String(raw.category_id || ''),
    });
  }

  return channels;
}

/** The subset of `player_api.php`'s `user_info` the check reads. */
interface RawUserInfo {
  auth?: string | number;
  status?: string;
  exp_date?: string | number | null;
}

interface RawAccountResponse {
  user_info?: RawUserInfo;
}

export interface CredentialCheck {
  ok: boolean;
  /** Human-readable result, safe to show in the form. */
  message: string;
  /** Expiry as a locale date, when the panel reports one. */
  expiresAt: string | null;
}

function userInfo(data: unknown): RawUserInfo | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const info = (data as RawAccountResponse).user_info;
  return info && typeof info === 'object' ? info : null;
}

/**
 * Signs in against `player_api.php` with no action, which returns the
 * account's `user_info` for valid credentials. Panels answer wrong
 * credentials with HTTP 401 or an empty/`auth: 0` body, so the status and
 * the body together decide the verdict. The password echoed back by some
 * panels is never read, logged, or stored.
 */
export async function checkCredentials(
  config: XtreamConfig
): Promise<CredentialCheck> {
  const query = buildQuery(config, {});
  const url = import.meta.env.DEV
    ? `${DEV_PROXY_PATH}?${query}`
    : `${config.baseUrl}/${API_FILE}?${query}`;
  const headers = import.meta.env.DEV
    ? { 'x-xtream-base': config.baseUrl }
    : undefined;

  let result;

  try {
    result = await httpGetTextResult(url, headers);
  } catch (error) {
    return {
      ok: false,
      message:
        'Could not reach the server. Check the address and your connection.',
      expiresAt: null,
    };
  }

  let data: unknown = null;
  if (result.text) {
    try {
      data = JSON.parse(result.text);
    } catch (error) {
      data = null;
    }
  }

  const info = userInfo(data);

  if (result.status === 401 || result.status === 403) {
    return {
      ok: false,
      message: 'Wrong username or password.',
      expiresAt: null,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      message: `The server answered with HTTP ${result.status}.`,
      expiresAt: null,
    };
  }

  if (!info || Number(info.auth) === 0) {
    // Panels use an empty body or auth 0 for rejected credentials.
    return {
      ok: false,
      message: 'Wrong username or password.',
      expiresAt: null,
    };
  }

  const status = String(info.status || '').toLowerCase();

  if (status === 'banned') {
    return { ok: false, message: 'This account is banned.', expiresAt: null };
  }

  if (status === 'disabled') {
    return { ok: false, message: 'This account is disabled.', expiresAt: null };
  }

  const expiresAt = expiryDate(info.exp_date);

  if (status === 'expired' || (expiresAt && expiresAt.getTime() < Date.now())) {
    return {
      ok: false,
      message: 'This account has expired.',
      expiresAt: null,
    };
  }

  return {
    ok: true,
    message: 'Signed in.',
    expiresAt: expiresAt ? expiresAt.toLocaleDateString() : null,
  };
}

/** `exp_date` is unix seconds; 0 or null means the account never expires. */
function expiryDate(value: unknown): Date | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}
