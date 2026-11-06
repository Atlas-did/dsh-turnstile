import assert from 'node:assert/strict';
import { TARGETS, checkTarget, runChecks } from '../lib/checks.js';

const fakeLookup = async () => [{ address: '2001:db8::1', family: 6 }, { address: '203.0.113.10', family: 4 }];
const fakeRequest = async (target, address) => ({ ok: target.id !== 'github-git', statusCode: target.id === 'github-git' ? 500 : 200, ms: 4, address: address.address });

assert.equal(TARGETS.length, 4);
assert.equal(TARGETS[0].url, 'https://github.com/Atlas-did/dsh-turnstile');
const one = await checkTarget(TARGETS[0], { lookup: fakeLookup, request: fakeRequest });
assert.deepEqual({ ok: one.ok, phase: one.phase, address: one.address }, { ok: true, phase: 'https', address: '203.0.113.10' });
const report = await runChecks({ targets: TARGETS, lookup: fakeLookup, request: fakeRequest });
assert.equal(report.schema, 'turnstile/netcheck@1');
assert.equal(report.direct, true);
assert.equal(report.ok, false);
assert.equal(report.results.find((x) => x.id === 'github-git').statusCode, 500);
const dnsFail = await checkTarget(TARGETS[0], { lookup: async () => { throw new Error('no DNS'); }, request: fakeRequest });
assert.deepEqual({ ok: dnsFail.ok, phase: dnsFail.phase }, { ok: false, phase: 'dns' });
const reachable401 = await checkTarget(TARGETS[0], { lookup: fakeLookup, request: async (_target, address) => ({ ok: true, statusCode: 401, ms: 2, address: address.address }) });
assert.equal(reachable401.ok, true);
assert.equal(reachable401.statusCode, 401);
console.log('NETCHECK_TEST_OK');
