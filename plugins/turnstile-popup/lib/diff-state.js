// Diff state as orthogonal bitfields, modelled on WinMerge's DIFFCODE (Src/DiffItem.h):
// each dimension gets its own mask, every legitimate value is non-zero, and checks read as
// `(code & mask) === value` so a caller cannot compare mismatched dimensions by accident.

const mask = (bits) => bits;

export const CHANGE = { MASK: mask(0x3c), NONE: 0x04, ADDED: 0x08, REMOVED: 0x0c, MODIFIED: 0x10 };
export const KIND = { MASK: mask(0xc0), ROW: 0x40, CONFIG: 0x80, VALUE: 0xc0 };
export const SIDE = { MASK: mask(0x700), LEFT: 0x100, RIGHT: 0x200, BOTH: 0x300 };
export const CONFIDENCE = { MASK: mask(0x1800), EXACT: 0x800, UNKNOWN: 0x1000 };

export const DIMENSIONS = [CHANGE, KIND, SIDE, CONFIDENCE];

/** Compose a code from one value per dimension. Missing dimensions stay zero on purpose. */
export function codeOf({ change, kind, side, confidence }) {
  return (change || 0) | (kind || 0) | (side || 0) | (confidence || 0);
}

export function is(code, dimension, value) {
  return (code & dimension.MASK) === value;
}

/** True when every set dimension is one of ours - i.e. the code is not garbage. */
export function isKnown(code) {
  const known = DIMENSIONS.reduce((acc, d) => acc | d.MASK, 0);
  return (code & ~known) === 0;
}

/** A code with no CHANGE value is either empty (0) or unreadable; never guess a change. */
export function hasChange(code) {
  return (code & CHANGE.MASK) !== 0;
}

export function describe(code) {
  if (!code) return '未比较';
  if (!isKnown(code)) return '无法识别的差异码';
  const parts = [];
  if (is(code, CHANGE, CHANGE.ADDED)) parts.push('新增');
  else if (is(code, CHANGE, CHANGE.REMOVED)) parts.push('删除');
  else if (is(code, CHANGE, CHANGE.MODIFIED)) parts.push('修改');
  else parts.push('未变化');
  if (is(code, KIND, KIND.ROW)) parts.push('整行');
  else if (is(code, KIND, KIND.CONFIG)) parts.push('配置');
  else if (is(code, KIND, KIND.VALUE)) parts.push('值');
  if (is(code, SIDE, SIDE.LEFT)) parts.push('仅左侧');
  else if (is(code, SIDE, SIDE.RIGHT)) parts.push('仅右侧');
  if (is(code, CONFIDENCE, CONFIDENCE.UNKNOWN)) parts.push('(快速比对，未逐行确认)');
  return parts.join(' · ');
}


/**
 * Turn two texts into coded diff lines. Kept here (not in the page) so it can be unit tested:
 * the page only renders what this returns.
 */
export function classifyDiff(beforeText, afterText, limit = 160000) {
  const a = String(beforeText || '').split('\n');
  const b = String(afterText || '').split('\n');
  if (a.length * b.length > limit) return { tooBig: true, lines: [], summary: null };
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0; let j = 0;
  const kindOf = (text) => (/^- id:/.test(text) || /^\s*- id:/.test(text) ? KIND.ROW : KIND.CONFIG);
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push({ code: codeOf({ change: CHANGE.NONE, kind: kindOf(a[i]) }), marker: ' ', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) lines.push({ code: codeOf({ change: CHANGE.REMOVED, kind: kindOf(a[i]) }), marker: '-', text: a[i++] });
    else lines.push({ code: codeOf({ change: CHANGE.ADDED, kind: kindOf(b[j]) }), marker: '+', text: b[j++] });
  }
  while (i < a.length) lines.push({ code: codeOf({ change: CHANGE.REMOVED, kind: kindOf(a[i]) }), marker: '-', text: a[i++] });
  while (j < b.length) lines.push({ code: codeOf({ change: CHANGE.ADDED, kind: kindOf(b[j]) }), marker: '+', text: b[j++] });
  const summary = { added: 0, removed: 0, same: 0 };
  for (const l of lines) {
    if (is(l.code, CHANGE, CHANGE.ADDED)) summary.added++;
    else if (is(l.code, CHANGE, CHANGE.REMOVED)) summary.removed++;
    else summary.same++;
  }
  return { tooBig: false, lines, summary };
}

if (typeof window !== 'undefined') {
  window.TurnstileDiff = { CHANGE, KIND, SIDE, CONFIDENCE, codeOf, is, isKnown, hasChange, describe, classifyDiff };
}
