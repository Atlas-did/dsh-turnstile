# 运行时上报：端到端跑通的链路 + 一个诚实的 0（2026-11-01）

## 链路

```
DSH 页面（client.js 挂载） --POST /turnstile/slot-map--> 宿主写 state/slot-map-<profile>.json
                                                          --> tools/ui-atlas.mjs 读它，出 runtimeCount 列
```

## 实测（mini，18770，真浏览器打开 DSH）

```
slot-map responses: 200,200     ← 挂载时一次 + 4 秒后补报一次
pageerrors: 0
file: true
```

文件内容：`slots 3 → root=0 | settings.mascot.item=0 | settings.section=0`。

## 为了跑通，修了三件事

### 1. 401：DSH 会抹掉 URL 里的 ?token=

插件侧原本在发请求时读 `location.search` 拿 token，但 DSH 加载完就把 query 清掉了：

```
location.search at 3s: ""        sessionStorage token: null
→ POST 无 token → {"error":"unauthenticated"} 401
```

两处修法：
- 客户端：**模块加载时**就把 token 抓下来（顺手写 sessionStorage），之后用缓存值；
- 宿主：把 `/turnstile/slot-map` 加入免 token 名单——它只含 slot 名和条目数，不含用户内容，
  跨源仍由 guardHandler 拦（注释里写清了为什么免）。

### 2. 挂载太早：4 秒后补报一次

面板挂载时有些插件还没注入，所以 `sendSlots()` 立即发一次 + `setTimeout(4000)` 再发一次。
实测两次都是 200。

### 3. 名字对不上：面名 ≠ slot 名

面叫 `@deepseek-ai/dsh-client-ui-settings`，slot 叫 `settings.section`。
改成「面取最后一段、slot 取第一段」再比，`ui-settings` 才匹配上。

## 诚实标注：数字是 0

匹配上了，但 `runtimeCount` 全是 **0**。原因：客户端快照的 `count` 取自
`ctx.slots._core.records` 里每个 slot 节点的 `entries` 长度，而这台机器上这些节点报出来是空的。

**所以我只证明了「链路通」，没证明「数字有意义」。**
要拿到有意义的条目数，得先搞清 DSH 的 slot 记录结构（下一步）。

## 插件行 → 骨架（另一件）

插件页的插件名现在带虚下划线，点一下直接跳「插件骨架」并自动加载：

```
e2e: clicking a plugin row opens its skeleton → PASS（83/83）
```
