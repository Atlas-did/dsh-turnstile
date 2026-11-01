# 这份文档 = HEAD 0831190 的同一份（2026-11-01 复核）

收到的新文件 `dsh-turnstile-更新后功能详解(1).md` 与之前那份**内容相同**（都写 HEAD=0831190、5 个提交）。
其中第八节 8 条 + 第九节 6 条，对照当前 HEAD 逐条核：**13 条已处理，1 条是环境问题（已改为可诊断）**。

## 第八节「已知问题」逐条

| # | 原问题 | 当前状态 | 证据 |
|---|---|---|---|
| 1 | occupancy/doctor/gate-map 未迁移 lib/ui-scan | ✅ 已迁 | `a86a463`（occupancy）、`2c0fc0e`（doctor+gate-map）；`OCCUPANCY_PARITY_OK` 6 条 |
| 2 | `--fixture` 无 CLI 开关；search/pits 假数据；diagnose-legacy 死代码 | ✅ 已清 | `--fixture` 实测打印 `Data: FIXTURE`/`Data: real`；search 真搜索引；pits 真跑 3 条；死代码删 669 字符 |
| 3 | `files` 缺 `recommendations/` | ✅ 已加 | `files: tools,plugins,skills,recommendations,tests,docs,…` |
| 4 | `card --kind health` detail 为空 | ✅ 已修 | 改读 `checks[i].findings[]`，实测 `"detail":"unsupported variable ${UNKNOWN}"` |
| 5 | recommend 的 installed 插件本机未装时无提示 | ✅ 已修 | 打印「目录标记为已装…但**这个 profile 里没有**」 |
| 6 | semver-drift / ui-scan 未接 CI | ✅ 已接 | `.github/workflows/selftest.yml` 两步；本地 `test:all` 13 套件 |
| 7 | 缺 node_modules 导致 selftest 红 / profile-yaml FAIL | ⚠️ **本轮改成可诊断** | 见下节 |
| 8 | 仓库根两个零字节异常文件 | ✅ 已删 | `git status` 两条 `D` |

## 第九节「下一步建议」逐条

| # | 建议 | 状态 |
|---|---|---|
| 1 | occupancy 迁 lib | ✅ `a86a463` |
| 2 | bin 指向 turnstile.mjs | ✅ 早已是（他们看到的是更早版本） |
| 3 | files 加 recommendations | ✅ `13fbd9f` |
| 4 | 清 search/pits 假数据 + 死代码 | ✅ `13fbd9f` |
| 5 | 接 CI | ✅ `a86a463` |
| 6 | 面板三档 + `/turnstile/run` + next[] | ✅ `48c2d4a` / `a7268e6` / `c97f636` |

## 唯一真正剩余的：第 7 条（缺依赖的诊断）——本轮补掉

原来在没 `npm install` 的环境里，只看到一句 `profile-yaml FAIL`，人/agent 都无从判断是缺包。

改了两处：

1. `tools/config.mjs` 的 `requireDep`：抛 `MISSING_DEPENDENCY`，消息是
   `缺少依赖 js-yaml：在仓库根跑 npm install（离线环境可 npm install --offline）`
2. `tools/preflight.mjs`：捕获这类错误后**不再当 FAIL**，而是
   `{ ok: true, skipped: true, skipReason: 'missing-dependency', next: 'npm install（仓库根）' }`，
   并写进 `--json` 与报告文件（`skipped` / `skipReason` / `next` 三个字段）。

实测：

```
$ node tools/test-dependency-diag.mjs
ok   缺依赖抛 MISSING_DEPENDENCY
ok   错误消息里给 npm install
ok   check 记录带 skipped 字段
ok   正常检查 skipped=false
DEPENDENCY_DIAG_OK
```

意义：**「没装依赖」不再伪装成「你的 profile 坏了」**——这正是上一轮我们批评假数据的同一类问题。

## 结论

这份文档（HEAD 0831190）描述的是**更早的版本**；当前 HEAD 已把它的 13/14 条建议做完，
最后一条（依赖诊断）这轮补齐。剩下的不是它列的问题，而是我们自己的路线：面板三档之外的 IA 重排、`ask` 覆盖主线、CLI 侧 applyToken。
