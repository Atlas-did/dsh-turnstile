# Provision 批次：两层适配卡最小 schema（2026-11-02）

> 本文是计划，不是实现报告。基线 8fe0a68。
> 依据：deep-polish-plan / dsh-native-integration-plan / 人机协同与装机自适配设计 /
> 重复轮子判定 / DSH 深度融合评估 / 8fe0a68 深度代码讲解。

## 0. 与两份既有计划的顺序关系

三份计划不冲突，但不能并行开工：

深度打磨 批次一（数据保护：toggle 四套实现合一、P0-1 往返）
深度打磨 批次二（测试与 CI 可信化：恒真断言、能失败的负例）
        ↓
Provision 批次（本文件：机器快照 + profile 适配卡 + 探测证据 + stale）
        ↓
原生融合 N0–N1（能力契约夹具、只读工具、exemptions、slots 公开 API）
        ↓
原生融合 N2（approval + applyToken 组合写入，最后一步）

理由：Provision 要给「这台机器有什么能力」定事实，而事实必须写在唯一的写路径和
可信测试之上；否则适配卡会把已有缺陷固化成本机事实。

## 1. 四条硬约束（对原设计的三处修正）

| # | 约束 | 原设计的问题 |
|---|---|---|
| C1 | 机器事实只由确定性探测器产出；Agent 只能选适配器、解释差异 | 原文「Agent 探测并填值」→ 幻觉路径变成证据循环 |
| C2 | 能力状态分五档，不把「方法存在」等同「兼容」 | 原文只到 API 存在性 |
| C3 | stale 知识只能提示，不能断言 | 原文「旧知识仍比 20 个硬编码强」在权威层不成立 |
| C4 | 探测不得产生副作用：不真调 approval.request()、不试注册 tools | 原文未区分只读探测与调用 |

## 2. 第一层：MachineSnapshot（机器/运行时，每台机器一份）

~~~json
{
  "kind": "turnstile/machine-snapshot@1",
  "probeVersion": "1",
  "platform": "win32",
  "arch": "x64",
  "node": "24.9.0",
  "dsh": { "version": "0.2.1-rc.3", "runtimeRoot": "<abs>", "home": "<abs>", "source": "package.json|--version|unknown" },
  "capabilities": {
    "slots.snapshot":   { "state": "detected",    "source": "ctx.slots",  "missingReason": "" },
    "approval.request": { "state": "declared",    "source": "dsh source", "missingReason": "not probed at runtime" },
    "tools.register":   { "state": "declared",    "source": "dsh source", "missingReason": "" },
    "dshHomePath":      { "state": "unavailable", "source": "probe",      "missingReason": "not exposed in this version" }
  },
  "services": { "count": 163, "generatedFor": "0.2.1-rc.3", "generator": "knowledge-gen@1", "unavailable": [] },
  "probeDigest": "<sha256 of canonical facts>",
  "probedAt": "2026-11-02T...",
  "provenance": { "commands": [], "host": "cli|agent|host" }
}
~~~

### 2.1 能力状态五档

| 状态 | 含义 | 谁可以写 |
|---|---|---|
| declared | 源码/类型里声明存在，未在运行态确认 | 探测器（静态） |
| detected | 当前宿主对象上存在该成员（只读反射） | 探测器（运行态） |
| contract-passed | 输入/输出形状通过契约夹具（假对象） | 测试 |
| host-verified | 真实宿主里完成过行为验证（有证据文件） | 验收流程 |
| unavailable | 明确不存在 | 探测器 |
| unknown | 无法判定，必须带 missingReason | 任何层 |

规则：状态只能由低到高被更强证据覆盖；unknown 不得被默认值填成 detected。

### 2.2 只读探测规则（C4）

- 允许：typeof ctx.slots?.snapshot、读 package.json、读 profile 清单。
- 禁止：await ctx.approval.request(...)（会弹审批/写日志）、ctx.tools.register(...) 试注册、写 profile。
- 副作用接口一律停在 declared，直到有契约夹具或真实宿主证据。

## 3. 第二层：ProfileCard（每台机器 × 每个 profile 一张）

