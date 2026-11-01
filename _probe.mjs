import { execFileSync } from 'node:child_process';
const out = execFileSync(process.execPath, ['tools/console-server.mjs', '--profile', 'C:/Users/finef/Desktop/mini-harness/home/profiles/mini', '--port', '7103'], { encoding: 'utf8', timeout: 2000 }).toString();
console.log(out.slice(0, 80));