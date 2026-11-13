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
- Home screen with billboard hero, section cards, last-used section, and a
  playlist status card (connected host and user) with a manage link.
- First-run flow (no playlist): disabled sections; the hero CTA opens the
  playlists page to add one.
- Playlists page, reachable from the top nav and Home: multiple named
  playlists with add, edit, delete (two-press confirm), and switch; the
  active playlist feeds Live TV, Movies, and Series (0.3.0).
- Credential validation on save via `player_api.php`: nothing is stored
  unless the panel accepts the login; inline errors distinguish wrong
  credentials, an unreachable server, and banned/disabled/expired accounts.
- Playlist form fields render as buttons showing their values; Enter opens
  the real input — so the on-screen keyboard opens only then — with its text
  selected; Enter and Up/Down commit and move between fields. The password
  field has a show/hide toggle.
- Pre-0.3 single-credential storage migrates into one playlist (named after
  the panel host) on first load; the legacy key is then removed.
- Shared top navigation across Home, Live, Movies, and Series.
- Virtualized single-column channel list (0.4.0): one row per channel with
  the channel number behind a hairline divider, the name in large display
  type, and a Live marker; ~12 rendered rows maximum. Since 0.5.0 the same
  list component renders movies, series, and episodes: VOD rows carry a
  ★ rating badge where channels carry the Live dot, and episodes carry none.
- Movies & Series catalogs (0.5.0): `get_vod_categories` + lazy
  `get_vod_streams` per category, `get_series_categories` + lazy
  `get_series`, and `get_series_info` with an in-memory LRU. Live, Movies,
  and the Series list share one `CatalogBrowser` (categories sidebar,
  virtualized rows, player overlay, race guards). Movies play straight from
  the list (`/movie/<user>/<pass>/<id>.<ext>`); series rows open a
  seasons/episodes detail screen (`SeriesDetail`) that renders instead of
  the list so exactly one spatial-navigation scope owns Back at a time:
  player → episode list → series list → Home. Each section caches its
  category headers in IndexedDB under its own key, and the selected
  category plus its rows survive the round trip in a module-level LRU, so
  Back from a series returns instantly with no refetch.
- Six themes via `data-theme`; theme is persisted in `localStorage`.
- Mouse/Touch/Keyboard input detection with spatial (remote/keyboard) focus.
- Spatial focus movement ranks candidates by facing edges — never centers —
  and keeps Left/Right within the row and Up/Down within the column, with a
  far-diagonal fallback so arrows never get trapped (0.3.1; the 0.3.0 TV
  round found Right selecting the control below a wide field instead of the
  small button beside it).
- Netflix/Disney/HBO-inspired visual redesign using CSS-only artwork.
- Live channel playback: selecting a channel opens a **fullscreen** player
  takeover; a control bar (play/pause, back) auto-hides after ~4s of playback
  and returns on any key press; Back closes it with focus restored to the
  channel row that opened it.
- Samsung remote media keys are wired in the player: play (415), pause (19),
  play/pause (10252), and stop (413, exits the player). Space toggles in the
  browser preview. Samsung blocks media keys from web apps until they are
  registered with `tizen.tvinputdevice.registerKey()`, which
  `registerTizenMediaKeys()` does at startup (0.2.1).
- Player seek bar (0.6.0): VOD playback shows elapsed/total time and a
  draggable seeker, plus round rewind-10s, play/pause, and forward-10s
  buttons. Progress is polled at 500ms only while the bar is visible; the
  dot scrubs with a pointer, and Left/Right seek ±10s while the timeline
  owns focus. Live channels show a `LIVE` badge instead and disable
  rewind/forward.
- Channel Up/Down (0.6.0): the Tizen channel keys (427/428) switch to the
  previous/next live channel in the list being browsed and stop at the first
  and last rows. Back restores focus to the channel that is actually
  playing, scrolling the virtualized list to its row when the virtualizer
  had recycled it.
- Global search (0.7.0): Movies and Series each show one search box that
  queries **both** catalogs and labels every hit `Movie · ★ x` or
  `Series · ★ x`. Arabic titles match Arabic queries (tashkeel, tatweel, and
  alef/yeh/teh-marbuta variants are folded; scripts are never mixed) and
  Latin queries tolerate typos and letter transpositions. Results are ranked
  (exact, prefix, substring, then edit-distance/trigram) and capped at 150.
  The index is the one approved full-catalog fetch: built once, stored in
  IndexedDB per `baseUrl|username`, reused across launches, and rebuilt only
  by the Refresh button; if the fetch fails it indexes categories visited
  this session instead. A movie hit plays; a series hit opens its detail,
  and Back from there returns to the same results.
