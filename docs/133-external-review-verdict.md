# 外部调研的四份文档：哪些对、哪些不对（2026-11-01 复核）

> 复核方式：逐条在本仓库 HEAD 上跑命令验证，不看文档自述。

## 结论：**大部分对，而且指出了我一直在回避的真问题**

## 一、核实为真的（已开始修）

| 文档声称 | 复核结果 | 证据 |
|---|---|---|
| README 提到不存在的 `quicktest.mjs` | **真** | `ls tools/quicktest.mjs` → MISSING；而 README/我新写的 README 都列了它 |
| INSTALL 写 Node 20+，package.json 要 ^22.19 | **真** | `INSTALL.md:9` vs `package.json:75` |
| 仓库根有调试残留 `_m.mjs/_rw.mjs/_shot3.mjs`（硬编码作者路径） | **真** | 三个文件都在，且已被 git 跟踪 |
| `test-arch-graph.mjs` 硬编码作者机器路径 | **真** | 原来写死 `C:/Users/finef/.../profiles/mini` |
| `sandbox-trial.mjs` 用相对 `join('tools', script)` | **真** | 不在仓库根跑就挂（已在 /tmp 复现） |
| `mini-ctl.mjs` 硬编码 `~/Desktop/mini-harness` 与 `oss/dsh-turnstile` 布局 | **真** | 新用户 `status` 必 exit 2 |
| `console-server.mjs` 返回编造数据（`records:42`、假 profile 名） | **真** | 就是无标注假数据，违背本项目自己的纪律 |
| 两个 promote 并存 | **真** | `tools/promote.mjs` 与 `tools/sandbox-promote.mjs` |
| `toggleLegacy` 零调用 | **真** | 全仓库只有定义处 1 次命中 |
| 没有单一入口，75 个平铺脚本 | **真** | `ls tools/*.mjs | wc -l` = 108 |
| semver 判断两份（registry 手写 vs version 调宿主） | **真** | 两文件都在 |
| 无 `.sh` 启动器，`mini-ctl stop` 只走 PowerShell | **真** | `ls tools/*.sh` 为空 |

## 二、说得不对或已过时的

| 文档声称 | 复核结果 |
|---|---|
| **「插件测试当前是红的（health.test.mjs）」** | **不对（或已过时）**：现在 `HEALTH_TEST_OK 7 checks`。他们克隆的是 v0.1.0 的某个时点 |
| 「113 个 CLI 脚本」 | 数字偏大：`tools/*.mjs` 实际 **108** 个，其中还有 test/e2e 脚本，正式 CLI 更少 |
| 「130 篇 docs」 | 实际 **108** 篇 |
| 「README 中英两套快速开始脱节」 | 现在 README 已重写为中文、英文保留为 README.en.md，两者定位不同但仍需一次同步 |

## 三、这一轮已经动手修的

1. 删掉三个调试残留。
2. `sandbox-trial.mjs` 改成基于文件位置解析 `tools/`（在 /tmp 验证过）。
3. `mini-ctl.mjs` 不再假定目录布局：`--mini` / `MINI_HOME` / 常见路径探测，仓库位置优先用本文件所在仓库。
4. `test-arch-graph.mjs` 用夹具 profile（`ARCHGRAPH_PROFILE` 可覆盖），不再写死作者路径。
5. `console-server` 的 `/turnstile/diagnose` 与 `/turnstile/profiles` **改成真跑**（spawn diagnose / 真扫 profiles 目录）；假数据挪进 `fixture:true` 分支，只有 e2e 显式开启。
6. README 去掉不存在的 `quicktest`，换成 `selftest`；INSTALL 的 Node 版本对齐 package.json。

## 四、还没做（下一步，按风险排）

| # | 项 | 为什么值得做 |
|---|---|---|
| 1 | 单一入口 `tools/turnstile.mjs`（子命令 + 旧 bin 转发） | 108 个脚本没有指路牌，新人第一步就迷路 |
| 2 | UI 面扫描四处重复 → 抽 `lib/ui-scan.mjs` + 漂移测试 | 四处口径不一致会导致「同一个面两个工具数出不同插件数」 |
| 3 | semver 统一到宿主判定器 | 两套判断可能给出相反结论 |
| 4 | `tools/checker.mjs`（docs/38 report-v2 落地） | 面板每次刷新 spawn 12 次进程 |

## 五、一个容易忽略的点

他们提的「**假数据没标注就是污染证据链**」是这份调研里最有价值的一句：
本项目的全部价值建立在「结论可复现」上，一条编造的数字就能毁掉信任。
这一轮把假数据**关进 fixture 分支**，就是为了让它再也不能无声地出现在真实路径里。
