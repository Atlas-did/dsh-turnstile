# 外部实测反馈：12 条，逐条核对结果

来源：用户转来的 `dsh-turnstile-反馈包-20261031.zip`（DSH 0.2.1-rc.5，Windows，用户名含中文）。
纪律：**每条都自己复现或反驳**，不复述结论。

| # | 问题 | 判定 | 处理 |
|---|---|---|---|
| B1 | `dsh.bundle.patch` 为数组时崩溃 | ✅ 属实（4 处） | 已修：`tools/lib/patch-files.mjs` + 4 条测试 |
| B6 | preflight 对无法解析的 profile 判「clear」 | ✅ 属实，**最该修** | 已修：新增 `tools/profile-yaml.mjs` 并设为阻塞项 |
| B8 | `manage.mjs` 裸写、在坏文件上照样报成功 | ✅ 属实 | 已修：`tools/lib/patch-write.mjs` 写前写后都解析，5 条测试 |
| B12 | `URL.pathname` 在非 ASCII 用户名下必崩 | ✅ 属实 | 已修：`fileURLToPath`；`mapshot` 改 `pathToFileURL` |
| B4 | 24 个路由只有 4 个鉴权 | 🟡 部分属实 | 已收紧：全部路由拒跨源（403）、写操作仍需 token；**只读 GET 不能加 token 门**，因为面板就活在宿主页里 |
| B5 | 用 `DSH_HOME`/cwd 推导 profile 目录 | ✅ 属实 | 已修：兜底改为 `USERPROFILE/.dsh`，cwd 不再作为候选 |
| B3 | 缺参数即崩、无处用法 | ✅ 部分属实 | 已修 `mapshot`；其余 CLI 逐个补用法待做 |
| B10 | `engines` 静默降级 | ✅ 属实 | 未修（见下） |
| B9 | `doctor` 不接受目录 | 🟡 存疑 | `doctor --dir <path>` 实测可用；位置参数不支持，属契约不统一 |
| B7 | `anchor` 看不到 bundle 自带 patch 的行 | 🟡 待核实 | 未修 |
| B2 | selftest 用 `bash -lc`、e2e-panel 静态 import 可选依赖 | ✅ 属实 | 未修（见下） |
| B11 | 读不到数据时底部绿点、两套壳 | ✅ 属实 | 未修（UI 改版另排） |

## B6 修法的坑（值得记）

反馈建议「用 js-yaml 五行搞定」。照做会**把正常 profile 判红**：harness 的配置里有 `!!js` 标签，
裸 `js-yaml` 报 `unknown tag !<tag:yaml.org,2002:js>`。必须用项目自己的 schema（`tools/config.mjs` 的 `loadYaml`）。
修完实测：真实 desktop profile → `PASS profile-yaml`；人为写坏 → `FAIL` + exit 1。

## B4 为什么不能照建议全加 token

面板（`/turnstile/report` 等）是**嵌在宿主页面里**运行的，那个 URL 没有 `?token=`；
一刀切加 token 门 → 面板全空（实测 e2e 从 29/29 掉到 16/17）。
现在的折中：跨源一律 403；写操作（POST）仍要 token。只读 GET 的暴露面限于本机同源进程，
这一点与反馈的判断一致（「实际暴露面限于本机进程」）。

## 仍未修的（明确记账）

- **B10 engines 静默降级**：没设 `DSH_VERSION` 只打 WARNING 就判通过，应改为「版本未知 = 明确跳过并在结果里标注」。
- **B2 Windows 自带测试**：`selftest` 的 `bash -lc`、`e2e-panel` 的静态 import，需要跨平台化。
- **B11 UI**：读失败仍显示绿点、两套壳并存。
