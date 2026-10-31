# 第 3 轮：Windows 脚手架与 CLI 契约（B2/B3/B9/B10）

这一批不动功能，只修「别人复测时对不上」的地方。

## B2 Windows 上自带测试是坏的

| 坏在哪 | 修法 | 验证 |
|---|---|---|
| `selftest.mjs` 用 `execFileSync('bash', ['-lc', …])` | 按平台选 shell：Windows 用 `cmd.exe /d /s /c` | 本机 selftest 从「1 个假失败」变 67 fixture + 3 env 全过 |
| 同一个用例用 `printf … \| node …` 喂 stdin | 改成 `spawnSync(process.execPath, …, { input })`，不经 shell | 同上 |
| 7 个 e2e/截图脚本 `import { chromium } from 'playwright-core'`（可选依赖） | 改动态 import，缺失时 exit 3 而不是 exit 1 | `e2e-panel` 无参仍 exit 2；有 playwright 时 29/29 全过 |

## B3 缺参数即崩不给用法

- `providers.mjs`：没有 `DSH_BIN` 时 exec `null` → `Cannot find module '…\null'`。现在先判断，打印一行说明 + exit 2。
- 新增 `config.mjs#requireProfile(dir, usage)`：路径不是 profile 时打印 `not a profile (no package.json)` + usage + exit 2。
  已接入 `risk` / `engines` / `conflict` / `import-health` / `prompt-vars` / `registry`。

实测：

```
DSH_HOME=/tmp/nope node tools/risk.mjs   → exit 2  not a profile (no package.json) … + usage
node tools/risk.mjs <真实 profile>        → exit 0
```

## B9 doctor 不接受目录

位置参数给一个存在的路径时等同 `--dir`（`preflight`/`manage` 早就接受路径，doctor 拒绝是不一致）。

```
node tools/doctor.mjs ~/.dsh/profiles/desktop   → doctor · desktop  (…/profiles/desktop)
```

## B10 静默降级

| 工具 | 原来 | 现在 |
|---|---|---|
| `doctor` | 取不到 `--dump-config` 时打 `composed 0 B = 0.0%`（看起来健康） | `composed unknown (no --dump-config; set DSH_BIN)` |
| `engines` | 无 runtime 时仍输出 `ok: true` | 额外打 `NOTE: …no plugin was evaluated against engines.dsh`，JSON 里加 `evaluated: false` |

## 一个不算 bug 的扫描结果

无参 exit 0 且不打用法的 16 个文件里，绝大多数是**库模块**（`config` `json-out` `safe-copy` `version` `pits` `scan` `setup-checks` `console-data` …），
它们本来就不是 CLI。真正该有用法的是被点名的 `providers`/`mapshot`，已修。

## 仍未修

- B7 `anchor` 看不到 bundle 自带 patch 的行；
- B11 UI：读失败仍显示绿点、两套壳。
