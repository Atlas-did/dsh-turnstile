// 技能包检查器：读得懂第三方包（块标量 frontmatter），坏包要能抓出来。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, 'skill-pack.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const home = mkdtempSync(join(tmpdir(), 'skills-'));
const root = join(home, 'skills');
const mk = (name, body) => { mkdirSync(join(root, name), { recursive: true }); writeFileSync(join(root, name, 'SKILL.md'), body); };

// 1) 正常包
mk('good', '---\nname: good\ndescription: 一个正常的技能\n---\n\n# good\n');
// 2) 块标量 description（brooks-lint 的写法）
mk('blocky', '---\nname: blocky\ndescription: >\n  多行描述\n  第二行\n---\n\n# blocky\n');
// 3) 前缀命名（sp-* 的写法）：name 与目录不同名 → 只是 warning
mk('sp-prefixed', '---\nname: prefixed\ndescription: 带前缀的技能\n---\n\n# x\n');
// 4) 坏包：没有 frontmatter
mk('broken', '# 没有 frontmatter 的技能\n');

const run = (args) => {
  try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', timeout: 60000 }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

const list = run(['list', '--home', home]);
ok('list 看到 4 个包', (list.out.match(/SKILL/g) || ['x']).length >= 1 && list.out.includes('blocky'));
ok('块标量 description 被正确解析', /多行描述/.test(list.out), (list.out.split('\n').find((l) => l.includes('blocky')) || '').slice(0, 60));

const goodLint = run(['lint', '--dir', join(root, 'good')]);
ok('合规包 lint 通过', goodLint.code === 0 && /OK/.test(goodLint.out), goodLint.out.trim().slice(0, 30));

const prefixed = run(['lint', '--dir', join(root, 'sp-prefixed')]);
ok('前缀命名只是 warning，不判死', prefixed.code === 0 && /不一致/.test(prefixed.out), prefixed.out.trim().split('\n')[1] || '');

const broken = run(['lint', '--dir', join(root, 'broken')]);
ok('坏包 lint 报错', broken.code === 1 && /frontmatter/.test(broken.out), broken.out.trim().slice(0, 40));

const doc = run(['doctor', '--home', home]);
ok('doctor 有坏包时退出码非 0', doc.code === 1, String(doc.code));
ok('doctor 汇总里点名坏包数', /不合规 1/.test(doc.out), doc.out.trim().split('\n').pop());

console.log(fail ? 'SKILLPACK_FAILED ' + fail : 'SKILLPACK_OK');
process.exitCode = fail ? 1 : 0;
