// arch-graph 的产物必须能被下游消费：两条被 archify 拒过的规则 + 摆放不重叠。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// 不写死作者机器路径：优先 ARCHGRAPH_PROFILE，其次仓库夹具
const profile = process.env.ARCHGRAPH_PROFILE || join(here, '..', 'tests', 'console-fixture');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const out = mkdtempSync(join(tmpdir(), 'arch-')) + '/x';
execFileSync(process.execPath, [join(here, 'arch-graph.mjs'), profile, '--out-dir', out], { encoding: 'utf8', timeout: 120000 });
const doc = JSON.parse(readFileSync(join(out, 'candidate.json'), 'utf8'));

ok('candidate.json 存在且有组件', Array.isArray(doc.components) && doc.components.length > 0);
ok('viewBox 是两项（archify 只收 [w,h]）', Array.isArray(doc.meta.viewBox) && doc.meta.viewBox.length === 2, JSON.stringify(doc.meta.viewBox));

const textW = (s) => [...String(s || '')].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 13 : 7.2), 0);
const narrow = doc.components.filter((c) => c.size[0] < textW(c.label) + 12);
ok('每个组件宽度都容得下标签', narrow.length === 0, narrow.slice(0, 2).map((c) => c.label + ' ' + c.size[0] + 'px vs ' + Math.ceil(textW(c.label)) + 'px').join(' | '));

const tall = doc.components.filter((c) => c.size[1] < 40);
ok('每个组件高度不小于 40', tall.length === 0);

const rows = new Map();
for (const c of doc.components) { const k = c.pos[1]; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(c); }
let overlap = '';
for (const [, list] of rows) {
  const sorted = [...list].sort((a, b) => a.pos[0] - b.pos[0]);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    if (prev.pos[0] + prev.size[0] > sorted[i].pos[0]) overlap = prev.label + ' / ' + sorted[i].label;
  }
}
ok('同一行组件不重叠', overlap === '', overlap);

const right = Math.max(...doc.components.map((c) => c.pos[0] + c.size[0]));
ok('viewBox 宽度覆盖所有组件', doc.meta.viewBox[0] >= right, doc.meta.viewBox[0] + ' vs ' + right);

const archify = process.env.ARCHIFY_PATH;
if (archify && existsSync(archify)) {
  try {
    execFileSync(process.execPath, [archify, 'render', 'architecture', join(out, 'candidate.json'), join(out, 'graph.html')], { encoding: 'utf8', timeout: 180000 });
    ok('archify render 成功', existsSync(join(out, 'graph.html')));
  } catch (e) {
    ok('archify render 成功', false, String(e.stderr || e.message).slice(0, 160));
  }
} else {
  console.log('skip archify render（这台机器上没有 archify.mjs；用 ARCHIFY_PATH 指定后可实测）');
}

console.log(fail ? 'ARCHGRAPH_TEST_FAILED ' + fail : 'ARCHGRAPH_TEST_OK');
process.exitCode = fail ? 1 : 0;
