# 单一入口 + UI 扫描收敛（2026-11-01）

## 1. `tools/turnstile.mjs`：一张会指路的子命令树

```bash
node tools/turnstile.mjs help
node tools/turnstile.mjs inspect <profile> <pkg>
node tools/turnstile.mjs gate <profile>
node tools/turnstile.mjs check risk|conflict|engines|port|css|file|shortcut <profile>
node tools/turnstile.mjs snapshot take|diff|list <profile>
node tools/turnstile.mjs lab status|url|start|stop
```

**设计**：这里不实现任何能力，只做转发；子命令 → 脚本是显式表格；能力仍在各自 .mjs 里，可单独 `node` 跑。

**旧行为兼容**：裸 profile 路径或 `--only` 直接当 gate 的参数：

```
$ node tools/turnstile.mjs tests/console-fixture --only risk
  PASS    dependency-risk      135ms  no findings
RESULT: clear to install
```

**测试 9 条**：help 分组、未知子命令 exit 2 且给下一步、inspect/check/snapshot 转发、裸路径兼容。

## 2. UI 面扫描收敛到一份实现

新增 `tools/lib/ui-scan.mjs`，`ui-surfaces.mjs` 已改成用它；口径与原实现逐字对齐：

```
lib 与 CLI 对 ui-settings 的计数一致   2 vs 2   →  PASS
```

真实 profile（mini）对比：库与 CLI 都给出 `ui-conversation 8 / ui-settings 7 / ui-renderer 4 / ui-slots 3`。

两个口径用一个开关区分：

| 调用 | 面 | 用途 |
|---|---|---|
| `scanUi(dir)` | 所有 inject 面 | occupancy / 架构图 |
| `scanUi(dir, { onlyUiSurfaces: true })` | 只 `ui-*`（含 patch 里的 `ui-` 行） | ui-surfaces 的旧口径 |

**测试 6 条**：插件数、inject 面、两种口径各一条、与 CLI 计数一致、非 profile 明确拒绝。

## 3. 还没做完的（这一步只做了一半）

| 项 | 状态 |
|---|---|
| `occupancy.mjs` 改用 lib | **未做**（下一轮） |
| `doctor.mjs` / `gate-map.mjs` 改用 lib | **未做** |
| semver 统一到宿主判定器（registry vs version） | **未做** |
| 旧 bin 转发（package.json 里那三个 bin） | 未改，保持原样 |

**为什么停在这**：ui-surfaces 是四处里唯一有 JSON 输出、可被测试直接比对的；先把它切成 lib 并锁住，
再改 occupancy/doctor 才有参照。一次全改会同时动四个输出格式，出了问题定位不了。
