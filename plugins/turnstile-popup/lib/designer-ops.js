// Atomic command queue for the visual plugin designer.
// The server owns row resolution; the browser never gets to choose arbitrary YAML rows.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { togglePatch } from './toggle-patch.js';

const validAnchor = (value) => typeof value === 'string' && value.length <= 40 && /^[A-Za-z0-9_.:-]+$/.test(value);

export function anchorPatch(text, rowId, anchor) {
  if (anchor !== '' && !validAnchor(anchor)) throw new Error('invalid-anchor');
  const lines = text.split(/\r?\n/);
  const escaped = String(rowId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowIdx = lines.findIndex((line) => new RegExp('^\\s*-?\\s*id:\\s*' + escaped + '\\s*$').test(line));
  if (rowIdx === -1) throw new Error('row-not-in-patch: ' + rowId);
  const rowIndent = (lines[rowIdx].match(/^\s*/) || [''])[0].length;
  let end = lines.length;
  for (let i = rowIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const indent = (line.match(/^\s*/) || [''])[0].length;
    if (line.trim() && indent <= rowIndent && /^-\s/.test(line.trimStart())) { end = i; break; }
  }
  const next = lines.slice();
  const childIndent = ' '.repeat(rowIndent + 2);
  const leafIndent = ' '.repeat(rowIndent + 4);
  const clear = anchor === '';
  const configIdx = next.findIndex((line, i) => i > rowIdx && i < end && line.trim() === 'config:');
  if (configIdx === -1 && !clear) {
    next.splice(rowIdx + 1, 0, childIndent + 'config:', leafIndent + 'anchor: ' + anchor);
  } else if (configIdx !== -1) {
    let anchorIdx = -1;
    for (let i = configIdx + 1; i < end; i++) {
      if (/^\s*anchor:/.test(next[i])) { anchorIdx = i; break; }
      if (next[i].trim() && (next[i].match(/^\s*/) || [''])[0].length <= rowIndent + 2) break;
    }
    if (clear) { if (anchorIdx !== -1) next.splice(anchorIdx, 1); }
    else if (anchorIdx === -1) next.splice(configIdx + 1, 0, leafIndent + 'anchor: ' + anchor);
    else next[anchorIdx] = leafIndent + 'anchor: ' + anchor;
  }
  let out = next.join('\n');
  if (/\r\n/.test(text)) out = out.replace(/\n/g, '\r\n');
  return out;
}

export function applyDesignerOperations(text, operations, plugins) {
  if (!Array.isArray(operations) || operations.length > 100) throw new Error('invalid-operations');
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  let next = text;
  const normalized = operations.map((operation, index) => {
    const plugin = byName.get(operation?.package);
    if (!plugin || plugin.missing || !plugin.row) throw new Error('no-row: ' + String(operation?.package || index));
    if (operation.type === 'toggle') {
      const disable = Boolean(operation.disable);
      next = togglePatch(next, plugin.row, disable);
      return { type: 'toggle', package: plugin.name, row: plugin.row, disable };
    }
    if (operation.type === 'anchor') {
      const anchor = operation.anchor === null || operation.anchor === undefined ? '' : String(operation.anchor);
      next = anchorPatch(next, plugin.row, anchor);
      return { type: 'anchor', package: plugin.name, row: plugin.row, anchor };
    }
    throw new Error('unknown-operation: ' + String(operation.type));
  });
  return { before: text, after: next, changed: next !== text, operations: normalized };
}

export function designerTransaction(dir, operations, { dryRun = true, expected } = {}, plugins) {
  const file = join(dir, 'cordis.patch.yml');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!dryRun && expected !== undefined && expected !== before) {
    const error = new Error('patch-changed-externally');
    error.status = 409;
    throw error;
  }
  const result = applyDesignerOperations(before, operations, plugins);
  if (!dryRun && result.changed) {
    if (existsSync(file)) copyFileSync(file, file + '.bak-' + Date.now());
    writeFileSync(file, result.after, 'utf8');
  }
  return { ok: true, dryRun: Boolean(dryRun), ...result };
}
