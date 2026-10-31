# Batch write: one preview over many plugins

Completes the multi-select slice: the table's selection now produces queue entries in the designer, and
the existing preview/confirm path covers them together - no separate batch write path, so there is still
exactly one place that writes.

## What a user does

1. plugin list: click one row, Ctrl-click more (summary line shows `已选 N 个`)
2. designer → Common → `批量停用已选` or `批量启用已选`
3. one row per plugin lands in the command queue
4. the normal `生成并检查队列` → preview → confirm applies all of them

## Rules enforced

| Rule | Behaviour |
|---|---|
| a plugin with no config row | skipped, and the notice names it |
| queue cap of 100 | excess reported (`队列已满，N 条未加入`), not silently dropped |
| empty selection | `先在插件清单里多选若干插件（Ctrl / Shift）` |
| all selections row-less | `所选插件都没有可写配置行` |

## Verification

Designer e2e 30 -> **31/31**; the new check selects two rows with Ctrl, switches to the designer and
asserts the queue grew by two entries:

```
PASS  batch adds one queue entry per selected plugin   0->2
```

Full suite: console 62/62, panel 29/29, self-test 67 passed / 6 skipped, 13 package test groups.

## Not done

The preview currently shows the merged diff of the **whole queue**, which is correct for a batch but not
annotated per plugin; a per-entry grouping in the preview is the next improvement. Also not done:
applying a batch is not recorded as one transaction id - each entry goes through the same single plan,
which is one atomic write, but the journal records one operation rather than N labelled ones.
