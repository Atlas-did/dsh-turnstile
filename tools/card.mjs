#!/usr/bin/env node
// 把本项目的结论变成 dsh-genui 能渲染的卡片（schemaJson 代码块）。
//
// usage:
//   node tools/card.mjs --kind health [--from state/report-<profile>.json]
//   node tools/card.mjs --kind findings --from <preflight report>
//   node tools/card.mjs --kind slots --from <slot-map.json>
//
// 输出只做一件事：打印一个 ```schemaJson 代码块。贴进对话，genui 就会渲染成可点卡片。
// 没装 genui 也能用（就是一段 JSON），但价值在渲染。
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const kind = val('--kind') || 'health';
const from = val('--from');

function readJson(p) {
  if (!p) return null;
  if (!existsSync(p)) { console.error('找不到文件：' + p); process.exit(3); }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const data = readJson(from);

// 统一成「标题 + 若干行状态 + 一个建议动作」，卡片只做这三件事。
function rowsFor() {
  if (kind === 'health' && data) {
    const checks = (data.checks || data.findings || []);
    return checks.slice(0, 12).map((c) => ({
      name: String(c.checker || c.id || c.name || 'check'),
      state: c.ok === false || c.status === 'fail' ? 'fail' : c.ok === true || c.status === 'pass' ? 'pass' : 'warn',
      detail: String(c.message || c.summary || c.detail || '').slice(0, 120),
    }));
  }
  if (kind === 'slots' && data) {
    return (data.slots || []).slice(0, 12).map((s) => ({
      name: String(s.slot),
      state: (s.count || 0) >= 10 ? 'warn' : 'pass',
      detail: (s.count || 0) + ' 条：' + (s.entries || []).slice(0, 3).join(', '),
    }));
  }
  return [];
}

const rows = rowsFor();
const failed = rows.filter((r) => r.state === 'fail').length;
const warned = rows.filter((r) => r.state === 'warn').length;
const title = kind === 'slots' ? 'UI 位置占用' : '插件体检'
  + (failed ? '：' + failed + ' 项失败' : warned ? '：' + warned + ' 项需注意' : '：通过');

const card = {
  componentName: 'Page',
  state: { view: kind },
  methods: {},
  children: [
    {
      componentName: 'TinyCard',
      children: [
        { componentName: 'Text', props: { text: title, style: 'font-size:15px;font-weight:600;display:block;margin-bottom:10px' } },
        {
          componentName: 'TinyGrid',
          props: {
            columns: [
              { field: 'name', title: '检查项', width: 200 },
              { field: 'state', title: '状态', width: 90 },
              { field: 'detail', title: '说明' },
            ],
            data: rows.map((r, i) => Object.assign({ _RID: i + 1 }, r)),
          },
        },
        rows.length ? {
          componentName: 'Text',
          props: { text: '来源：' + (from || '(未给文件)') + ' · 由 dsh-turnstile 生成', style: 'color:#8a8f98;font-size:12px;display:block;margin-top:8px' },
        } : { componentName: 'Text', props: { text: '没有数据：用 --from 指定报告文件。', style: 'color:#8a8f98;display:block' } },
      ],
    },
  ],
};

console.log('```schemaJson');
console.log(JSON.stringify(card));
console.log('```');
