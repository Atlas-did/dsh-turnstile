# 全面体检（杀毒软件式的一键扫）

用户要的是「像杀毒软件那样，点一下就全面体检」。这一轮先做出**能跑的一键扫描**，不是完整产品。

## 已经有的是什么

| 层 | 东西 | 在哪 |
|---|---|---|
| 逻辑 | `lib/health.js`：凭据 / 桥接 / 插件 / 引擎 / 登录记录，每条带 `next` | 插件内，8 条单测 |
| 接口 | `GET /turnstile/health` | 插件 host，只读 |
| 界面 | 总览页「全面体检」卡片 + 开始体检按钮 | 全窗口控制台 |
| 命令行 | `tools/setup-check.mjs` | 同一套判定，给终端用 |

## 实跑（mini profile，正在运行）

```
{ "items": [
  { "id": "credentials", "level": "warn", "message": "缺少凭据键：agnes-api-key", "next": "把凭据写进 ~/.dsh/.credentials.yaml 后重启客户端" },
  { "id": "bridge", "level": "fail", "message": "AA 卡在「等待本地 bridge」：endpoint.json 不存在", "next": "dsh plugin --profile desktop add @agents-anywhere/dsh-bridge-next" },
  { "id": "plugin:dsh-free-search", "level": "pass", ... },
  { "id": "auth", "level": "skip", "message": "登录记录数读不到（DSH 正在运行，库被锁）", "next": "完全退出 DSH 后再体检" }
] }
```

界面上点「开始体检」后的样子（测试夹具里的原文）：

```
✗ 凭据文件不存在（还没登录过）→ 在 DSH 里登录一次
✗ AA 卡在「等待本地 bridge」：endpoint.json 不存在 → dsh plugin --profile desktop add ...
```

console e2e 62 → **64/64**（加了「扫描出条目」「汇总里有通过/警告/失败」两条）。

## 几个必须诚实的地方

1. **体检报告的是「当前 profile」**，不是整台机器。mini 里说市场没装，是因为 mini 没装；
   主 profile 装没装要主 profile 里的插件去报。
2. **登录记录这一项在 DSH 运行时只能 `skip`**——cookie 库被锁。这不是失败，也不是通过。
3. **引擎闸门这一项还没接进接口**，只在命令行 `tools/engines.mjs` 里；接进来需要运行时版本，
   而插件里拿不到（`DSH_BIN` 只在工具侧有）。

## 还没做（下一轮）

- **从主 DSH 管理 mini**：现在只能在 mini 里看 mini。要做 profile 切换（`/turnstile/profile?name=mini`），
  以及「重启 mini」「跑 quicktest」这类动作（都要走事务，不能裸执行）。
- **定时体检 / 开机自检**：现在只有手动点。
