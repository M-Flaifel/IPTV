# Deferred work

## Self-hosted brand font (WOFF2 subset)

- **Status:** Deferred. Ask the user before implementing.
- **Goal:** identical modern typography across Windows, Android, and Tizen.
- **Constraint:** small Latin subset only; evaluate TV startup, memory, and
  `font-display` behaviour before committing.
- **Current state:** `--font-display` in `src/styles/themes.css` uses system
  fonts only, with no network requests.
- **When to raise it:** branding pass or Tizen packaging, not before.

## Tizen 4.0 / Chromium 56 legacy JS

- **Status:** Handled for the widget build; verify on a TV before closing.
- **Issue:** Vite emits `<script type="module">`; Chromium 56 cannot execute
  module scripts.
- **Handled by Stage 1 (`vite build --mode tizen`):**
  - `build.target`/`cssTarget` set to `chrome56`, so esbuild transpiles
    newer syntax down for the TV's engine.
  - The bundle is emitted as a single chunk (`codeSplitting: false`) and the
    `tizenPackageHtml` plugin rewrites the entry script to a classic deferred
    `<script>` in the emitted `index.html`.
  - `$WEBAPIS/webapis/webapis.js` and a permissive CSP meta are injected
    ahead of the bundle.
- **Remaining risk:** syntax transpilation is not polyfills. If the TV throws
  at launch, read the Apps2Samsung debug console before reaching for Babel or
  `@vitejs/plugin-legacy`.
- **Already handled:** CSS Grid has a flex fallback via
  `@supports not (display: grid)` for this engine.
