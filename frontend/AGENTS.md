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

## Workflow

- **After completing code changes**: Run `npm run check` (runs `npm run lint:fix` and `npm run build`), or run `npm run lint:fix` and `npm run build` individually, then run `/delta-review` before responding.
- **No test suite**: This project has no test suite by design. TypeScript (`vue-tsc`) and type-aware ESLint rules serve as the automated safety net.
- **Doc Maintenance**: After making changes, check if `AGENTS.md` or `docs/typescript.md` need updating. Architectural and workflow rules belong here; TypeScript, naming, and code conventions belong in `docs/typescript.md`.

## Tooling

- **TypeScript projects**: `tsconfig.json` references `tsconfig.app.json` (browser, `src/`, extends `@vue/tsconfig/tsconfig.dom.json`) and `tsconfig.node.json` (`vite.config.ts`, extends `@tsconfig/node24`). An option not covered in bases must be set in both.
- **Fonts**: Served by Google Fonts CDN ('Anton', 'Instrument Sans') via `<link>` in `index.html`. No font packages in `package.json` and no font files in the repo.
- **Static assets**: Import assets from `src/assets/` (including static data via `?url`) so Vite fingerprints them; nothing goes in `public/`.
- **Meme volumes**: `scripts/measure_volumes.sh` measures each meme's loudness (`yt-dlp` + `ffmpeg`) and prints the player volume (1–100) that evens them out; the values are maintained by hand in the meme catalogue spreadsheet.

## Deployment

- **Build output**: `npm run build` writes into `../backend/public` (the directory Firebase Hosting serves) and empties it first (`emptyOutDir: true`).
- **Hosting configuration**: `../backend/firebase.json` rewrites all paths to `/index.html`, serves every path with `no-cache` (header rules match the request path before rewrites, so this covers the `index.html` served for SPA routes), then overrides `/assets/**` as immutable (1-year cache); later matching header rules win.
- **Deploy scripts**: `npm run deploy` (or `scripts/deploy.sh`) updates the meme catalogue (`scripts/fetch_memes.sh`), builds the frontend, switches to remote target (`firebase use remote`), deploys hosting (`firebase deploy --only hosting`), and resets to `local` (`firebase use local`). `../backend/scripts/deploy.sh` also triggers `npm run build` before publishing. Deploy scripts pass `--only hosting` and do not deploy Firestore indexes; run `firebase deploy --only firestore:indexes` from `../backend` when `firestore.indexes.json` changes.
- **Firebase**: Web config lives in `src/firebase.ts` (project `meme-iq`) and is public by design — it is a set of identifiers, not secrets. The project requires the Anonymous sign-in provider enabled in Firebase Auth to prevent `auth/configuration-not-found`.
