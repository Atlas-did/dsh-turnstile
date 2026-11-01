# 五个推荐插件的实地核验（2026-11-01）

上一版目录里 5 个有 4 个是 `unverified`。这轮逐个查了来源、读清单/源码、并在 mini 上做了能做的安装验证。

## 结论表

| 插件 | 结论 | 证据 |
|---|---|---|
| **dsh-genui** | 已装可用 | `dsh-genui 0.3.1`，inject 4 面，`lib/index.js` 内确认真读 `schemaJson` |
| **brooks-lint** | **已装进 mini** | npm `1.9.1`；`brooks-lint list` 明确支持 `dsh` 平台；`install dsh --dir <DSH_HOME>/skills` 落地 6 个 SKILL.md（audit/debt/health/review/sweep/test）+ `_shared` |
| **Aegis** | 真实存在，DSH 原生形态 | GitHub `GanyuanRan/Aegis` `package.json` v2.14.2，`dsh.bundle.patch=./extensions/dsh/cordis.patch.yml`；官方有 `docs/README.deepseek-harness.md` 完整说明 |
| **superdesign-skill** | 真实存在，技能形态 | GitHub `superdesigndev/superdesign-skill` README：面向 Claude Code/Cursor/Codex 等 70+ agent，提供设计判断力 |
| **distilly（colleague.skill）** | 真实存在，Python 工具 + 技能 | GitHub `titanwings/distilly` README：Python 3.9+、AgentSkills 标准；把「某个人的资料」蒸馏成 Skill |

## 三个必须说清的点

### 1. npm 上有同名但不是同一个东西

| 名字 | npm 上是什么 | 是不是我们要的 |
|---|---|---|
| `aegis` | Quildreen Motta 的异步流库 | ❌ 不是 |
| `distilly` | wighawag 的 HTML→markdown 工具 | ❌ 不是（同名不同物） |
| `brooks-lint` | hyhmrright 的代码评审 CLI | ✅ **是** |

所以「npm 上搜到同名」不能当证据 —— 这也是我上一版把它们标成 unverified 的原因，现在改按 GitHub 仓库核。

### 2. brooks-lint 是本轮唯一真正装进去的

```
$ npx brooks-lint install dsh --dir <MINI>/home/skills
Installed brooks-lint skills (+ _shared/) into …\home\skills
$ ls <MINI>/home/skills
_shared  brooks-audit  brooks-debt  brooks-health  brooks-review  brooks-sweep  brooks-test  mini-lab
```

它在 mini 的 skills 目录里，与已有的 `mini-lab` 并列 —— 路径约定一致。
**未直接验证**：DSH 重启后技能目录是否真的把它列进 catalog（日志没有技能清单输出）。

### 3. 四个插件管的是不同的东西，别当成同类

| 插件 | 管什么 | 与本项目关系 |
|---|---|---|
| brooks-lint | **代码质量**（坏味道/维护风险） | 旁路，互补 |
| Aegis | **agent 工程纪律**（少返工、完成前给证据） | 也做闸门，但管的是 agent 行为；我们管环境与插件，不重叠 |
| superdesign-skill | **UI 质感** | 给本项目两个页面做设计评审 |
| distilly | **经验→技能** | 接在 `lab-journal` 导出之后 |
| dsh-genui | **对话内渲染** | `card.mjs` 的落地端 |

## 目录数据模型也跟着升级

`recommendations/plugins.json` 从 `schema:1` 升到 `schema:2`：

- `status` 三档：`installed`（本机跑过）/ `verified`（读过源码或清单，没装）/ `unverified`
- 每条必须有 `evidence[]`（可复查的具体事实，不是形容词）
- 新增 `detect.skills`：技能形态的安装也能被识别（`<DSH_HOME>/skills/<dir>/SKILL.md`）

`recommend.mjs` 实测：

```
dsh-genui       [已装 0.3.1]
brooks-lint     [已装]        ← 技能形态被 detect.skills 认出来
Aegis           [未装]
superdesign-skill [未装]
distilly（colleague.skill）[未装]
```

## 测试

`test-recommend-card.mjs` 新增 3 条纪律断言：status 三档、每条必须有 evidence、verified 必须带说明。共 15 条全过。

## 仍未验证

- Aegis **没装进 mini 实测**（它要 `pnpm add aegis` + bundle patch，动静比装技能大）；
- superdesign-skill / distilly 都只是读了 README，没跑；
- brooks-lint 的 6 个技能在 DSH 会话里能否被触发，没验。
