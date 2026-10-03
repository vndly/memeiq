# Bug Findings

## Medium

### [a/error-handling/match-round/audio-load-failure-soft-locks-round] Match round stuck on "LOADING..." when the round's audio cannot be prepared

- **Location:** `frontend/src/components/screens/match_screen.vue:185` (player error callback). Related: `frontend/src/components/screens/match_screen.vue:51-73` (card and button disabled state), `frontend/src/components/screens/match_screen.vue:198-203` (mount skipped when no video id), `frontend/src/services/youtube_player.ts:176-180` (mount failure reported through the error callback).
- **Severity:** Medium
- **Confidence:** High
- **Likelihood:** Low. It needs the YouTube IFrame API script to fail or take more than 10 s to load (flaky or slow mobile networks, blocked `youtube.com`), or a catalogue entry whose URL yields no video id. On a normal connection the main path never hits this.
- **Defect:** The error callback only sets "player not ready" and "not playing". Nothing ever retries the mount or moves to the next round. Cards stay disabled until audio has played once, and the action button stays disabled with the label "LOADING..." while the player isn't ready. A load failure therefore shows as a permanent loading state, and the match can't continue. The screen has no in-app exit, so the only way out is the browser back button followed by LEAVE. The same lock happens when the round's URL can't be parsed into a video id: the mount is silently skipped and "ready" never becomes true.
- **Trigger:** Open a match while `https://www.youtube.com/iframe_api` fails (script error) or doesn't finish within 10 s. Alternatively, a round picks a catalogue entry whose URL the video-id extractor can't parse.
- **Evidence / verification:** Traced statically:
  - `loadYouTubeIframeApi` rejects on script error (`youtube_player.ts:47-51`) or on the 10 s timeout (`youtube_player.ts:75-79`).
  - `mount` catches the rejection and calls `onError` (`youtube_player.ts:176-179`), which sets `isPlayerReady=false` (`match_screen.vue:186`).
  - Only `onReady` sets it back to true (`match_screen.vue:192-194`), and `onReady` is never fired.
  - `isActionButtonDisabled` and `actionButtonText` (`match_screen.vue:59, 72`) then return disabled / "LOADING...". `isCardDisabled` (`match_screen.vue:52`) is true because the audio has never played.
  - `resetRound` runs only from the card-click timeout and the difficulty watcher, and neither is reachable here.
  - Even when a slow script finishes later, the current round never re-mounts.
  - Refutation: the reviewer found no retry, timeout fallback, or alternate path that re-enables the round, so it was not refuted.
  - Assumption: whether the YouTube player can raise `onError` before first play (for example for a removed video) was not verified, so that third trigger is excluded from this finding.
- **Suggested fix:** Give the round a recoverable error state. In the error callback (and when no video id can be extracted), show an error or retry label instead of "LOADING...". Let the action button re-run the player setup, or automatically advance to a fresh round, possibly after skipping the failing meme.

### [a/state-and-lifecycle/match-leave-guard/stay-drops-pending-round-reset] Choosing STAY after answering within the last second soft-locks the match

- **Location:** `frontend/src/components/screens/match_screen.vue:233-243` (playback halt clears the pending reset). Related: `frontend/src/components/screens/match_screen.vue:170-172` (1 s round-reset timer), `frontend/src/components/screens/match_screen.vue:261-265` (STAY handler), `frontend/src/components/screens/match_screen.vue:267-277` (leave guard), `frontend/src/components/confirm_dialog.vue:29-33,58` (Escape and backdrop also cancel).
- **Severity:** Medium
- **Confidence:** High
- **Likelihood:** Low. The user has to trigger browser back within the 1 s feedback window after picking a card and then cancel the dialog.
- **Defect:** Picking a card records the clicked card and schedules the next round 1 s later. The leave guard halts playback, which also clears that scheduled reset without running it. If the user stays (STAY, Escape, or a backdrop click), nothing re-schedules the reset. The clicked-card state stays set for good, so every card is disabled and the action button stays disabled with the label "LOADING...". The match can't continue until the user leaves.
- **Trigger:** In a match, play the audio, pick any card, and within 1 s press browser back (or swipe back on mobile). When the leave dialog appears, choose STAY, press Escape, or tap the backdrop.
- **Evidence / verification:** Traced:
  - `handleCardClick` sets `clickedMemeId` and `resetTimeoutId` (`match_screen.vue:150,170`).
  - `onBeforeRouteLeave` calls `haltPlayback`, which runs `clearTimeout(resetTimeoutId)` and nulls it (`match_screen.vue:239-242`).
  - `handleCancelLeave` only closes the dialog and clears the target route (`match_screen.vue:261-265`).
  - With `clickedMemeId !== null`, `isCardDisabled` and `isActionButtonDisabled` are both true and `actionButtonText` is "LOADING..." (`match_screen.vue:52,59,66-67`).
  - Refutation: confirmed independently, and no code path re-schedules or runs the reset after cancel.
- **Suggested fix:** Don't drop the pending round transition on a cancelled leave. Either let the halt function leave the reset timer alone, or have the cancel handler start a fresh round (or re-schedule the reset) when a card had already been picked.

