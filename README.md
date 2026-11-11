# Flaifel's Entertainment

A performance-first, cross-platform IPTV client built with Preact, TypeScript,
and Vite. It targets Windows desktop, Android, and 2018 Samsung Tizen TVs.

This README is the **scope contract** for anyone (human or agent) working on
the project after the initial build. Read it before changing code. If a request
conflicts with a non-negotiable constraint below, stop and ask the user rather
than silently relaxing it.

---

## 1. Current status

### Implemented

- Xtream Live TV: `get_live_categories`, then lazy `get_live_streams` per
  selected category.
- IndexedDB category cache (`iptv` database) plus an in-memory per-category
  stream cache and request-race protection.
- Home screen with billboard hero, section cards, last-used section, and
  playlist credentials form on the same page.
- First-run flow (no credentials): disabled sections, hero CTA scrolls to the
  form, server field autofocuses.
- Shared top navigation across Home, Live, Movies, and Series.
- Virtualized channel grid with ~12 rendered rows maximum.
- Six themes via `data-theme`; theme is persisted in `localStorage`.
- Mouse/Touch/Keyboard input detection with spatial (remote/keyboard) focus.
- Netflix/Disney/HBO-inspired visual redesign using CSS-only artwork.
- Live channel preview overlay: selecting a card opens a player shell and Back
  closes it with focus restored to the card.
- Playback seam (`src/services/player.ts`) with runtime engine detection:
  - `window.webapis.avplay` present → native Tizen AVPlay adapter and the real
    Xtream stream URL.
  - otherwise → standard `<video>` adapter driving the bundled mock MP4.

### Not implemented

- **Real playback beyond Tizen AVPlay.** The AVPlay adapter is written and the
  widget now packageable (`npm run build:tizen`), but playback has not been
  verified on the TV itself. The browser build still previews the mock MP4.
  Tauri (libmpv) and Capacitor (ExoPlayer) are not wired. HLS via `hls.js`
  remains an unapproved fallback.
- **Movies and Series catalogs.** Those views are intentional visual
  placeholders. `get_vod_categories`, `get_vod_streams`,
  `get_series_categories`, and `get_series` are not wired.
- **Desktop and Android packaging.** Tauri and Capacitor wrappers do not exist
  yet. Production Xtream calls still depend on panel CORS; `src/services/http.ts`
  is the seam for a native transport.
- **Tizen on-device verification.** The tizen build emits a classic deferred
  script for Chromium 56 and the widget installs unsigned via Apps2Samsung,
  but nothing has run on the 2018 TV yet. The 960×540 CSS viewport is the main
  verify item. See `DEFERRED.md`.

Do not describe the app as complete, playable, or VOD-capable until those gaps
are actually closed.

---

## 2. Non-negotiable constraints

### Performance baseline

A 2018 Samsung Tizen TV is the primary performance target. Every decision
should be justified against that hardware.

- Do not add decorative animation, transitions, blurs, backdrop filters, or
  heavy shadows/box-shadows.
- Artwork is CSS only: gradients, borders, and type. Do not introduce remote
  images or image sprites for hero/poster/card backgrounds.
- Channel logos are currently **not rendered**; cards use generated initials.
  The `logo` field exists in the data model but is unused. Do not start loading
  remote logos without measuring memory, network, and scroll cost on TV.
- Keep the DOM small. The channel grid must stay virtualized.
- Avoid layout work on scroll and theme change. Themes change colors only.

### Stack

- Preact + TypeScript + Vite.
- Runtime dependencies are deliberately limited to `preact`,
  `@tanstack/react-virtual`, and `idb`.
- **Do not add** Redux, Material UI, Tailwind, styled-components, Emotion,
  framer-motion, or any heavy CSS-in-JS/runtime styling library.
- Any new dependency needs a clear performance/size justification and user
  approval. Prefer platform APIs and small local code.

### Styling and themes

- Design tokens live as CSS custom properties on `:root` in
  `src/styles/themes.css`.
- Themes are selected with `data-theme` on `<html>` and may **only override
  colors** (including the `--art-*` artwork tints). Shape, spacing, type,
  radius, and focus geometry stay shared so switching themes cannot trigger
  layout or font work.
- One CSS file per component, imported by that component. Global tokens and
  base/reset rules live in `src/styles/themes.css` and
  `src/styles/global.css`.
- Keep focus outline-based. The global ring is:
  `outline: var(--focus-ring-width) solid var(--focus-ring)` with
  `outline-offset`, shown only in keyboard input mode.
- Hover is a mouse-only affordance. Guard hover rules with
  `html[data-input-mode="mouse"] ...:hover`.
