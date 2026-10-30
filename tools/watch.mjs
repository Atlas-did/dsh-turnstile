#!/usr/bin/env node
// Log-based runtime observation. NOT instrumentation: it reads what the host already printed
// and parses the crash report's service table so a vague "1 required plugin did not activate"
// becomes a named root cause.
// usage: node tools/watch.mjs <logFile> [--last N] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();

const argv = process.argv.slice(2);
const lastIdx = argv.indexOf('--last');
const lastN = lastIdx >= 0 ? Number(argv[lastIdx + 1]) || 12 : 12;
let file = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--last') { i++; continue; }
  if (!argv[i].startsWith('--')) { file = argv[i]; break; }
}
if (!file) { console.error('usage: node tools/watch.mjs <logFile> [--last N] [--json]'); process.exit(2); }
if (!existsSync(file)) { console.error('no such log: ' + file); process.exit(2); }

const RULES = [
  ['error', /fatal|uncaught|INVALID_REQUEST|failed to import|did not activate|(^|\s)Error:\s|\[cause\]: Error/i],
  ['skip', /engines\.dsh|will be skipped|not activated/i],
  ['provide', /\bprovide\b|\bctx\.[a-zA-Z]+\s*=/],
  ['tool', /CallToolRequest|ListToolsRequest|tools?\/execute|tool call/i],
  ['llm', /model listing|\bllm\b|stream|tokens?\b/i],
  ['load', /activat|loaded|applying|bundle|plugin/i],
];

function classify(line) {
  for (const rule of RULES) if (rule[1].test(line)) return rule[0];
  return 'other';
}

function parseWaiting(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let inTable = false;
  for (const line of lines) {
    if (/Plugins waiting for services/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^\s*Plugin\s+Missing services/.test(line)) continue;
    const m = line.match(/^\s{2,}(\S+)(?:\s+\(required\))?\s{2,}(.+)$/);
    if (m) { out.push({ plugin: m[1], missing: m[2].trim() }); continue; }
    if (!/^\s/.test(line)) inTable = false;
  }
  return out;
}

const text = readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/).filter(Boolean);
const counts = {};
const events = [];
for (const line of lines) {
  const kind = classify(line);
  counts[kind] = (counts[kind] || 0) + 1;
  if (kind !== 'other') events.push({ kind, line: line.slice(0, 200) });
}
// The same table can appear twice (child error + host diagnostic). Dedupe, then separate the
// root cause (a service nobody in the list provides) from the cascade waiting on it.
const waitingSeen = new Set();
const waiting = parseWaiting(text).filter((w) => {
  const k = w.plugin + '->' + w.missing;
  if (waitingSeen.has(k)) return false;
  waitingSeen.add(k);
  return true;
});
const provided = new Set(waiting.map((w) => w.plugin));
const roots = [];
for (const w of waiting) {
  for (const svc of w.missing.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!provided.has(svc)) roots.push({ plugin: w.plugin, service: svc });
  }
}
const errors = events.filter((e) => e.kind === 'error').slice(-lastN);

if (wantsJson()) {
  const findings = roots.map((r) => ({
    severity: 'error', plugin: r.plugin, resource: r.service,
    message: 'root cause: this plugin needs a service nothing provides',
    evidence: { file }, fix: { kind: 'service-name', snippet: 'the service was renamed or removed; update the inject list' },
  })).concat(waiting.map((w) => ({
    severity: 'error', plugin: w.plugin, resource: w.missing,
    message: 'waiting for a service nobody provides: ' + w.missing,
    evidence: { file }, fix: { kind: 'service-name', snippet: 'update the inject list; the service was renamed or removed' },
  }))).concat(errors.map((e) => ({ severity: 'error', plugin: '-', resource: file, message: e.line.slice(0, 120), evidence: { file } })));
  emitJson('watch', findings, findings.length ? 1 : 0);
  process.exit(findings.length ? 1 : 0);
}

console.log('log: ' + file + '  lines: ' + lines.length);
console.log('classes: ' + Object.entries(counts).map((kv) => kv[0] + '=' + kv[1]).join('  '));
if (waiting.length) {
  console.log('');
  if (roots.length) {
    console.log('ROOT CAUSE:');
    for (const r of roots) console.log('  ' + r.plugin + ' needs "' + r.service + '" - nothing in this profile provides it');
    console.log('');
  }
  console.log('ATTRIBUTION - plugins waiting for services:');
  for (const w of waiting) console.log('  ' + String(w.plugin).padEnd(24) + '-> ' + w.missing);
}
console.log('');
console.log('last ' + Math.min(events.length, lastN) + ' notable actions:');
for (const e of events.slice(-lastN)) console.log('  [' + e.kind.padEnd(7) + '] ' + e.line);
if (errors.length) {
  console.log('');
  console.log('CRASH CONTEXT - last ' + errors.length + ' error line(s):');
  for (const e of errors) console.log('  ! ' + e.line);
}
process.exit(errors.length || waiting.length ? 1 : 0);
