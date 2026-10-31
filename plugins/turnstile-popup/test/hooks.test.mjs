// Hooks: before may refuse and must say why; after observes and never blocks.
import assert from 'node:assert';
import { EVENTS, createHooks, on, runBefore, runAfter } from '../lib/hooks.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

test('an event without handlers allows the action', () => {
  const h = createHooks();
  assert.deepStrictEqual(runBefore(h, 'beforeEnqueue', { a: 1 }).allowed, true);
});

test('a refusal carries its reason and stops the chain', () => {
  const h = createHooks();
  let secondRan = false;
  on(h, 'beforeEnqueue', () => '队列已满');
  on(h, 'beforeEnqueue', () => { secondRan = true; return true; });
  const out = runBefore(h, 'beforeEnqueue', {});
  assert.strictEqual(out.allowed, false);
  assert.strictEqual(out.reason, '队列已满');
  assert.strictEqual(secondRan, false, 'later hooks must not run after a refusal');
});

test('a bare false still produces a reason', () => {
  const h = createHooks();
  on(h, 'beforeApply', () => false);
  const out = runBefore(h, 'beforeApply', {});
  assert.strictEqual(out.allowed, false);
  assert.match(out.reason, /未给出原因/);
});

test('a throwing before-hook fails closed and quotes the error', () => {
  const h = createHooks();
  on(h, 'beforeApply', () => { throw new Error('boom'); });
  const out = runBefore(h, 'beforeApply', {});
  assert.strictEqual(out.allowed, false);
  assert.match(out.reason, /boom/);
});

test('a hook may rewrite the payload for later hooks', () => {
  const h = createHooks();
  on(h, 'beforeEnqueue', (p) => ({ payload: Object.assign({}, p, { capped: true }) }));
  const out = runBefore(h, 'beforeEnqueue', { n: 1 });
  assert.strictEqual(out.allowed, true);
  assert.strictEqual(out.payload.capped, true);
});

test('after hooks never block and their errors are collected', () => {
  const h = createHooks();
  on(h, 'afterApply', () => { throw new Error('observer broke'); });
  on(h, 'afterApply', () => 'seen');
  const out = runAfter(h, 'afterApply', {});
  assert.deepStrictEqual(out.results, ['seen'], 'a throwing observer must not mask the next one');
  assert.strictEqual(out.errors.length, 1);
});

test('unsubscribe stops a handler', () => {
  const h = createHooks();
  const off = on(h, 'beforeJump', () => '不许跳');
  assert.strictEqual(runBefore(h, 'beforeJump', {}).allowed, false);
  off();
  assert.strictEqual(runBefore(h, 'beforeJump', {}).allowed, true);
});

test('a misspelled event is refused at registration', () => {
  const h = createHooks();
  assert.throws(() => on(h, 'beforeEnque', () => true), /unknown hook event/);
  assert.ok(EVENTS.includes('beforeEnqueue'));
});

console.log('HOOKS_TEST_OK ' + passed + ' checks');
