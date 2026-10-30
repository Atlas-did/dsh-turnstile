// Enable/disable a profile patch row without losing anything.
//
// Rules:
//  - disable inserts `disabled: true` and keeps every other key of the block;
//  - enable removes only that line;
//  - if the block then holds nothing but `- id: <row>` it was synthesized by us, so remove the block
//    too (otherwise the file keeps a row that never existed, and the next apply sees a changed baseline).

export function toggleText(text, rowId, disable) {
  const source = String(text || '');
  const lines = source.split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp('^-\\s*id:\\s*' + rowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$').test(l));

  if (disable) {
    if (at !== -1) {
      let end = lines.length;
      for (let i = at + 1; i < lines.length; i++) if (/^-\s/.test(lines[i])) { end = i; break; }
      const body = lines.slice(at + 1, end).filter((l) => !/^\s*disabled:\s*true\s*$/.test(l));
      const named = body.findIndex((l) => /^\s*name:/.test(l));
      if (named === -1) body.unshift('  disabled: true'); else body.splice(named + 1, 0, '  disabled: true');
      return lines.slice(0, at + 1).concat(body, lines.slice(end)).join('\n');
    }
    const block = '- id: ' + rowId + '\n  disabled: true';
    const empty = /^\[\]\s*$/m;
    const out = empty.test(source) ? source.replace(empty, block) : source.replace(/\s*$/, '') + '\n' + block + '\n';
    return /\n$/.test(out) ? out : out + '\n';
  }

  if (at === -1) return /\n$/.test(source) ? source : source + '\n';
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (/^-\s/.test(lines[i])) { end = i; break; }
  const body = lines.slice(at + 1, end).filter((l) => !/^\s*disabled:\s*true\s*$/.test(l));
  const isEmptyBlock = body.every((l) => l.trim() === '');
  const next = isEmptyBlock
    ? lines.slice(0, at).concat(lines.slice(end))
    : lines.slice(0, at + 1).concat(body, lines.slice(end));
  let out = next.join('\n');
  if (!/^- /m.test(out)) out = out.replace(/\s*$/, '\n') + '[]\n';
  return /\n$/.test(out) ? out : out + '\n';
}
