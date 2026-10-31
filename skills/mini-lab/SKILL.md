---
name: mini-lab
description: "Mini 实验场：插件试验台与作者工作间。提到「mini 实验场 / 管理 mini / 插件试验 / 拖不动 / 谁占了哪个角」时进入。只对 mini 负责，先只看不改，写操作留备份。"
---

# Mini 实验场（技能入口）

这是一个**模式**，不是一组命令。进入后固定按下面的形状工作。

## 第零步：如果这台机器还没有沙盒（自建，需用户同意）

触发：用户说「帮我建一个试验环境 / 我没有 mini / 我想先在小环境试」。
**先问一句「建在哪个目录、用哪个端口」，得到确认再动手。** 永远不要建在主 profile 里。

```bash
# 1. 生成（一条命令产出 profile + 启动器 + 独立 state/logs）
node tools/new-sandbox.mjs --root <你选的目录> --profiles mini --port 18770 \
     --dsh-bin <DSH 的 lib/bin.js 路径>

# 2. 启动（Windows 双击 START-MINI.cmd，或直接跑）
DSH_HOME=<root>/home node <bin.js> mini --no-open --port 18770

# 3. 验证：日志里必须出现这一行，且带 token 的 URL 能打开
#    dsh web: http://127.0.0.1:18770/?token=...
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18770/    # 401 = 宿主活着（没 token 就该 401）
```

**已知必须满足的两点**（不满足会静默退出，日志为空）：

1. `package.json` 的 `dsh.profile.bundles` **不能为空**——至少 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`，
   否则宿主没有 web surface，直接退出（实测：空 bundles → 无输出 exit 0）。
2. `cordis.patch.yml` 用空层 `[]`，并且**任何工具追加前先解析**（往 `[]` 后面追加会写出非法 YAML，见 docs/105）。

建完立刻登记三件事：profile 名、端口、`DSH_HOME`。之后所有命令都用这三样，不碰默认 home。
## 三个对象（始终同时考虑）

| 对象 | 它关心什么 | 由此决定的动作 |
|---|---|---|
| **用户** | 装完还能不能干活 | 只给「判定 + 图 + 编号选项」，不让他读日志、不让他手改 YAML |
| **他电脑上的 DSH** | 结论对这个环境是否成立 | 任何结论必须落到真实 profile 上验证；静态推断不能当证据 |
| **插件作者** | 想改一点、试一下 | 同一个 mini 既能测也能写小实验插件（写—装—验—卸） |

默认工作区：你把本仓库克隆到哪里，就用那里（例如 `~/mini-harness`）；用户可在设置里改。

## 第一步：只看不改

```bash
node tools/preflight.mjs <mini profile> --no-record
node tools/occupancy.mjs <mini profile> --out state/occupancy-mini.json
```

输出必须是三块，不要贴原始日志：
1. **判定**：CLEAR 还是 BLOCKED，一句话原因；
2. **阻断项**：插件 + 哪个检查 + 证据（文件:行）+ 建议修法；
3. **位置占用**：哪些 UI 面被几个插件占，其中多少是硬编码（拖不动）。

## 第二步：给选项，等用户选

编号列出 1/2/3，不自作主张改配置。典型选项：
1. 停用某个插件；2. 调整某个插件的位置；3. 两个插件真不兼容 → 融合。

## 第三步：写操作规则（只有用户同意才做）

- 只用 `tools/manage.mjs` / `tools/anchor.mjs`，不手改 `cordis.patch.yml`；
- 每次写前自动留 `.bak`，写完提醒「重启 DSH 才生效」；
- 不碰 desktop profile。

## 第四步：冲突

先跑 `node tools/fuse.mjs <profile> --surface <ui-面>`（配置层融合）。
`exit 3` = 插件没暴露位置配置，动不了 —— 这时才谈源码级合并，并明确风险。

## 第五步：写实验插件（像油猴脚本那样小）

```bash
node tools/lab.mjs <profile> --install plugins/<name> [--anchor <值>]
node tools/lab.mjs <profile> --uninstall <name>
```

验证标准：`quicktest` 仍 10/10；新行为有可复现证据（截图用 `tools/capture.mjs`）。
卸载要真的卸干净（包目录、dependencies、bundles、patch 行）。

## 边界

- 恶意检测是顺手做的一项，不阻塞主线，默认不联网。
- 任何一步失败，先回滚再报告，不要带着半成品继续。
## 实验动作清单（C1：哪些必须在 mini 做，哪些绝不能碰主 profile）

### 必须在 mini 做（或至少先在 mini 做一遍）

| 动作 | 命令 | 为什么 |
|---|---|---|
| 装/升级/卸载插件 | `node tools/preinstall.mjs` → `sandbox-trial.mjs` | 主 profile 坏了你就没法干活 |
| 改 `cordis.patch.yml` | `sandbox-snapshot.mjs --take` 再动手 | 一次写坏就是起不来 |
| 试新的 UI 注入 / 改 client bundle | 在 mini 里装，`e2e` 验完再说 | 渲染失败只在宿主里才看得见 |
| 换 DSH 版本 / 升级运行时 | mini 用独立 `runtime/` | 版本不兼容会静默跳过插件 |

### 绝不能碰主 profile

- 任何「先删了再说」的修复；
- 未经 `preinstall` 的第二个同类插件（双市场/双栏就是这么做出来的）；
- 直接把 mini 的 `node_modules` 拷过去（依赖解析不同，要用 `sandbox-promote` 出清单）。

### 标准流程（一条链）

```bash
node tools/sandbox-snapshot.mjs <mini> --take --label "试 X 之前"   # 1 先拍
node tools/preinstall.mjs <mini> <pkg>                              # 2 看会不会撞车
node tools/sandbox-trial.mjs <mini> <pluginDir> [--keep]            # 3 装+验+自动回滚
node tools/sandbox-promote.mjs <mini> <main>                        # 4 出变更清单（dry-run）
node tools/sandbox-promote.mjs <mini> <main> --apply                # 5 确认后才写主 profile
node tools/lab-journal.mjs --export issue.md                        # 6 留证据
```

任何一步失败：`sandbox-snapshot.mjs <profile> --restore latest`，然后在 journal 里记一笔，再报告。
