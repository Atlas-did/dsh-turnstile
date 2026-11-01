# 文档命令冒烟测试（2026-11-01）

链接存在不代表命令能用。这轮把文档里写的 `node tools/...` **真跑一遍**（只跑只读的）。

## `tools/test-docs-smoke.mjs`

1. 从 `README.md`、`docs/README.md` 以及索引里链到的文档中抓 `node tools/xxx.mjs ...`
2. 只放行只读子命令白名单（`help/inspect/surfaces/doctor/slot-report/check-*/recommend/card/trial-status`）
3. 占位符能映射到夹具就替换：`<profile>`/`<profileDir>` → `tests/console-fixture`，`<pkg>`/`<plugin>` → `plug-alpha`
4. 映射不了的整条**跳过**并记录原因（不假装跑过）
5. 含 `--apply/--yes/--keep/--token/--mini/preinstall/manage/snapshot/start/stop` 的一律不跑

判定：出现 `usage:` 或 `ENOENT` 才算文档过期；检查类工具以 1 退出（有发现）或 3 退出（unknown）都算正常。

## 实测

```
ok   文档命令能跑（无 usage/ENOENT）
ok   至少真的跑了 5 条   8
{ "found": 44, "ran": 8, "skipped": 16 }
DOCS_SMOKE_OK
```

**发现 3 处假阳性后被修掉**：`<exportedPluginDir>`、`<profile> <pkg>`、`report.mjs <profileDir>` 这些带占位符的命令本来会被当成「跑失败」——
实际是**没法自动跑**。现在明确区分「跳过（占位符）」与「失败（真报错）」。

## 测试

```
test:all  40 步 exit 0
```

## 仍未做

- 只覆盖索引里链到的文档（历史文档不跑）；
- 写操作类文档命令（含 `--apply`）永远不自动跑，只能人工；
- 教程里的**预期输出**还没断言（现在只保证不报 usage/ENOENT）。
