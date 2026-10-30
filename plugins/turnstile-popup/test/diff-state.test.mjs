// Diff state: dimensions must not overlap, every value must be non-zero, and unknown is explicit.
import assert from 'node:assert';
import { CHANGE, KIND, SIDE, CONFIDENCE, DIMENSIONS, codeOf, is, isKnown, hasChange, describe } from '../lib/diff-state.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

test('dimension masks never overlap', () => {
  for (let i = 0; i < DIMENSIONS.length; i++) {
    for (let j = i + 1; j < DIMENSIONS.length; j++) {
      assert.strictEqual(DIMENSIONS[i].MASK & DIMENSIONS[j].MASK, 0, 'masks overlap');
    }
  }
});

test('every value is inside its own mask and non-zero', () => {
  for (const dim of DIMENSIONS) {
    for (const [key, value] of Object.entries(dim)) {
      if (key === 'MASK') continue;
      assert.ok(value > 0, key + ' must be non-zero');
      assert.strictEqual(value & ~dim.MASK, 0, key + ' escapes its mask');
    }
  }
});

test('a composed code answers each dimension independently', () => {
  const code = codeOf({ change: CHANGE.ADDED, kind: KIND.ROW, side: SIDE.RIGHT, confidence: CONFIDENCE.EXACT });
  assert.ok(is(code, CHANGE, CHANGE.ADDED));
  assert.ok(is(code, KIND, KIND.ROW));
  assert.ok(is(code, SIDE, SIDE.RIGHT));
  assert.ok(is(code, CONFIDENCE, CONFIDENCE.EXACT));
  assert.ok(!is(code, CHANGE, CHANGE.REMOVED));
});

test('an unset change reads as no change, not as a guess', () => {
  assert.strictEqual(hasChange(0), false);
  const code = codeOf({ kind: KIND.CONFIG });
  assert.strictEqual(hasChange(code), false);
});

test('foreign bits are reported as unknown instead of being interpreted', () => {
  const weird = 0x40000000;
  assert.strictEqual(isKnown(weird), false);
  assert.strictEqual(describe(weird), '无法识别的差异码');
});

test('describe names the change, the subject and the side', () => {
  const code = codeOf({ change: CHANGE.MODIFIED, kind: KIND.VALUE, side: SIDE.BOTH, confidence: CONFIDENCE.EXACT });
  assert.strictEqual(describe(code), '修改 · 值');
});

test('a quick compare says it was not confirmed line by line', () => {
  const quick = codeOf({ change: CHANGE.ADDED, kind: KIND.ROW, side: SIDE.LEFT, confidence: CONFIDENCE.UNKNOWN });
  assert.match(describe(quick), /未逐行确认/);
});

test('zero means not compared at all', () => {
  assert.strictEqual(describe(0), '未比较');
});

console.log('DIFFSTATE_TEST_OK ' + passed + ' checks');
