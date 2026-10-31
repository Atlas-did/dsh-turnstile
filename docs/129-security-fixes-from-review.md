# 外部审查发现的安全问题：确认与修复（2026-11-01）

> 审查者在 `41bb89a` 上实测到 `pkg=../../../secret` 能读到 `node_modules` 之外的 `package.json` 和源码。
> **确认：这个洞在我上一轮（`41bb89a` / `6c47214` / `682...`）里一直没修。** 本轮修掉了。

## 1. 路径穿越（高）

**漏洞**：`inspectPlugin` 直接 `join(profileDir, 'node_modules', pkgName)`，`pkgName` 来自查询串，未校验。

**修法（两道闸）**：

```js
const PKG_RE = /^(@[\w.-]+\/)?[\w.-]+$/;          // 普通名或 @scope/name
if (!PKG_RE.test(name)) return { ok: false, code: 2, reason: '包名不合法：…' };

realRoot = realpathSync(join(profileDir, 'node_modules'));
realPkg  = realpathSync(join(realRoot, name));
const rel = relative(realRoot, realPkg);
if (rel.startsWith('..') || isAbsolute(rel)) return { ok:false, code:2, reason:'解析到 node_modules 之外，拒绝' };
```

第二道闸防的是**符号链接逃逸**：名字合法但链接指向外面。

**实测（mini 真机）**：

```
$ curl '…/turnstile/inspect?pkg=..%2F..%2F..%2Fsecret&token=…'
{"error":"包名不合法：../../../secret（只接受 name 或 @scope/name）"}

$ curl '…/turnstile/inspect?pkg=dsh-mimir&token=…'
{"pkg":"dsh-mimir","version":"0.21.2",…}      ← 正常包不受影响
```

HTTP 码也改对了：`2 → 400`（参数非法）、`3 → 200`（没装，前端好展示）、其他 `500`。

## 2. `AUTH_EXEMPT` 注释与代码不符（低，但会误导人）

审查者说得对：`AUTH_EXEMPT` 是**整个绕过 guardHandler**，连 origin 检查都没有，注释却写「跨源仍由 guardHandler 拦住」。

**改成分两档**：

```js
const AUTH_EXEMPT  = new Set(['/turnstile/']);         // 只给静态页，完全绕过
const TOKEN_EXEMPT = new Set(['/turnstile/slot-map']); // 只免 token，仍查跨源
```

**实测**：`curl -X POST -H 'origin: http://evil.example' …/turnstile/slot-map` → **403**。

## 3. `patchFiles` 双份实现（低）

审查者指出这违反「手工漂移」。实际情况：live 部署时插件被同步到 `research/turnstile-popup/`，
与 `tools/lib/` 不在同一棵树，静态 import 会 404 —— 所以**不能简单合并**。

**处理**：保留本地实现，但加一条测试盯住漂移：

```
ok 两份 patchFiles 行为一致 "./a.patch.yml"
```

## 4. 审查者提的另外两条（本轮未改）

- **runtimeCount 在真实数据上为 null**：确认存在。`docs/125` 已写「只证明链路通，没证明数字有意义」。
  修法他给得对（客户端上报带 `declaredBy`，按插件名对齐），但当前 slot 记录的 `declaredBy` 也是空的，
  得先搞清 DSH 的 records 结构。**仍是开放项。**
- **e2e 对 `/turnstile/inspect` 用硬编码夹具**：确认存在，这条路由的错误映射此前零覆盖。
  本轮把穿越用例加在 `test-look-tools` 里（直接调 `inspectPlugin`），路由层只做了手工 curl 验证。
  **e2e 仍未覆盖路由。**

## 5. 测试

`test-look-tools` 新增 6 条（4 个穿越形状 + scoped 合法名 + 双份实现一致），全过；
`e2e-console-offline` 83/83。
