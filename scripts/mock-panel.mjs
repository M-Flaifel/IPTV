/**
 * Dev-only fake Xtream panel, used to verify the Live TV list in a browser.
 * The dev proxy (vite.config.ts) forwards `/xtream/player_api.php` to the
 * `x-xtream-base` host, so seeding a playlist pointing at this server makes
 * categories and streams load without a real panel. Not shipped in the widget.
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