- CSS Grid is used for major layouts, but Chromium 56 has no unprefixed Grid.
  Every Grid layout needs a `@supports not (display: grid)` flex fallback.
- Do not use flex `gap` in critical layouts; use margins. Grid `gap` is
  acceptable only where the grid path is active and the flex fallback supplies
  its own spacing.
- Do not use `aspect-ratio` in critical layouts.
- The build targets `chrome56` for both JS and CSS (`vite.config.ts`).

### Responsive breakpoints

- Desktop is `min-width: 769px`.
- `768px` and below is mobile.
- `1200px` and `1600px` are optional widenings (larger type, hero, sidebar).
- The Live sidebar is a fixed rail at 16rem desktop and 17.5rem at ≥1200px.
  On mobile it becomes a horizontally scrollable pill strip.
- Verify no horizontal overflow at 375×667, 912×670, and 1920×1080.

### Input and navigation

- Input modes are exactly `'Mouse' | 'Touch' | 'Keyboard'`, exposed as
  `data-input-mode` on `<html>`.
- Pointer/touch/keyboard/wheel events switch modes. Modifier keys do not.
- Arrow keys move focus spatially between `[data-spatial]` elements. Focus must
  remain visible and scrolled into view.
- Theme Left/Right changes the theme **only while the theme control is
  focused**; it must not move focus away.
- Back behavior:
  - `Escape`, `Backspace`, and key code `10009` (Tizen remote) are Back.
  - Backspace edits text while a text input is focused.
  - From the channel grid, Back returns focus to the active category.
  - From the player overlay, Back closes it and restores focus to the channel
    card that opened it.
  - From Live, Back returns to Home.
  - From Movies/Series, Back returns to Home.
- Home entry focus: hero primary CTA when keyboard mode is active. First-run
  focuses the Server field instead.
- Returning from Live focuses the hero CTA (“Continue to …”).
- Browser entry focuses the first category; Section screens focus “Back to
  home”.
- The playlist form keeps Up/Down movement between its fields and bubbles at
  the edges to spatial navigation.

### Data and caching

- Fetch category headers with `get_live_categories`.
- Cache categories in IndexedDB, keyed by `baseUrl|username`.
- Fetch `get_live_streams` **only after a category is selected**.
- Keep per-category stream results in a memory cache; never fetch all streams
  up front.
- Prevent stale responses from overwriting a newer category selection.
- Cache failures are non-fatal; the network remains the source of truth.
- IndexedDB may be unavailable (private windows/webviews); always degrade
  gracefully.

### Credentials and privacy

- Xtream credentials are stored only in `localStorage` under
  `iptv-xtream-config` on the device.
- Never commit credentials, panel URLs, or generated secrets.
- Never log passwords. Do not send them anywhere except the configured Xtream
  panel.
- The dev-only Vite proxy (`/xtream`) exists to avoid CORS during development.
  Production calls the panel directly; do not remove the HTTP seam in
  `src/services/http.ts`.

### Scope discipline

- Keep changes scoped to the requested feature.
- Do not add unrequested features, refactors, dependencies, or visual systems.
- The redesign intentionally mimics the *feel* of Netflix, Disney+, and HBO,
  not their exact branding or assets. Keep CSS artwork abstract and
  theme-aware.
- Preserve existing keyboard/remote flows whenever changing layout or markup.

---

## 3. Architecture

```text
index.html                 Theme pre-paint script, app mount
src/main.tsx               Providers and root render
src/app.tsx                View routing (home/live/movies/series), Live data flow
src/types.ts               Shared types: Section, ViewTarget, Category, Channel
src/theme.ts               Theme list, persistence, next/previous theme
src/context/InputModeContext.tsx
                           Mouse/Touch/Keyboard detection
src/hooks/useSpatialNavigation.ts
                           Arrow focus movement, Back handling, form edges
src/services/http.ts       HTTP transport seam (fetch by default)
src/services/xtream.ts     Xtream queries and normalization
src/services/player.ts     Playback seam: source selection, engine detection
src/services/avplay.ts     Tizen AVPlay adapter and webapis typings
src/services/html5Player.ts
                           Browser `<video>` fallback for the mock MP4
src/services/categoryCache.ts
                           IndexedDB category cache
src/services/config.ts     Credential load/save/validation, config key
src/components/TopNav.*    Shared brand, section links, theme toggle
src/components/HomeScreen.*
                           Hero, section cards, playlist panel
src/components/PlaylistForm.tsx
                           Server/username/password form
src/components/CategoryNav.*
                           Desktop rail and mobile pill strip
src/components/ChannelGrid.*
                           Virtualized channel cards
src/components/PlayerOverlay.*
                           Modal preview player and focus restore
src/components/SectionScreen.*
                           Movies/Series placeholders
src/components/ThemeToggle.*
                           Compact theme cycle control
src/styles/themes.css      Color tokens and theme overrides
src/styles/global.css      Reset, base type, focus ring, utilities
```

