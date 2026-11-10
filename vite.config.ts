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

/**
 * Tizen-only HTML adjustments for `vite build --mode tizen`, applied to the
 * emitted index.html after Vite's own processing:
 *
 * 1. Tizen 4.0 (2018 TVs) runs Chromium 56, which cannot execute
 *    `<script type="module">`. The tizen build is a single inlined chunk, so
 *    it is rewritten to a classic deferred script with the same behavior.
 * 2. `modulepreload` links and `crossorigin` attributes are removed; the
 *    widget loads its assets from the package root.
 * 3. The Samsung Product API bridge must load before the app bundle, or
 *    `window.webapis.avplay` never exists.
 * 4. A permissive CSP meta tag mirrors proven community widgets (Jellyfin).
 */
const TIZEN_CSP =
  "default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: gap: file: filesystem: ws: wss:;";

function tizenPackageHtml(): Plugin {
  return {
    name: 'tizen-package-html',
    apply: 'build',
    // Must run after vite:build-html emits the final index.html asset; user
    // plugins without `post` run too early and see no asset (or a stale one).
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset' || typeof html.source !== 'string') {
        this.error(
          'index.html asset not found in the build bundle; cannot apply the ' +
            'Tizen classic-script and webapis.js transforms'
        );
      }

      let source = html.source;
      let moduleScripts = 0;

      source = source.replace(
        /<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g,
        (_match, src: string) => {
          moduleScripts += 1;
          return `<script defer src="${src}"></script>`;
        }
      );
      source = source.replace(/<link rel="modulepreload"[^>]*>/g, '');
      source = source.replace(/\scrossorigin(="[^"]*")?/g, '');
      // Insert at the top of <head>: a meta CSP only governs resources seen
      // after it, and webapis.js must be fetched before anything else.
      source = source.replace(
        '<head>',
        `<head>
    <meta http-equiv="Content-Security-Policy" content="${TIZEN_CSP}" />
    <script src="$WEBAPIS/webapis/webapis.js"></script>`
      );

      if (moduleScripts === 0) {
        this.error(
          'no `<script type="module" src=...>` found in index.html; the Tizen ' +
            'build requires exactly one entry script to rewrite'
        );
      }

      html.source = source;
    },
  };
}

export default defineConfig(({ mode }) => {
  const tizen = mode === 'tizen';

  return {
    // The widget resolves assets from its own package root, not a server root.
    base: tizen ? './' : '/',
    plugins: [preact(), xtreamDevProxy(), ...(tizen ? [tizenPackageHtml()] : [])],
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
      outDir: tizen ? 'dist-tizen' : 'dist',
      // The classic-script rewrite above assumes one JS chunk.
      rollupOptions: tizen ? { output: { codeSplitting: false } } : {},
    },
  };
});
