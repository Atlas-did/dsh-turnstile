# B1–B17 处理对照表（交给反馈者复测）

> 环境：Windows 11 / Node 24–25 / DSH 0.2.1-rc.5 / 用户名含中文。
> 纪律：**只写实测**。每条给「修在哪个 commit / 谁能复跑」。

## 已修（13 条）

| # | 问题 | 修法 | 复跑 |
|---|---|---|---|
| B1 | 数组 `dsh.bundle.patch` 崩 | `tools/lib/patch-files.mjs`，doctor/gate-map/ui-surfaces 四处统一 | `node tools/test-patch-files.mjs` (4) |
| B2 | Windows 自带测试坏 | selftest 用 `cmd /d /s /c`；stdin 改 `spawnSync({input})`；7 个脚本改动态 import playwright | `node tools/selftest.mjs` → 67+3 全过 |
| B3 | 缺参数即崩不给用法 | `config.mjs#requireProfile`；providers 先判 DSH_BIN；mapshot 打印 usage | `DSH_HOME=/tmp/x node tools/risk.mjs` → exit 2 + usage |
| B4 | 路由绕过鉴权 | 全部 `/turnstile/*` 拒跨源(403)；写操作仍要 token(401) | `curl -H 'Origin: http://evil' …/turnstile/report` → 403 |
| B5 | 用 cwd 推 profile | 兜底改 `USERPROFILE/.dsh` | 面板 `/turnstile/profiles` 返回真实列表 |
| B6 | preflight 对坏 YAML 判 clear | 新增 `profile-yaml` 阻塞检查（用项目自己的 `!!js` schema） | 写坏 profile → exit 1 |
| B7 | anchor 看不到 bundle 自带行 | 支持数组 patch；行不在 profile 时**插入 override**（带校验与备份） | `anchor … --apply` → 写入 `- id: … config: anchor:` |
| B8 | 裸写、坏文件报成功 | `lib/patch-write.mjs`：写前写后都解析，坏则拒绝 | `node tools/test-patch-write.mjs` (5) |
| B9 | doctor 不接受目录 | 位置参数给存在的路径等同 `--dir` | `node tools/doctor.mjs ~/.dsh/profiles/desktop` |
| B10 | 静默降级 | doctor：`composed unknown (set DSH_BIN)`；engines：`evaluated:false` + NOTE | 见两工具输出 |
| B12 | `URL.pathname` 非 ASCII 崩 | `fileURLToPath` / `pathToFileURL` | `node tools/e2e-hook-rules.mjs` 全过 |
| B13 | 新 profile 装完起不来 | `tools/install-panel.mjs`：空数组整体重写 | `node tools/test-install-panel.mjs` (5) + `/tmp/fresh` 全流程 |
| B14 | `link:` 依赖过不了自家门禁 | 改 `file:./node_modules/turnstile-popup` | 同上，`dependency-risk PASS` |
| B15 | health 是作者本机清单 | 去掉硬编码包名；只报本 profile 的 bundle；bridge 项按是否装了 bridge | 实机 5项(2 fail) → 3项(0 fail) |
| B16 | 宿主 bundle 标 missing | `createRequire(process.argv[1])` 向宿主解析 | 实机 `28 个 bundle 都能解析（2 个由宿主提供）` |
| B17 | 两端点读不同 state | 统一 `stateBase()`；preflight 认 `DSH_TURNSTILE_STATE`；缺数据 200 `not-generated` | 实机 report/occupancy 同为 200 |
| B11 | 读失败显示绿点 + 两套壳 | 失败时红点 + `data-health=failed`；`/turnstile/` 302 到 `/turnstile/console` | e2e 76/76；实机 302 → 47,981B |

## 逐项复跑命令（一条一条来）

```bash
node tools/test-patch-files.mjs      # B1
node tools/selftest.mjs              # B2
DSH_HOME=/tmp/nope node tools/risk.mjs          # B3 -> exit 2 + usage
node tools/test-patch-write.mjs      # B8
node tools/test-install-panel.mjs    # B13/B14
node tools/profile-yaml.mjs <坏profile>  # B6 -> exit 1
node tools/diagnose.mjs --live       # B10 之外的现场体检
node tools/e2e-console-offline.mjs   # B11 (76 checks)
node tools/e2e-panel-offline.mjs     # 面板 29 checks
```

## 需要他在自己机器上确认的两点

1. **B2 的 Windows 修复**：他的环境没有 bash，现在 selftest 应该能全过；若仍失败，请贴 `node tools/selftest.mjs` 的完整输出。
2. **B4 的边界**：只读 GET 仍未强制 token（面板运行在宿主页面里，URL 没有 token）。跨源已被 403 挡住。如果他认为这还不够，请说明期望的攻击面——目前的暴露面是本机同源进程。

## 未修 / 部分修（如实）

| # | 状态 | 说明 |
|---|---|---|
| B4 | 部分 | 见上：写操作有 token 门，读操作只有跨源门 |
| — | 无 | 其余 16 条均已修并带复跑命令 |
