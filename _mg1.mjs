import { readFileSync, writeFileSync } from 'node:fs';
const p = 'package.json';
let t = readFileSync(p, 'utf8');
const m = t.match(/<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> kimi\/main\n/);
if (!m) { console.log('no conflict block'); process.exit(1); }
const toObj = (frag) => JSON.parse('{' + frag.trim().replace(/,\s*$/, '') + '}');
const a = toObj(m[1]);
const b = toObj(m[2]);
const la = a['test:all'].split(' && ');
const lb = b['test:all'].split(' && ');
const merged = [...new Set([...la, ...lb])].join(' && ');
t = t.replace(m[0], '    "test:all": ' + JSON.stringify(merged) + '\n');
writeFileSync(p, t);
const j = JSON.parse(readFileSync(p, 'utf8'));
console.log('suites', j.scripts['test:all'].split(' && ').length);