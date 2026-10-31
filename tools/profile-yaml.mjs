#!/usr/bin/env node
// B6: 一个 profile 的 cordis.patch.yml / cordis.yml 自己解析不了，就是「无法启动」，
// 而 preflight 之前对它全票 PASS —— 正好落在工具自称的防护目标之外。
//
// 注意：必须用项目自己的 YAML schema（tools/config.mjs 的 loadYaml），
// 因为 harness 的配置里有 `!!js` 标签，裸 js-yaml 会把正常 profile 也判失败。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml } from './config.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/profile-yaml.mjs <profileDir> [--json]'); process.exit(2); }

const { yaml, schema } = loadYaml();
const files = ['cordis.patch.yml', 'cordis.yml'];
const findings = [];
for (const name of files) {
  const p = join(dir, name);
  if (!existsSync(p)) continue;
  try {
    yaml.load(readFileSync(p, 'utf8'), { schema });
  } catch (e) {
    findings.push({
      severity: 'error', file: name,
      message: 'YAML 无法解析：' + String(e.message || e).split('\n')[0],
      hint: '这个 profile 起不来；修好语法后再装任何插件',
    });
  }
}

const result = { ok: findings.length === 0, findings };
if (process.argv.includes('--json')) console.log(JSON.stringify(result));
else if (findings.length) for (const f of findings) console.log('FAIL ' + f.file + ': ' + f.message);
else console.log('ok   profile yaml parses');
process.exitCode = findings.length ? 1 : 0;
