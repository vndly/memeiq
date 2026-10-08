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
