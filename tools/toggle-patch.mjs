// Pure enable/disable edit shared by the host route and the standalone console.
// Preserves unrelated settings and removes only disabled:true when re-enabling.
export function togglePatch(text, rowId, disable) {
  const lines = text.split(/\r?\n/);
  const ranges = [];
  let current = null;
  for (let i = 0; i <= lines.length; i++) {
    const m = i < lines.length ? lines[i].match(/^-\s*id:\s*([\w.@/-]+)\s*$/) : null;
    const boundary = i === lines.length || m || (i < lines.length && /^\S/.test(lines[i]));
    if (current && boundary) { ranges.push(current); current = null; }
    if (m && m[1] === rowId) current = { start: i, end: i + 1 };
    else if (current) current.end = i + 1;
  }
  const disabled = (range) => lines.slice(range.start, range.end).some((l) => /^\s*disabled:\s*true\s*$/.test(l));
  let next = text;
  if (disable) {
    if (ranges.some(disabled)) return text;
    const block = '- id: ' + rowId + '\n  disabled: true';
    const emptyRe = /^\[\]\s*$/m;
    next = emptyRe.test(text)
      ? text.replace(emptyRe, block)
      : text + (text && !/\n$/.test(text) ? '\n' : '') + block + (!text || /\n$/.test(text) ? '\n' : '');
  } else {
    for (let i = ranges.length - 1; i >= 0; i--) {
      const range = ranges[i];
      if (!disabled(range)) continue;
      const kept = lines.slice(range.start, range.end).filter((l) => !/^\s*disabled:\s*true\s*$/.test(l));
      const hasOtherSettings = kept.slice(1).some((l) => l.trim() && !l.trim().startsWith('#'));
      lines.splice(range.start, range.end - range.start, ...(hasOtherSettings ? kept : []));
    }
    next = lines.join('\n');
    if (!/^- /m.test(next)) next = next.replace(/\s*$/, '\n') + '[]\n';
    if (/\n$/.test(text) && !/\n$/.test(next)) next += '\n';
  }
  return next;
}
