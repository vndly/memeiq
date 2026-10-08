### [b/resource-and-configuration-parity/hosting/cache-headers-keyed-to-request-path] Hosting cache rules don't follow the rewritten index.html: SPA routes are cacheable and missing assets get HTML cached for a year

- **Location:** `backend/firebase.json:28-46` (`no-cache` only for `/` and `/index.html`). Related: `backend/firebase.json:12-27` (catch-all rewrite plus the immutable `/assets/**` rule).
- **Severity:** Low
- **Confidence:** Low
- **Likelihood:** Low. It needs a load of `/match` (bookmark, history entry, session restore) within the default cache window after a deploy. The harmful variant also needs a stale asset request followed by a rollback or a rebuild that recreates the same hashed filename.
- **Defect:** Hosting matches header rules against the original request path, before rewrites, so the index.html served for `/match` gets no `no-cache`. It falls back to Hosting's default caching, believed to be `max-age=3600`, and browsers can reuse an old app shell for up to an hour after a deploy. The usual result is running the previous build. A request for an old hashed file under `/assets/` that the new release no longer has is rewritten to index.html and returned as `200 text/html` with `max-age=31536000, immutable`. The browser then keeps that HTML under the asset URL for a year, which permanently breaks that client if a rollback or rebuild makes the same filename valid again. This is a likely case for `memes-<hash>.json` when the catalogue reverts.
- **Trigger:** Deploy a new build, then open a bookmarked `/match?...` URL in a browser that loaded the site in the last hour. For the harmful variant: a stale page requests an asset the new release removed, then the old release is rolled back.
- **Evidence / verification:** Read the Hosting emulator code bundled with the installed firebase-tools (superstatic 10.0.0). Its middleware order is headers → files → rewrites, and the headers middleware matches the original request pathname. Production behavior is assumed to match. Hosting's default `Cache-Control` could not be checked without contacting the live site. The independent refutation pass agreed with the mechanism and downgraded the usual impact to "previous build served", hence Low confidence.
- **Suggested fix:** Apply `no-cache` to every HTML response. For example, set a `no-cache` rule on `**` first and keep the immutable rule for `/assets/**` after it, since later matching rules override earlier ones. Also exclude `/assets/**` from the catch-all rewrite, so a missing asset returns a real 404 that is not cached as immutable.

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
