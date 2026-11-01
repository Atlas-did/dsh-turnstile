# 146 · 真实宿主加载证据契约与采集器

## 为什么需要它

`sandbox-trial` 的快照、安装、YAML 解析和 HTTP health 都很有用，但它们只能证明静态步骤或宿主响应。
要回答「这个插件是否真的在新启动的 DSH 中加载」，必须保存并关联另一组证据，不能改个结论文案就算完成。

证据契约、两阶段采集器、记录与关联均已实现，全部通过临时目录和 HTTP 夹具验收；没有启动或修改真实 mini。

## 证据链

`turnstile/host-evidence@1` 包含：

1. **目标**：插件包名与 profile 绝对路径。
2. **宿主**：`kind:dsh`、运行时版本、运行时 bin 绝对路径、进程 PID、本次 bootId。
3. **重启**：确实观察到重启；重启前后 bootId 不同；重启后的 bootId 等于当前宿主 bootId。
4. **安装**：插件 package.json 存在，且插件已列入 profile bundles。
5. **路由**：目标路由返回 200、非空内容，并记录响应 SHA-256。
6. **时间**：capturedAt 晚于最近一次 trial。

任何一项缺失都保持未验证。特别是：隔离模块宿主、`realDsh:false`、孤立 HTTP 200、旧启动证据、
其他插件或其他 profile 的证据，都不能让 `trial-status` 变绿。

## 两阶段采集

采集器只观察，不启动或停止宿主。重启由用户或已有受控流程完成。

```bash
# 1. 记录当前真实运行时、进程与启动标识
node tools/host-observe.mjs before <profile> <pkg> --mini <dir> --out <observation.json>

# 2. 完成受控重启后，读取最新启动并请求真实目标路由
node tools/host-observe.mjs after <profile> <pkg> --mini <dir> --input <observation.json> --out <evidence.json>
```

mini 适配器会检查运行时包身份、profile 必须位于该 mini 的 `home/profiles` 直接子目录、
进程使用对应运行时 bin，以及带最新 token 的根路由确实返回 200。
bootId 由 PID 与最新 token 计算 SHA-256；observation 和最终 evidence 均不保存 token。

after 阶段重新读取运行时、安装状态和 bundles，并计算目标路由真实响应的字节数与 SHA-256。
证据不完整时不会写出通过文件。

## 校验、记录与关联

```bash
# 只校验适配器输出
node tools/turnstile.mjs host-evidence <evidence.json> --json

# 校验通过后追加到 lab-journal.jsonl
node tools/host-evidence.mjs <evidence.json> --record --state <state>

# 关联最近一次 trial；完整有效才 exit 0
node tools/turnstile.mjs trial-status <profile> --json
```

无效证据不会被记录。新一次 trial 出现后，旧宿主证据自动失效，需要重新采集。
`host-pass` journal 与 trial 分开追加，历史记录不改写。

## 夹具验收

- `test-host-evidence.mjs`：19 项，覆盖证据结构、统一 CLI、伪装/旧证据/错误目标反例、journal 关联与失效。
- `test-host-observe.mjs`：13 项，使用临时 mini 目录和真实 HTTP 服务覆盖 before/after、序列化后继续、
  token 不泄露、运行时与 bundles、响应哈希、未重启、404、根路由失败和 mini 外 profile。

这些测试证明采集与证据机制在夹具中的行为，不证明任何真实插件已在真实 DSH 中加载。
真实 mini 的端到端验收仍需在用户明确授权的受控环境中另行执行。
