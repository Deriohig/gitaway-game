/**
 * Whether this build has the dev tools: the Dev panel, and the game clock's
 * time skips. vite.config.ts sets it, and Vite replaces it with a literal, so a
 * build where it is `false` leaves the tools' code out of the bundle entirely.
 *
 * - `true`: `npm run dev` and the tests, and `npm run build:devtools`
 *   (`vite build --mode devtools`), which is an optimised build with the tools on.
 * - `false`: every other build, such as `npm run build`.
 *
 * Don't use `import.meta.env.DEV` for this: a devtools build is a production
 * build, so it is `false` there. src/game/dev.test.ts keeps it that way.
 */
declare const __DEV_TOOLS__: boolean
