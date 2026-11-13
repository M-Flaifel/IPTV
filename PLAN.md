# Feature plan: search, player seek, mini player, channel keys, skip intro

This is the working plan for the 0.6.0–0.9.0 feature batch. It records the
decisions the user made, the implementation approach in this codebase, and the
verification each feature needs. `README.md` remains the scope contract; this
file is the execution plan and status board.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Search scope | **Global** across movies + series (one search box in both catalogs) |
| Arabic search | Matches **Arabic titles only**; no cross-script (Arabic query → English title) |
| Catalog loading for search | **One-time full catalog fetch** is approved (an explicit exception to the lazy-row rule) |
| Mini player audio | **Audio plays during preview** |
| Back from fullscreen | Returns to the **mini player**, not the list |
| Channel +/− at list edges | **Stops** at the first/last channel (no wrap) |
| Skip intro | **Per-series learned offset**, stored on the device |

No new runtime dependencies are approved or needed for this batch. Search is
hand-rolled, the mini player reuses the existing player adapters, and skip
intro reuses the seek capability added in 0.6.0.

## Build order

1. **0.6.0 — Player seek bar + time + 3 round buttons** (this unblocks 0.9.0)
2. **0.6.0 — Channel +/− in fullscreen**
3. **0.7.0 — Global bilingual search with typo tolerance**
4. **0.8.0 — Mini player that follows focus → fullscreen**
5. **0.9.0 — Per-series learned "Skip intro"**

Versions are bumped in `package.json`, `tizen/config.xml`, and the README when
each feature lands.

## Status

| Step | Version | State |
| --- | --- | --- |
| Player seek bar, time, round buttons | 0.6.0 | Implemented; browser-verified |
| Channel Up/Down in fullscreen | 0.6.0 | Implemented; browser-verified |
| Global bilingual search | 0.7.0 | Implemented; browser-verified |
| Mini preview player | 0.8.0 | Implemented; browser-verified |
| Per-series learned skip intro | 0.9.0 | Implemented; browser-verified |

---

## 1. Player seek bar, elapsed/total time, three round buttons (0.6.0)

### Goal

While a movie or episode plays, show a timeline with elapsed and total time and
three round controls: rewind 10s, play/pause, forward 10s. The timeline is a
real seeker: drag the dot with a mouse/touch, or focus it with the remote and
press Left/Right to jump 10s at a time.

Live channels have no known duration, so they show a `LIVE` marker instead of
the seeker. The three buttons stay, but rewind/forward are disabled.

### Approach

- Extend `PlayerAdapter` (`src/services/player.ts`) with
  `getProgress(): PlaybackProgress | null` and `seekTo(seconds: number)`.
  `PlaybackProgress` carries `current`, `duration`, and `seekable`.
- `Html5PlayerAdapter`: read `video.currentTime` / `video.duration`; seek by
  assigning `currentTime`, clamped to the media bounds.
- `AvPlayAdapter`: use `getCurrentTime()` / `getDuration()` (milliseconds) and
  `seekTo(milliseconds)`. Guard every call: AVPlay throws when the player is
  not in a prepared state.
- Add `live: boolean` to `PlaybackSource` so the overlay does not have to guess
  from the container type (VOD can also be HLS).
- `PlayerOverlay` polls progress at 500ms **only while the control bar is
  visible**; when the bar auto-hides there is no timer work on the TV.
- The timeline is focusable (`data-spatial="player"`, `role="slider"`). While
  it owns focus, Left/Right seek ±10s instead of moving spatial focus; the
  player's capture-phase key handler intercepts them.
- Pointer drag: `pointerdown` starts scrubbing, `pointermove` updates the
  visual, `pointerup` commits the seek. Pointer events are available on
  Chromium 56.
- Time formatting must avoid `String.prototype.padStart` (Chromium 57+); use a
  local two-digit helper.
- Styles: round buttons, a track/fill/dot, a muted `LIVE` badge. No animation,
  no blur, no shadow. Keep the existing auto-hide behavior and focus restore.

### Edge cases

- Progress `null` while opening: show the timeline as soon as a duration is
  known; a VOD stream that never reports a duration stays on the `LIVE`-style
  placeholder only if it is genuinely live.
- Scrubbing keeps the control bar open and stops the auto-hide timer.
- Seeking past the end clamps to `duration`; before the start clamps to 0.
- The mock preview clip loops, so its duration is the clip length, not a live
  window; it is only used for live rows, which are marked `live: true`.

### Verification

