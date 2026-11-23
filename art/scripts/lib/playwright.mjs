// playwright.mjs -- the one Playwright lookup for the art pipeline's browser tools (capture, harnesses, *.browser.mjs tests).
// art/ adds no Playwright dependency of its own: it borrows an existing install. Roots, first hit wins:
//   1. PLAYWRIGHT_ROOT (any checkout or folder with node_modules/playwright)
//   2. this repo's root (a game checkout after `npm ci`)
//   3. the main checkout of this git worktree (the parent of `git rev-parse --git-common-dir`), so a fresh worktree without
//      node_modules still finds the main checkout's install wherever it lives
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');

// the main checkout of the worktree at `cwd` (for the main checkout itself: its own root), or null without git
export function mainCheckout(cwd = REPO_ROOT) {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return common ? path.dirname(common) : null;
  } catch { return null; }
}

export function playwrightRoots() {
  return [...new Set([process.env.PLAYWRIGHT_ROOT, REPO_ROOT, mainCheckout()].filter(Boolean).map((r) => path.resolve(r)))];
}

export function requirePlaywright() {
  const require = createRequire(import.meta.url), roots = playwrightRoots();
  for (const r of roots) { try { return require(require.resolve('playwright', { paths: [r] })); } catch { /* next */ } }
  throw new Error('playwright not found (looked in: ' + roots.join(', ') + '); set PLAYWRIGHT_ROOT to a folder with node_modules/playwright');
}
