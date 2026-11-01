# 从四个插件身上「借」了什么（只借机制，不复制实现）

> 原则：**留接口，不抄代码**。每个插件只取一条我们能复用的机制，并在本项目里留一个可对接的位置。

## 1. brooks-lint（代码质量评审）

**它的机制**：`brooks-lint install <platform>` 把 6 个技能写进平台目录（含 `dsh`），每个技能 = `SKILL.md` + 分阶段 guide，另有 `_shared/` 放共用规则。

**我们借的**：技能包目录约定 + **检查器**，而不是它的评审内容。

新增 `tools/skill-pack.mjs`：

```bash
node tools/skill-pack.mjs list   [--home <DSH_HOME>]   # 装了哪些技能包
node tools/skill-pack.mjs lint   <dir>                 # 单个包是否合规
node tools/skill-pack.mjs doctor [--home …] [--json]   # 全部体检
```

实测（mini 的 skills 目录，真实第三方内容）：

```
brooks-audit   3 文件  Architecture audit that maps module dependencies…
brooks-debt    2 文件  Tech debt assessment that identifies, classifies…
…
全部合规（8 个）
```

**接口位置**：`recommendations/plugins.json` 的 `detect.skills` 已经能识别「技能形态的安装」，
`recommend` 因此能把 brooks-lint 显示成「已装」（它不在 node_modules 里）。

## 2. Aegis（agent 工程纪律）

**它的机制**：一个 DSH bundle 只贡献**一条 Cordis 行** `aegis-method-pack`，把技能发现委托给 DSH 原生 skill provider；
在 `startup/resume/clear/compact` 边界上「上膛」，等会话第一个持久动作后再注入一次，避免首请求被污染。

**我们借的**：「**一行 + 委托原生技能目录**」这个形态，不碰它的注入时序。

**接口位置**：`skill-pack.mjs list/doctor` 能把这种「方法包」像普通技能包一样列出来；
`recommend` 的 `Aegis` 条目写清「装进 mini 作为插件、技能走原生目录」，并标 `verified` 而非 `installed`——
**我们没有复制它的注入逻辑，也不打算复制**。

## 3. superdesign-skill（UI 质感）

**它的机制**：跨会话连续性——记住项目、草稿、抽出的组件与「预算内的源码上下文包」，下次不再重新探索。

**我们借的**：「**预算内上下文**」这个说法。我们已有同类约束（inspector 4 MiB 预算、`card.mjs` 截断 12 行），
但没把它写成一条人能懂的原则。

**接口位置**：文档层——本项目所有「喂给模型的东西」都受预算约束，这条现在写进了 `docs/141` 与 `card.mjs` 的截断规则里。
不引入它的 canvas/服务依赖。

## 4. distilly / colleague.skill（经验资产化）

**它的机制**：从素材（消息、文档、截图）蒸馏出一个「像某人一样工作」的技能，产物是 AgentSkills 标准包。

**我们借的**：**产物形态**——`SKILL.md` + 附带资料，正好是我们 `skills/` 目录的形态。

**接口位置**：`lab-journal.mjs --export` 导出的流水账，就是它能吃的「素材」；
产物落到 `<DSH_HOME>/skills/<name>/`，然后用 `skill-pack.mjs lint` 验一遍。
**我们没有实现蒸馏流程**（那需要 LLM + 素材管线），只保证「出口兼容」。

## 5. 一张表：借了什么、留了什么接口、没做什么

| 插件 | 借的机制 | 我们的接口 | 没做 |
|---|---|---|---|
| brooks-lint | 技能包安装布局 + 分阶段 guide | `skill-pack.mjs` + `detect.skills` | 不复制它的评审规则 |
| Aegis | 一行 bundle + 委托原生技能目录 | `skill-pack.mjs` 能列出方法包 | 不复制生命周期注入 |
| superdesign-skill | 预算内上下文 | 预算约束写进文档与 `card.mjs` | 不引入它的 canvas/服务 |
| distilly | 产物是 AgentSkills 包 | `lab-journal --export` 出口 + `lint` 验收 | 不实现蒸馏管线 |

## 6. 检查器的宽容度（这轮踩到的）

第一版 `lint` 把「name 与目录名不一致」判成 FAIL，结果主环境 20 个官方技能里 15 个被判不合规——
因为 `sp-*` 就是**前缀命名**的正当用法。

改成两档：

- `errors`（读不了/没法用）：无 `SKILL.md`、无 frontmatter、缺 name/description → 影响退出码
- `warnings`（风格不合但能用）：name≠目录、description 过长、文件过大 → 只提示

现在是 `全部合规（20 个）` / `全部合规（8 个）`，第三方包不再被我们的风格规则判死。

## 7. 测试

`tools/test-skill-pack.mjs` 7 条：正常包、块标量 description（brooks 的写法）、前缀命名只 warning、坏包报错、doctor 退出码与汇总。
