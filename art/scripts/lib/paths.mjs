// paths.mjs -- shared locations for the proof viewer + verification toolkit (build.mjs, shots.mjs, capture.mjs, ...).
// The proof folder is an env var with a repo-local default: PROOF_DIR (build.mjs's long-standing name) wins, then GITAWAY_PROOF
// (this module's old name), then art/scripts/.build/proof, which git ignores (art/.gitignore `scripts/.build/`).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ART_DIR = path.resolve(__dirname, '../..');
export const SCRIPTS_DIR = path.resolve(__dirname, '..');
export const BUILD_DIR = path.join(SCRIPTS_DIR, '.build');
export const DEFAULT_PROOF_DIR = path.join(BUILD_DIR, 'proof');
export const PROOF_DIR = path.resolve(process.env.PROOF_DIR || process.env.GITAWAY_PROOF || DEFAULT_PROOF_DIR);
export const SHOTS_DIR = path.join(PROOF_DIR, '_shots');
export const CONCEPT_DIR = path.join(ART_DIR, 'reference', 'concept');