### [b/validation-and-coercion/catalogue-fetch/missing-id-and-url-validation] Deploy-time catalogue validation accepts duplicate ids and URLs the game can't play

- **Location:** `frontend/scripts/fetch_memes.sh:17-31`. Related: `frontend/src/services/meme_catalogue.ts:43` (unchecked cast), `frontend/src/components/screens/match_screen.vue:157,345,349-350` (answers judged and cards keyed by id), `frontend/src/services/youtube.ts:10-38` (video-id extraction).
- **Severity:** Medium
- **Confidence:** Medium
- **Likelihood:** Low. The catalogue comes from an externally edited Google Sheet and is re-fetched on every `npm run deploy`. A bad row has to be added there, which is possible but not routine. The committed data (47 entries) is currently clean.
- **Defect:** The fetch script checks only that the response is a non-empty array whose items have a numeric id and string name and URL. It doesn't reject duplicate ids, and it doesn't reject URLs the client can't turn into a YouTube video id. The client never re-validates. The match screen judges answers by id and keys cards by id, so two entries sharing an id can both be drawn into a round: a wrong card is then judged correct, two cards get highlighted, and Vue sees duplicate keys. A URL with no extractable id soft-locks any round that targets it (see the audio-load-failure finding above).
- **Trigger:** A sheet row with a repeated `id`, or a non-YouTube or malformed URL, followed by `npm run deploy`. The script writes it into `src/assets/memes.json`, and it ships.
- **Evidence / verification:**
  - Read the validator (`fetch_memes.sh:22-29`) and the client cast (`meme_catalogue.ts:43`).
  - `pickRandomMemes` shuffles by position, not identity, so two entries with the same id can be drawn into one round.
  - Ran an extractor-equivalent check over the committed catalogue: 47 entries, unique ids, all URLs parse, so the defect is not live today.
  - Refutation confirmed there is no other runtime guard.
  - Assumption: sheet editors can enter such rows.
- **Suggested fix:** Extend the deploy-time validation to require unique ids and URLs from which an 11-character YouTube video id can be extracted, reusing the same rules as the client extractor, and fail the deploy otherwise.

## Low

### [c/api-or-library-misuse/match-leave-guard/back-navigation-replayed-as-push] Leaving a match via the back button pushes a new history entry, trapping the back button

- **Location:** `frontend/src/components/screens/match_screen.vue:248-256`. Related: `frontend/src/components/screens/match_screen.vue:267-277`, `frontend/node_modules/vue-router/dist/vue-router.js:1430-1445` (router reverts an aborted back navigation).
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Medium. The browser back button is the only way to leave a match, so every player who leaves and then presses back again hits this.
- **Defect:** When the user presses back on the match screen, the guard aborts the navigation and the router immediately moves history forward again. Confirming LEAVE then does a `router.push` to the original destination instead of repeating the back step, which appends a new home entry. History becomes `[…, home, match, home]`. Pressing back from that home returns to the match. Leaving again appends yet another home entry, so the back button can never get past the match screen to the page before the app.
- **Trigger:** Home → START → pick a difficulty → press back → LEAVE → press back again: the user lands on a new match instead of leaving.
- **Evidence / verification:**
  - The guard returns `false`, which gives a NAVIGATION_ABORTED failure.
  - The popstate handler then runs `routerHistory.go(-info.delta, false)` (`vue-router.js:1443`), restoring the match entry.
  - `handleConfirmLeave` calls `router.push(destination)` (`match_screen.vue:255`), and pushes add history entries.
  - Refutation confirmed it. It doesn't apply when the match was the first entry loaded from the server.
