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

const ALLOWED = new Set(['a','h1','h2','h3','h4','h5','h6','p','ol','ul','li','div','input','video','label','Img','Slot','Text',
  'TinyForm','TinyFormItem','TinyButton','TinyInput','TinyRadio','TinyRadioGroup','TinySelect','TinySwitch','TinyNumeric',
  'TinyCheckbox','TinyCheckboxButton','TinyCheckboxGroup','TinyDatePicker','TinyGrid','TinyCard','TinyPager',
  'TinyHuichartsLine','TinyHuichartsHistogram','TinyHuichartsBar','TinyHuichartsRadar','TinyHuichartsRing','TinyHuichartsPie',
  'TinyHuichartsFunnel','TinyHuichartsScatter','TinyHuichartsWaterfall','TinyHuichartsGauge','TinyHuichartsGraph','TinyHuichartsProcess']);

export function validateCard(card) {
  const problems = [];
  if (!card || card.componentName !== 'Page') problems.push('根节点必须是 Page');
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, path + '[' + i + ']')); return; }
    if (node.componentName && !ALLOWED.has(node.componentName)) problems.push(path + ' 组件不在白名单：' + node.componentName);
    const props = node.props || {};
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' && /(^|;)\s*(background|background-color|color)\s*:/.test(v)) problems.push(path + ' 属性 ' + k + ' 含颜色样式');
    }
    if (node.componentName === 'TinyGrid') {
      const d = props.data;
      if (!Array.isArray(d)) problems.push(path + ' TinyGrid 缺少 data 数组');
      else {
        const ids = new Set();
        for (const row of d) {
          if (row && row._RID != null) { if (ids.has(row._RID)) problems.push(path + ' TinyGrid _RID 重复：' + row._RID); ids.add(row._RID); }
        }
      }
      if (!Array.isArray(props.columns)) problems.push(path + ' TinyGrid 缺少 columns 数组');
    }
    if (node.children && typeof node.children !== 'string' && !Array.isArray(node.children)) problems.push(path + ' children 必须是数组或字符串');
    walk(node.children, path + ' > ' + (node.componentName || '?'));
  };
  walk(card.children, 'children');
  return problems;
}

const card = {
  componentName: 'Page',
  state: { view: kind },
  methods: {},
  children: [
    {
      componentName: 'TinyCard',
      children: [
        // 只用排版属性，不写任何 color/background —— schemaJson 的硬规则（写了会渲染异常）
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
          props: { text: '来源：' + (from || '(未给文件)') + ' · 由 dsh-turnstile 生成', style: 'font-size:12px;display:block;margin-top:8px' },
        } : { componentName: 'Text', props: { text: '没有数据：用 --from 指定报告文件。', style: 'display:block' } },
      ],
    },
  ],
};


if (argv.includes('--validate')) {
  const problems = validateCard(card);
  if (problems.length) { console.error('卡片不合规：'); for (const p of problems) console.error('  - ' + p); process.exit(1); }
  console.error('卡片合规（根 Page / 无颜色 / 组件白名单 / TinyGrid 完整）');
}
console.log('```schemaJson');
console.log(JSON.stringify(card));
console.log('```');
// 硬规则自检：这些是 schemaJson 的硬约束，写错会渲染异常（[显示异常]）。
// 规则来自渲染端约定：根必须是 Page；禁止任何颜色；节点必须在白名单内；TinyGrid 行需要唯一 _RID。