- Mini preview player (0.8.0): in Live, the first Enter starts a preview with
  audio in a reserved 16:9 pane beside the list and leaves focus in the list;
  moving focus switches the stream after a 400ms debounce. Enter expands the
  focused channel to fullscreen without reopening the stream (the same player
  session moves its surface), and Back returns to the preview with playback
  intact. Back from the preview stops audio and keeps focus on the row;
  another Back returns to the category. Movies and series episodes still open
  directly.
- Learned skip intro (0.9.0): series episodes show a `Skip intro` pill in the
  control bar during the first two minutes. The first press jumps forward 85s
  and stores the resulting position per panel + series in `localStorage`;
  later episodes jump straight to that learned offset. The pill hides after
  one use or once playback passes the offset, and it never appears for movies
  or live channels.
- Playback seam (`src/services/player.ts`) with runtime engine detection:
  - `window.webapis.avplay` present → native Tizen AVPlay adapter and the real
    Xtream stream URL.
  - otherwise → standard `<video>` adapter. In development (`npm run dev`)
    it loads the **real panel URLs** so VOD playback can be tested from a
    laptop browser (live HLS needs Safari — Chromium has no native HLS);
    production browser builds keep the bundled mock MP4.

### Not implemented

- **Real playback beyond Tizen AVPlay.** The widget installs unsigned via
  Apps2Samsung and AVPlay playback ran on the TV (audio verified; the video
  plane transparency and buffering-error-flash fixes ship in 0.1.1, the
  fullscreen takeover and media keys in 0.2.0, both pending re-verification
  on device). The browser build still previews the mock MP4. Tauri (libmpv)
  and Capacitor (ExoPlayer) are not wired. HLS via `hls.js` remains an
  unapproved fallback.
- **Desktop and Android packaging.** Tauri and Capacitor wrappers do not exist
  yet. Production Xtream calls still depend on panel CORS; `src/services/http.ts`
  is the seam for a native transport.

### Roadmap (user-approved order)

1. **Fullscreen player + remote media keys** — shipped in 0.2.0 and verified
   on the TV; media-key registration followed in 0.2.1 and is pending
   re-verification on device.
2. **Playlists page** — shipped in 0.3.0 (TV round approved everything
   except left/right arrows; the edge-based navigation fix ships in 0.3.1
   and is pending re-verification on device): dedicated view reachable
   from the top nav and Home;
   multiple named playlists (add/edit/delete/switch); credential validation
   on save (`player_api.php` login check) with inline errors; form fields
   open the on-screen keyboard only on Enter; show-password toggle; pre-0.3
   config migration.
3. **Live TV redesign** — shipped in 0.4.0 (pending the TV round):
   channels are a virtualized single-column list with larger type matching
   the home screen's design language — channel number, name, and Live marker
   per row — and the category sidebar is restyled to match (larger items and
   the shared eyebrow treatment).
4. **Movies & Series VOD** — shipped in 0.5.0 (pending the TV round):
   Xtream VOD endpoints (`get_vod_categories`, `get_vod_streams`,
   `get_series_categories`, `get_series`, `get_series_info`); movies play
   straight from the list; series get a seasons/episodes detail screen.
   Artwork stays typography-only (no remote posters or logos) per the
   performance constraints.
5. **Player seek bar + channel keys** — 0.6.0 (this batch): elapsed/total
   time and a draggable seeker with rewind-10s, play/pause, and forward-10s
   round buttons; the remote's Channel Up/Down switches live channels in
   fullscreen, stopping at the list edges. See `PLAN.md`.
6. **Global bilingual search** — shipped in 0.7.0: one search box across
   movies and series, Arabic title normalization, and typo tolerance, backed
   by the approved one-time full-catalog fetch described in `PLAN.md`.
7. **Mini preview player** — shipped in 0.8.0: first Enter starts a live
   preview with audio, focus changes switch it after a short debounce, the
   next Enter goes fullscreen without reopening the stream, and Back returns
   to the mini player before another Back stops it.
