### [a/state-and-lifecycle/match-leave-guard/query-change-restarts-without-confirmation] Moving between two `/match` history entries restarts the match without confirmation

- **Location:** `frontend/src/components/screens/match_screen.vue:610-619` (restart on difficulty/length change). Related: `frontend/src/components/screens/match_screen.vue:582-592` (only a leave guard is registered).
- **Severity:** Low
- **Confidence:** High
- **Likelihood:** Low. Only a history jump of two or more entries (the browser's long-press history menu) between `/match` entries with different difficulty or length reaches it. The back-navigation finding makes such histories easy to accumulate.
- **Defect:** Navigation from one `/match` URL to another reuses the same route record and component. vue-router therefore runs update guards, not leave guards, and the confirmation that protects an in-progress match never runs. The watcher halts playback and starts a new match at once, discarding progress. Any open pause dialog and its saved state stay on screen over the new match.
- **Trigger:** Play `/match?difficulty=easy…`, then reach `/match?difficulty=hard…` through home. During that match, use the long-press Back menu to jump to the older easy entry.
- **Evidence / verification:** Traced: vue-router classifies a `/match` → `/match` navigation as "updating" (`extractChangingRecords`). `RouterView` has no key, so the component is reused, and the `[difficulty, matchLength]` watcher calls `haltPlayback()` and `startMatch()`. The refutation pass confirmed this (no restart when the values are identical).
- **Suggested fix:** Register `onBeforeRouteUpdate` with the same confirmation flow as the leave guard, or key the router view by full path so the leave guard applies.
