### [a/error-handling/match-stage/player-ready-wait-unbounded] A stage spins forever when the YouTube embed never reports ready or failed

- **Location:** `frontend/src/components/screens/match_screen.vue:162` (stage reveal waits on thumbnails and audio with no timeout). Related: `frontend/src/components/screens/match_screen.vue:232-247` (the audio load resolves only from player callbacks), `frontend/src/components/screens/match_screen.vue:409-445`, `frontend/src/services/youtube_player.ts:156-184` (only onReady and onError settle a mounted player).
- **Severity:** Medium
- **Confidence:** Medium
- **Likelihood:** Low. It needs the embed iframe to fail silently after the API script has loaded: a network drop between stages, or an extension that blocks or click-to-loads `youtube.com/embed`.
- **Defect:** The stage reveal waits for the audio load, which resolves only on the player's onReady or onError, a failure to load the API script, or a missing video id. Nothing bounds the wait. If the per-stage iframe never completes the IFrame API handshake, neither callback fires and the stage spinner stays up for good. The existing fallback that lets the user answer without audio is never reached, and nothing retries. The only way out is Pause → QUIT → LEAVE, which loses the match.
- **Trigger:** Play a few stages, so the API script is loaded, then lose connectivity just as the next stage creates its iframe. The iframe fails to load and no event ever reaches the page. Restoring the network does not recover the stage.
- **Evidence / verification:** Traced statically:
  - The `loadStage` reveal (`match_screen.vue:162-177`) waits on `loadAudio()`, whose resolver is called only from the `onReady`/`onError` callbacks or the no-video-id branch (`match_screen.vue:416-444`).
  - `YouTubeAudioPlayer.mount` reports errors only for API-script failures (`youtube_player.ts:185-189`). Player-level errors (2/5/100/101/150) need a live player inside the iframe.
  - Thumbnails always settle, because both `onload` and `onerror` resolve (`thumbnail_loader.ts:36-41`).

  An independent refutation pass confirmed the code path and noted Pause → QUIT still works. Remaining assumption, not verifiable offline: the YouTube widget API emits no event when its iframe document fails to load.

- **Suggested fix:** Race the audio load against a readiness timeout, for example 10–15 s, matching the script timeout. On expiry, treat the stage as audio-unavailable (set the unavailable flag and settle the load) and destroy the stuck player.

### [a/error-handling/match-stage/manual-play-assumed-successful] PLAY marks the audio as played before playback starts and can't be retried

- **Location:** `frontend/src/components/screens/match_screen.vue:475-477` (pressed flag, audio-played flag and clock set before any PLAYING event). Related: `frontend/src/components/screens/match_screen.vue:93-99` (cards unlock and PLAY disables on those flags), `frontend/src/components/screens/match_screen.vue:424-430` (the real PLAYING callback), `frontend/src/services/youtube_player.ts:205-213`.
- **Severity:** Medium
- **Confidence:** Low
- **Likelihood:** Low. PLAY is reached only when autoplay was blocked. The defect shows only if the tap-triggered `playVideo()`, sent by postMessage to the cross-origin, off-screen iframe, also fails to start playback.
- **Defect:** The PLAY handler sets the audio-played flag and the pressed flag and starts the penalty clock, then asks the player to play. It never checks that a PLAYING event follows. If playback does not start, the cards unlock, the clock runs, and PLAY stays disabled for the rest of the stage. The user must guess blind, with no retry and no indication that audio failed.
- **Trigger:** A browser that blocks both autoplay and scripted playback in the cross-origin embed. YouTube's IFrame API documentation warns that scripted playback functions may not work in some mobile browsers unless the user taps the player itself. The player here is hidden off-screen.
- **Evidence / verification:** Traced: `handlePlayClick` sets `isPlayButtonPressed`, `hasAudioPlayed` and calls `startStageClock()` before `audioPlayer.play()`. The only paths that reset these flags are a new stage's `loadStage`. An independent refutation pass confirmed the path. Remaining assumptions (unverified, no device testing): whether a target browser, most plausibly iOS Safari, actually blocks the tap-delegated `playVideo()`. Chrome likely allows it through the iframe's autoplay delegation and the page's sticky user activation.
- **Suggested fix:** Set the audio-played flag only in the PLAYING callback. After PLAY, keep the button re-enabled, or re-enable it after a short timeout, until PLAYING arrives. If it never does, fall back to the audio-unavailable path explicitly.