8. **Per-series learned skip intro** — shipped in 0.9.0: a `Skip intro` pill
   on episodes jumps forward and remembers the offset per panel + series on
   the device for later episodes.

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
- Channel logos are currently **not rendered**; list rows show the channel
  number, name, and a Live marker.
  The `logo` field exists in the data model but is unused. Do not start loading
  remote logos without measuring memory, network, and scroll cost on TV.
- Keep the DOM small. The channel list must stay virtualized.
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
  - From the channel list, Back returns focus to the active category.
  - From the player overlay, Back closes it and restores focus to the channel
    card that opened it.
  - From the playlist form, Back cancels the open field's edit; Back again
    closes the form and returns to the playlist list. From the playlists page,
    Back returns to Home.
  - From Live or Movies, Back returns to Home (after closing any open
    player).
  - From the series detail, Back returns to the series list with the same
    category and rows restored; Back again returns Home.
- Samsung remote media keys act only inside the player overlay, handled in
  the capture phase before spatial navigation: play `415`, pause `19`,
  play/pause `10252`, stop `413` (exits the player). They only arrive after
  `registerTizenMediaKeys()` registers them with the TV input device API at
  startup; unregistered, the TV consumes them and shows its own overlay.
  While the player's control bar is auto-hidden, any other key only reveals
  it (the press is swallowed on purpose). Unrecognized key codes are logged
  as `player: unhandled key ...` for mapping in the debug console.
- Home entry focus: hero primary CTA when keyboard mode is active, on first
  run and when returning.
- Playlists entry focuses the first row; after the form closes, focus returns
  to the playlist that was saved or edited.
- Returning from Live focuses the hero CTA (“Continue to …”).
- Catalog entries (Live, Movies, Series list) focus the first category; the
  series detail focuses its first season pill once episodes load.
- The playlist form is a spatial scope: arrows cannot leave it while it is
  open, and Back closes it. Fields render as buttons showing their values;
  Enter opens the input (the on-screen keyboard opens only then) with its
  text selected; Up/Down commit and move between fields, stopping at the
  edges; Enter commits and advances; Back cancels the edit and keeps the
  field's button focused. Focus handoffs happen synchronously with the DOM
  commit — never in a deferred effect — so rapid key repeats cannot land on
  `<body>`.

### Data and caching

- Fetch category headers with the section's `get_*_categories` action
  (live, vod, series).
- Cache categories in IndexedDB, keyed by `baseUrl|username` for Live and
  `baseUrl|username:vod` / `:series` for the VOD sections, so one catalog
  never reads another's headers.
- Fetch the section's rows (`get_live_streams`, `get_vod_streams`,
  `get_series`) **only after a category is selected**.
- Keep per-category row results in the browser's in-memory LRU; never fetch
  all rows up front.
- **Approved exception (0.7.0):** the global search index fetches the whole
  VOD and series catalogs once, builds a title index, and caches it in
  IndexedDB keyed by `baseUrl|username` with a schema version. It must never
  block normal browsing and falls back to indexing visited categories if the
  fetch fails. This is the only place a full-catalog fetch is allowed; do not
  generalize it.
- Prevent stale responses from overwriting a newer category selection.
- `get_series_info` results live in a module-level LRU (cap 60) keyed by
  panel + series id, so re-entering a series is instant and one panel's
  episodes can never leak into another's.
- Cache failures are non-fatal; the network remains the source of truth.
- IndexedDB may be unavailable (private windows/webviews); always degrade
  gracefully.

### Credentials and privacy

- Playlists and their credentials are stored only in `localStorage` on the
  device: the list under `iptv-playlists`, the active playlist id under
  `iptv-active-playlist`. Saving validates against the panel first; nothing
  is stored unless `player_api.php` accepts the login.
- The pre-0.3 key `iptv-xtream-config` migrates into one playlist on first
  load and is then removed, so updates never lose saved credentials.
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
src/app.tsx                Playlist state, view routing (home/playlists/
                           live/movies/series), and the thin Live/Movies/
                           Series wrappers around CatalogBrowser
src/types.ts               Shared types: Section, ViewTarget, Category,
                           MediaItem (Channel/Movie/SeriesSummary/
                           SeriesEpisode), SeriesDetailState