### Data flow

```text
localStorage ──> config ──> Home (default view)
                              │
                              ├─ Live ──> IndexedDB categories
                              │             └─ select category
                              │                  └─ memory cache or get_live_streams
                              │                       └─ virtualized ChannelGrid
                              │                            └─ select channel
                              │                                 └─ PlayerOverlay
                              │                                      └─ AVPlay on Tizen,
                              │                                         mock MP4 elsewhere
                              ├─ Movies ──> placeholder
                              └─ Series ──> placeholder
```

- Home is the default view even when a playlist is already saved.
- `lastSection` drives the hero CTA (“Continue to Live TV/Movies/Series”).
- Live mounts with a `configKey`; changing the playlist remounts the browser.
- Movies/Series are routed through `SectionScreen` until their catalogs exist.

### Virtualization

`ChannelGrid` uses `@tanstack/react-virtual` with:

- card height `4.75rem`, row gap `0.75rem`
- minimum card width `13rem`
- `MAX_RENDERED_ROWS = 12`, `MAX_OVERSCAN = 2`
- a spacer element sized by the virtualizer, absolutely positioned rows, and
  filler elements to keep the last row aligned

Do not replace this with plain mapping, pagination that grows the DOM, or
image-heavy tiles.

---

## 4. Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev         # Vite dev server, default http://localhost:5173
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build
npm run build:tizen # typecheck + widget build -> IPTV.wgt (unsigned)
npm run preview     # preview the production build
```

Dev-only Xtream proxy:

- The browser calls `/xtream/player_api.php` and sends the panel base URL in
  the `x-xtream-base` header.
- This keeps the app same-origin in development and bypasses CORS.
- It is implemented in `vite.config.ts` and applies only to `serve`.

A mock Xtream panel may be used for manual testing. It is not part of the
repository; do not commit test credentials or mock data into `src/`.

`public/mock-stream.mp4` is the bundled preview clip for the player shell. It is
the CC0 “flower” sample from MDN's interactive examples. It exists only to test
the overlay, focus restore, and Back behavior until a real player engine lands.

Playback picks its engine at runtime. A packaged Tizen app that exposes
`window.webapis.avplay` uses the AVPlay adapter and the real Xtream stream; a
browser preview never defines `webapis`, so it stays on the mock MP4. The
`$WEBAPIS/webapis/webapis.js` bridge is injected automatically in tizen mode;
see below.

### Samsung Tizen packaging

`npm run build:tizen` typechecks, builds with `--mode tizen`, regenerates
`tizen/icon.png`, and writes `IPTV.wgt` at the repo root. The widget is left
unsigned on purpose: Apps2Samsung (or Tizen Studio's CLI) signs it during
installation. No new dependencies are involved.

What tizen mode changes (`vite.config.ts` and `scripts/`):

- `base: './'` so the widget resolves assets from its package root.
- One JS chunk, transpiled for Chromium 56 (`build.target: 'chrome56'`).
- The emitted `index.html` gets a CSP meta plus
  `$WEBAPIS/webapis/webapis.js` injected ahead of the bundle, and the module
  script becomes a classic deferred script (Tizen 4.0 cannot run module
  scripts).
- `scripts/package-tizen.mjs` zips `dist-tizen/` plus `tizen/config.xml` and
  `tizen/icon.png` into `IPTV.wgt`, with `config.xml` at the archive root as
  Tizen requires.
- `scripts/make-tizen-icon.mjs` renders the 512×512 app icon from the brand
  colors in `src/styles/themes.css`.

`tizen/config.xml` rules:

- The `MFlaifelTV` package id must stay stable forever; changing it installs a
  second app instead of updating. Its version must be bumped together with
  `package.json` (the packager warns on mismatch).

Install/update loop (Apps2Samsung):

1. One-time TV setup: Settings → System Manager → Developer Mode on, with the
   PC's IP entered, then let the TV restart. TV and PC must share the network.
2. Apps2Samsung → scan → select the TV → **Custom WGT** → `IPTV.wgt`. Sign in
   with the Samsung account once; the signing certificate is reused after
   that.
3. Updates: bump the version in `package.json` **and** `tizen/config.xml`,
   rebuild, install again. Keep the widget private; never submit it to
   Apps2Samsung's public catalog, since it points at a private panel.
4. Use Apps2Samsung's debug console for AVPlay logs.

`dist-tizen/` and `IPTV.wgt` are build output and ignored by git.

---

## 5. Verification checklist

Run before declaring work done:

```bash
npm run typecheck
npm run build
npm run build:tizen
```

Manual checks:

- [ ] First run: Home hero says “Bring your playlist.”; nav sections and
      section cards are disabled; Server field is focused; saving enables
      everything.
- [ ] Saved run: hero CTA says “Continue to …”; “Edit playlist” scrolls to and
      focuses the form; form saves and updates the playlist summary.
- [ ] Keyboard: Home CTA → ArrowDown reaches a section card → Enter opens it →
      Escape/Back returns Home with the CTA focused.
- [ ] Live: categories load; selecting a category fetches streams; only ~12
      rows are in the DOM; Back from the grid returns to the active category;
      Back from Live returns Home.
- [ ] Player: Enter/click on a card opens the overlay and starts the preview;
      Play/Pause toggles; arrows stay inside the overlay; Back closes it and
      restores focus to the same card; the overlay has no animation or blur.
- [ ] Tizen path: with a fake `window.webapis.avplay` installed, the overlay
      uses AVPlay (no `<video>` element), opens the real
      `/live/<user>/<pass>/<id>.m3u8` URL, and calls `stop`/`close` on Back.
- [ ] Tizen device: video is visible inside the stage while AVPlay plays (the
      overlay's AVPlay mode hides the shell and drops page backgrounds), and
      no error message flashes during initial buffering.
- [ ] Movies/Series: placeholder screens render, nav active state is correct,
      Back returns Home.
- [ ] Theme: Left/Right cycles while the theme control is focused; focus stays
      on the control; all themes keep readable hero/card colors.
- [ ] Input modes: hover styles only in Mouse mode; focus ring appears only in
      Keyboard mode.
- [ ] No console errors.
- [ ] No horizontal overflow at 375×667, 912×670, and 1920×1080.
- [ ] No new animations, blurs, remote artwork images, or unvirtualized lists.
- [ ] Widget package: `tar -tf IPTV.wgt` lists `config.xml`, `index.html`,
      `icon.png` at the archive root, and `dist-tizen/index.html` loads
      `$WEBAPIS/webapis/webapis.js` before a classic (non-module) deferred
      bundle script.

---

## 6. Known gaps and deferred work

1. **Tizen AVPlay on-device verification** — first device run: channels open
   and audio plays, so the engine wiring and install loop work. Two fixes
   shipped after it: the AVPlay video plane renders below every web layer, so
   the overlay's AVPlay mode now hides the shell and drops page backgrounds
   while playing (previously audio with a black screen); and non-fatal
   `onerror` events that 2018 firmware emits during initial buffering no
   longer flash the stream error. Still to verify on the TV: video visible
   inside the stage, pause/resume, Back teardown, and the `avplay:` console
   lines via Apps2Samsung's debug console. Tauri (libmpv) and Capacitor
   (ExoPlayer) adapters come later. HLS via `hls.js` remains an unapproved
   desktop fallback.
2. **Movies/Series** — wire Xtream VOD/series endpoints and add catalogs while
   preserving the current navigation and performance rules.
3. **Production transport/CORS** — install a native transport via
   `setHttpTransport` in packaged builds.
4. **Tizen legacy JS** — handled for the widget build: tizen mode rewrites the
   entry to a classic deferred script and transpiles for Chromium 56. Pending
   on-device verification; see `DEFERRED.md`.
5. **Self-hosted brand font** — deferred; ask the user before implementing.
   The current stack uses system fonts only.
6. **Plain-text credentials** — stored in `localStorage` by design for this
   stage. Treat as a known limitation; do not add sync or telemetry.

---

## 7. Working agreements for future agents

- Read the files you are about to change, then keep edits scoped.
- Preserve the existing CSS token names and theme behavior.
- When adding a layout, write the Grid path first and the flex fallback second.
- When adding a control, add `data-spatial` and verify arrow/Back behavior.
- Modals own spatial movement: put `data-spatial-scope` on the modal root so
  arrows cannot reach the screen behind it, and let Back close it.
- Keep hover rules behind `html[data-input-mode="mouse"]`.
- Keep new copy short and TV-readable; avoid remote assets.
- If a proposed feature needs a new dependency, animation, image pipeline, or
  non-trivial DOM growth, stop and ask the user first.
- The nested `IPTV/` directory is an ignored stray clone. Do not delete or
  commit it.
- `dist/`, `dist-tizen/`, `IPTV.wgt`, and `node_modules/` are ignored
  build/install output.