## Low

### [a/boundary-and-encoding-cases/match-layout/landscape-phone-gets-desktop-layout] Landscape phones get the desktop match layout: medium/hard overflow the viewport and PLAY is below the fold

- **Location:** `frontend/src/components/screens/match_screen.vue:1169-1179` (width-only wide layout replaces height and padding). Related: `frontend/src/components/screens/match_screen.vue:797-821` (fixed-viewport sizing and safe-area paddings), `frontend/src/components/screens/match_screen.vue:1191-1200`, `frontend/src/components/screens/match_screen.vue:1237-1241` (pause button offsets), `frontend/index.html:5` (`viewport-fit=cover`).
- **Severity:** Low
- **Confidence:** Medium
- **Likelihood:** Medium. Most current phones are at least 768 CSS px wide in landscape, so anyone who plays medium or hard with the phone rotated gets this layout.
- **Defect:** The wide layout depends only on width. A landscape phone (for example 844×390) switches to it, which:
  - drops the fixed `100dvh` height and `overflow: hidden`
  - lays medium and hard out as two rows of about 249×144 px cards
  - replaces the safe-area-based paddings with a flat 1.5rem

  The content totals about 552 px against a roughly 390 px viewport. The bottom card row is partly hidden and PLAY is fully below the fold, so the user has to scroll every stage while the penalty clock runs. The edge cards and the pause button also lose the notch inset, though that part is mostly cosmetic (24 px padding against a 47–59 px inset). This contradicts the project's documented requirement of safe-area accommodation and seamless mobile layouts.

- **Trigger:** Play a medium or hard match on a phone in landscape orientation.
- **Evidence / verification:** Computed from the stylesheet. For 844×390, medium and hard give 24 (padding) + 52 (counter row) + 44 (gap) + about 311 (2 card rows and gap) + 44 (gap) + 52 (PLAY) + 24 (padding) ≈ 552 px. Easy comes to about 384 px, which is borderline. An independent refutation pass recomputed the same numbers and found no height condition or later rule that restores the mobile layout. Not rendered on a device.
- **Suggested fix:** Gate the wide layout on height as well, for example `(min-width: 768px) and (min-height: 600px)`, or on `(hover: hover)`. Alternatively, keep the fixed-viewport sizing and the `max(…, env(safe-area-inset-*))` paddings in the wide layout.

### [a/logic-errors/analytics/match-start-and-pause-events-skipped] `match_start` and `pause_dialog_shown` analytics events are skipped on some paths

- **Location:** `frontend/src/components/screens/match_screen.vue:567-571` (STAY reopens the pause dialog without logging). Related: `frontend/src/components/screens/main_screen.vue:55` (the only `match_start` call), `frontend/src/components/screens/match_screen.vue:594-596` (every mount starts a match), `frontend/src/services/analytics.ts:77-100`.
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Medium. Matches started by reloading `/match` or by Back into `/match` (which the back-navigation finding makes routine) all go unlogged, as does every STAY.
- **Defect:** `match_start` is documented as "when a player starts a new match" but is logged only from the START button. A match started by a reload or deep link of `/match`, or by Back into `/match`, logs nothing. `pause_dialog_shown` is documented as "when the pause dialog is displayed", but STAY on the leave confirmation redisplays the pause dialog without logging it. Match and pause metrics are therefore undercounted.
- **Trigger:** Reload during a match, or press Back from home into `/match`: a new match runs with no `match_start`. Or open pause → QUIT → STAY: the pause dialog shows again with no `pause_dialog_shown`.
- **Evidence / verification:** Traced: `trackMatchStart` is called only in `handleStartClick` (`main_screen.vue:55`), while `startMatch` runs from `onMounted` on every mount (`match_screen.vue:594-596`). `handleCancelLeave` sets `isPauseOpen = true` without calling `trackPauseDialogShown` (`match_screen.vue:567-571`). The refutation pass confirmed both.
- **Suggested fix:** Log `match_start` from the match screen's `startMatch` with the resolved difficulty and length, and remove the menu-side call. Log `pause_dialog_shown` from `handleCancelLeave` too, or wherever the pause dialog's open flag becomes true.