- Movie/episode: bar shows `elapsed / total`, updates while playing, hides
  after ~4s, returns on a key press.
- Rewind/forward jump ~10s; play/pause updates its icon.
- Drag the dot with a mouse; release seeks to that point.
- Focus the timeline with the remote: Left/Right seek ±10s and do not move
  focus; Up/Down still reach the buttons.
- Live channel: `LIVE` marker, rewind/forward disabled.
- Typecheck, production build, and Tizen build pass.

---

## 2. Channel +/− changes the channel in fullscreen (0.6.0)

### Goal

While a live channel plays fullscreen, the remote's Channel Up/Down buttons
switch to the previous/next channel in the list that was being browsed.

### Approach

- Register `ChannelUp` and `ChannelDown` in `src/services/tizenKeys.ts`
  alongside the media keys. Tizen key codes are **427 / 428**.
- Handle them in the player's capture-phase key handler, like the media keys.
- `CatalogBrowser` owns `playing` and `items`. Pass the ordered list plus the
  current id (or an `onStep(direction)` callback) to `PlayerOverlay`.
- Live only (`source.live`). Ignore for movies/episodes.
- Stop at the ends (locked decision): no wrap.
- On close, focus must return to the row of the channel that is **currently**
  playing, not the one originally opened. Locate it by id; if the virtualizer
  recycled the row, scroll it into view first.
- Update the title/sub line when the channel changes.

### Verification

- Enter a live channel, press Channel Up/Down: the stream, title, and sub
  update; Channel Up on the first row and Channel Down on the last are no-ops.
- Back closes the player and focuses the current channel's row.
- Movies/episodes ignore channel keys.
- Keys arrive only after registration on the TV; log unmapped codes.

---

## 3. Global bilingual search with typo tolerance (0.7.0)

### Goal

A search field in the Movies and Series catalogs that searches the **whole
library** (not just the selected category), matches English and Arabic titles,
and tolerates typos. Global means a query searches both movies and series and
the results are grouped/labelled by section.

### Data

- On first use, fetch `get_vod_streams` and `get_series` **without
  `category_id`** (the whole catalog) and build a title index.
- This is the approved exception to "never fetch all rows up front". Keep the
  normal per-category browsing path unchanged.
- Cache the index in IndexedDB with a schema version and a fetched-at
  timestamp, keyed by `baseUrl|username`, so the TV does not re-download it on
  every launch. Offer a manual refresh.
- Guard size: if the combined payload is unreasonable or the fetch fails,
  fall back to indexing only categories already visited and say so in the UI.
- Show a one-time "Building search index…" state; never block normal browsing.

### Matching (`src/services/search.ts`, pure and testable)

- Normalize Arabic: remove tashkeel and tatweel; unify `أ إ آ ٱ → ا`,
  `ى → ي`, `ة → ه`, `ؤ → و`, `ئ → ي`; strip Arabic punctuation.
- Normalize Latin: lowercase, strip diacritics and punctuation.
- Rank: exact match → prefix → token substring → fuzzy.
- Fuzzy: Damerau-Levenshtein per token with a length-scaled threshold
  (1 edit below 5 characters, 2 above). Fall back to trigram similarity if a
  token is short.
- Cap results (about 100–200) and let the existing virtualizer render them.
- Debounce input ~200ms.

### UI

- Search field in the catalog header, `data-spatial="search"`. Enter opens the
  TV IME (a real `<input>`), results replace the list, Back clears the query
  first and then navigates.
- Movie results keep `extension` so playback still works; series results drill
  into `SeriesDetail` as today.
- Arabic titles are matched as Arabic; an Arabic query is not transliterated to
  Latin (locked decision).
- The on-screen keyboard depends on the TV locale; the browser can type Arabic
  directly.

### Verification

- English query with a typo (e.g. `godfathr`) finds `The Godfather`.
- Arabic query with a missing letter finds the Arabic title; diacritics and
  alef/yeh variants do not matter.
- Results include titles outside the selected category.
- Selecting a movie result plays it; selecting a series result opens its detail.
- Index survives a reload; refresh rebuilds it; failure falls back gracefully.
- No layout overflow at 375×667, 912×670, 1920×1080.

---

## 4. Mini player that follows focus, then fullscreen (0.8.0)

### Goal

In the Live channel list, the first Enter on a channel starts a **mini player**
with audio. While the mini player is active, moving focus to another channel
switches the preview to that channel after a short debounce. The next Enter
expands the current channel to fullscreen. Back from fullscreen returns to the
mini player (locked decision).

### Architecture

