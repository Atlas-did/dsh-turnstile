# dsh-turnstile

DeepSeek Harness（DSH）插件的 **对话入口、风险闸门、可视化控制台与安全实验场**。

一句话：**先检查，再试装；先看计划，再写入；没有加载证据，就不说成功。**

> English guide: [README.en.md](README.en.md) · 安装与卸载：[INSTALL.md](INSTALL.md)

## 第一次使用

要求 Node.js 22.19+ 或 24+。

```bash
git clone https://github.com/Atlas-did/dsh-turnstile.git
cd dsh-turnstile
npm ci

# 先用自包含夹具证明扫描器还能抓住问题，不读取你的 profile
node tools/selftest.mjs --allow-skips

# 查看统一入口
node tools/turnstile.mjs help
```

`<profile>` 是 DSH profile 目录，例如 Windows 的 `%USERPROFILE%\.dsh\profiles\desktop`。
第一次体检建议选实验 profile，不要直接修改日常环境。

## 普通用户：直接对智能体说

安装 `skills/turnstile` 后，在 DSH 对话里说：

- 「帮我看看插件状态」
- 「装 dsh-x 前有风险吗？」
- 「我想制作一个插件页面」
- 「上次试装结果怎么样？」
- 「把 dsh-x 挪到左下角」
- 「停用 dsh-x」——先展示计划和风险，等你确认才执行

面板不是必经路径。智能体通过统一入口理解动作、读取证据，再把结论讲成人话。

```bash
node tools/turnstile.mjs ask <profile> "帮我看看插件状态" --json
```

返回的 `actions[]` 分为只读、界面和写入动作。`open-builder` 会打开 `/turnstile/builder`，不是 shell 命令。

## 可视化：控制台与页面搭建器

安装面板插件后，可以在 DSH 中打开 Turnstile 控制台：

- 查看插件状态、UI 面占用、属性与动作。
- 用页面搭建器拖拽创作，保存后刷新可恢复。
- 预览并导出独立页面插件。
- 在最小隔离模块宿主中检查首次加载和再次启动。

```bash
# 对已经导出的页面插件做隔离模块自检
node tools/verify-export.mjs <exportedPluginDir> --json
```

**隔离模块自检不等于真实 DSH 试装。** 控制台、CLI 和文档都保持这条边界。

## 高级用户：统一 CLI

### 查与验（只读）

```bash
node tools/turnstile.mjs doctor <profile> --json
node tools/turnstile.mjs gate <profile> --json
node tools/turnstile.mjs preinstall <profile> <pkg> --json
node tools/turnstile.mjs surfaces <profile> --json
node tools/turnstile.mjs inspect <profile> <pkg> --json
node tools/turnstile.mjs trial-status <profile> --json
```

### 写入：计划与确认缺一不可

```bash
# 1. 只生成计划，不写文件
node tools/turnstile.mjs manage-disable <profile> <pkg> --dry-run

# 2. 用户明确确认后，使用上一步的一次性 token；包名必须逐字一致
node tools/turnstile.mjs manage-disable <profile> <pkg> --apply --token <token> --confirm <pkg>
```

`anchor`、`fix`、`manage-enable` 和 `snapshot-take` 也走 dry-run／applyToken。
不要直接调用旧脚本的 `--yes` 来绕过统一闸门。

### 页面插件的真实宿主证据

试装保留后，采集器用两阶段观察证明「确实在新启动的宿主中加载」。采集器自身不会启动或停止 mini：

```bash
node tools/host-observe.mjs before <profile> <pkg> --mini <miniDir> --out <observation.json>
# 通过已有受控流程重启该 mini
node tools/host-observe.mjs after <profile> <pkg> --mini <miniDir> --input <observation.json> --out <evidence.json>
node tools/host-evidence.mjs <evidence.json> --record --state <stateDir>
node tools/turnstile.mjs trial-status <profile> --json
```

只有同插件、同 profile、晚于本次试装，且同时具有新 bootId、安装／bundles 和目标路由 200 非空响应的证据才会通过。
observation 与 evidence 不保存 URL token。

## 三种环境，不要混用结论

| 路径 | 用途 | 能证明什么 |
|---|---|---|
| 静态检查与自包含夹具 | 扫风险、验证扫描器 | 已知规则是否触发，不证明插件已加载 |
| 最小隔离模块宿主 | 验证生成插件的模块与路由 | 导出模块可加载，不证明真实 DSH 已加载 |
| mini／真实 DSH 宿主 | 受控试装、重启与路由观察 | 证据链完整时，才能说明该次宿主加载通过 |
| 主环境 | 日常桌面使用 | 只接收已验证且经再次确认的改动 |

## 常用能力

| 想做什么 | 工具 |
|---|---|
| 总闸门与风险检查 | `gate` / `preinstall` / `check risk|conflict|engines` |
| 谁占用设置页或顶栏 | `surfaces` / `atlas` / `slot-report` |
| 看插件骨架与两插件差异 | `inspect` / `diff-plugins` |
| 页面创作与导出 | 控制台 `/turnstile/builder` / `builder-export.mjs` |
| 快照、试装与回滚 | `snapshot-take` / `trial` / `archive` |
| 宿主加载证据 | `host-observe` / `host-evidence` / `trial-status` |
| 推主环境前比较 | `sandbox-promote <sandboxProfile> <mainProfile>`，默认 dry-run |
| 接入自己的检查器 | `gate <profile> --checks <manifest.json>`，见 [扩展契约](docs/148-check-extension.md) |

## 验证与发布检查

```bash
npm run test:all                 # 自包含单元与契约回归
npm run test:sandbox-lab         # 快照、试装、回滚与推送夹具
npm run test:export              # 导出插件与隔离加载
npm run test:builder:console     # 保存 → 刷新 → 导出 → 预览
npm run test:host-observe        # 两阶段宿主采集夹具
node tools/release-check.mjs --pack --json
```

`npm pack` 当前会包含工具、插件、技能、文档和测试夹具，方便复核证据；发布前必须运行 release check。

## 信任边界

- `unknown` 是合法结论：缺证据时不猜、不自动修。
- 静态通过、HTTP health 和隔离加载是三种不同证据，不能互相冒充。
- Turnstile 不是安全沙箱，不能阻止恶意插件执行代码。
- mini 通过不代表桌面主环境一定通过；桌面端仍需自己的验收。
- 所有写操作都必须先展示计划并获得明确确认，高危停用还需精确确认目标。
- 历史检查器有各自的退出码；自动化应优先读取统一 `--json` 的 `verdict`、`summary`、`evidence` 和 `next`。

## 文档与目录

```text
plugins/turnstile-popup/   面板、控制台、搭建器与共享渲染器
tools/                   统一 CLI、检查器、实验场与宿主适配器
skills/                  DSH 对话技能
tests/                   自包含夹具与必须失败的对照
docs/                    当前指南、机制笔记与历史证据
```

| 想了解 | 看 |
|---|---|
| 文档分类索引 | [docs/README.md](docs/README.md) |
| 对话入口与写入闸门 | [docs/145-conversation-entry.md](docs/145-conversation-entry.md) |
| 宿主证据与两阶段采集 | [docs/146-host-evidence-contract.md](docs/146-host-evidence-contract.md) |
| 整体架构 | [docs/50-modules.md](docs/50-modules.md) |
| 页面创作闭环 | [docs/116-abcd-complete.md](docs/116-abcd-complete.md) |

## 许可

MIT。
