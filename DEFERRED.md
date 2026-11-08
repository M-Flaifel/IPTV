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

- **Status:** Deferred until Tizen packaging.
- **Issue:** Vite emits `<script type="module">`; Chromium 56 cannot execute
  module scripts.
- **Plan:** add legacy transpilation (`@vitejs/plugin-legacy` or equivalent)
  and verify on the TV.
- **Already handled:** CSS Grid has a flex fallback via
  `@supports not (display: grid)` for this engine.
