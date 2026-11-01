# 复审三个新问题的处置（2026-11-01）

复审（基线 `a63263e` + 工作区）确认上轮修改有效，同时提了 3 个新边界 + 2 个旧问题。
注意：复审里「真实宿主版本保护 / 控制台假健康数据 未修」这两条，在我提交 `6615bdb` 时已经修了——
复审副本早于该提交。下面只记我这轮真正修的。

## P1-3（新）：无基线时字段自相矛盾 ✅

之前：`claim=verified` 但 `L5=pass / deepest=L5 / verdict=ok / next=[]`。
现在缺基线时 **L5 直接是 `unknown`**，deepest 停在 L4：

```
ok  无基线时 L5 是 unknown（不是 pass）   unknown
ok  无基线时 deepest 停在 L4            L4
ok  字段自洽：deepest 不到 L5 就不该是 ok + next 为空
```

## P2-1（新）：空步骤数组被判成功 ✅

`judgeAcceptance([])` 原来返回「全部 0 步通过」。现在：

- 空数组 → `没有任何步骤：不能算通过`
- 必需步骤缺失 → 列出缺哪些（`create / install+verify / verify-with-host-evidence / uninstall / rollback-verified`）

## P1-1（新）：`ask` 的顺序解析依赖本机文件系统 ✅

原来用「DSH_HOME 下有没有这个 profile」判断哪个参数是 profile → 干净机器上反向顺序失效。
现在不看文件系统，而是**分别试两种分配、选能解析出已知意图的那一种**，并支持显式 `--profile`：

```
ok  ["帮我看看插件状态","desktop"] → doctor      （空 DSH_HOME 下也过）
ok  ["desktop","体检"] → diagnose
```

测试现在用临时 `DSH_HOME`，不再依赖本机 profile。

## P2-2（新）：超大请求得到 socket 错误而不是 413 ✅

新增 `tools/lib/json-body.mjs`：`readJsonBody(req,{maxBytes})` 超限抛 `BODY_TOO_LARGE`，
调用方回 **结构化 413**；`/turnstile/run` 已改用。

```
ok  超大请求返回 413   413
ok  413 带结构化错误信息   {"error":"请求体过大（上限 1000000 字节）"}
ok  非 JSON 返回 400（不是 socket 错误）   400
```

## 测试

```
test-l5-honesty      +3 条（L5 unknown / deepest L4 / 字段自洽）
test-acceptance-judge +3 条（空数组 / 缺步骤 / 必需步骤齐全）
test-ask-order       改用临时 DSH_HOME
test-json-body       3 条（新增）
test:all             47 个 _OK，exit 0
```

## 复审里仍然成立、我还没做的

| 项 | 状态 |
|---|---|
| P1-3 旧：验收无 try/finally、可能删已有目标 | ❌ |
| P1-5 恒真断言 `ok(..., true)`（test-move-many:20） | ❌ |
| P1-6 CI 未运行完整 `test:all` | ❌ |
| 文档冒烟仍可能改写 `#`（本轮已修，但需 CI 兜底） | 🟡 需 CI `git diff --exit-code` |
| P2-1 页面校验不查属性声明 | ❌ |
| P2-2 moveMany 不查 draggable | ❌ |
| P2-3 fuse 逐条写非原子 | ❌ |
