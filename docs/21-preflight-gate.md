# 装前闸门（preflight）与冲突登记

## 为什么要有闸门

2026-10-29 的一天里，同一个模式的坑踩了两次：

| 事件 | 装的时候有没有报错 | 什么时候炸的 |
|---|---|---|
| dsh-vibe-math 的 `{{cwd}}` | 没有 | 新建会话、选中预设那一刻 |
| dsh-orb 的 Computer Use 预设 | 没有 | 同样，一选就炸 |

共同点：**装的时候一切正常，用的时候才爆**。所以检查不能等「用到了再说」，
要放在**装和重启之间**，做成一道闸门。

## 用法

```bash
node tools/preflight.mjs <profileDir>     # 退出码 0=可装，1=有阻塞项
```

五项阻塞检查 + 一项建议：

| 检查 | 抓什么 | 工具 |
|---|---|---|
| dependency-risk | 依赖了 peer-only 的非官方包（装不活） | risk.mjs |
| conflict-surface | ctx 覆盖 / 服务重复 / 端口 / 状态文件 / 版本分叉 | conflict.mjs |
| engine-gate | 会被加载器按版本跳过 | engines.mjs |
| prompt-vars | persona 文案用了没注册的模板变量 | prompt-vars.mjs |
| *版本矩阵（建议）* | 声明不覆盖当前 runtime 但仍会加载 | registry.mjs |

## 版本矩阵：三种状态

```
OK           有 engines.dsh 且满足 → 加载器装载
SKIPPED      有 engines.dsh 但不满足 → 加载器丢弃（有告警）
UNCERTIFIED  没有 engines.dsh，但 dsh.compatibility 不包含当前版本
             → 照样加载，但作者没认证过。这是最阴的一类。
```

实测（2026-10-29，runtime 0.2.1-rc.3）：

```
UNCERTIFIED   math-research-dsh   2.0.4   compat excludes 0.2.1-rc.3
summary: {"UNCERTIFIED":1,"UNDECLARED":17,"OK":5}
```

`math-research-dsh` 就是我们一直在用的那个技能包 —— 它跑在**自己声明的兼容窗口之外**，
只是一直没出问题。这类要登记，不当成「已验证」。

## 三份清单（按你笔记里的划分）

### 清单 1 · 冲突登记表

> ⚠️ 下面是**判断口径**（人工维护），真实数据看 `docs/22-gate-report.md` 第 2 节。
> 手写数据会过期，口径不会。

| 资源 | 冲突类型 | 现状 | 能不能改 |
|---|---|---|---|
| `ctx.<字段>` 赋值 | 后写覆盖前写 | 桌面 0 处 | ❌ 只能二选一（硬约束） |
| `ctx.provide('服务')` | 同名两套实现 | 0 处 | 部分可（改服务名 = 一条链） |
| 依赖版本分叉 | 行为诡异、不报错 | 1 条（schemastery 3.18.4/3.18.5） | ✅ 可统一 |
| prompt 模板变量 | 首次渲染即抛 | 已修 2 处（vibe-math、orb） | ✅ 已用 pnpm patch 固化 |
| 工具名重名 | 加载期就失败 | 未发现 | ⚠️ 改名是一条链，不是一行 |
| 端口 / 状态文件 | EADDRINUSE / 抹数据 | 未发现 | ✅ 可配置 |

### 清单 2 · 版本矩阵

由 `tools/registry.mjs` 生成，见上。要点：**UNCERTIFIED 不等于可用**，只是还没炸。

### 清单 3 · 改造优先级

```
必须先改（不改跑不起来）→ 加载期：引擎门、prompt 变量、依赖缺失
最好能改（体验问题）    → UI：注入点、样式
改不动的（当硬约束）    → ctx 对象本身、写死的 slot 名
```

## 为什么不做「运行时弹框选择」

你笔记里那句话是对的：**检测能力 = 调解能力，是同一道门槛**。
想拦 `ctx.fs = ...`，得先把 ctx 换成 Proxy；而 Proxy 必须在 `apply(ctx)` 之前塞进去，
那个位置在 Loader 手里 —— 我们拿不到。

所以闸门放在**装之后、重启之前**：纯静态分析 `node_modules`，不需要任何 Loader 权限。

## 还没做的（下一步）

| 目标 | 状态 | 为什么难 |
|---|---|---|
| 加载顺序 + 注册表快照 | 部分（dump-config 有行顺序） | 真实的「谁注册了什么」要运行时 hook |
| ctx 变更日志 | ❌ | 同上，需要 kernel 层 |
| 决策记忆（带版本 key） | ❌ | 前置是上面两条 |