src/theme.ts               Theme list, persistence, next/previous theme
src/context/InputModeContext.tsx
                           Mouse/Touch/Keyboard detection
src/hooks/useSpatialNavigation.ts
                           Arrow focus movement, Back handling, form edges
src/services/http.ts       HTTP transport seam (fetch by default)
src/services/tizenKeys.ts  Registers the remote's media keys via
                           tizen.tvinputdevice at startup
src/services/xtream.ts     Xtream queries (live/VOD/series), normalization,
                           series-info LRU, credential check
src/services/player.ts     Playback seam: source selection (live + VOD URL
                           builders), engine detection
src/services/avplay.ts     Tizen AVPlay adapter and webapis typings
src/services/html5Player.ts
                           Browser `<video>` fallback for the mock MP4
src/services/errors.ts     Unknown-thrown-value to display copy mapping
src/services/categoryCache.ts
                           IndexedDB category cache
src/services/config.ts     Pure config helpers: URL normalization, validity,
                           cache/remount key
src/services/playlistStore.ts
                           Playlist persistence (localStorage list + active
                           id) and pre-0.3 config migration
src/components/TopNav.*    Shared brand, section links, playlists link,
                           theme toggle
src/components/HomeScreen.*
                           Hero, section cards, playlist status card
src/components/PlaylistForm.tsx
                           Button-style fields, Enter-to-open inputs,
                           credential check on save, show-password toggle
src/components/PlaylistsScreen.*
                           Playlist list (add/edit/delete/switch) and form
src/components/CategoryNav.*
                           Desktop rail and mobile pill strip; doubles as
                           the seasons sidebar (title/showAll props)
src/components/ChannelList.*
                           Virtualized single-column list, shared by
                           channels, movies, series, and episodes
src/components/CatalogBrowser.*
                           Shared catalog screen: category sidebar +
                           virtualized rows + player overlay, with
                           remembered selection across drill-ins
src/components/SeriesDetail.*
                           Seasons sidebar + episode list for one series;
                           renders instead of the series list
src/components/PlayerOverlay.*
                           Fullscreen player: auto-hiding control bar,
                           remote media keys, focus restore
src/components/ThemeToggle.*
                           Compact theme cycle control
src/styles/themes.css      Color tokens and theme overrides
src/styles/global.css      Reset, base type, focus ring, utilities
```

### Data flow

```text
localStorage ──> playlists + active id ──> Home (default view)
                                            │
                                            ├─ Playlists ──> add/edit/delete/switch
                                            │                (credential check on save)
                                            ├─ Live ──> IndexedDB categories
                                            │             └─ select category
                                            │                  └─ memory cache or get_live_streams
                                            │                       └─ virtualized ChannelList
                                            │                            └─ select channel
                                            │                                 └─ PlayerOverlay
                                            │                                      └─ AVPlay on Tizen,
                                            │                                         mock MP4 elsewhere
                                            ├─ Movies ──> IndexedDB categories (:vod)
                                            │             └─ select category
                                            │                  └─ memory cache or get_vod_streams
                                            │                       └─ select movie
                                            │                            └─ PlayerOverlay
                                            │                                 └─ /movie/<user>/<pass>/<id>.<ext>
                                            └─ Series ──> IndexedDB categories (:series)
                                                        └─ select category
                                                             └─ memory cache or get_series
                                                                  └─ select series
                                                                       └─ get_series_info (LRU)
                                                                            └─ seasons sidebar +
                                                                                 episode list
                                                                                 └─ select episode
                                                                                      └─ PlayerOverlay
                                                                                           └─ /series/<user>/<pass>/<id>.<ext>
```

- Home is the default view even when a playlist is already saved.
- `lastSection` drives the hero CTA (“Continue to Live TV/Movies/Series”).
- Each catalog mounts with a `configKey`; changing the playlist remounts it.
- Switching, editing, or deleting the active playlist re-derives the config;
  views that require one fall back to Home.
- Live, Movies, and the Series list are the same `CatalogBrowser` with
  different loaders and copy; the Series list's rows drill into
  `SeriesDetail` instead of opening the player.

### Virtualization

`ChannelList` uses `@tanstack/react-virtual` with:

- row height `4.5rem`, row gap `0.5rem` — constant across breakpoints so the
  JS-measured cycle always matches the CSS
- `MAX_RENDERED_ROWS = 12`, `MAX_OVERSCAN = 2`
- a spacer element sized by the virtualizer, absolutely positioned rows, one
  item per row (channel, movie, series, or episode)

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

A mock Xtream panel for manual and automated testing lives at
`scripts/mock-panel.mjs` (`node scripts/mock-panel.mjs [port]`, default 8788).
Seed a playlist whose `baseUrl` is `http://127.0.0.1:8788` and the dev proxy
will serve its canned data: live categories and streams (one oversized
category forces the virtualizer to recycle rows), VOD categories and movies,
series categories and shows, and `get_series_info` with two seasons (8 + 4
episodes, including untitled and mkv rows). It serves no media — the browser
preview always plays the bundled mock MP4. It contains no real credentials and
ships nothing into `src/` or the widget.

