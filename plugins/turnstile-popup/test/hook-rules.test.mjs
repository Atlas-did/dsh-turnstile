// Hook rules: refused kinds are rejected at load, refusals always carry a reason.
import assert from 'node:assert';
import { KINDS, DEFAULT_RULES, validateRules, evaluateRule, evaluateRules } from '../lib/hook-rules.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const op = { type: 'toggle', package: 'a', disable: true };

test('the defaults are themselves valid', () => {
  const v = validateRules(DEFAULT_RULES);
  assert.strictEqual(v.rejected.length, 0);
  assert.strictEqual(v.rules.length, 2);
});

test('an unknown kind is rejected with a reason, not ignored', () => {
  const v = validateRules([{ id: 'x', kind: 'no-such-thing' }]);
  assert.strictEqual(v.rules.length, 0);
  assert.match(v.rejected[0].why, /未知规则类型/);
});

test('a queue-limit rule refuses at the cap and quotes the number', () => {
  const rule = { kind: 'queue-limit', max: 2 };
  assert.strictEqual(evaluateRule(rule, op, { queue: [op, op] }).allowed, false);
  assert.match(evaluateRule(rule, op, { queue: [op, op] }).reason, /2/);
  assert.strictEqual(evaluateRule(rule, op, { queue: [op] }).allowed, true);
});

test('no-duplicate matches only a真正 identical operation', () => {
  const rule = { kind: 'no-duplicate' };
  assert.strictEqual(evaluateRule(rule, op, { queue: [Object.assign({}, op)] }).allowed, false);
  assert.strictEqual(evaluateRule(rule, op, { queue: [Object.assign({}, op, { disable: false })] }).allowed, true);
  assert.strictEqual(evaluateRule(rule, { type: 'anchor', package: 'a', anchor: 'top-left' }, { queue: [{ type: 'anchor', package: 'a', anchor: 'top-right' }] }).allowed, true);
});

test('require-field refuses an empty value and names the field', () => {
  const rule = { kind: 'require-field', field: 'anchor' };
  const bad = evaluateRule(rule, { type: 'anchor', package: 'a', anchor: '  ' }, {});
  assert.strictEqual(bad.allowed, false);
  assert.match(bad.reason, /anchor/);
  assert.strictEqual(evaluateRule(rule, { type: 'anchor', package: 'a', anchor: 'top-left' }, {}).allowed, true);
});

test('the first refusal wins', () => {
  const rules = [{ kind: 'require-field', field: 'anchor' }, { kind: 'queue-limit', max: 1 }];
  const out = evaluateRules(rules, { type: 'anchor', package: 'a' }, { queue: [op] });
  assert.strictEqual(out.allowed, false);
  assert.match(out.reason, /anchor/);
});

test('no rules means allowed', () => {
  assert.deepStrictEqual(evaluateRules([], op, {}), { allowed: true, reason: '' });
});

console.log('HOOKRULES_TEST_OK ' + passed + ' checks');
