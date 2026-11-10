import type { Category, Channel, XtreamConfig } from '../types';
import { httpGetText } from './http';

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
