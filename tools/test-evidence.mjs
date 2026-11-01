// P1.0 验证分级：层级结论必须诚实（不能拿 L0 冒充可用）。
import { LEVELS, STATUS, layer, reached, claimOf, verdictOf, renderReport } from './lib/evidence.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const P = (id) => layer(id, STATUS.pass, ['ok']);
const F = (id) => layer(id, STATUS.fail, ['boom']);
const U = (id) => layer(id, STATUS.unknown, ['no data']);

ok('六层定义齐全', LEVELS.map((l) => l.id).join(',') === 'L0,L1,L2,L3,L4,L5');

ok('只过 L0 → 结论是静态通过', claimOf([P('L0')]).code === 'static-only', claimOf([P('L0')]).code);
ok('L0 的措辞禁止说可用', /尚未验证|不能据此/.test(claimOf([P('L0')]).text), claimOf([P('L0')]).text.slice(0, 24));
ok('只过 L0 的 verdict 是 warn（不是 ok）', verdictOf([P('L0')]) === 'warn');

ok('L0..L2 → loaded', claimOf([P('L0'), P('L1'), P('L2')]).code === 'loaded');
ok('L0..L4 → verified', claimOf([P('L0'), P('L1'), P('L2'), P('L3'), P('L4')]).code === 'verified');
ok('六层全过 → verified-with-regression', claimOf([P('L0'), P('L1'), P('L2'), P('L3'), P('L4'), P('L5')]).code === 'verified-with-regression');

ok('中间断裂时后面再绿也不算', reached([P('L0'), F('L1'), P('L2'), P('L3')]) === 'L0');
ok('unknown 会中断链条', reached([P('L0'), P('L1'), U('L2'), P('L3')]) === 'L1');

const failClaim = claimOf([P('L0'), P('L1'), P('L2'), F('L3')]);
ok('有失败层时 verdict=fail', verdictOf([P('L0'), F('L1')]) === 'fail');
ok('失败结论点名失败的层与原因', /路由层失败/.test(failClaim.text) && /boom/.test(failClaim.text), failClaim.text.slice(0, 40));
ok('失败时也说明验到了哪一步', /只验到/.test(failClaim.text));

const rep = renderReport({ pkg: 'p', profile: 'mini', layers: [P('L0')], claim: claimOf([P('L0')]), verdict: verdictOf([P('L0')]) });
ok('报告带 claim 文本与 deepest', rep.claimText.length > 10 && rep.deepest === 'L0');
ok('summary 以包名开头（人能读）', rep.summary.startsWith('p：'), rep.summary.slice(0, 20));

console.log(fail ? 'EVIDENCE_FAILED ' + fail : 'EVIDENCE_OK');
process.exitCode = fail ? 1 : 0;
