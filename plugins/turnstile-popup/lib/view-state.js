// View state: the sort column, direction, page and filter a user left behind.
//
// Modelled on System Informer's column-set string (colsetmgr.c): a tiny self-delimiting record that
// is parsed defensively - anything unrecognised falls back to defaults instead of throwing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const DEFAULT_VIEW_STATE = Object.freeze({ view: 'overview', query: '', status: 'all', sortKey: 'name', sortDir: 1 });

const VIEWS = ['overview', 'designer', 'checks', 'plugins', 'surfaces', 'architecture', 'history'];
const STATUSES = ['all', 'enabled', 'disabled', 'skipped'];
const SORTS = ['name', 'status', 'surfaces', 'version'];

export function viewStatePath(stateDir) {
  return join(stateDir, 'turnstile-view.json');
}

/** Accept only known keys with the right types; everything else is dropped, never guessed. */
export function sanitizeViewState(input) {
  const out = Object.assign({}, DEFAULT_VIEW_STATE);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  if (VIEWS.indexOf(input.view) !== -1) out.view = input.view;
  if (STATUSES.indexOf(input.status) !== -1) out.status = input.status;
  if (SORTS.indexOf(input.sortKey) !== -1) out.sortKey = input.sortKey;
  if (input.sortDir === 1 || input.sortDir === -1) out.sortDir = input.sortDir;
  if (typeof input.query === 'string' && input.query.length <= 120) out.query = input.query;
  return out;
}

export function readViewState(stateDir) {
  const p = viewStatePath(stateDir);
  if (!existsSync(p)) return { state: Object.assign({}, DEFAULT_VIEW_STATE), source: 'default' };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return { state: sanitizeViewState(parsed), source: 'file' };
  } catch {
    // A corrupt file is not an error: fall back, and say so.
    return { state: Object.assign({}, DEFAULT_VIEW_STATE), source: 'fallback' };
  }
}

export function writeViewState(stateDir, input) {
  const clean = sanitizeViewState(input);
  const p = viewStatePath(stateDir);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = p + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(clean, null, 1));
  renameSync(tmp, p);
  return clean;
}