这三项都指向同一件事：**要么改 kernel，要么接受「只能看到静态」**。
按「绕开 > 编排 > 仲裁」的排序，静态闸门已经能挡掉绝大多数装错，
剩下的靠 mini 复现 + 预设实测。
## 决策登记（机器可读，带版本号）

每次 preflight 自动追加一条运行记录到 `state/gate-history.json`；
人做的判断用 `decide` 写进去，**key 里带版本号**，插件升级后旧决策自动失效。

```bash
node tools/history.mjs list                                  # 看历史与决策
node tools/history.mjs decide "<包@版本>|<检查>|<资源>" allow|deny|patch <证据>
node tools/preflight.mjs <profileDir> --no-record             # 只想看结果，不留痕
```

### key 为什么带版本号

```
dsh-vibe-math@2.8.5|prompt-vars|{{cwd}}x50   -> patch
```

作者发 2.8.6 后，这个 key 不再匹配 —— 决策失效，闸门会重新问一遍。
这正是「记住上次选择」必须补的那一课：**版本变了，结论可能就不成立了**。

### 当前登记（2026-10-29）

| 决策 | key | 说明 |
|---|---|---|
| PATCH | `dsh-vibe-math@2.8.5\|prompt-vars\|{{cwd}}x50` | 50 处改写，pnpm patch 固化 |
| PATCH | `dsh-orb@0.0.0\|prompt-vars\|persona-suffix-{{cwd}}` | 本地 tgz，脚本可重复施加 |
| ALLOW | `math-research-dsh@2.0.4\|version-matrix\|UNCERTIFIED` | 跑在兼容窗口外，暂无事故 |
| DENY | `@dsh-external/dsh-normify@0.5.4\|engine-gate\|<0.2.0` | 已卸载 |
| DENY | `dsh-talk@0.3.15\|engine-gate\|<0.2.0` | 已卸载，tarball 存档 |

## 闸门自己的阳性对照

`tests/gate-fixture/` 放了一个只有 persona `{{cwd}}` 的假插件，实测：

```
FAIL  prompt-vars   summary: 1 unsupported reference(s)
RESULT: 1 blocking check(s)      EXIT=1
```

**闸门必须能拦住已知的坑，否则它只是装饰。** 这条和 risk/conflict 的夹具一样是硬要求。
## 自动生成的报告

清单不再手写，一条命令生成：

```bash
node tools/report.mjs <profileDir>     # -> docs/22-gate-report.md
```

内容：版本矩阵 + 冲突面 + 依赖风险 + prompt 变量 + 决策登记 + 最近运行。
开头写明「自动生成，不要手改」——**手写表格一定会过期，生成的一定不会**。
## 闸门的自检（防止扫描器悄悄失效）

改扫描逻辑时最容易出的事：工具还在跑、结果全绿，但其实已经不检查了。
所以给闸门本身写了自检：

```bash
node tools/selftest.mjs     # 7 个用例，全过才算闸门健康
```

| 用例 | 期望 |
|---|---|
| risk 扫 RED 夹具 | exit 6 且认得出 plug-red |
| conflict 扫夹具 | 同时报 ctx-assign 与 service-dup |
| prompt-vars 扫夹具 | exit 7，YAML 与 JS 两种写法都抓到 |
| preflight 扫夹具 | exit 1（拦得住） |
| preflight 扫 desktop | exit 0（不误伤） |
| preflight 扫 mini | exit 0（不误伤） |
| registry 扫 mini | 把 talk 标成 EXEMPTED 而非 SKIPPED |

实测：`RESULT: gate is healthy (7 cases)`。

**这条规则来自踩过的坑**：第一版 risk 扫描器对夹具全报 GREEN，
如果没有「该红必须红」的用例，它会一直绿灯骗人。
## 五项阻塞（2026-10-29 起）

```
dependency-risk   依赖装不活（peer-only 非官方 scope）
conflict-surface  ctx 覆盖 / 服务重复 / 端口 / 状态文件 / 版本分叉
engine-gate       引擎版本会被加载器跳过
prompt-vars       persona 用了未注册的模板变量
import-health     模块根本 import 不了（HARD）
```

第五项是后来补的：以前只有重启后的 quicktest 会查导入，
等于「装完了、重启之后才发现装不活」。现在装前就能拦住。
夹具 `tests/import-fixture/` 验证：`EXIT=1`，明细 `HARD (真正的缺陷): 1`。