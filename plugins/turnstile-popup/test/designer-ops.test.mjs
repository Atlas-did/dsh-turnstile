import assert from 'node:assert/strict';
import { applyDesignerOperations as applyHosted } from '../lib/designer-ops.js';
import { applyDesignerOperations as applyStandalone } from '../../../tools/designer-ops.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + ': ' + error.stack); process.exitCode = 1; }
}
const text = '- id: a-row\n  name: a\n';
const plugins = [{ name: 'a', row: 'a-row' }];

for (const [name, apply] of [['hosted', applyHosted], ['standalone', applyStandalone]]) {
  test(name + ' returns structured field errors for invalid anchors', () => {
    assert.throws(() => apply(text, [{ type: 'anchor', package: 'a', anchor: 'bad value' }], plugins), (error) => error.details?.[0]?.field === 'anchor' && error.details[0].code === 'invalid-anchor');
  });
  test(name + ' rejects string booleans instead of coercing them', () => {
    assert.throws(() => apply(text, [{ type: 'toggle', package: 'a', disable: 'false' }], plugins), (error) => error.details?.[0]?.code === 'invalid-boolean');
  });
  test(name + ' reports the exact missing package', () => {
    assert.throws(() => apply(text, [{ type: 'toggle', package: 'missing', disable: true }], plugins), (error) => error.details?.[0]?.package === 'missing' && error.details[0].code === 'package-missing');
  });
  test(name + ' rejects oversized batches before applying them', () => {
    const operations = Array.from({ length: 101 }, () => ({ type: 'toggle', package: 'a', disable: true }));
    assert.throws(() => apply(text, operations, plugins), (error) => error.details?.[0]?.code === 'too-many');
  });
  test(name + ' resolves row ids from the server snapshot', () => {
    const result = apply(text, [{ type: 'toggle', package: 'a', row: 'attacker', disable: true }], plugins);
    assert.equal(result.operations[0].row, 'a-row');
    assert.ok(result.after.includes('disabled: true'));
  });
}
test('hosted and standalone validation produce the same details', () => {
  const operations = [{ type: 'anchor', package: 'a', anchor: 'bad value' }];
  let a, b;
  try { applyHosted(text, operations, plugins); } catch (error) { a = error.details; }
  try { applyStandalone(text, operations, plugins); } catch (error) { b = error.details; }
  assert.deepEqual(a, b);
});
console.log('DESIGNEROPS_TEST_OK ' + passed + ' checks');
