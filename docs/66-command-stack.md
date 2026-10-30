# Command stack: what wxFormBuilder does, and why we kept snapshots

Sixth mechanism read. Source: `src/rad/cmdproc.cpp` (2.6 KB) and `src/rad/cmdproc.h`, fetched from
the repository tree (GPL-2.0/GPL-3.0 - shapes only, no code copied).

## The whole implementation, in two classes

```cpp
void CommandProcessor::Execute(PCommand command) {
    command->Execute();
    m_undoStack.push(command);
    while (!m_redoStack.empty()) m_redoStack.pop();   // a new command drops the redo branch
}
void CommandProcessor::Undo() { PCommand c = m_undoStack.top(); m_undoStack.pop(); c->Restore(); m_redoStack.push(c); }
void CommandProcessor::Redo() { PCommand c = m_redoStack.top(); m_redoStack.pop(); c->Execute(); m_undoStack.push(c); }

void CommandProcessor::SetSavePoint() { m_savePoint = m_undoStack.size(); }
bool CommandProcessor::IsAtSavePoint() { return m_undoStack.size() == m_savePoint; }
```

and the guard on each command:

```cpp
void Command::Execute() { if (!m_executed) { DoExecute(); m_executed = true; } }
void Command::Restore() { if (m_executed) { DoRestore(); m_executed = false; } }
```

Three rules worth naming:

1. **idempotency by construction** - `m_executed` makes a repeated Execute a no-op;
2. **the save point is a position** (stack depth), not a boolean, so "unsaved" is derived;
3. **a new command clears the redo branch** - no dangling future states.

## What our code already does, and where

| Rule | Where it lives for us |
|---|---|
| idempotency of a write | `lib/txn.js`: single-use `confirm` token + precondition sha256. A second apply of the same plan is refused because the file hash moved - stronger than a boolean guard |
| save point | the designer's signature: `dirty()` compares the current operation list against a saved signature, and `保存草稿` records a new one |
| redo cleared on new command | the designer's `mutate()` pushes to `past` and drops `future` |

## Why the designer was **not** refactored to command objects

Its history is snapshot-based (`past` / `future` arrays of copied operation lists) with a hard cap of
100 operations. For that size a copy is cheaper than wrapping every mutation in a command class, and
the observable behaviour is the same for the two rules that matter (redo branch, save point).

Rewriting it would touch the code path covered by 30 designer checks, for no user-visible gain. That
is a decision, not an oversight.

## What was attempted and reverted in this round

I tried to add two UI assertions for the stack rules ("undo enables redo", "a new command clears the
redo branch"). Inserting them mid-suite broke two existing ordering-sensitive checks (`undo removes
the command`, `command reorder changes generated execution order`), and relocating them to the end did
not restore them. Rather than leave a suite that is red or selectively weakened, the test file was
reverted and the designer suite is back to **30/30**.

Recorded so the next attempt starts from `cmdproc.cpp`'s three rules and a *fresh fixture* rather than
from a half-edited sequence.

## Regression

```
console e2e   60/60
panel e2e     29/29
designer e2e  30/30
selftest      67 passed / 6 skipped
package tests 8 + 5 + 7 + 7 + 7 + 8 + 7 + 8 = 57 checks
```
