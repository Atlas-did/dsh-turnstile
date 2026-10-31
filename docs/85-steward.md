# 环境管家：左体检，右全部 profile

用户要的是「像杀毒软件那样点一下体检」，外加「在主 DSH 里能看见 mini」。这一轮把页面做出来了，
**但只做只读那一半**，原因见最后一节。

## 页面

`环境管家`（控制台第一个导航项）：两栏网格，窄屏自动堆叠。

```
┌──────────────── 全面体检 ────────────────┐ ┌──────── 所有 profile ────────┐
│ 体检结果：2 通过 / 1 警告 / 2 失败 / 1 跳过 │ │ 3 个 profile，当前 mini      │
│ ! 缺少凭据键：agnes-api-key  → …          │ │ ○ lite   bundles 9 · 行 3    │
│ X AA 卡在「等待本地 bridge」 → …           │ │ ● mini   bundles 28 · 行 6   │
│ ✓ dshmarket 已安装并启用                   │ │ ○ research bundles 12        │
│ X @agents-anywhere/… 未安装 → …            │ │ 体检（终端）node tools/doctor│
│ · 登录记录读不到（正在运行，库被锁）        │ │ 预检 node tools/preflight    │
└──────────────────────────────────────────┘ └──────────────────────────────┘
```

## 两个新接口（都只读）

| 路由 | 作用 |
|---|---|
| `GET /turnstile/health` | 凭据 / 桥接 / 插件 / 登录记录，每条带 `next` |
| `GET /turnstile/profiles` | 每个 profile 的 bundles、patch 行数、停用数、node_modules 条目数 |

实跑（mini，`DSH_HOME=.../home`）：

```
profiles: lite(bundles 9/行 3/停用 0/102), mini(28/6/2/275), research(12/3/0/206)
health : 2 通过 / 1 警告 / 2 失败 / 1 跳过
```

## 为什么「重启 mini」「跑 quickcheck」还没做成按钮

插件一旦调用 `child_process` 就可能触发商店的合规检查——我们为了让插件能上架，**主动去掉了
child_process 依赖**（docs/57 记着）。所以管家页现在是**只读 + 给命令**：

```
体检（终端）  node tools/doctor.mjs --dir "<profile>"
安装前预检    node tools/preflight.mjs "<profile>"
```

要做成真按钮有两条路，都要先决定：

1. **在 mini 实验场保留一个可执行的本地工具**（`tools/steward.mjs`），页面只显示它的输出与按钮链接；
2. 接受插件不能 spawn，把「重启」做成**复制命令 + 手动执行**，并把这条限制写进商店说明。

我倾向 1：能力留在工具侧，插件只读，既过审又能用。

## 验证

console e2e 64 → **68/68**：管家页两栏、profile 列表 ≥2 条、终端命令可见、体检能在页内跑起来。
截图：`state/steward.png`（1440×900，真实 mini 数据）。
