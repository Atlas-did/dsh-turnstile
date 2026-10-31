# 最终报告：17 条外部反馈的闭环状态

> 对应反馈包：`dsh-turnstile-反馈包-20261031 (1).zip`（17 条）与前一份（12 条，后者是前者的子集）。
> 结论：**16 条已修并验证，1 条（B4）部分修且说明了威胁模型**。

## 一、修复清单（每条带复跑命令）

| # | 问题 | 修法 | 复跑 |
|---|---|---|---|
| B1 | 数组 `dsh.bundle.patch` 崩 | `lib/patch-files.mjs` 统一 4 处 | `node tools/test-patch-files.mjs` |
| B2 | Windows 自带测试坏 | `cmd /d /s /c` + `spawnSync({input})` + 动态 import playwright | `node tools/selftest.mjs` |
| B3 | 缺参数即崩 | `requireProfile()` + providers 先判 `DSH_BIN` | `DSH_HOME=/tmp/x node tools/risk.mjs` |
| B4 | 路由绕过鉴权 | 见 §三 | `curl -H 'Origin: http://evil' …/turnstile/report` |
| B5 | cwd 推 profile | 兜底 `USERPROFILE/.dsh` | `curl …/turnstile/profiles` |
| B6 | 对坏 YAML 判 clear | 新增 `profile-yaml` 阻塞检查（用项目 `!!js` schema） | `node tools/profile-yaml.mjs <坏>` |
| B7 | anchor 看不到 bundle 行 | 数组 patch + 自动插入 override | `node tools/anchor.mjs … --apply` |
| B8 | 裸写、坏文件报成功 | `lib/patch-write.mjs`（写前写后解析） | `node tools/test-patch-write.mjs` |
| B9 | doctor 不接受目录 | 位置参数=路径 | `node tools/doctor.mjs ~/.dsh/profiles/desktop` |
| B10 | 静默降级 | `composed unknown` / `evaluated:false` | 见 doctor / engines 输出 |
| B11 | 绿点 + 两套壳 | 失败红点 + `data-health=failed`；`/turnstile/` 302 | `node tools/e2e-console-offline.mjs` |
| B12 | `URL.pathname` 非 ASCII | `fileURLToPath` / `pathToFileURL` | `node tools/e2e-hook-rules.mjs` |
| B13 | 新 profile 装完起不来 | `install-panel.mjs` 空数组整体重写 | `node tools/test-install-panel.mjs` |
| B14 | `link:` 过不了自家门禁 | 改 `file:` | 同上 |
| B15 | health 是作者清单 | 数据驱动；bridge 按是否安装 | 实机 health 3 项 0 fail |
| B16 | 宿主 bundle 标 missing | `createRequire(process.argv[1])` | 实机「2 个由宿主提供」 |
| B17 | 两端点读不同 state | 统一 `stateBase()`；缺数据 200 `not-generated` | 实机 report/occupancy 同源 |

## 二、同族清扫（目标③）

修完 17 条后又按类别扫了一遍，抓到 3 处同类：

1. **面板内置了作者的插件清单**（`client.js` 的 `FALLBACK` 常量，20+ 个包名）——首屏/读取失败时渲染不存在的插件。已清空。
2. `anchor.mjs --apply` 仍是裸 `writeFileSync`。已改走 `safeWritePatch`。
3. 面板读失败时表格空着，看起来像「没有插件」。已显式报错。

## 三、B4 的坦白

现状：每个 `/turnstile/*` 路由**拒绝跨源请求（403）**；写操作仍要求 token（401）；只读 GET 允许同源无 token。

为什么不做成「一刀切要 token」：面板运行在**宿主自己的页面**里，那个 URL 没有 `?token=`；强制会让面板全空
（实测 e2e 从 29/29 掉到 16/17）。这与反馈者的判断一致——「实际暴露面限于本机进程」。

残留风险：本机其它进程可以读这些端点。它们同时也能直接读磁盘上的同一个 profile，
所以这条不构成额外的权限提升；要彻底关闭需要宿主提供「注入给客户端插件的会话凭据」，目前 DSH 没有暴露。

## 四、验证记录

```
单元：patch-write 5 · patch-files 4 · install-panel 5 · records 9 · diagnose 10
      pits 8 · preinstall 5 · proxy 6 · setup-checks 8 · auth 4 · 包内 17 组
e2e ：console 76/76 · panel 29/29 · designer 44/44 · hook-rules · virtual-list
真机：mini（全新 profile 安装 → 可解析 → 门禁 clear；health 3 项 0 fail；6 个端点 200；302 重定向）
      desktop（preflight clear · profile-yaml ok · doctor/gate-map/risk/engines 均正常）
CI  ：run#88 #89 #90 #91 连续 success
```

## 五、交付给反馈者的最短路径

```bash
git pull
node tools/selftest.mjs              # B2：Windows 上应全过
node tools/test-install-panel.mjs    # B13/B14
node tools/test-patch-write.mjs      # B8
node tools/e2e-console-offline.mjs   # B11
node tools/diagnose.mjs --live       # 现场体检
```
