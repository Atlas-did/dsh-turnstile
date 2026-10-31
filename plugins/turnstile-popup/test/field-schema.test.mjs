// Field schema: declared once, rendered and validated from the same declaration.
import assert from 'node:assert';
import { field, visibleFields, coerce, validateValues, applyEdit, groupFields, controlSpec } from '../lib/field-schema.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const anchor = field({ key: 'anchor', label: '位置', group: '布局', defaultValue: '',
  validate: (v) => (v && !['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(v) ? '位置必须是四角之一' : true) });
const disabled = field({ key: 'disabled', label: '停用', type: 'boolean', group: '状态' });
const reason = field({ key: 'reason', label: '原因', group: '状态', when: (v) => v.disabled });
const fields = [disabled, anchor, reason];

test('a hidden field is not returned for rendering', () => {
  assert.deepStrictEqual(visibleFields(fields, { disabled: false }).map((f) => f.key), ['disabled', 'anchor']);
  assert.deepStrictEqual(visibleFields(fields, { disabled: true }).map((f) => f.key), ['disabled', 'anchor', 'reason']);
});

test('a hidden field cannot produce an error', () => {
  const hidden = field({ key: 'reason', label: '原因', when: (v) => v.disabled, validate: () => '必须填写' });
  assert.deepStrictEqual(validateValues([hidden], { disabled: false }), []);
  assert.deepStrictEqual(validateValues([hidden], { disabled: true }), [{ key: 'reason', message: '必须填写' }]);
});

test('boolean and number coercion are explicit', () => {
  assert.strictEqual(coerce(disabled, 'true'), true);
  assert.strictEqual(coerce(disabled, undefined), false);
  const num = field({ key: 'n', type: 'number', defaultValue: 3 });
  assert.strictEqual(coerce(num, '7'), 7);
  assert.strictEqual(coerce(num, 'abc'), 3);
});

test('errors name the field that failed', () => {
  const errs = validateValues(fields, { disabled: false, anchor: 'middle' });
  assert.deepStrictEqual(errs, [{ key: 'anchor', message: '位置必须是四角之一' }]);
});

test('a valid edit leaves no errors; an invalid one keeps values', () => {
  const ok = applyEdit(fields, { disabled: false, anchor: 'top-left' }, 'anchor', 'bottom-right');
  assert.deepStrictEqual(ok.errors, []);
  assert.strictEqual(ok.values.anchor, 'bottom-right');
  const bad = applyEdit(fields, { disabled: false, anchor: 'top-left' }, 'anchor', 'center');
  assert.strictEqual(bad.values.anchor, 'center');
  assert.strictEqual(bad.errors.length, 1);
});

test('an unknown key does not create a field or an error', () => {
  const out = applyEdit(fields, { disabled: false }, 'nope', 'x');
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual('nope' in out.values, false);
});

test('grouping preserves declaration order', () => {
  const g = groupFields(fields, { disabled: true });
  assert.deepStrictEqual(g.map((x) => x.group), ['状态', '布局']);
  assert.deepStrictEqual(g[0].fields.map((f) => f.key), ['disabled', 'reason']);
});

test('the declaration decides which control renders', () => {
  assert.deepStrictEqual(controlSpec(disabled, true), { kind: 'checkbox', value: true, options: null });
  assert.deepStrictEqual(controlSpec(anchor, 'top-left'), { kind: 'text', value: 'top-left', options: null });
  const pick = field({ key: 'anchor', type: 'select', options: [{ value: 'a' }] });
  assert.strictEqual(controlSpec(pick, 'a').kind, 'select');
  assert.strictEqual(controlSpec(pick, 'a').options.length, 1);
});

test('a missing value falls back to the declared default', () => {
  const num = field({ key: 'n', type: 'number', defaultValue: 5 });
  assert.deepStrictEqual(controlSpec(num, undefined), { kind: 'number', value: '5', options: null });
});

console.log('FIELDSCHEMA_TEST_OK ' + passed + ' checks');