`public/mock-stream.mp4` is the bundled preview clip for the player shell. It is
the CC0 “flower” sample from MDN's interactive examples. It exists only to test
the overlay, focus restore, and Back behavior until a real player engine lands.

Playback picks its engine at runtime. A packaged Tizen app that exposes
`window.webapis.avplay` uses the AVPlay adapter and the real Xtream stream; a
browser never defines `webapis`, so it uses the standard `<video>` element.
In development the video element also gets the **real panel URLs** (mode
`xtream` is forced while `import.meta.env.DEV`), so movies and episodes
actually stream in the browser; live `.m3u8` channels generally only play
in Safari, because Chromium has no native HLS engine — the TV remains the
real test for live. The mock panel serves no media, so playing from it shows
a playback error on purpose. Production browser builds (`npm run build`) keep
the bundled mock MP4. The `$WEBAPIS/webapis/webapis.js` bridge is injected
automatically in tizen mode; see below.

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
      section cards are disabled; the hero CTA opens the playlists page with
      the add form's first field focused.
- [ ] Saved run: hero CTA says “Continue to …”; the playlist status card shows
      the connected host and user; “Manage playlists” opens the playlists page.
- [ ] Playlists: saving with wrong credentials shows an inline error and
      stores nothing; saving valid credentials stores, activates, and lists
      the playlist; edit keeps values; delete needs a second press and
      disarms on blur; switching the active playlist remounts Live.
- [ ] Playlist form on the remote: Enter opens a field's input (keyboard only
      then) with its text selected; Up/Down commit and move between fields,
      stopping at the edges; Enter on the last field reaches Save; Back
      cancels the edit and a second Back closes the form; the eye toggles
      the password.
- [ ] Remote arrows (0.3.1 edge-based movement): Right from a playlist row
      reaches Edit, then Delete, and Left steps back; Down moves row to row
      and reaches the Add button; Right from the password field reaches the
      eye toggle; Right is a no-op on the Add button and on the
      name/server/username fields; Down from the hero CTA still reaches the
      playlist Manage button on the disconnected Home.
- [ ] Migration: a pre-0.3 `iptv-xtream-config` entry appears as one playlist
      named after the panel host, and the legacy key is removed.
- [ ] Keyboard: Home CTA → ArrowDown reaches a section card → Enter opens it →
      Escape/Back returns Home with the CTA focused.
- [ ] Live list (0.4.0): categories load into the restyled sidebar; selecting
      one loads the single-column list with large channel numbers and names;
      only ~12 rows are in the DOM; Up/Down move row to row; Left from a row
      reaches the sidebar; Back from a row returns to the active category;
      Back from Live returns Home.
- [ ] Player: Enter/click on a row opens a fullscreen takeover and starts
      playback; Play/Pause toggles; the control bar hides after ~4s of
      playing and returns on any key; arrows stay inside the player; Back
      closes it and restores focus to the same row; no animation or blur.
- [ ] Player keys: Space toggles; media keys play/pause/stop (415, 19, 10252,
      413); Enter while the bar is hidden only reveals it; while the bar is
      visible, Enter activates the focused control.
- [ ] Seek bar (0.6.0): a movie/episode shows elapsed / total time that
      updates while playing; rewind/forward jump ~10s; the dot drags with a
      mouse and commits the seek on release; with the timeline focused,
      Left/Right seek ±10s without moving focus; the bar still auto-hides
      after ~4s. A live channel shows `LIVE` and disables rewind/forward.