### [a/state-and-lifecycle/leave-dialog/background-controls-active-while-modal] Pause and leave dialogs don't block keyboard input to the match behind them

- **Location:** `frontend/src/components/screens/match_screen.vue:367-369` (card handler ignores open dialogs). Related: `frontend/src/components/screens/match_screen.vue:93-99` (disabled states ignore dialogs), `frontend/src/components/screens/match_screen.vue:470-472` (PLAY handler ignores open dialogs), `frontend/src/components/pause_dialog.vue:44-56`, `frontend/src/components/confirm_dialog.vue:54-66` (no focus move, focus trap or `inert`).
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Only keyboard and screen-reader users can reach the controls behind the backdrop; pointer input is blocked.
- **Defect:** The dialogs are plain overlays. Focus stays where it was, nothing traps it, and the match is not made inert. The card and PLAY handlers don't check whether a dialog is open.
  - Selecting a card while paused scores it with the stage clock frozen and plays the win or fail sound behind the dialog. It also schedules the stage advance, so the next stage, or the results screen, loads behind the still-open pause dialog.
  - Pressing PLAY while paused plays the clip behind the dialog without starting the clock. A user can listen to the whole clip, resume, and answer at once for full points.
- **Trigger:** In Chrome or Firefox, press the pause button (focus stays on it), press Shift+Tab to reach PLAY or a card, then press Enter. The same works after browser Back opens the pause dialog while a card has focus.
- **Evidence / verification:** Traced: `isCardDisabled` and `handleCardClick` never read `isDialogOpen`. `scheduleStageAdvance` runs regardless. `startStageClock` records a started-but-frozen clock while a dialog is open (`match_screen.vue:317-323`), and `getStageElapsedSeconds` excludes frozen time. The dialogs only add an Escape listener on `window`. The independent refutation pass confirmed this (cards are visually blurred behind the dialog).
- **Suggested fix:** Make the match content `inert` (or `aria-hidden` plus a focus trap) while a dialog is open, move focus into the dialog on open and restore it on close. Also guard `handleCardClick` and `handlePlayClick` with the dialog-open check.

### [b/resource-and-configuration-parity/routing/unmatched-path-renders-blank] Unknown paths, including `/index.html`, render an empty page with no way home

- **Location:** `frontend/src/router.ts:11-22` (only `/` and `/match`, no catch-all). Related: `frontend/src/app.vue:12-13`, `backend/firebase.json:12-17` and `backend/firebase.json:37-45` (`/index.html` is served as a real file and given its own header rule).
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Nothing in the app links to such paths. It needs a mistyped, outdated or hand-edited URL, or a direct `/index.html` link.
- **Defect:** Hosting answers every path with the app. The router has no fallback route, so for any path other than `/` and `/match` the router view renders nothing once the catalogue loads. The user sees only the blue body background, with no content, message or link home.
- **Trigger:** Open `https://<site>/index.html` or any other unknown path such as `/play`.
- **Evidence / verification:** Traced: with no matched record, `RouterView` falls back to its empty default slot (`frontend/node_modules/vue-router/dist/vue-router.js:1093-1094`). `createWebHistory` does not strip `index.html`. Confirmed independently. `/match/` and `/Match` still match, because routes are case-insensitive and non-strict.
- **Suggested fix:** Add a catch-all route, `{path: '/:pathMatch(.*)*', redirect: {name: 'home'}}`.

### [b/resource-and-configuration-parity/hosting/cache-headers-keyed-to-request-path] Hosting cache rules don't follow the rewritten index.html: SPA routes are cacheable and missing assets get HTML cached for a year

