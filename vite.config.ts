import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Dev-only Xtream proxy. The browser sends the selected panel base URL in the
 * `x-xtream-base` header, so the app can stay same-origin while the settings
 * screen connects to an arbitrary server. Production builds call the panel
 * directly and rely on the native shell for CORS.
 */
function xtreamDevProxy(): Plugin {
  return {
    name: 'xtream-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/xtream', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const header = req.headers['x-xtream-base'];
        const baseUrl = Array.isArray(header) ? header[0] : header;

        if (!baseUrl) {
          res.statusCode = 400;
          res.end('Missing x-xtream-base header');
          return;
        }

        let target: URL;

        try {
          target = new URL(
            req.url || '/',
            baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
          );

          if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            throw new Error('Unsupported protocol');
          }
        } catch (error) {
          res.statusCode = 400;
          res.end('Invalid Xtream base URL');
          return;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);

        try {
          const upstream = await fetch(target, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
          });

          res.statusCode = upstream.status;

          const contentType = upstream.headers.get('content-type');
          if (contentType) {
            res.setHeader('content-type', contentType);
          }

          res.setHeader('cache-control', 'no-store');
          res.end(new Uint8Array(await upstream.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.end('Xtream proxy request failed');
        } finally {
          clearTimeout(timer);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), xtreamDevProxy()],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    // 2018 Samsung TVs run an older Chromium. Keep emitted JS conservative.
    target: 'chrome56',
    cssTarget: 'chrome56',
    sourcemap: false,
  },
});