- [ ] Channel keys (0.6.0): Channel Up/Down step live channels, stop at the
      first/last row, and update the title; Back focuses the channel that is
      playing even when the virtualizer had not rendered its row; movies and
      episodes ignore the keys.
- [ ] Search (0.7.0): Movies and Series each show the search box; a query
      returns hits from both catalogs with `Movie`/`Series` badges and a
      “N results” count; a typo (`acton`, `braking bad`) still matches; an
      Arabic query matches Arabic titles only; Enter on a movie hit plays it,
      on a series hit opens its detail; Back clears the query first (Tizen
      Back also leaves the field), and Back again leaves the section.
- [ ] Search index (0.7.0): the first search performs one full
      `get_vod_streams` + `get_series` fetch; reloading reuses the stored
      index with no refetch; Refresh rebuilds it; a failed fetch falls back to
      categories visited this session and shows the partial-coverage note.
- [ ] Mini player (0.8.0): in Live, the first Enter starts a preview with
      audio and leaves focus in the list; moving focus to another row switches
      the stream after ~400ms; Enter expands the focused channel to fullscreen
      without restarting it; Back returns to the preview with the same element
      and time, and another Back stops playback while keeping focus on the
      row; Movies and series episodes still open directly; the pane never
      overlaps the focus ring, and no layout overflows.
- [ ] Skip intro (0.9.0): a series episode shows `Skip intro` during the first
      two minutes; the first press jumps forward and stores the offset in
      `iptv-intro-offsets` under `panelKey -> seriesId`; the next episode's
      press seeks straight to that offset; the pill disappears after use or
      past the offset; movies and live channels never show it; switching
      playlists does not reuse offsets.
- [ ] Tizen path: with a fake `window.webapis.avplay` installed, the overlay
      uses AVPlay (no `<video>` element), opens the real
      `/live/<user>/<pass>/<id>.m3u8` URL (movies/episodes open
      `/movie/…`/`/series/…` with the item's extension), and calls
      `stop`/`close` on Back.
- [ ] Tizen device: video is visible inside the stage while AVPlay plays (the
      overlay's AVPlay mode hides the shell and drops page backgrounds), and
      no error message flashes during initial buffering.
- [ ] Movies (0.5.0): categories load into the sidebar; selecting one loads
      the list with ★ rating badges (unrated movies show none); Enter plays a
      movie fullscreen; Back closes the player with focus restored; Back
      again returns Home. Only ~12 rows are in the DOM.
- [ ] Series (0.5.0): categories load; Enter on a series opens the detail
      with the seasons sidebar focused on the first season and its episodes
      listed; selecting another season swaps episodes in place; Enter plays
      an episode fullscreen (sub reads “Season N · Episode M”); Back closes
      the player; Back again returns to the series list with the same
      category selected and no refetch; Back a third time returns Home.
- [ ] A series with no episodes shows “This series has no episodes.” with a
      retry that refetches.
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
   and audio plays, so the engine wiring and install loop work. Fixes shipped
   after it: the AVPlay video plane renders below every web layer, so the
   overlay's AVPlay mode hides the shell and drops page backgrounds while
   playing (0.1.1); non-fatal `onerror` events during initial buffering no
   longer flash the stream error (0.1.1); the player is now a fullscreen
   takeover with a constant `setDisplayRect(0,0,1920,1080)` and remote media
   keys (0.2.0, verified on the TV: fullscreen video, auto-hiding controls,
   and Back teardown all work). The remote's play/pause button showed the
   TV's own overlay instead of reaching the app: Samsung delivers media keys
   to web apps only after `tizen.tvinputdevice.registerKey()` registration,
   added in 0.2.1 and pending re-verification. If the button still misfires,
   the player logs unrecognized codes as `player: unhandled key ...` in the
   Apps2Samsung debug console. Tauri (libmpv) and Capacitor (ExoPlayer)
   adapters come later. HLS via `hls.js` remains an unapproved desktop
   fallback.
2. **Production transport/CORS** — install a native transport via
   `setHttpTransport` in packaged builds.
3. **Tizen legacy JS** — handled for the widget build: tizen mode rewrites the
   entry to a classic deferred script and transpiles for Chromium 56. Pending
   on-device verification; see `DEFERRED.md`.
4. **Self-hosted brand font** — deferred; ask the user before implementing.
   The current stack uses system fonts only.
5. **Plain-text credentials** — stored in `localStorage` by design for this
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
