## Project

Meme IQ (Vite + Vue 3, TypeScript, Composition API with `<script setup>`, ESLint + @stylistic + type-aware typescript-eslint via @vue/eslint-config-typescript).

`src/` layout:

- `components/screens/` — the screen views (`main_screen.vue`, `match_screen.vue`, `loading_screen.vue`).
- `components/` — shared presentational and UI components.
- `constants.ts` — global application constants.
- `services/` — application state and data fetching services.
- `types/` — domain models and TypeScript interfaces.
- `firebase.ts` — Firebase initialization (App, Firestore via `getFirestore`, Auth via `getAuth`).
- `assets/styles.css` — global design tokens (`--ground`, `--ink`, `--paper`, `--text-main`, `--accent`, `--font-ui`, `--font-display`) and reset. All component styles are scoped (`<style scoped>`).
- `router.ts` — Vue Router configuration using HTML5 history mode (`createWebHistory`).
- `main.ts` — application entry point; creates root `app.vue`, installs router, imports global styles, mounts to `#app`.
- `env.d.ts` — Vite client types and `__APP_VERSION__` global definition.

## Conventions & Rules

- **Path aliases & extensions**: Always import using the `@` path alias (mapped to `src/`). Never use relative paths (`./`, `../`) and never include file extensions.
- **Naming**: Files in `snake_case`, types/interfaces/classes in `PascalCase`, functions/variables in `camelCase`. Avoid abbreviations; use full descriptive names (counters `i`, `j` and coordinates `x`, `y`, `dx`, `dy` permitted).
- **Types**: `strict` and `noUncheckedIndexedAccess` remain enabled. Do not use `any` or non-null assertions (`!`) on indexed lookups; handle possible undefined values (`?? fallback`). Use `import type` for type-only imports.
- **Code style**: Enforced by ESLint with `@stylistic`. No semicolons, single quotes, 2-space indentation, 1tbs brace style, multiline trailing commas, `object-shorthand: 'never'`, `curly: 'all'`, and prefix unused variables with `_`.
- **Getters & Comments**: Prefer getters over parameterless methods for computed instance state without side effects. Follow JSDoc conventions for classes and functions (see `docs/typescript.md`).
- **Responsive & Mobile**: The web app must work seamlessly across mobile and desktop devices. Ensure touch-friendly interactive targets (minimum 44×44px), fluid layouts without unintended horizontal overflow, safe area inset accommodation, and responsiveness across varied screen sizes.
- **Match audio**: The match screen preloads the next stage's audio in a standby player once the current stage's audio starts or is marked unavailable, and swaps it in on advance. The audio player downloads the whole clip before reporting ready (mobile browsers ignore preload hints), restarts the download after temporary failures (network errors, server errors or a stall; growing delay, capped at 10s), and reports any other failed response or any error once the player is ready.

## Workflow

- **After completing code changes**: Run `npm run check` (runs `npm run lint:fix` and `npm run build`), or run `npm run lint:fix` and `npm run build` individually, then run `/delta-review` before responding.
- **No test suite**: This project has no test suite by design. TypeScript (`vue-tsc`) and type-aware ESLint rules serve as the automated safety net.
- **Doc Maintenance**: After making changes, check if `AGENTS.md` or `docs/typescript.md` need updating. Architectural and workflow rules belong here; TypeScript, naming, and code conventions belong in `docs/typescript.md`.

## Tooling

- **TypeScript projects**: `tsconfig.json` references `tsconfig.app.json` (browser, `src/`, extends `@vue/tsconfig/tsconfig.dom.json`) and `tsconfig.node.json` (`vite.config.ts`, extends `@tsconfig/node24`). An option not covered in bases must be set in both.
- **Fonts**: Served by Google Fonts CDN ('Anton', 'Instrument Sans') via `<link>` in `index.html`. No font packages in `package.json` and no font files in the repo.
- **Static assets**: Import assets from `src/assets/` (including static data via `?url`) so Vite fingerprints them; nothing goes in `public/`.
- **Meme media**: Nothing is loaded from YouTube at runtime. `scripts/download_media.sh` downloads each catalogue meme's audio and thumbnail from its YouTube `url` (`yt-dlp` + `ffmpeg` + `curl`) into `src/assets/memes/audio/<id>.mp3` and `src/assets/memes/thumbnails/<id>.jpg`, skipping memes that already have them; it levels every MP3 to the same loudness (−23 LUFS, limited to about −1 dBFS) and crops every thumbnail to its centred 16:9 picture (YouTube letterboxes it in a 4:3 image). The files are committed; `src/services/meme_media.ts` maps meme IDs to their built URLs (never inlined). A meme without media plays as unavailable audio.

## Deployment

- **Build output**: `npm run build` writes into `../backend/public` (the directory Firebase Hosting serves) and empties it first (`emptyOutDir: true`).
- **Hosting configuration**: `../backend/firebase.json` rewrites all paths to `/index.html`, serves every path with `no-cache` (header rules match the request path before rewrites, so this covers the `index.html` served for SPA routes), then overrides `/assets/**` as immutable (1-year cache); later matching header rules win.
- **Deploy scripts**: `npm run deploy` (or `scripts/deploy.sh`) updates the meme catalogue (`scripts/fetch_memes.sh`), downloads media for new memes (`scripts/download_media.sh`), builds the frontend, switches to remote target (`firebase use remote`), deploys hosting (`firebase deploy --only hosting`), and resets to `local` (`firebase use local`). `../backend/scripts/deploy.sh` also triggers `npm run build` before publishing. Deploy scripts pass `--only hosting` and do not deploy Firestore indexes; run `firebase deploy --only firestore:indexes` from `../backend` when `firestore.indexes.json` changes.
- **Firebase**: Web config lives in `src/firebase.ts` (project `meme-iq`) and is public by design — it is a set of identifiers, not secrets. The project requires the Anonymous sign-in provider enabled in Firebase Auth to prevent `auth/configuration-not-found`.
