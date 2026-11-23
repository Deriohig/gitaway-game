/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Production builds ship a Content-Security-Policy that only allows the page's
// own origin. Gitaway makes no network requests, and the policy enforces that:
// no analytics, no CDN fonts, nothing leaves the device. (Dev mode skips it
// because the React refresh preamble is an inline script.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // `ipc:` and `http://ipc.localhost` carry the desktop shell's Tauri commands
  // to the Rust side: `ipc://localhost` on macOS, `http://ipc.localhost` on
  // Windows. They are local to the app, not network hosts. (The page itself
  // comes from `tauri://localhost` on macOS, `http://tauri.localhost` on
  // Windows, and is 'self' on both.) `blob:` lets the model loader read the
  // textures it unpacks from a .glb into the page's own memory (Chromium
  // fetches them).
  "connect-src 'self' blob: ipc: http://ipc.localhost",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'gitaway-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

// The dev tools (the Dev panel, and the game clock's time skips) are on when
// the dev server or the tests run, and in a build made with `--mode devtools`
// (`npm run build:devtools`, which is what the "Gitaway Dev" desktop app ships).
// Every other build has them off. It is a constant that Vite replaces with a
// literal (`__DEV_TOOLS__`, declared in src/dev-tools.d.ts), so the minifier
// drops the tools' code from builds where it is false. A mode is used, not an
// environment variable, so that the same npm script works in any shell.
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), contentSecurityPolicy()],
  // Look for dependencies to pre-bundle from the game's page only. Left to
  // itself the dev server also scans art/scripts' pages, and where the art
  // pipeline's npm install has run it pre-bundles that folder's older three.js
  // in place of the game's.
  optimizeDeps: { entries: ['index.html'] },
  define: {
    __DEV_TOOLS__: JSON.stringify(command === 'serve' || mode === 'devtools'),
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
}))
