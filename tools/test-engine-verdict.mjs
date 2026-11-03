// 引擎闸门结论：四种 basis 各一条，且只有「声明不兼容且无豁免」才算跳过。
import { classifyEngine, basisCounts } from './lib/engine-verdict.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
ok('没有声明 → loads（undeclared），不算跳过', (() => { const v = classifyEngine({ engine: '' }); return v.verdict === 'loads (no engines.dsh)' && v.basis === 'undeclared' && !v.skipped; })());
ok('声明兼容 → loads / declared-compatible', (() => { const v = classifyEngine({ engine: '>=0.2', issue: null }); return v.verdict === 'loads' && v.basis === 'declared-compatible' && !v.skipped; })());
ok('声明不兼容但有豁免 → loads (exempted)', (() => { const v = classifyEngine({ engine: '>=9', issue: { code: 'x' }, exempt: true }); return v.verdict === 'loads (exempted)' && v.basis === 'exempted' && !v.skipped; })());
ok('声明不兼容且无豁免 → SKIPPED', (() => { const v = classifyEngine({ engine: '>=9', issue: { code: 'x' } }); return v.verdict === 'SKIPPED' && v.basis === 'declared-incompatible' && v.skipped; })());
const counts = basisCounts([{ basis: 'undeclared' }, { basis: 'undeclared' }, {}]);
ok('basis 计数把未知 basis 归到 unknown', counts.undeclared === 2 && counts.unknown === 1, JSON.stringify(counts));
console.log(fail ? 'ENGINE_VERDICT_FAILED ' + fail : 'ENGINE_VERDICT_OK');
process.exitCode = fail ? 1 : 0;
