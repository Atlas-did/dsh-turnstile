# 审查 P1-1 / P1-2 处置（2026-11-01）

## P1-1：真实宿主页面保存没有版本保护 → 已修（共用一份 store）

新增 `plugins/turnstile-popup/lib/page-store.js`：

```js
pageVersion(file)                       // mtime + size
readPage(file)     → {exists, page, version}
writePage(file, page, {baseVersion}) → {ok, version} | {ok:false, stale:true, version}
```

写入是 **临时文件 + rename 原子替换**，写前留 `.bak-<ts>`。

| 位置 | 之前 | 现在 |
|---|---|---|
| 独立控制台 `POST /turnstile/page` | 自己比对版本 | 调 `writePage` |
| **真实宿主** `POST /turnstile/page` | **直接覆盖写** | 调 `writePage`（同一份实现） |
| `GET` | 各自返回 | 都经 `readPage`，都带 `version` |

## P1-2：控制台真实模式返回写死健康项 → 已修

以前 `fixture:false` 也返回固定内容：`dsh-free-search 已安装并启用`、`profile: console-fixture`、bridge 固定不存在。
现在分两条完全不同的采集路径：

| 项 | fixture 模式 | 真实模式 |
|---|---|---|
| credentials | 夹具文件 | `<profile>/.credentials.yaml` 是否存在 |
| bridge | 固定 `exists:false` | `<profile>/.dsh-link.json` 是否存在 |
| plugins | 写死 `dsh-free-search` | **真实 bundles 统计**（不编造包名） |
| profile 字段 | `console-fixture` | **实际 profile 路径** |
| fixture 标记 | `fixture: true` | 不写（真实数据） |

实测（mini 真机）：`items 3 · fixture undefined · profile mini`。

## 顺手修的一个真故障（同步白名单漏文件）

改完 `index.js` 后 mini **起不来**：
`Cannot find module .../lib/page-validate.js` —— `sync-live.mjs` 的白名单没跟上。
这类漏文件已让我栽过两次（上次是 `run-route.js`）。新增 `test-sync-coverage.mjs`：
解析 `index.js` 里所有 `from "./x"`，要求它们和所有 `.css` 都在同步白名单里。

## 测试

```
test-page-store      10 条（纯 store 7 + 真控制台 3）
test-health-real      5 条（不写死包名 / profile 是真实路径 / fixture 显式标注）
test-sync-coverage    3 条
test:all            46 个 _OK 标记，exit 0
```

## 仍未做（审查剩下的）

| 项 | 状态 |
|---|---|
| P1-3 acceptance 无 try/finally 事务边界 | ❌ |
| P1-5 恒真断言 `ok(..., true)` | ❌ |
| P1-6 CI 没跑完整 `test:all` | ❌ |
| P2-1 页面校验不查属性声明 | ❌ |
| P2-2 moveMany 不查 draggable | ❌ |
| P2-3 fuse 逐条写非原子 | ❌ |
