#!/usr/bin/env node
// Log format statistics BEFORE any classification rule.
//
// Lesson from 2026-10-31: I wrote a parser for {"event","level"} while the real lines are
// [{"source":..., "record":{"level":...,"name":...,"message":...}}] - so the rules read nothing.
// This tool prints what is actually there, so the rules can be written against it.
//
// usage: node tools/log-format.mjs <file|dir> [--top 5] [--json]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const topN = Number((argv.indexOf('--top') >= 0 ? argv[argv.indexOf('--top') + 1] : 0)) || 5;
if (!target) { console.error('usage: node tools/log-format.mjs <file|dir>'); process.exit(2); }
if (!existsSync(target)) { console.error('not found: ' + target); process.exit(2); }

const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e)); }
  else if (/\.jsonl?$/.test(p)) files.push(p);
};
walk(target);

const envelope = { array: 0, object: 0, unparsable: 0 };
const topKeys = {}; const levels = {}; const names = {}; const codes = {};
const errorStrings = {};
let records = 0;

const bump = (bag, key) => { if (key) bag[key] = (bag[key] || 0) + 1; };

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let parsed;
    try { parsed = JSON.parse(line); } catch { envelope.unparsable++; continue; }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (Array.isArray(parsed)) envelope.array++; else envelope.object++;
    for (const e of entries) {
      records++;
      for (const k of Object.keys(e || {})) bump(topKeys, k);
      const rec = (e && e.record) || e || {};
      for (const k of Object.keys(rec)) bump(topKeys, 'record.' + k);
      bump(levels, rec.level);
      bump(names, rec.name);
      bump(codes, rec.errorCode || rec.bridgeCode);
      const text = String(rec.message || '') + ' ' + String(rec.error || '') + ' ' + JSON.stringify(rec.exception || '');
      const m = /unknown variant `([a-z_]+)`/.exec(text);
      if (m) bump(errorStrings, 'unknown variant `' + m[1] + '`');
      for (const pat of ['PARSE_ERROR', 'ConnectError', 'ERR_STREAM_WRITE_AFTER_END', 'ingest request failed', 'sync interrupted']) {
        if (text.includes(pat)) bump(errorStrings, pat);
      }
    }
  }
}

const top = (bag) => Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, topN);
const out = { files: files.length, lines: files.length ? undefined : 0, records, envelope, topKeys, levels, names, codes, errorStrings };
if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

console.log('files        ' + files.length);
console.log('records      ' + records + '   (array-enveloped ' + envelope.array + ', plain ' + envelope.object + ', unparsable lines ' + envelope.unparsable + ')');
console.log('top-level keys: ' + top(topKeys).map(([k, v]) => k + '=' + v).join(' '));
console.log('levels       ' + top(levels).map(([k, v]) => k + '=' + v).join(' '));
console.log('names        ' + top(names).map(([k, v]) => k.slice(-28) + '=' + v).join(' '));
if (Object.keys(codes).length) console.log('errorCodes   ' + top(codes).map(([k, v]) => k + '=' + v).join(' '));
console.log('error strings: ' + (top(errorStrings).map(([k, v]) => k + '=' + v).join(' ') || '(none matched)'));
