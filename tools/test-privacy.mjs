// 隐私与安全回归：文档不含本机绝对路径；不出现 eval-like 代码；服务器默认只听本机。
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findPaths } from './sanitize-docs.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

// 与 sanitize-docs 同一条规则：占位符（后面跟 <）不算泄漏
const HOME = /(?:[A-Za-z]:[\\/]|\/)[Uu]sers[\\/](?![<`])[^\\/\s`'"]+[\\/][^\\/\s`'"]+/;
const docsDir = join(root, 'docs');
const dirty = readdirSync(docsDir).filter((f) => f.endsWith('.md') && HOME.test(readFileSync(join(docsDir, f), 'utf8')));
ok('docs 里没有本机绝对路径', dirty.length === 0, dirty.slice(0, 3).join(','));

const exprLint = readFileSync(join(root, 'tools', 'js-expr-lint.mjs'), 'utf8');
const pits = readFileSync(join(root, 'tools', 'pits.mjs'), 'utf8');
// 注释里会提到旧实现的名字，所以只检查「可执行代码里」是否还有
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('js-expr-lint 代码里没有 new Function', !/new Function/.test(stripComments(exprLint)) && /acorn/.test(exprLint));
ok('pits 代码里没有 new Function', !/new Function/.test(stripComments(pits)) && /acorn\.parse/.test(pits));

const server = readFileSync(join(root, 'tools', 'console-server.mjs'), 'utf8');
ok('console-server 默认只监听 127.0.0.1', /arg\('--host', '127\.0\.0\.1'\)/.test(server));
ok('console-server 没有 0.0.0.0 默认值', !/0\.0\.0\.0/.test(server));

const plugin = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'index.js'), 'utf8');
ok('令牌也可以用请求头传（不必留在 URL）', /x-turnstile-token/.test(plugin));

// D-04：扫描范围扩到全仓库，并且要能识别真实路径、放过占位符
// 夹具在运行时拼出来：源码里不含连续路径，否则扫描器会把自己当成泄漏
const SAMPLE = 'x ' + ['C:', 'Users', 'bob', 'app'].join('/') + ' y ' + ['', 'c', 'Users', 'al', '.dsh'].join('/');
ok('能识别真实主目录路径', findPaths(SAMPLE).length === 2, String(findPaths(SAMPLE).length));
ok('占位符不算泄漏', findPaths('C:/Users/<user>/x 与 /home/<user>').length === 0);
let repoScan = { hits: -1 };
try { const out = execFileSync(process.execPath, [join(here, 'sanitize-docs.mjs')], { encoding: 'utf8' }); repoScan = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); }
catch (e) { const s = String((e.stdout || '') + (e.stderr || '')); try { repoScan = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); } catch { repoScan = { hits: -1 }; } }
ok('全仓库（docs/tools/plugins/tests/skills）无本机路径', repoScan.hits === 0, String(repoScan.hits));

console.log(fail ? 'PRIVACY_FAILED ' + fail : 'PRIVACY_OK');
process.exitCode = fail ? 1 : 0;