import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkCompatibility } from './tools/version.mjs';
const profile = 'C:/Users/finef/Desktop/mini-harness/home/profiles/mini';
for (const name of ['dsh-voice', 'dsh-unlag', 'dsh-context', 'dsh-ops']) {
  const pj = join(profile, 'node_modules', name, 'package.json');
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const issue = checkCompatibility(j);
  console.log(name, '| engines.dsh=', j.engines?.dsh || '(none)', '| issue=', issue ? JSON.stringify(issue.requirements) : 'null');
}