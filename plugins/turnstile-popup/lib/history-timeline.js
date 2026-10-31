// History timeline: an ordered log of committed states, each with a time, a kind and a label.
//
// Replaces the bare past/future pair. Shape taken from Designable's operation history: a step is
// not just "the state before", it is a named event you can jump to. Two properties matter:
//
//   1. Jumping is not stepping. `past.pop()` can only go back one; a timeline can go anywhere.
//   2. Transient UI state (hover, selection, an in-progress drag) is NOT history. A timeline that
//      records hovers is a timeline nobody can read, and it hides the edits that matter.
//
// Pure data: no DOM, no globals read. The page supplies "now" so tests are deterministic.

export const STEP_KIND = Object.freeze({
  ADD: 'add',        // pushed a new command
  REMOVE: 'remove',  // deleted a command
  MOVE: 'move',      // reordered
  COPY: 'copy',      // duplicated
  EDIT: 'edit',      // changed a field in place
  RESET: 'reset',    // loaded a draft / cleared
});

/**
 * Transient states never enter the timeline. Kept as data so the rule is testable rather than
 * implied by where the code happens to call append().
 */
export const TRANSIENT = Object.freeze(['hover', 'select', 'drag', 'focus', 'scroll']);

/**
 * Create an empty timeline.
 * @param {{limit?:number}} [opts]
 */
export function createTimeline(opts) {
  const limit = Math.max(1, Number(opts && opts.limit) || 100);
  return { steps: [], cursor: -1, limit };
}

const snapshot = (state) => JSON.stringify(state);

/**
 * Append a committed state. Any "future" after the cursor is discarded - the same rule every
 * editor uses, because a branch you walked away from is no longer reachable by redo.
 *
 * @param {object} timeline
 * @param {{state:unknown, kind:string, label?:string, at?:number, transient?:string}} step
 * @returns {object} the same timeline, mutated
 */
export function append(timeline, step) {
  const s = step || {};
  // Transient UI events are ignored on purpose: recording them hides the real edits.
  if (s.transient && TRANSIENT.includes(s.transient)) return timeline;

  // A no-op edit is not a step. Otherwise dragging a slider back to where it started leaves a
  // history entry that does nothing, and every "undo" becomes a guessing game.
  if (!s.force && timeline.cursor >= 0 && snapshot(timeline.steps[timeline.cursor].state) === snapshot(s.state)) return timeline;

  timeline.steps = timeline.steps.slice(0, timeline.cursor + 1);
  timeline.steps.push({
    state: s.state === undefined ? null : s.state,
    kind: s.kind || STEP_KIND.EDIT,
    label: s.label || '',
    at: Number.isFinite(s.at) ? s.at : 0,
  });
  if (timeline.steps.length > timeline.limit) timeline.steps.shift();
  timeline.cursor = timeline.steps.length - 1;
  return timeline;
}

/** The state the timeline is currently pointing at, or undefined when empty. */
export function current(timeline) {
  if (!timeline || timeline.cursor < 0 || timeline.cursor >= timeline.steps.length) return undefined;
  return timeline.steps[timeline.cursor].state;
}

/** Move the cursor by delta. Returns true when the cursor actually moved. */
export function step(timeline, delta) {
  const next = timeline.cursor + (Number(delta) || 0);
  if (next < 0 || next >= timeline.steps.length || next === timeline.cursor) return false;
  timeline.cursor = next;
  return true;
}

/** Jump to an absolute index. Out-of-range jumps are refused rather than clamped. */
export function jumpTo(timeline, index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= timeline.steps.length) return false;
  if (i === timeline.cursor) return false;
  timeline.cursor = i;
  return true;
}

/** Whether an undo (back) / redo (forward) is possible right now. */
export function canUndo(timeline) { return Boolean(timeline && timeline.cursor > 0); }
export function canRedo(timeline) { return Boolean(timeline && timeline.cursor >= 0 && timeline.cursor < timeline.steps.length - 1); }

/** The rows a UI should render: index, kind, label and time for every step. */
export function rows(timeline) {
  if (!timeline) return [];
  return timeline.steps.map((s, i) => ({ index: i, kind: s.kind, label: s.label, at: s.at, current: i === timeline.cursor }));
}

/** Reset to a single baseline entry (a loaded draft or a cleared queue). */
export function reset(timeline, state, opts) {
  timeline.steps = [{ state: state === undefined ? null : state, kind: (opts && opts.kind) || STEP_KIND.RESET, label: (opts && opts.label) || '载入草稿', at: (opts && opts.at) || 0 }];
  timeline.cursor = 0;
  return timeline;
}

if (typeof window !== 'undefined') window.TurnstileHistory = { STEP_KIND, TRANSIENT, createTimeline, append, current, step, jumpTo, canUndo, canRedo, rows, reset };
