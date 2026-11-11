/**
 * Dev-only fake Xtream panel, used to verify the Live TV, Movies, and Series
 * screens in a browser. The dev proxy (vite.config.ts) forwards
 * `/xtream/player_api.php` to the `x-xtream-base` host, so seeding a playlist
 * pointing at this server makes categories and streams load without a real
 * panel. Playback itself is never served here: the browser preview always
 * plays the bundled mock-stream.mp4. Not shipped in the widget.
 *
 * Usage: node scripts/mock-panel.mjs [port]   (default 8788)
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2]) || 8788;
const HOST = '127.0.0.1';

const CATEGORIES = [
  { category_id: '1', category_name: 'News' },
  { category_id: '2', category_name: 'Sports' },
  { category_id: '3', category_name: 'Movies' },
  { category_id: '4', category_name: 'Kids' },
];

const VOD_CATEGORIES = [
  { category_id: 'v1', category_name: 'Action' },
  { category_id: 'v2', category_name: 'Comedy' },
  { category_id: 'v3', category_name: 'Sci-Fi' },
];

const SERIES_CATEGORIES = [
  { category_id: 's1', category_name: 'Crime' },
  { category_id: 's2', category_name: 'Thriller' },
];

function stream(id, name, num, categoryId) {
  return {
    stream_id: id,
    name,
    num: num === null ? 0 : num,
    stream_icon: '',
    category_id: categoryId,
  };
}

function streamsFor(categoryId) {
  // Sports is large enough to force the virtualizer to recycle rows.
  const count = categoryId === '2' ? 60 : 12;
  const baseName = categoryName(categoryId);
  const list = [];

  for (let i = 0; i < count; i++) {
    // Every fifth channel has no number, so the number column keeps names
    // aligned for channels without one.
    const num = i % 5 === 4 ? null : i + 1;
    list.push(
      stream(`${categoryId}-${i + 1}`, `${baseName} ${i + 1} HD`, num, categoryId)
    );
  }

  return list;
}

function categoryName(categoryId) {
  const found = CATEGORIES.find((category) => category.category_id === categoryId);
  return found ? found.category_name : 'Channel';
}

function vodCategoryName(categoryId) {
  const found = VOD_CATEGORIES.find((category) => category.category_id === categoryId);
  return found ? found.category_name : 'Movie';
}

function moviesFor(categoryId) {
  const count = categoryId === 'v1' ? 30 : 30;
  const baseName = vodCategoryName(categoryId);
  const list = [];

  for (let i = 0; i < count; i++) {
    // Every sixth movie is unrated and every seventh an mkv, so the badge and
    // extension handling both have cases to hit.
    const rating = i % 6 === 5 ? 0 : 5.5 + (i % 40) / 10;
    const extension = i % 7 === 6 ? 'mkv' : 'mp4';

    list.push({
      stream_id: `${categoryId}-${i + 1}`,
      name: `${baseName} Title ${i + 1}`,
      num: i + 1,
      rating: rating.toFixed(1),
      container_extension: extension,
      category_id: categoryId,
    });
  }

  return list;
}

function seriesCategoryName(categoryId) {
  const found = SERIES_CATEGORIES.find((category) => category.category_id === categoryId);
  return found ? found.category_name : 'Series';
}

function seriesFor(categoryId) {
  const baseName = seriesCategoryName(categoryId);
  const list = [];

  for (let i = 0; i < 6; i++) {
    list.push({
      series_id: `${categoryId}-${i + 1}`,
      name: `${baseName} Show ${i + 1}`,
      num: i + 1,
      rating: (7 + (i % 30) / 10).toFixed(1),
      category_id: categoryId,
    });
  }

  return list;
}

/** Two seasons: 8 episodes in season 1, 4 in season 2. */
function seriesInfoFor(seriesId) {
  const counts = { 1: 8, 2: 4 };
  const episodes = {};

  for (const season of ['1', '2']) {
    episodes[season] = [];

    for (let i = 0; i < counts[season]; i++) {
      // Every fifth episode has no title, exercising the "Episode N" fallback.
      episodes[season].push({
        id: `${seriesId}-s${season}e${i + 1}`,
        episode_num: i + 1,
        title: i % 5 === 4 ? '' : `Episode ${i + 1}`,
        container_extension: i % 6 === 5 ? 'mkv' : 'mp4',
      });
    }
  }

  return {
    seasons: [{ season: 1 }, { season: 2 }],
    episodes,
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method !== 'GET' || url.pathname !== '/player_api.php') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const action = url.searchParams.get('action') || '';
  let body;

  if (action === 'get_live_categories') {
    body = CATEGORIES;
  } else if (action === 'get_live_streams') {
    const categoryId = url.searchParams.get('category_id');
    body = categoryId
      ? streamsFor(categoryId)
      : CATEGORIES.flatMap((category) => streamsFor(category.category_id));
  } else if (action === 'get_vod_categories') {
    body = VOD_CATEGORIES;
  } else if (action === 'get_vod_streams') {
    const categoryId = url.searchParams.get('category_id');
    body = categoryId
      ? moviesFor(categoryId)
      : VOD_CATEGORIES.flatMap((category) => moviesFor(category.category_id));
  } else if (action === 'get_series_categories') {
    body = SERIES_CATEGORIES;
  } else if (action === 'get_series') {
    const categoryId = url.searchParams.get('category_id');
    body = categoryId
      ? seriesFor(categoryId)
      : SERIES_CATEGORIES.flatMap((category) => seriesFor(category.category_id));
  } else if (action === 'get_series_info') {
    const seriesId = url.searchParams.get('series_id') || '';
    body = seriesId ? seriesInfoFor(seriesId) : [];
  } else {
    // No action: the account check used by the playlist form.
    body = {
      user_info: {
        username: 'demo',
        auth: 1,
        status: 'Active',
        exp_date: null,
      },
    };
  }

  res.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
});

server.listen(PORT, HOST, () => {
  console.log(`mock panel: http://${HOST}:${PORT}/player_api.php`);
});