AVPlay is a single global instance and renders on a hardware plane **below
every web layer** (see `PlayerOverlay.css`). A floating picture-in-picture over
the list would be hidden by the list. Therefore:

- Reserve a fixed 16:9 **preview pane** in the catalog layout; the list shrinks
  around it. The pane is transparent so the AVPlay plane shows through.
- Point `setDisplayRect` at the pane's screen coordinates in mini mode and at
  `0,0,1920,1080` in fullscreen.
- Extract a shared player controller (module/service) that owns the single
  adapter, so mini → fullscreen reuses the stream instead of reopening it and
  rebuffering. `PlayerOverlay` becomes a view over that controller.
- `CatalogBrowser` drives the preview state machine:
  - `preview = null` → Enter starts the mini stream.
  - Focus moves while previewing → debounce ~400ms, then switch the stream.
  - Enter while previewing → fullscreen the focused channel.
  - Back from fullscreen → mini player; Back from mini → stop preview.
- Cancel in-flight opens when focus moves again, so a slow channel cannot
  overwrite a newer selection.
- Live only. Movies/episodes keep the current direct-to-fullscreen behavior.

### Risks / on-device checks

- AVPlay volume is not per-stream on all firmware; confirm audio during preview
  behaves, and that switching channels does not leave the old audio running.
- The preview pane must contain no painted element in its rect; verify on the
  TV, not just the browser.
- Chromium has no HLS, so live preview cannot be verified on the laptop; VOD
  preview can. The TV is the real test.
- Rapid channel surfing must not leak AVPlay opens (close before reopen).

### Verification

- Enter on a live row starts the mini player with audio.
- Arrow to another row: preview follows after the debounce; title updates.
- Enter expands to fullscreen with no restart/rebuffer.
- Back from fullscreen returns to the mini player still playing.
- Back from mini stops audio and returns to the list.
- Only ~12 list rows in the DOM; the pane does not overlap the focus ring.

---

## 5. Per-series learned "Skip intro" (0.9.0)

### Goal

For series episodes, offer a "Skip intro" button that jumps over the intro.
The offset is learned per series the first time the user skips, stored on the
device, and reused for later episodes.

### Decisions

- No automatic detection: Xtream has no intro metadata and client-side audio
  fingerprinting is not viable on a 2018 TV.
- **Per-series learned offset** is the chosen approach.
- A third-party community DB (TheIntroDB, matched by TMDB id + season +
  episode) is **out of scope** for this batch; revisit only if the panel is
  confirmed to expose TMDB ids.

### Approach

- Reuses `seekTo` from 0.6.0.
- While an episode plays, show a "Skip intro" button in the control bar for a
  short window (e.g. the first 2 minutes) when a learned offset exists for the
  series.
- First time (no offset): the button is labelled "Skip intro" and jumps a
  default amount (e.g. 85s). When pressed, store
  `{ seriesId, offsetSeconds, updatedAt }` under a namespaced localStorage key,
  keyed by panel + series so playlists never share offsets.
- Later episodes: the button jumps to the learned offset relative to the
  episode start, not to an absolute time.
- Store offsets in `localStorage` (consistent with playlists); never send them
  anywhere.
- A settings/management surface is not required; keep the first version
  automatic.

### Implementation notes

- `src/services/introOffsets.ts` owns the `iptv-intro-offsets` store:
  `panelKey -> seriesId -> { seriesId, offsetSeconds, updatedAt }`.
- The first press jumps forward `DEFAULT_SKIP_SECONDS` (85s) and learns the
  resulting position, so a press a few seconds into an episode does not move
  playback backwards. Later episodes seek straight to that position.
- The pill lives beside the transport buttons, appears only while
  `current < INTRO_WINDOW_SECONDS` (120s) and before the learned offset, and
  is removed after one use. On phone-width bars it wraps above the Back
  button instead of clipping.

### Verification

- First skip on a series stores the offset; the next episode's button uses it.
- Offsets are per panel + series; switching playlists does not reuse them.
- The button appears only for episodes, not movies or live.
- It disappears after the intro window and does not fight the seek bar.
- Typecheck/build pass.

---

## Cross-cutting notes

- Keep the player adapter seam intact; both engines must implement every new
  method.
- No new dependencies, animations, blurs, or remote artwork.
- Preserve the existing spatial-navigation rules: one scope at a time, Back
  chains correctly, focus is restored by item id after channel changes.
- Every new control gets `data-spatial` and a keyboard/remote path.
- The README verification checklist is updated as each feature ships.