- **Location:** `backend/firebase.json:28-46` (`no-cache` only for `/` and `/index.html`). Related: `backend/firebase.json:12-27` (catch-all rewrite plus the immutable `/assets/**` rule).
- **Severity:** Low
- **Confidence:** Low
- **Likelihood:** Low. It needs a load of `/match` (bookmark, history entry, session restore) within the default cache window after a deploy. The harmful variant also needs a stale asset request followed by a rollback or a rebuild that recreates the same hashed filename.
- **Defect:** Hosting matches header rules against the original request path, before rewrites, so the index.html served for `/match` gets no `no-cache`. It falls back to Hosting's default caching, believed to be `max-age=3600`, and browsers can reuse an old app shell for up to an hour after a deploy. The usual result is running the previous build. A request for an old hashed file under `/assets/` that the new release no longer has is rewritten to index.html and returned as `200 text/html` with `max-age=31536000, immutable`. The browser then keeps that HTML under the asset URL for a year, which permanently breaks that client if a rollback or rebuild makes the same filename valid again. This is a likely case for `memes-<hash>.json` when the catalogue reverts.
- **Trigger:** Deploy a new build, then open a bookmarked `/match?...` URL in a browser that loaded the site in the last hour. For the harmful variant: a stale page requests an asset the new release removed, then the old release is rolled back.
- **Evidence / verification:** Read the Hosting emulator code bundled with the installed firebase-tools (superstatic 10.0.0). Its middleware order is headers → files → rewrites, and the headers middleware matches the original request pathname. Production behavior is assumed to match. Hosting's default `Cache-Control` could not be checked without contacting the live site. The independent refutation pass agreed with the mechanism and downgraded the usual impact to "previous build served", hence Low confidence.
- **Suggested fix:** Apply `no-cache` to every HTML response. For example, set a `no-cache` rule on `**` first and keep the immutable rule for `/assets/**` after it, since later matching rules override earlier ones. Also exclude `/assets/**` from the catch-all rewrite, so a missing asset returns a real 404 that is not cached as immutable.

### [b/validation-and-coercion/catalogue-fetch/missing-id-and-url-validation] Catalogue validation accepts duplicate ids, unplayable URLs and too-small catalogues

- **Location:** `frontend/scripts/fetch_memes.sh:22-29` (type checks only). Related: `frontend/src/services/meme_catalogue.ts:40-44` (the runtime check is only an array check), `frontend/src/components/screens/match_screen.vue:691-701` (cards keyed and highlighted by id), `frontend/src/services/youtube.ts:10-38`, `frontend/src/constants.ts:19-23`.
- **Severity:** Low
- **Confidence:** Low
- **Likelihood:** Low. It needs a bad row in the upstream sheet. The catalogue is re-fetched on every `npm run deploy`, and the current 46 entries are clean.
- **Defect:** The deploy-time check only requires a non-empty array of items with a numeric id and string name and url, and the app re-checks only that the data is an array. Catalogues that break gameplay still ship:
  - Duplicate ids: two decoys sharing an id collide on the card key and thumbnail map, so one card shows the other's thumbnail and both highlight when either is picked.
  - A URL with no extractable YouTube id: that stage has no audio, unlocks immediately with the clock running, and shows a broken image.
  - Fewer than 6 entries: hard mode shows fewer cards than designed.
- **Trigger:** A sheet edit that duplicates an id, pastes a non-YouTube or malformed link, or leaves fewer than 6 rows, followed by `npm run deploy`.
- **Evidence / verification:** Traced the validation script and the consumers. `pickStageMemes` keys answers and decoys by id. `getYouTubeThumbnailUrl` and `extractYouTubeVideoId` return null for unparseable URLs, which leads to an empty image source and the audio-unavailable path. The refutation pass corrected an earlier claim: duplicate ids cannot cause a wrong answer to be accepted, because memes sharing the target's id are excluded from its decoys. Whether the sheet can produce such rows (manual ids or URLs) is unknown.
- **Suggested fix:** In the validation step, also reject duplicate ids, URLs from which an 11-character YouTube id cannot be extracted, and catalogues smaller than the largest card count. Mirror at least the id-uniqueness and URL checks at runtime, or fail the build.

### [a/concurrency/match-audio/ended-clip-replayed-on-resume] A clip that ends just as the user pauses replays from the start on resume

