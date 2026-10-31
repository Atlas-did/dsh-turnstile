// ask.mjs：一句话 → 意图 → 命令（纯函数，不执行）。
import assert from 'node:assert';
import { parseIntent, planFor } from '../../../tools/ask.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const intent = (s) => parseIntent(s).intent;

ok('挪到左下角 → anchor', intent('把鲸鱼娘挪到左下角') === 'anchor');
ok('识别锚点词', parseIntent('把 dsh-whale 放到右下').anchor === 'bottom-right');
ok('抽出包名', parseIntent('把 dsh-whale 放到右下').pkg === 'dsh-whale');
ok('停用 → disable', intent('停用 dsh-talk') === 'disable');
ok('停用抽出包名', parseIntent('停用 dsh-talk').pkg === 'dsh-talk');
ok('启用 → enable', intent('启用 dsh-meme') === 'enable');
ok('修一下 → fix', intent('修一下') === 'fix');
ok('拍快照 → snapshot-take', intent('装之前拍个快照') === 'snapshot-take');
ok('对比 → snapshot-diff', intent('和上次对比一下') === 'snapshot-diff');
ok('谁占 → surfaces', intent('谁占着 ui-settings') === 'surfaces');
ok('骨架 → inspect', intent('看看 dsh-mimir 怎么插的') === 'inspect');
ok('冲突 → conflict', intent('有没有冲突') === 'conflict');
ok('体检 → diagnose', intent('体检一下') === 'diagnose');
ok('看不懂 → help', intent('今天天气不错') === 'help');

const plan = (s) => planFor(parseIntent(s), 'C:/x');
ok('anchor 生成 anchor.mjs', plan('把 dsh-a 挪到左上').cmds[0][0] === 'anchor.mjs');
ok('anchor 缺包名要补充', plan('挪到左上').missing.length === 1);
ok('disable 生成 manage --disable', plan('停用 dsh-a').cmds[0].includes('--disable'));
ok('fix 生成 fix.mjs', plan('修一下').cmds[0][0] === 'fix.mjs');
ok('surfaces 生成 ui-surfaces.mjs', plan('谁占着 ui-settings').cmds[0][0] === 'ui-surfaces.mjs');
ok('help 不生成命令', plan('今天天气不错').cmds.length === 0);

console.log(fail ? 'ASK_TEST_FAILED ' + fail : 'ASK_TEST_OK ' + 20 + ' checks');
process.exitCode = fail ? 1 : 0;