- **Suggested fix:** Remember whether the blocked navigation was a history traversal (for example via the router's history state or a flag set from a `popstate` listener). On LEAVE, replay it with `router.back()` / `router.go(delta)` instead of pushing, or use `router.replace` so no extra entry is created.

### [a/boundary-and-encoding-cases/match-layout/landscape-phone-gets-desktop-layout] Landscape phones get the desktop match layout: PLAY is below the fold and safe-area insets are lost

- **Location:** `frontend/src/components/screens/match_screen.vue:636-698`. Related: `frontend/src/components/screens/match_screen.vue:418-434` (safe-area padding), `frontend/index.html:5` (`viewport-fit=cover`).
- **Severity:** Low
- **Confidence:** Medium
- **Likelihood:** Medium. Most current phones are 768 CSS px or wider in landscape, so any player who rotates their phone on medium or hard gets this layout.
- **Defect:** The wide-screen media query depends only on width. A landscape phone (for example 844×390) therefore switches to the desktop layout, which turns off the fixed-viewport height, allows the page to grow, and replaces all four safe-area paddings with a flat 1.5rem. On medium and hard, two rows of ~148 px cards plus gaps, button, and padding come to about 460 px, more than the ~390 px viewport. The player has to scroll between the cards and PLAY every round, and the outer cards sit partly under the notch / Dynamic Island inset (~47–59 px vs 24 px padding).
- **Trigger:** Play a medium or hard match on a phone in landscape orientation.
- **Evidence / verification:**
  - Computed from the stylesheet. For hard: (844−48−48)/3 ≈ 249 px wide cards → 140 px image + 8 px border; 2 rows + 24 gap + 44 content gap + 48 button + 48 padding ≈ 460 px.
  - Medium's capped two-column grid gives the same card size.
  - The media block's `padding` shorthand overrides the safe-area paddings.
  - Refutation: no height condition or later rule restores the mobile layout.
  - Remaining assumption: not rendered on a device.
- **Suggested fix:** Gate the desktop layout on height as well as width (or on `orientation`/`hover`), or keep the fixed-viewport sizing and `max(…, env(safe-area-inset-*))` paddings in the wide layout too.

### [a/error-handling/youtube-api-loader/failed-script-tag-never-reinjected] A failed YouTube API script tag blocks every later load attempt in the session

- **Location:** `frontend/src/services/youtube_player.ts:42-53`. Related: `frontend/src/services/youtube_player.ts:67-79`.
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. It needs a hard network or CSP failure loading `iframe_api`, and then the user starting another match without reloading the page.
- **Defect:** On a script `error`, the loader rejects and clears its cached promise but leaves the failed `<script>` element in the document. The next call finds that element, skips injecting a new one, attaches no error handler, and just polls until the 10 s timeout rejects. Every later match in the same page session therefore waits 10 s and then soft-locks, even after connectivity recovers, until a full page reload.
- **Trigger:** The first `iframe_api` request fails (offline, blocked). The user leaves the match and starts a new one after the network is back.
- **Evidence / verification:**
  - Traced: `onerror` resets `apiPromise` (`youtube_player.ts:49`) but never removes `scriptElement`.
  - On re-entry, `window.YT` is undefined and `apiPromise` is null, so a new promise starts.
  - The `querySelector` lookup (`youtube_player.ts:42`) finds the dead tag, so no new script is added, and only the timeout path can settle the promise.
  - Refutation confirmed: nothing else injects or removes the tag, and only the hard-error path is permanent (a late-loading script does recover).
- **Suggested fix:** Remove the script element in the error handler (and possibly on timeout) so the next attempt re-injects it, or attach error/load listeners to an existing tag instead of relying only on polling.

### [b/resource-and-configuration-parity/routing/unmatched-path-renders-blank] Any unknown path renders an empty page with no way back

- **Location:** `frontend/src/router.ts:9-23`. Related: `backend/firebase.json:12-17` (all paths rewritten to the app), `frontend/src/app.vue:13`.
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Only mistyped or stale links, or a direct visit to `/index.html`, trigger it, since the app itself only links to `/` and `/match`.
- **Defect:** Hosting serves the app for every path, but the router defines only `/` and `/match`, with no catch-all or redirect. For any other path, the router view renders nothing once the catalogue has loaded: the user sees only the blue background, with no content or link home.
- **Trigger:** Open `/index.html`, `/play`, `/matches`, or any other non-route path on the deployed site.
- **Evidence / verification:**
  - The hosting rewrite `"source": "**"` serves `index.html`.
  - The route table has no `/:pathMatch(.*)*` entry, so `<RouterView>` gets no matched component.
  - Searched for a not-found route, redirect, or router error handler and found none. Refutation did not hold.
- **Suggested fix:** Add a catch-all route that redirects to `home` (or shows a not-found screen with a link home).

### [a/state-and-lifecycle/leave-dialog/background-controls-active-while-modal] Leave dialog doesn't block keyboard input to the match behind it

- **Location:** `frontend/src/components/confirm_dialog.vue:29-47,54-91`. Related: `frontend/src/components/screens/match_screen.vue:267-277`.
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Only keyboard users (or hardware-keyboard tablet users) who navigate back while a match control has focus are affected.
- **Defect:** The dialog says it is modal, but focus is never moved into it, background content isn't made inert, and the key handler only handles Escape. Focus stays on the previously focused PLAY button or card, so Space/Enter still activates it while the dialog is open. Meme audio can start behind the dialog right after the guard stopped it, or a card can be answered and the next round scheduled behind it. Tab also moves through the background controls.
- **Trigger:** Focus PLAY or a card with the keyboard, press Alt+Left (browser back), then press Space or Enter.
- **Evidence / verification:**
  - Traced: the guard only opens the dialog (`match_screen.vue:272-274`).
  - The dialog has no `autofocus`, `.focus()`, focus trap, or `inert` handling.
  - The backdrop blocks pointer events only.
  - Same-document back navigation leaves focus unchanged.
  - Refutation found no element that captures keyboard focus.
- **Suggested fix:** When opening, move focus into the dialog (for example to the STAY button) and restore it on close. Mark the match content `inert` while the dialog is open, or trap Tab within the dialog.

## Summary

By severity: Medium (3 findings), Low (5 findings)

By confidence: High (6 findings), Medium (2 findings)

| Severity | High | Medium | Low |
| -------- | ---- | ------ | --- |
| Medium   | 2    | 1      | 0   |
| Low      | 4    | 1      | 0   |

By Likelihood: High (0 findings), Medium (2 findings), Low (6 findings)