- **Location:** `frontend/src/components/screens/match_screen.vue:499` (paused-by-dialog flag captured from the playing state). Related: `frontend/src/components/screens/match_screen.vue:535-536` (resume calls the player's resume), `frontend/src/services/youtube_player.ts:229-234` (`playVideo` with no ended check), `frontend/src/services/youtube_player.ts:294-297`.
- **Severity:** Low
- **Confidence:** Medium
- **Likelihood:** Low. The window is only the delay before the player's ENDED message arrives.
- **Defect:** Pausing records whether the clip was playing, from the player's local flag. If the clip ends in the instant before that, the ENDED state change arrives after the flag was captured as true. On CONTINUE, the screen calls the player's resume, which calls `playVideo()` on the ended video and plays the whole clip again, although each stage is designed to play its clip once.
- **Trigger:** Press pause within a few milliseconds of the clip ending, then press CONTINUE.
- **Evidence / verification:** Traced: `pauseMatch` reads `audioPlayer.playing` before `pause()`. `handleStateChange` clears the flag on ENDED but does not touch the screen's paused-by-dialog flag. `handleResume` then calls `resume()`, and `resume()` sets playing and calls `playVideo()`. The refutation pass confirmed the sequence and rated the impact negligible: one extra listen.
- **Suggested fix:** In resume, skip `playVideo()` when the player state is ENDED. Alternatively, have the screen clear its paused-by-dialog flag when the ended callback fires.

### [a/null-and-numeric-hazards/match-results/iq-count-up-negative-progress] The results IQ count-up can show a negative number for one frame

- **Location:** `frontend/src/components/screens/match_screen.vue:207-211` (progress not clamped at 0). Related: `frontend/src/components/screens/match_screen.vue:182-190`.
- **Severity:** Low
- **Confidence:** Medium
- **Likelihood:** Low. It needs the first animation frame's timestamp to be earlier than the `performance.now()` taken in the timer task, by enough to round below zero. That is about 2 ms at an IQ of 100, or about 16 ms to show -6 at 150.
- **Defect:** The count-up computes progress as `(timestamp - startTime) / duration` and clamps only the upper bound. Browsers pass the animation callback the frame's start time, which can be earlier than the start time recorded in the reset-timeout task. The progress is then negative, the cubic ease turns it more negative, and the first frame shows a negative IQ such as "-1" to "-6".
- **Trigger:** Finish a match with a good score in a browser that passes a frame time earlier than the scheduling task, such as Chrome.
- **Evidence / verification:** Traced: `startTime = performance.now()`, then `progress = Math.min(1, (timestamp - startTime) / 1200)`, then `1 - (1 - progress) ** 3`, then `Math.round(finalScore * easedProgress)`, with no lower clamp. The refutation pass confirmed the arithmetic and the browser timing behavior; `Math.round` of values between -0.5 and 0 renders as "0".
- **Suggested fix:** Clamp the progress at both ends, `Math.min(1, Math.max(0, …))`, or take the start time from the first animation frame's timestamp.

### [a/state-and-lifecycle/match-leave-guard/query-change-restarts-without-confirmation] Moving between two `/match` history entries restarts the match without confirmation

- **Location:** `frontend/src/components/screens/match_screen.vue:610-619` (restart on difficulty/length change). Related: `frontend/src/components/screens/match_screen.vue:582-592` (only a leave guard is registered).
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Only a history jump of two or more entries (the browser's long-press history menu) between `/match` entries with different difficulty or length reaches it. The back-navigation finding makes such histories easy to accumulate.
- **Defect:** Navigation from one `/match` URL to another reuses the same route record and component. vue-router therefore runs update guards, not leave guards, and the confirmation that protects an in-progress match never runs. The watcher halts playback and starts a new match at once, discarding progress. Any open pause dialog and its saved state stay on screen over the new match.
- **Trigger:** Play `/match?difficulty=easy…`, then reach `/match?difficulty=hard…` through home. During that match, use the long-press Back menu to jump to the older easy entry.
- **Evidence / verification:** Traced: vue-router classifies a `/match` → `/match` navigation as "updating" (`extractChangingRecords`). `RouterView` has no key, so the component is reused, and the `[difficulty, matchLength]` watcher calls `haltPlayback()` and `startMatch()`. The refutation pass confirmed this (no restart when the values are identical).
- **Suggested fix:** Register `onBeforeRouteUpdate` with the same confirmation flow as the leave guard, or key the router view by full path so the leave guard applies.