~~~json
{
  "kind": "turnstile/profile-card@1",
  "profile": "mini",
  "profileDir": "<abs>",
  "machineDigest": "<MachineSnapshot.probeDigest>",
  "runtimeFingerprint": "<dsh.version + runtimeRoot + generator>",
  "adapterSelections": {
    "platform": "windows",
    "stateDir": "<abs>",
    "hotkey": "powershell|xdg|none",
    "registryWatch": { "enabled": true, "reason": "win32" }
  },
  "plugins": [ { "name": "...", "declared": true, "installed": true } ],
  "slots": { "source": "live-public|live-private-legacy|static-only|unknown", "observedAt": "..." },
  "evidence": [ { "source": "...", "observedAt": "...", "status": "...", "locator": "..." } ],
  "provenance": { "createdBy": "cli|agent", "commands": [], "dshVersionAtProbe": "..." },
  "cardDigest": "<sha256 of card minus cardDigest>",
  "createdAt": "2026-11-02T...",
  "stale": { "isStale": false, "reason": "", "detectedAt": "" }
}
~~~

为什么拆两层：一台机器常有 desktop/mini/web 多个 profile；机器事实只一份，
切换 profile 只换卡，不会把 A profile 的插件与 slot 占用误用到 B。

## 4. stale 语义（C3）

判定 current 必须同时满足：dsh.version 相同、runtimeRoot 相同、
probeVersion+generator 相同、profileDir 与清单文件 hash 未变。

任一不满足 → stale：

| stale 用途 | 允许 | 禁止 |
|---|---|---|
| 提示「曾在这个对象上发现过 X」 | 是 | — |
| 作为冲突结论的直接依据 | 否 | 只能 low-confidence 或 unknown |
| 作为服务存在性断言 | 否 | 必须重新探测 |
| 修复/写入决策 | 否 | 必须先 reprovision |

实现要点：conflict.mjs 现在是 dshVersion === runtimeVersion 的全有或全无（37–53 行），
要改成三态：current（可断言）/ stale（只提示）/ absent（退回内置清单并明写 stale by construction）。

## 5. 采纳流程（复用现有闸门，不新造通道）

只读探测 → MachineSnapshot + 候选 ProfileCard
  → Agent 选择适配器、解释差异（不得改探测器产出的事实）
  → dry-run：展示将写哪些文件、卡里哪些字段会变、影响哪些功能
  → 人确认（沿用 applyToken 协议）
  → 原子写入 + 纳入快照
  → 写后重新探测
  → 对比实际能力 vs 卡片：一致 → current；不一致 → 回滚或标 unknown

token 绑定：hash(command + args + cardDigest + machineDigest + profileDir + 目标文件前置 hash)。
批准后若版本、runtimeRoot、profileDir 或目标文件 hash 变化 → 拒绝执行，重新探测与出计划。

## 6. 最小验收（Provision 批次）

| # | 断言 | 失败后果 |
|---|---|---|
| P1 | 探测器不调用任何副作用接口（假 ctx 记录调用次数为 0） | 批次不通过 |
| P2 | 能力五档可表达，unknown 必须带 missingReason | 批次不通过 |
| P3 | 版本变化后旧卡变 stale，且不能再产出高置信冲突 | 批次不通过 |
| P4 | 两张卡 digest 自校验（篡改任字段 → 不匹配） | 批次不通过 |
| P5 | 采纳时 machineDigest/cardDigest/前置 hash 任一变化 → 拒绝 | 批次不通过 |
| P6 | 写后复探不一致 → 回滚到写入前字节，或把卡标 unknown | 批次不通过 |
| P7 | 装机默认不静默跑扫描；只有显式 provision 才执行并打印摘要 | 批次不通过 |

## 7. 对「163/163 = 100%」的口径修正

分子分母来自同一个抽取器，不能作为覆盖率证明。允许的写法：

本机运行时探测到 163 个 ctx 服务；该数字来自 knowledge-gen@1 的抽取结果，
尚无独立分母，因此不能称覆盖 100%。未抽取到的服务一律 unknown。

## 8. 本批次明确不做

- 生成适配器代码（仍走「候选 → mini 试装 → 六级证据 → 人工审查 → 晋升」窄门）；
- 原生 approval 替换 applyToken（属 N2，二者互补）；
- 静默 postinstall；
- 多机同步。

## 9. 三份计划里仍然成立、尚未关闭的事项（本轮核对）

| 事项 | 证据 | 状态 |
|---|---|---|
| toggle 三套实现并存（manage.toggleInPatch / index.toggleLegacy / toggle-text） | 代码位置已核 | 未修 |
| conflict.mjs 版本严格相等即全有或全无 | 37/53 行已核 | 未修 |
| panel e2e 仍有 3 处恒真断言 | e2e-panel-offline.mjs:178/264/290 | 未修 |
| 状态目录三套推导（apply-token tmpdir / console-data profileDir/../.. / index.js DSH_TURNSTILE_STATE） | 三处已核 | 未收敛 |
| rc.4/rc.5/0.2.2-alpha.2 兼容 | compat-matrix 全 unknown | 未验证 |
