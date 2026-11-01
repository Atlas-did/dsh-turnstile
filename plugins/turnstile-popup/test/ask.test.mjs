// ask.mjs：自然语言 → 结构化动作；写操作不能绕过统一确认。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent, planFor } from '../../../tools/ask.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const intent = (s) => parseIntent(s).intent;
const plan = (s) => planFor(parseIntent(s), 'C:/x');
const first = (s) => plan(s).actions[0];
const here = dirname(fileURLToPath(import.meta.url));
const ask = join(here, '..', '..', '..', 'tools', 'ask.mjs');

ok('挪到左下角 → anchor', intent('把鲸鱼娘挪到左下角') === 'anchor');
ok('识别锚点词', parseIntent('把 dsh-whale 放到右下').anchor === 'bottom-right');
ok('抽出包名', parseIntent('把 dsh-whale 放到右下').pkg === 'dsh-whale');
ok('停用 → disable', intent('停用 dsh-talk') === 'disable');
ok('启用 → enable', intent('启用 dsh-meme') === 'enable');
ok('修一下 → fix', intent('修一下') === 'fix');
ok('拍快照 → snapshot-take', intent('装之前拍个快照') === 'snapshot-take');
ok('对比 → snapshot-diff', intent('和上次对比一下') === 'snapshot-diff');
ok('谁占 → surfaces', intent('谁占着 ui-settings') === 'surfaces');
ok('骨架 → inspect', intent('看看 dsh-mimir 怎么插的') === 'inspect');
ok('冲突 → conflict', intent('有没有冲突') === 'conflict');
ok('体检 → diagnose', intent('体检一下') === 'diagnose');
ok('插件状态 → doctor', intent('帮我看看插件状态') === 'doctor');
ok('试装结果 → trial-status', intent('上次试装结果怎么样') === 'trial-status');
ok('制作插件 → builder', intent('我想制作一个插件页面') === 'builder');
ok('装前风险 → preinstall', intent('装 dsh-x 之前有风险吗') === 'preinstall');
ok('看不懂 → help', intent('今天天气不错') === 'help');

ok('anchor 生成统一 anchor 动作', first('把 dsh-a 挪到左上').command === 'anchor' && first('把 dsh-a 挪到左上').args.anchor === 'top-left');
ok('anchor 缺包名要补充', plan('挪到左上').missing.length === 1);
ok('disable 生成高危写动作', first('停用 dsh-a').command === 'manage-disable' && first('停用 dsh-a').mutating && first('停用 dsh-a').danger);
ok('enable 生成统一写动作', first('启用 dsh-a').command === 'manage-enable' && first('启用 dsh-a').args.package === 'dsh-a');
ok('fix 生成统一写动作', first('修一下').command === 'fix' && first('修一下').mutating);
ok('surfaces 生成只读动作', first('谁占着 ui-settings').command === 'surfaces' && !first('谁占着 ui-settings').mutating);
ok('doctor 带 profile', first('看看插件状态').command === 'doctor' && first('看看插件状态').args.profile === 'C:/x');
ok('trial-status 是只读证据查询', first('上次试装结果').command === 'trial-status' && !first('上次试装结果').mutating);
ok('builder 返回页面入口而非 shell 命令', first('制作插件').url === '/turnstile/builder');
ok('preinstall 提取包名', first('装 dsh-x 前有风险吗').args.pkg === 'dsh-x');
ok('help 不生成动作', plan('今天天气不错').actions.length === 0);

const planned = JSON.parse(execFileSync(process.execPath, [ask, 'C:/x', '停用 dsh-a', '--json'], { encoding: 'utf8' }));
ok('JSON 契约暴露结构化写动作', planned.ok && planned.actions[0].command === 'manage-disable' && planned.actions[0].mutating);
let refused = null;
try { execFileSync(process.execPath, [ask, 'C:/x', '停用 dsh-a', '--apply'], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { refused = JSON.parse(String(e.stdout)); }
ok('--apply 不能直接执行写操作', refused && refused.ok === false && /dry-run/.test(refused.summary));

console.log(fail ? 'ASK_TEST_FAILED ' + fail : 'ASK_TEST_OK ' + 30 + ' checks');
process.exitCode = fail ? 1 : 0;
